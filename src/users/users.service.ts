import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { DataSource, Repository } from 'typeorm';

import { AuditService } from '../audit/audit.service';
import { UserEventType } from '../audit/user-event-type';
import { MailService } from '../mail/mail.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Address } from './entities/address.entity';
import { User } from './entities/user.entity';
import { matchesImageSignature } from './utils/image-signature.util';
import { Wallet } from '../wallets/entities/wallet.entity';

interface PostgresUniqueViolationError {
  code: string;
  detail?: string;
}

function isUniqueViolation(
  error: unknown,
): error is PostgresUniqueViolationError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

export type SafeUser = Omit<User, 'password'>;

// The saved extension must never come from the client-supplied filename
// — that field is fully attacker-controlled and independent of the
// already-validated mimetype (see matchesImageSignature). Mapping the
// extension from the mimetype instead closes that gap. Keep this in sync
// with Uploads.allowedAvatarMimeTypes.
const AVATAR_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async create(dto: CreateUserDto): Promise<SafeUser> {
    const existingByEmail = await this.usersRepository.findOne({
      where: { email: dto.email },
    });
    if (existingByEmail) {
      this.logger.warn(
        '[users-service] - signup rejected, email already registered.',
      );
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'This email is already registered',
      });
    }

    const existingByCpf = await this.usersRepository.findOne({
      where: { cpf: dto.cpf },
    });
    if (existingByCpf) {
      this.logger.warn(
        '[users-service] - signup rejected, CPF already registered.',
      );
      throw new ConflictException({
        code: 'CPF_ALREADY_REGISTERED',
        message: 'This CPF is already registered',
      });
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    try {
      // User, Address and Wallet are separate tables, so creating all
      // three has to be atomic — a signup should never leave a user
      // without a wallet.
      const savedUser = await this.dataSource.transaction(async (manager) => {
        const user = manager.create(User, {
          name: dto.name,
          email: dto.email,
          cpf: dto.cpf,
          phone: dto.phone,
          monthlyIncome: dto.monthlyIncome.toFixed(2),
          password: passwordHash,
        });
        const insertedUser = await manager.save(user);

        const address = manager.create(Address, {
          user: insertedUser,
          zipCode: dto.address.zipCode,
          street: dto.address.street,
          number: dto.address.number,
          complement: dto.address.complement ?? null,
          neighborhood: dto.address.neighborhood,
          city: dto.address.city,
          state: dto.address.state,
        });
        await manager.save(address);

        const wallet = manager.create(Wallet, {
          userId: insertedUser.id,
          balance: '0.00',
        });
        await manager.save(wallet);

        await this.auditService.record(
          {
            userId: insertedUser.id,
            eventType: UserEventType.UserRegistered,
            metadata: { email: insertedUser.email },
          },
          manager,
        );

        return insertedUser;
      });

      this.logger.log('[users-service] - user created successfully.');

      // Best-effort, fire-and-forget: an SMTP hiccup should never make a
      // successful signup look like it failed to the caller.
      this.mailService
        .sendWelcomeEmail({ email: savedUser.email, name: savedUser.name })
        .catch((error: unknown) => {
          this.logger.error(
            '[users-service] - failed to send welcome email.',
            error,
          );
        });

      const { password, ...safeUser } = savedUser;
      return safeUser;
    } catch (error) {
      // Second line of defense against the check-then-insert race: two
      // concurrent signups can both pass the findOne checks above before
      // either INSERT commits, so the database's own unique constraint is
      // what actually guarantees no duplicate ends up persisted.
      if (isUniqueViolation(error)) {
        this.logger.warn(
          '[users-service] - signup rejected by database unique constraint.',
        );

        const code = error.detail?.includes('email')
          ? 'EMAIL_ALREADY_REGISTERED'
          : 'CPF_ALREADY_REGISTERED';

        throw new ConflictException({
          code,
          message:
            code === 'EMAIL_ALREADY_REGISTERED'
              ? 'This email is already registered'
              : 'This CPF is already registered',
        });
      }

      throw error;
    }
  }

  // `password` has `select: false` on the entity, so it's left out of every
  // normal query by default — this explicitly asks for it back, needed
  // only for the login flow's credential check.
  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  async findById(id: string): Promise<SafeUser | null> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['address'],
    });
    if (!user) return null;

    const { password, ...safeUser } = user;
    return safeUser;
  }

  async update(userId: string, dto: UpdateUserDto): Promise<SafeUser> {
    if (dto.email) {
      const existingByEmail = await this.usersRepository.findOne({
        where: { email: dto.email },
      });
      if (existingByEmail && existingByEmail.id !== userId) {
        this.logger.warn(
          '[users-service] - profile update rejected, email already registered.',
        );
        throw new ConflictException({
          code: 'EMAIL_ALREADY_REGISTERED',
          message: 'This email is already registered',
        });
      }
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        const user = await manager.findOne(User, {
          where: { id: userId },
          relations: ['address'],
        });
        if (!user) throw new NotFoundException();

        // Only fields whose value actually differs from what's already
        // stored end up in the audit trail — resending the same email,
        // for instance, shouldn't look like a change in the log.
        const changes: Record<string, unknown> = {};

        if (dto.email && dto.email !== user.email) {
          changes.email = { before: user.email, after: dto.email };
          user.email = dto.email;
        }
        if (dto.phone && dto.phone !== user.phone) {
          changes.phone = { before: user.phone, after: dto.phone };
          user.phone = dto.phone;
        }
        if (dto.monthlyIncome !== undefined) {
          const newMonthlyIncome = dto.monthlyIncome.toFixed(2);
          if (newMonthlyIncome !== user.monthlyIncome) {
            changes.monthlyIncome = {
              before: user.monthlyIncome,
              after: newMonthlyIncome,
            };
            user.monthlyIncome = newMonthlyIncome;
          }
        }
        await manager.save(user);

        if (dto.address) {
          const addressChanges: Record<string, unknown> = {};
          const addressFields = [
            'zipCode',
            'street',
            'number',
            'complement',
            'neighborhood',
            'city',
            'state',
          ] as const;

          for (const field of addressFields) {
            const before = user.address?.[field] ?? null;
            const after = dto.address[field] ?? null;
            if (before !== after) addressChanges[field] = { before, after };
          }
          if (Object.keys(addressChanges).length > 0)
            changes.address = addressChanges;

          await manager.save(Address, { ...user.address, ...dto.address });
        }

        await this.auditService.record(
          {
            userId,
            eventType: UserEventType.ProfileUpdated,
            metadata: { changes },
          },
          manager,
        );
      });
    } catch (error) {
      // Same check-then-write race as create(): two concurrent updates
      // could both pass the findOne check above before either UPDATE
      // commits, so the database's unique constraint is the real guard.
      if (isUniqueViolation(error)) {
        this.logger.warn(
          '[users-service] - profile update rejected by database unique constraint.',
        );
        throw new ConflictException({
          code: 'EMAIL_ALREADY_REGISTERED',
          message: 'This email is already registered',
        });
      }
      throw error;
    }

    this.logger.log('[users-service] - profile updated successfully.');

    const updated = await this.findById(userId);
    if (!updated) throw new NotFoundException();
    return updated;
  }

  async updateAvatar(
    userId: string,
    file: Express.Multer.File,
  ): Promise<SafeUser> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException();

    // Checked against the in-memory buffer (MulterModule uses
    // memoryStorage — see users.module.ts) before a single byte reaches
    // disk. fileFilter there only checked the client-declared mimetype
    // header, which is spoofable; this confirms the actual bytes are a
    // real image of that type, so an invalid or malicious upload is
    // rejected without ever being written and needing cleanup.
    const isRealImage = matchesImageSignature(file.buffer, file.mimetype);
    if (!isRealImage) {
      this.logger.warn(
        '[users-service] - avatar upload rejected, content does not match declared type.',
      );
      throw new BadRequestException({
        code: 'UNSUPPORTED_FILE_TYPE',
        message: 'Unsupported file type',
      });
    }

    const avatarsDir = this.configService.get<string>(
      'Uploads.avatarsDir',
      'uploads/avatars',
    );
    const extension = AVATAR_MIME_EXTENSIONS[file.mimetype] ?? '';
    const filename = `${randomUUID()}${extension}`;
    await writeFile(join(process.cwd(), avatarsDir, filename), file.buffer);

    const avatarUrl = `/uploads/avatars/${filename}`;

    if (user.avatarUrl) await this.deleteAvatarFile(user.avatarUrl);

    await this.usersRepository.update(userId, { avatarUrl });

    await this.auditService.record({
      userId,
      eventType: UserEventType.AvatarUpdated,
      metadata: { avatarUrl: { before: user.avatarUrl, after: avatarUrl } },
    });

    this.logger.log('[users-service] - avatar updated successfully.');

    const updated = await this.findById(userId);
    if (!updated) throw new NotFoundException();
    return updated;
  }

  async removeAvatar(userId: string): Promise<SafeUser> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException();

    if (user.avatarUrl) await this.deleteAvatarFile(user.avatarUrl);

    await this.usersRepository.update(userId, { avatarUrl: null });

    await this.auditService.record({
      userId,
      eventType: UserEventType.AvatarRemoved,
      metadata: { avatarUrl: { before: user.avatarUrl, after: null } },
    });

    this.logger.log('[users-service] - avatar removed successfully.');

    const updated = await this.findById(userId);
    if (!updated) throw new NotFoundException();
    return updated;
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<SafeUser> {
    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException({
        code: 'NEW_PASSWORD_CONFIRMATION_MISMATCH',
        message: 'New password and confirmation do not match',
      });
    }

    // `password` has `select: false` on the entity, so it's left out of
    // every normal query by default — same reason findByEmailWithPassword
    // needs an explicit addSelect for the login flow.
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user) throw new NotFoundException();

    const currentPasswordMatches = await argon2.verify(
      user.password,
      dto.currentPassword,
    );
    if (!currentPasswordMatches) {
      this.logger.warn(
        '[users-service] - password change rejected, current password does not match.',
      );
      throw new UnauthorizedException({
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'Current password is incorrect',
      });
    }

    const newPasswordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });
    await this.usersRepository.update(userId, { password: newPasswordHash });

    await this.auditService.record({
      userId,
      eventType: UserEventType.PasswordChanged,
      metadata: {},
    });

    this.logger.log('[users-service] - password changed successfully.');

    // Best-effort, fire-and-forget: an SMTP hiccup should never make a
    // successful password change look like it failed to the caller.
    this.mailService
      .sendPasswordChangedEmail({ email: user.email, name: user.name })
      .catch((error: unknown) => {
        this.logger.error(
          '[users-service] - failed to send password changed email.',
          error,
        );
      });

    const updated = await this.findById(userId);
    if (!updated) throw new NotFoundException();
    return updated;
  }

  // Best-effort cleanup — a file that fails to delete (already gone,
  // permission issue) shouldn't block the caller's own update from saving.
  private async deleteAvatarFile(avatarUrl: string): Promise<void> {
    await unlink(join(process.cwd(), avatarUrl)).catch(() => {});
  }
}
