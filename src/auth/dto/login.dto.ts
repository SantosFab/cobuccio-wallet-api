import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

// No password-strength regex here on purpose: that's a signup-time rule.
// Reapplying it here would reject a valid (if old/weak) password as a
// 400 validation error instead of letting it fall through to the normal
// "invalid credentials" flow.
export class LoginDto {
  @IsEmail()
  @MaxLength(255) // matches the "email" column, varchar(255)
  email: string;

  @IsString()
  @MinLength(1)
  // Every real password was already capped at 128 by CreateUserDto, so
  // this only ever rejects an attacker's oversized input — never a
  // legitimate one. Public, unauthenticated endpoint: argon2.verify's
  // cost scales with input length, so an unbounded field here is a
  // cheap, pre-auth CPU-exhaustion vector.
  @MaxLength(128)
  password: string;
}
