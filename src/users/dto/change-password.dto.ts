import { IsString, Matches, MinLength } from 'class-validator';

import { STRONG_PASSWORD_REGEX } from './create-user.dto';

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @MinLength(8)
  @Matches(STRONG_PASSWORD_REGEX, {
    message:
      'newPassword must contain an uppercase letter, a lowercase letter and a number',
  })
  newPassword: string;

  @IsString()
  confirmNewPassword: string;
}
