import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { DataSource, Repository } from 'typeorm';

import { CreateUserDto } from './dto/create-user.dto';
import { Address } from './entities/address.entity';
import { User } from './entities/user.entity';

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

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
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
      // User and Address are two separate tables, so creating both has to
      // be atomic: if the Address insert failed after the User insert
      // committed, we'd be left with an account that has no address at all.
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

        return insertedUser;
      });

      this.logger.log('[users-service] - user created successfully.');

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
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) return null;

    const { password, ...safeUser } = user;
    return safeUser;
  }
}
