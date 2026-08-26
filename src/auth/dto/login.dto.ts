import { IsEmail, IsString, MinLength } from 'class-validator';

// No password-strength regex here on purpose: that's a signup-time rule.
// Reapplying it here would reject a valid (if old/weak) password as a
// 400 validation error instead of letting it fall through to the normal
// "invalid credentials" flow.
export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}
