import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ChangePasswordDto } from './change-password.dto';

function buildValidPayload(): Record<string, unknown> {
  return {
    currentPassword: 'OldSenha123',
    newPassword: 'NewSenha123',
    confirmNewPassword: 'NewSenha123',
  };
}

describe('ChangePasswordDto', () => {
  it('accepts a fully valid payload', async () => {
    const dto = plainToInstance(ChangePasswordDto, buildValidPayload());

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  // No password-strength regex on currentPassword on purpose — same
  // reasoning as LoginDto: it might be an old/weak password, and the
  // "is it actually correct" check happens in the service, not here.
  it('accepts any non-empty string as the current password', async () => {
    const dto = plainToInstance(ChangePasswordDto, {
      ...buildValidPayload(),
      currentPassword: 'anything',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a new password shorter than 8 characters', async () => {
    const dto = plainToInstance(ChangePasswordDto, {
      ...buildValidPayload(),
      newPassword: 'Ab1',
      confirmNewPassword: 'Ab1',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'newPassword')).toBe(true);
  });

  it('rejects a new password without an uppercase letter, lowercase letter or number', async () => {
    const dto = plainToInstance(ChangePasswordDto, {
      ...buildValidPayload(),
      newPassword: 'lowercase',
      confirmNewPassword: 'lowercase',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'newPassword')).toBe(true);
  });

  // Every field here eventually reaches argon2.hash/argon2.verify, whose
  // cost scales with input length — an unbounded field is a cheap
  // CPU-exhaustion vector, even on an authenticated endpoint.
  it('rejects a current password longer than 128 characters', async () => {
    const dto = plainToInstance(ChangePasswordDto, {
      ...buildValidPayload(),
      currentPassword: 'a'.repeat(129),
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'currentPassword')).toBe(
      true,
    );
  });

  it('rejects a new password longer than 128 characters', async () => {
    const tooLong = `Aa1${'a'.repeat(126)}`; // 129 chars, still otherwise valid

    const dto = plainToInstance(ChangePasswordDto, {
      ...buildValidPayload(),
      newPassword: tooLong,
      confirmNewPassword: tooLong,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'newPassword')).toBe(true);
  });

  it('rejects a confirmation longer than 128 characters', async () => {
    const dto = plainToInstance(ChangePasswordDto, {
      ...buildValidPayload(),
      confirmNewPassword: 'a'.repeat(129),
    });

    const errors = await validate(dto);

    expect(
      errors.some((error) => error.property === 'confirmNewPassword'),
    ).toBe(true);
  });
});
