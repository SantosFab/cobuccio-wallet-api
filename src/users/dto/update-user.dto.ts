import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsPositive,
  Matches,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { AddressDto } from './address.dto';
import { MAX_MONTHLY_INCOME } from './create-user.dto';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(255) // matches the "email" column, varchar(255)
  email?: string;

  // Same rule as CreateUserDto: mobile numbers only (DDD + 9 digits,
  // always starting with 9).
  @IsOptional()
  @Matches(/^\d{2}9\d{8}$/, {
    message: 'phone must be a valid mobile number (DDD + 9 digits)',
  })
  phone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(MAX_MONTHLY_INCOME)
  monthlyIncome?: number;
}
