import { ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { DataSource, Repository } from 'typeorm';

import { CreateUserDto } from './dto/create-user.dto';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

jest.mock('argon2', () => ({
  argon2id: 2,
  hash: jest.fn(),
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
  let manager: { create: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    manager = {
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

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(UsersService);
    repository = module.get(getRepositoryToken(User));

    (argon2.hash as jest.Mock).mockResolvedValue('hashed-password');
  });

  it('creates a user and its address in the same transaction, never returning the password', async () => {
    repository.findOne.mockResolvedValue(null);

    const result = await service.create(buildDto());

    expect(argon2.hash).toHaveBeenCalledWith('Senha123', { type: 2 });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledTimes(2); // user, then address
    expect(result).not.toHaveProperty('password');
    expect(result.email).toBe('ana@example.com');
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
});
