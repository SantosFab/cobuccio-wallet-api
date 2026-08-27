import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { DepositDto } from './dto/deposit.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
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
  listTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTransactionsQueryDto,
  ) {
    return this.walletsService.listTransactions(user.id, {
      limit: query.limit,
      offset: query.offset,
    });
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
