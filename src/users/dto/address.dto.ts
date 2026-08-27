import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export const BRAZILIAN_STATES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

export class AddressDto {
  @Matches(/^\d{8}$/, { message: 'zipCode must contain exactly 8 digits' })
  zipCode: string;

  @IsString()
  @MaxLength(255) // matches the "street" column, varchar(255)
  street: string;

  @IsString()
  @MaxLength(20) // matches the "number" column, varchar(20)
  number: string;

  @IsOptional()
  @IsString()
  @MaxLength(100) // matches the "complement" column, varchar(100)
  complement?: string;

  @IsString()
  @MaxLength(100) // matches the "neighborhood" column, varchar(100)
  neighborhood: string;

  @IsString()
  @MaxLength(100) // matches the "city" column, varchar(100)
  city: string;

  @IsIn(BRAZILIAN_STATES, { message: 'state must be a valid Brazilian UF' })
  state: string;
}
