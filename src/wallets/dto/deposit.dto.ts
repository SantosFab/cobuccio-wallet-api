import {
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  Matches,
} from 'class-validator';

export class DepositDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsString()
  @IsNotEmpty()
  cardNumber: string;

  @IsString()
  @Matches(/^\d{3}$/, { message: 'cardCvv must be exactly 3 digits' })
  cardCvv: string;

  @IsString()
  @Matches(/^\d{2}\/\d{2}$/, { message: 'cardExpiry must be in MM/YY format' })
  cardExpiry: string;
}
