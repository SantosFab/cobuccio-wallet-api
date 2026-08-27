import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { STRONG_PASSWORD_REGEX } from './create-user.dto';

export class ChangePasswordDto {
  @IsString()
  // Caps input size before it reaches argon2.verify — re-hashing cost
  // scales with input length, so an unbounded password is a cheap
  // CPU-exhaustion vector even on the "wrong password" path.
  @MaxLength(128)
  currentPassword: string;

  @MinLength(8)
  @MaxLength(128)
  @Matches(STRONG_PASSWORD_REGEX, {
    message:
      'newPassword must contain an uppercase letter, a lowercase letter and a number',
  })
  newPassword: string;

  @IsString()
  @MaxLength(128)
  confirmNewPassword: string;
}
