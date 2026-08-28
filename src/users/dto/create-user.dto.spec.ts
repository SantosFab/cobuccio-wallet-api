import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateUserDto, MAX_MONTHLY_INCOME } from './create-user.dto';

function buildValidPayload(): Record<string, unknown> {
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

describe('CreateUserDto', () => {
  it('accepts a fully valid payload', async () => {
    const dto = plainToInstance(CreateUserDto, buildValidPayload());

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a password without an uppercase letter, lowercase letter or number', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...buildValidPayload(),
      password: 'lowercase',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });

  it('rejects a password shorter than 8 characters', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...buildValidPayload(),
      password: 'Ab1',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });

  it('rejects an invalid CPF', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...buildValidPayload(),
      cpf: '11111111111',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'cpf')).toBe(true);
  });

  it('rejects an address with an invalid UF', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...buildValidPayload(),
      address: { ...(buildValidPayload().address as object), state: 'XX' },
    });

    const errors = await validate(dto, { whitelist: true });

    const addressError = errors.find((error) => error.property === 'address');
    expect(
      addressError?.children?.some((child) => child.property === 'state'),
    ).toBe(true);
  });

  it('rejects a name longer than the "name" column (varchar(150))', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...buildValidPayload(),
      name: 'A'.repeat(151),
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'name')).toBe(true);
  });

  it('rejects an email longer than the "email" column (varchar(255))', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...buildValidPayload(),
      email: `${'a'.repeat(250)}@example.com`,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'email')).toBe(true);
  });

  it('accepts a monthly income right at the maximum', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...buildValidPayload(),
      monthlyIncome: MAX_MONTHLY_INCOME,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a monthly income above the maximum', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...buildValidPayload(),
      monthlyIncome: MAX_MONTHLY_INCOME + 0.01,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'monthlyIncome')).toBe(
      true,
    );
  });

  // Caps input size before it ever reaches argon2 — hashing cost scales
  // with input length, so an unbounded password is a cheap CPU-exhaustion
  // vector.
  it('rejects a password longer than 128 characters', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...buildValidPayload(),
      password: `Aa1${'a'.repeat(126)}`, // 129 chars, still otherwise valid
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });
});
