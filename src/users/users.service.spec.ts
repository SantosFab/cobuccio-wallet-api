import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { unlink, writeFile } from 'fs/promises';
import { DataSource, Repository } from 'typeorm';

import { AuditService } from '../audit/audit.service';
import { UserEventType } from '../audit/user-event-type';
import { MailService } from '../mail/mail.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { matchesImageSignature } from './utils/image-signature.util';

jest.mock('argon2', () => ({
  argon2id: 2,
  hash: jest.fn(),
  verify: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./utils/image-signature.util', () => ({
  matchesImageSignature: jest.fn(),
}));

function buildDto(): CreateUserDto {
  return {
    name: 'Ana Silva',
    email: 'ana@example.com',
    cpf: '52998224725',
    phone: '11987654321',
    address: {
      zipCode: '01310100',
      street: 'Avenida Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
    },
    monthlyIncome: 3500,
    password: 'Senha123',
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let repository: jest.Mocked<Repository<User>>;
  let dataSource: { transaction: jest.Mock };
  let manager: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let auditService: { record: jest.Mock };
  let mailService: {
    sendWelcomeEmail: jest.Mock;
    sendPasswordChangedEmail: jest.Mock;
  };

  beforeEach(async () => {
    manager = {
      findOne: jest.fn(),
      create: jest.fn((_entityClass: unknown, data: unknown) => data),
      save: jest.fn((entity: Record<string, unknown>) =>
        Promise.resolve({
          id: 'generated-id',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...entity,
        }),
      ),
    };
    dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => unknown) =>
        callback(manager),
      ),
    };
    auditService = { record: jest.fn() };
    mailService = {
      sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        { provide: DataSource, useValue: dataSource },
        { provide: AuditService, useValue: auditService },
        { provide: MailService, useValue: mailService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (_key: string, defaultValue?: unknown) => defaultValue,
            ),
          },
        },
      ],
    }).compile();

    service = module.get(UsersService);
    repository = module.get(getRepositoryToken(User));

    (argon2.hash as jest.Mock).mockResolvedValue('hashed-password');
    (unlink as jest.Mock).mockClear();
    (writeFile as jest.Mock).mockClear();
    // Most tests don't care about avatar content validation — only the
    // `updateAvatar` tests that specifically exercise it override this.
    (matchesImageSignature as jest.Mock).mockClear().mockReturnValue(true);
  });

  it('creates a user and its address in the same transaction, never returning the password', async () => {
    repository.findOne.mockResolvedValue(null);

    const result = await service.create(buildDto());

    expect(argon2.hash).toHaveBeenCalledWith('Senha123', { type: 2 });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledTimes(3); // user, address, then wallet
    expect(result).not.toHaveProperty('password');
    expect(result.email).toBe('ana@example.com');
    expect(mailService.sendWelcomeEmail).toHaveBeenCalledWith({
      email: 'ana@example.com',
      name: 'Ana Silva',
    });
  });

  it('does not let a welcome-email failure affect the signup response', async () => {
    repository.findOne.mockResolvedValue(null);
    mailService.sendWelcomeEmail.mockRejectedValueOnce(new Error('SMTP down'));

    await expect(service.create(buildDto())).resolves.toMatchObject({
      email: 'ana@example.com',
    });
  });

  it('rejects signup when the email is already registered', async () => {
    repository.findOne.mockResolvedValueOnce({ id: 'existing' } as User);

    await expect(service.create(buildDto())).rejects.toMatchObject({
      response: { code: 'EMAIL_ALREADY_REGISTERED' },
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects signup when the CPF is already registered', async () => {
    repository.findOne
      .mockResolvedValueOnce(null) // email check passes
      .mockResolvedValueOnce({ id: 'existing' } as User); // cpf check fails

    await expect(service.create(buildDto())).rejects.toMatchObject({
      response: { code: 'CPF_ALREADY_REGISTERED' },
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('translates a database unique-constraint violation into a 409 as a second line of defense', async () => {
    repository.findOne.mockResolvedValue(null);
    dataSource.transaction.mockRejectedValue({
      code: '23505',
      detail: 'Key (email)=(ana@example.com) already exists.',
    });

    await expect(service.create(buildDto())).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.create(buildDto())).rejects.toMatchObject({
      response: { code: 'EMAIL_ALREADY_REGISTERED' },
    });
  });

  describe('findByEmailWithPassword', () => {
    it('explicitly re-selects the password column, which is select:false by default', async () => {
      const queryBuilder = {
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'ana@example.com',
          password: 'hashed-password',
        }),
      };
      repository.createQueryBuilder.mockReturnValue(
        queryBuilder as unknown as ReturnType<
          Repository<User>['createQueryBuilder']
        >,
      );

      const result = await service.findByEmailWithPassword('ana@example.com');

      expect(queryBuilder.addSelect).toHaveBeenCalledWith('user.password');
      expect(queryBuilder.where).toHaveBeenCalledWith('user.email = :email', {
        email: 'ana@example.com',
      });
      expect(result).toMatchObject({ password: 'hashed-password' });
    });
  });

  describe('findById', () => {
    it('returns the user without the password field', async () => {
      repository.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'ana@example.com',
        password: 'hashed-password',
      } as User);

      const result = await service.findById('user-1');

      expect(result).not.toHaveProperty('password');
      expect(result?.email).toBe('ana@example.com');
    });

    it('returns null when the user does not exist', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.findById('missing-id');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    function buildUser(overrides: Partial<User> = {}): User {
      return {
        id: 'user-1',
        name: 'Ana Silva',
        email: 'ana@example.com',
        phone: '11987654321',
        monthlyIncome: '3500.00',
        address: {
          zipCode: '01310100',
          street: 'Avenida Paulista',
          number: '1000',
          complement: null,
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
        },
        ...overrides,
      } as User;
    }

    it('updates only the fields that changed and audits a diff', async () => {
      manager.findOne.mockResolvedValue(buildUser());
      repository.findOne
        .mockResolvedValueOnce(null) // no other user has this email
        .mockResolvedValueOnce(buildUser({ email: 'new@example.com' })); // findById at the end

      const dto: UpdateUserDto = { email: 'new@example.com' };
      await service.update('user-1', dto);

      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com' }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        {
          userId: 'user-1',
          eventType: UserEventType.ProfileUpdated,
          metadata: {
            changes: {
              email: { before: 'ana@example.com', after: 'new@example.com' },
            },
          },
        },
        manager,
      );
    });

    it('does not record a change when the resent value is identical to what is already stored', async () => {
      manager.findOne.mockResolvedValue(buildUser());
      repository.findOne
        .mockResolvedValueOnce(buildUser()) // duplicate-email check finds itself
        .mockResolvedValueOnce(buildUser()); // findById at the end

      await service.update('user-1', { email: 'ana@example.com' });

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { changes: {} } }),
        manager,
      );
    });

    it('rejects when the new email already belongs to a different user', async () => {
      repository.findOne.mockResolvedValueOnce({ id: 'someone-else' } as User);

      await expect(
        service.update('user-1', { email: 'taken@example.com' }),
      ).rejects.toMatchObject({
        response: { code: 'EMAIL_ALREADY_REGISTERED' },
      });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('translates a database unique-constraint violation into a 409 as a second line of defense', async () => {
      repository.findOne.mockResolvedValueOnce(null);
      dataSource.transaction.mockRejectedValueOnce({
        code: '23505',
        detail: 'Key (email)=(new@example.com) already exists.',
      });

      await expect(
        service.update('user-1', { email: 'new@example.com' }),
      ).rejects.toMatchObject({
        response: { code: 'EMAIL_ALREADY_REGISTERED' },
      });
    });
  });

  describe('updateAvatar', () => {
    const fileBuffer = Buffer.from('fake-jpeg-bytes');

    function buildUploadedFile(
      overrides: Partial<Express.Multer.File> = {},
    ): Express.Multer.File {
      return {
        mimetype: 'image/jpeg',
        buffer: fileBuffer,
        ...overrides,
      } as Express.Multer.File;
    }

    it('validates content, writes the file, deletes the previous avatar and audits the change', async () => {
      repository.findOne
        .mockResolvedValueOnce({
          id: 'user-1',
          avatarUrl: '/uploads/avatars/old.jpg',
        } as User)
        .mockResolvedValueOnce({
          id: 'user-1',
          avatarUrl: '/uploads/avatars/new-generated.jpg',
        } as User);

      await service.updateAvatar('user-1', buildUploadedFile());

      expect(matchesImageSignature).toHaveBeenCalledWith(
        fileBuffer,
        'image/jpeg',
      );

      // The saved filename is generated internally (randomUUID + a safe
      // extension derived from the mimetype), never predictable from the
      // request — read back whatever writeFile actually received instead
      // of guessing it, then use that same value to confirm the DB update
      // and audit trail point at the exact file that was written.
      const [writtenPath, writtenBuffer] = (writeFile as jest.Mock).mock
        .calls[0] as [string, Buffer];
      expect(writtenPath).toMatch(/uploads[/\\]avatars[/\\].+\.jpg$/);
      expect(writtenBuffer).toBe(fileBuffer);
      const generatedFilename = writtenPath.split(/[/\\]/).pop();
      const expectedAvatarUrl = `/uploads/avatars/${generatedFilename}`;

      expect(unlink).toHaveBeenCalledWith(
        expect.stringContaining('/uploads/avatars/old.jpg'),
      );
      expect(repository.update).toHaveBeenCalledWith('user-1', {
        avatarUrl: expectedAvatarUrl,
      });
      expect(auditService.record).toHaveBeenCalledWith({
        userId: 'user-1',
        eventType: UserEventType.AvatarUpdated,
        metadata: {
          avatarUrl: {
            before: '/uploads/avatars/old.jpg',
            after: expectedAvatarUrl,
          },
        },
      });
    });

    it('does not try to delete anything when there was no previous avatar', async () => {
      repository.findOne
        .mockResolvedValueOnce({ id: 'user-1', avatarUrl: null } as User)
        .mockResolvedValueOnce({
          id: 'user-1',
          avatarUrl: '/uploads/avatars/new-generated.jpg',
        } as User);

      await service.updateAvatar('user-1', buildUploadedFile());

      expect(unlink).not.toHaveBeenCalled();
    });

    it('rejects without ever writing to disk when the content does not match the declared mimetype', async () => {
      repository.findOne.mockResolvedValueOnce({
        id: 'user-1',
        avatarUrl: null,
      } as User);
      (matchesImageSignature as jest.Mock).mockReturnValueOnce(false);

      await expect(
        service.updateAvatar('user-1', buildUploadedFile()),
      ).rejects.toMatchObject({
        response: { code: 'UNSUPPORTED_FILE_TYPE' },
      });

      expect(writeFile).not.toHaveBeenCalled();
      expect(unlink).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('rejects when the user does not exist, without checking the file content', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.updateAvatar('missing-id', buildUploadedFile()),
      ).rejects.toThrow();

      expect(matchesImageSignature).not.toHaveBeenCalled();
    });
  });

  describe('removeAvatar', () => {
    it('deletes the file, clears the column and audits the removal', async () => {
      repository.findOne
        .mockResolvedValueOnce({
          id: 'user-1',
          avatarUrl: '/uploads/avatars/old.jpg',
        } as User)
        .mockResolvedValueOnce({ id: 'user-1', avatarUrl: null } as User);

      await service.removeAvatar('user-1');

      expect(unlink).toHaveBeenCalledWith(
        expect.stringContaining('/uploads/avatars/old.jpg'),
      );
      expect(repository.update).toHaveBeenCalledWith('user-1', {
        avatarUrl: null,
      });
      expect(auditService.record).toHaveBeenCalledWith({
        userId: 'user-1',
        eventType: UserEventType.AvatarRemoved,
        metadata: {
          avatarUrl: { before: '/uploads/avatars/old.jpg', after: null },
        },
      });
    });

    it('rejects when the user does not exist', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      await expect(service.removeAvatar('missing-id')).rejects.toThrow();
    });
  });

  describe('changePassword', () => {
    function mockUserWithPasswordQuery(user: Partial<User> | null) {
      const queryBuilder = {
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(user),
      };
      repository.createQueryBuilder.mockReturnValue(
        queryBuilder as unknown as ReturnType<
          Repository<User>['createQueryBuilder']
        >,
      );
      return queryBuilder;
    }

    it('rejects when the new password and confirmation do not match', async () => {
      await expect(
        service.changePassword('user-1', {
          currentPassword: 'OldSenha123',
          newPassword: 'NewSenha123',
          confirmNewPassword: 'Different123',
        }),
      ).rejects.toMatchObject({
        response: { code: 'NEW_PASSWORD_CONFIRMATION_MISMATCH' },
      });
      expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('rejects when the current password is incorrect', async () => {
      mockUserWithPasswordQuery({
        id: 'user-1',
        email: 'ana@example.com',
        name: 'Ana Silva',
        password: 'hashed-old-password',
      });
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword('user-1', {
          currentPassword: 'WrongPassword1',
          newPassword: 'NewSenha123',
          confirmNewPassword: 'NewSenha123',
        }),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_CURRENT_PASSWORD' },
      });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('rejects when the user does not exist', async () => {
      mockUserWithPasswordQuery(null);

      await expect(
        service.changePassword('missing-id', {
          currentPassword: 'OldSenha123',
          newPassword: 'NewSenha123',
          confirmNewPassword: 'NewSenha123',
        }),
      ).rejects.toThrow();
    });

    it('hashes and saves the new password, audits the change and emails the user', async () => {
      mockUserWithPasswordQuery({
        id: 'user-1',
        email: 'ana@example.com',
        name: 'Ana Silva',
        password: 'hashed-old-password',
      });
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      (argon2.hash as jest.Mock).mockResolvedValue('hashed-new-password');
      repository.findOne.mockResolvedValueOnce({
        id: 'user-1',
        email: 'ana@example.com',
        name: 'Ana Silva',
      } as User);

      const result = await service.changePassword('user-1', {
        currentPassword: 'OldSenha123',
        newPassword: 'NewSenha123',
        confirmNewPassword: 'NewSenha123',
      });

      expect(argon2.verify).toHaveBeenCalledWith(
        'hashed-old-password',
        'OldSenha123',
      );
      expect(argon2.hash).toHaveBeenCalledWith('NewSenha123', { type: 2 });
      expect(repository.update).toHaveBeenCalledWith('user-1', {
        password: 'hashed-new-password',
      });
      expect(auditService.record).toHaveBeenCalledWith({
        userId: 'user-1',
        eventType: UserEventType.PasswordChanged,
        metadata: {},
      });
      expect(mailService.sendPasswordChangedEmail).toHaveBeenCalledWith({
        email: 'ana@example.com',
        name: 'Ana Silva',
      });
      expect(result).not.toHaveProperty('password');
    });

    it('does not let a password-changed email failure affect the response', async () => {
      mockUserWithPasswordQuery({
        id: 'user-1',
        email: 'ana@example.com',
        name: 'Ana Silva',
        password: 'hashed-old-password',
      });
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      (argon2.hash as jest.Mock).mockResolvedValue('hashed-new-password');
      repository.findOne.mockResolvedValueOnce({
        id: 'user-1',
        email: 'ana@example.com',
        name: 'Ana Silva',
      } as User);
      mailService.sendPasswordChangedEmail.mockRejectedValueOnce(
        new Error('SMTP down'),
      );

      await expect(
        service.changePassword('user-1', {
          currentPassword: 'OldSenha123',
          newPassword: 'NewSenha123',
          confirmNewPassword: 'NewSenha123',
        }),
      ).resolves.toMatchObject({ email: 'ana@example.com' });
    });
  });
});
