import {
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  Matches,
  Max,
} from 'class-validator';

// Well under the wallet balance column's decimal(14,2) cap — high enough
// that no legitimate deposit ever hits it, but bounded so an absurd
// finite value (e.g. 1e21) can't reach the money.util.ts arithmetic,
// where amount.toFixed(2) silently switches to exponential notation and
// produces a broken decimal string instead of a clean validation error.
const MAX_AMOUNT = 1_000_000_000;

export class DepositDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_AMOUNT)
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
