import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNumber,
  IsPositive,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { IsCpf } from '../validators/is-cpf.validator';
import { AddressDto } from './address.dto';

const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  name: string;

  @IsEmail()
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
  monthlyIncome: number;

  @MinLength(8)
  @Matches(STRONG_PASSWORD_REGEX, {
    message:
      'password must contain an uppercase letter, a lowercase letter and a number',
  })
  password: string;
}
