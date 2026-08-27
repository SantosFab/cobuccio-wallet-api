import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { DepositDto } from './dto/deposit.dto';
import { TransferDto } from './dto/transfer.dto';
import { WalletsService } from './wallets.service';

@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get('me')
  getMyWallet(@CurrentUser() user: AuthenticatedUser) {
    return this.walletsService.getBalance(user.id);
  }

  @Post('deposits')
  @HttpCode(HttpStatus.CREATED)
  deposit(@CurrentUser() user: AuthenticatedUser, @Body() dto: DepositDto) {
    return this.walletsService.deposit(user.id, dto);
  }

  @Post('transfers')
  @HttpCode(HttpStatus.CREATED)
  transfer(@CurrentUser() user: AuthenticatedUser, @Body() dto: TransferDto) {
    return this.walletsService.transfer(user.id, dto);
  }

  @Get('transactions')
  listTransactions(@CurrentUser() user: AuthenticatedUser) {
    return this.walletsService.listTransactions(user.id);
  }

  @Post('transactions/:id/reversal')
  @HttpCode(HttpStatus.CREATED)
  reverseTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.walletsService.reverseTransaction(user.id, id);
  }
}
