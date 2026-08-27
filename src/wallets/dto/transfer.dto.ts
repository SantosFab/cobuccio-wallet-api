import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

// Accepts either an email or a CPF — WalletsService.transfer() decides
// which one it is by format and looks up the recipient accordingly.
export class TransferDto {
  @IsString()
  @IsNotEmpty()
  recipientIdentifier: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;
}
