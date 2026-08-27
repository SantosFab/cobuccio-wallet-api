import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsPositive,
  Matches,
  ValidateNested,
} from 'class-validator';

import { AddressDto } from './address.dto';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
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
  monthlyIncome?: number;
}
