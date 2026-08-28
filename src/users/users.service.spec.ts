import { BadRequestException, ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { DataSource, Repository } from 'typeorm';

import { AuditService } from '../audit/audit.service';
import { UserEventType } from '../audit/user-event-type';
import { MailService } from '../mail/mail.service';
import { AvatarStorageService } from './avatar-storage.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

jest.mock('argon2', () => ({
  argon2id: 2,
  hash: jest.fn(),
  verify: jest.fn(),
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
  let avatarStorageService: { save: jest.Mock; delete: jest.Mock };
  let module: TestingModule;

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
    // Content validation and disk I/O both live in AvatarStorageService now
    // (see avatar-storage.service.spec.ts) — UsersService only needs to
    // know that `save` resolves with a URL and `delete` cleans up, so it's
    // mocked at that boundary instead of reaching into the filesystem.
    avatarStorageService = {
      save: jest.fn().mockResolvedValue('/uploads/avatars/generated.jpg'),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        { provide: DataSource, useValue: dataSource },
        { provide: AuditService, useValue: auditService },
        { provide: MailService, useValue: mailService },
        { provide: AvatarStorageService, useValue: avatarStorageService },
      ],
    }).compile();

    service = module.get(UsersService);
    repository = module.get(getRepositoryToken(User));

    (argon2.hash as jest.Mock).mockResolvedValue('hashed-password');
  });

  afterEach(async () => {
    await module.close();
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

  describe('findByIdBasic', () => {
    it('selects only id, name and email', async () => {
      repository.findOne.mockResolvedValue({
        id: 'user-1',
        name: 'Ana Silva',
        email: 'ana@example.com',
      } as User);

      const result = await service.findByIdBasic('user-1');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: ['id', 'name', 'email'],
      });
      expect(result).toMatchObject({ id: 'user-1', name: 'Ana Silva' });
    });

    it('queries through the given manager instead of the injected repository when provided', async () => {
      const managerRepository = { findOne: jest.fn().mockResolvedValue(null) };
      const scopedManager = {
        getRepository: jest.fn().mockReturnValue(managerRepository),
      } as unknown as import('typeorm').EntityManager;

      await service.findByIdBasic('user-1', scopedManager);

      expect(managerRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: ['id', 'name', 'email'],
      });
      expect(repository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('findByEmailOrCpf', () => {
    it('looks up by email when the identifier contains "@"', async () => {
      repository.findOne.mockResolvedValue(null);

      await service.findByEmailOrCpf('ana@example.com');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { email: 'ana@example.com' },
        select: ['id', 'name', 'email'],
      });
    });

    it('looks up by CPF (digits only) when the identifier has no "@"', async () => {
      repository.findOne.mockResolvedValue(null);

      await service.findByEmailOrCpf('529.982.247-25');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { cpf: '52998224725' },
        select: ['id', 'name', 'email'],
      });
    });
  });

  describe('findNamesByIds', () => {
    it('returns a map of id to name', async () => {
      repository.find.mockResolvedValue([
        { id: 'user-1', name: 'Ana Silva' },
        { id: 'user-2', name: 'João Souza' },
      ] as User[]);

      const result = await service.findNamesByIds(['user-1', 'user-2']);

      expect(result.get('user-1')).toBe('Ana Silva');
      expect(result.get('user-2')).toBe('João Souza');
    });

    it('returns an empty map without querying when given no ids', async () => {
      const result = await service.findNamesByIds([]);

      expect(result.size).toBe(0);
      expect(repository.find).not.toHaveBeenCalled();
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
    function buildUploadedFile(
      overrides: Partial<Express.Multer.File> = {},
    ): Express.Multer.File {
      return {
        mimetype: 'image/jpeg',
        buffer: Buffer.from('fake-jpeg-bytes'),
        ...overrides,
      } as Express.Multer.File;
    }

    it('saves the file via AvatarStorageService, deletes the previous avatar and audits the change', async () => {
      avatarStorageService.save.mockResolvedValueOnce(
        '/uploads/avatars/new-generated.jpg',
      );
      repository.findOne
        .mockResolvedValueOnce({
          id: 'user-1',
          avatarUrl: '/uploads/avatars/old.jpg',
        } as User)
        .mockResolvedValueOnce({
          id: 'user-1',
          avatarUrl: '/uploads/avatars/new-generated.jpg',
        } as User);

      const file = buildUploadedFile();
      await service.updateAvatar('user-1', file);

      // UsersService only orchestrates "what changes on the user row" —
      // it hands the raw file to AvatarStorageService and trusts whatever
      // URL comes back, never touching bytes or paths itself.
      expect(avatarStorageService.save).toHaveBeenCalledWith(file);
      expect(avatarStorageService.delete).toHaveBeenCalledWith(
        '/uploads/avatars/old.jpg',
      );
      expect(repository.update).toHaveBeenCalledWith('user-1', {
        avatarUrl: '/uploads/avatars/new-generated.jpg',
      });
      expect(auditService.record).toHaveBeenCalledWith({
        userId: 'user-1',
        eventType: UserEventType.AvatarUpdated,
        metadata: {
          avatarUrl: {
            before: '/uploads/avatars/old.jpg',
            after: '/uploads/avatars/new-generated.jpg',
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

      expect(avatarStorageService.delete).not.toHaveBeenCalled();
    });

    it('propagates the rejection from AvatarStorageService without touching the database', async () => {
      repository.findOne.mockResolvedValueOnce({
        id: 'user-1',
        avatarUrl: null,
      } as User);
      avatarStorageService.save.mockRejectedValueOnce(
        new BadRequestException({
          code: 'UNSUPPORTED_FILE_TYPE',
          message: 'Unsupported file type',
        }),
      );

      await expect(
        service.updateAvatar('user-1', buildUploadedFile()),
      ).rejects.toMatchObject({
        response: { code: 'UNSUPPORTED_FILE_TYPE' },
      });

      expect(repository.update).not.toHaveBeenCalled();
      expect(avatarStorageService.delete).not.toHaveBeenCalled();
    });

    it('rejects when the user does not exist, without calling AvatarStorageService', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.updateAvatar('missing-id', buildUploadedFile()),
      ).rejects.toThrow();

      expect(avatarStorageService.save).not.toHaveBeenCalled();
    });
  });

  describe('removeAvatar', () => {
    it('deletes the file via AvatarStorageService, clears the column and audits the removal', async () => {
      repository.findOne
        .mockResolvedValueOnce({
          id: 'user-1',
          avatarUrl: '/uploads/avatars/old.jpg',
        } as User)
        .mockResolvedValueOnce({ id: 'user-1', avatarUrl: null } as User);

      await service.removeAvatar('user-1');

      expect(avatarStorageService.delete).toHaveBeenCalledWith(
        '/uploads/avatars/old.jpg',
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

    it('does not call delete when there was no previous avatar', async () => {
      repository.findOne
        .mockResolvedValueOnce({ id: 'user-1', avatarUrl: null } as User)
        .mockResolvedValueOnce({ id: 'user-1', avatarUrl: null } as User);

      await service.removeAvatar('user-1');

      expect(avatarStorageService.delete).not.toHaveBeenCalled();
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
