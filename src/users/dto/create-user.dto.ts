import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNumber,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { IsCpf } from '../validators/is-cpf.validator';
import { AddressDto } from './address.dto';

export const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

// Well under the wallet balance column's decimal(14,2) cap — see
// wallets/dto/deposit.dto.ts for why an unbounded amount is a problem
// even though it's already positive and decimal-limited.
export const MAX_MONTHLY_INCOME = 1_000_000_000;

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(150) // matches the "name" column, varchar(150)
  name: string;

  @IsEmail()
  @MaxLength(255) // matches the "email" column, varchar(255)
  email: string;

  @IsCpf()
  cpf: string;

  // Mobile numbers only (DDD + 9 digits, always starting with 9) —
  // landlines are out of scope.
  @Matches(/^\d{2}9\d{8}$/, {
    message: 'phone must be a valid mobile number (DDD + 9 digits)',
  })
  phone: string;

  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @IsNumber()
  @IsPositive()
  @Max(MAX_MONTHLY_INCOME)
  monthlyIncome: number;

  @MinLength(8)
  // Caps input size before it ever reaches argon2 — hashing cost scales
  // with input length, so an unbounded password is a cheap CPU-exhaustion
  // vector. 128 chars is far beyond any real passphrase.
  @MaxLength(128)
  @Matches(STRONG_PASSWORD_REGEX, {
    message:
      'password must contain an uppercase letter, a lowercase letter and a number',
  })
  password: string;
}
