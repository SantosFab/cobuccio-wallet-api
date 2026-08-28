import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { Wallet } from './entities/wallet.entity';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, WalletTransaction]),
    AuditModule,
    MailModule,
    UsersModule,
  ],
  controllers: [WalletsController],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
