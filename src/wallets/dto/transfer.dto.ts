import {
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  Max,
} from 'class-validator';

// Well under the wallet balance column's decimal(14,2) cap — see
// DepositDto for why an unbounded amount is a problem even though it's
// positive and decimal-limited.
const MAX_AMOUNT = 1_000_000_000;

// Accepts either an email or a CPF — WalletsService.transfer() decides
// which one it is by format and looks up the recipient accordingly.
export class TransferDto {
  @IsString()
  @IsNotEmpty()
  recipientIdentifier: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_AMOUNT)
  amount: number;
}
