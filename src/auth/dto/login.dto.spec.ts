import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { LoginDto } from './login.dto';

function buildValidPayload(): Record<string, unknown> {
  return { email: 'ana@example.com', password: 'anything' };
}

describe('LoginDto', () => {
  it('accepts a fully valid payload', async () => {
    const dto = plainToInstance(LoginDto, buildValidPayload());

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid email', async () => {
    const dto = plainToInstance(LoginDto, {
      ...buildValidPayload(),
      email: 'not-an-email',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'email')).toBe(true);
  });

  it('rejects an empty password', async () => {
    const dto = plainToInstance(LoginDto, {
      ...buildValidPayload(),
      password: '',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });

  // No password-strength regex here on purpose (see login.dto.ts) — an
  // old/weak password must still be accepted by validation and fall
  // through to the normal "invalid credentials" flow instead of a 400.
  it('accepts a password with no uppercase, lowercase or number', async () => {
    const dto = plainToInstance(LoginDto, {
      ...buildValidPayload(),
      password: 'alllowercase',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects an email longer than the "email" column (varchar(255))', async () => {
    const dto = plainToInstance(LoginDto, {
      ...buildValidPayload(),
      email: `${'a'.repeat(250)}@example.com`,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'email')).toBe(true);
  });

  // Public, unauthenticated endpoint: argon2.verify's cost scales with
  // input length, so an unbounded password is a cheap, pre-auth
  // CPU-exhaustion vector. Every real password is already capped at 128
  // by CreateUserDto, so this only ever rejects an attacker's input.
  it('rejects a password longer than 128 characters', async () => {
    const dto = plainToInstance(LoginDto, {
      ...buildValidPayload(),
      password: 'a'.repeat(129),
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });
});
