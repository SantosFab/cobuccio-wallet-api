import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { AuditService } from '../audit/audit.service';
import { UserEventType } from '../audit/user-event-type';
import { User } from '../users/entities/user.entity';
import { isValidTestCard } from './utils/card.util';
import { DepositDto } from './dto/deposit.dto';
import { TransferDto } from './dto/transfer.dto';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { Wallet } from './entities/wallet.entity';
import { addAmounts, isLessThan, subtractAmounts } from './utils/money.util';

export interface WalletTransactionView {
  id: string;
  type: WalletTransaction['type'];
  amount: string;
  status: WalletTransaction['status'];
  direction: 'credit' | 'debit';
  counterpartName: string | null;
  initiatedByUserId: string;
  reversalOfTransactionId: string | null;
  createdAt: Date;
}

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletsRepository: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private readonly transactionsRepository: Repository<WalletTransaction>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async getBalance(userId: string): Promise<Wallet> {
    return this.findWalletByUserIdOrFail(this.walletsRepository, userId);
  }

  async deposit(userId: string, dto: DepositDto): Promise<WalletTransaction> {
    if (!isValidTestCard(dto.cardNumber, dto.cardCvv, dto.cardExpiry)) {
      await this.auditService.record({
        userId,
        eventType: UserEventType.WalletDepositRejectedInvalidCard,
      });
      throw new BadRequestException({
        code: 'INVALID_CARD',
        message: 'Invalid card',
      });
    }

    const amount = dto.amount.toFixed(2);

    return this.dataSource.transaction(async (manager) => {
      const wallet = await this.lockWalletByUserId(manager, userId);

      wallet.balance = addAmounts(wallet.balance, amount);
      await manager.save(wallet);

      const transaction = manager.create(WalletTransaction, {
        type: 'deposit',
        amount,
        fromWalletId: null,
        toWalletId: wallet.id,
        initiatedByUserId: userId,
      });
      const saved = await manager.save(transaction);

      await this.auditService.record(
        {
          userId,
          eventType: UserEventType.WalletDepositCompleted,
          metadata: { amount, transactionId: saved.id },
        },
        manager,
      );

      this.logger.log('[wallets-service] - deposit completed.');
      return saved;
    });
  }

  async transfer(userId: string, dto: TransferDto): Promise<WalletTransaction> {
    const amount = dto.amount.toFixed(2);

    return this.dataSource.transaction(async (manager) => {
      const senderUser = await manager.findOne(User, { where: { id: userId } });
      if (!senderUser) {
        throw new NotFoundException({
          code: 'WALLET_NOT_FOUND',
          message: 'Wallet not found',
        });
      }

      const identifier = dto.recipientIdentifier.trim();
      const recipientUser = identifier.includes('@')
        ? await manager.findOne(User, { where: { email: identifier } })
        : await manager.findOne(User, {
            where: { cpf: identifier.replace(/\D/g, '') },
          });
      if (!recipientUser) {
        throw new NotFoundException({
          code: 'RECIPIENT_NOT_FOUND',
          message: 'Recipient not found',
        });
      }
      if (recipientUser.id === senderUser.id) {
        throw new BadRequestException({
          code: 'CANNOT_TRANSFER_TO_SELF',
          message: 'Cannot transfer money to yourself',
        });
      }

      // Always lock in the same order (sorted by user id) regardless of
      // who is sender/recipient — two concurrent transfers between the
      // same pair of users, even in opposite directions, then always
      // request their locks in that same order, which is what prevents a
      // deadlock here.
      const [firstUserId, secondUserId] = [
        senderUser.id,
        recipientUser.id,
      ].sort();
      const firstWallet = await this.lockWalletByUserId(manager, firstUserId);
      const secondWallet = await this.lockWalletByUserId(manager, secondUserId);
      const senderWallet =
        firstUserId === senderUser.id ? firstWallet : secondWallet;
      const recipientWallet =
        firstUserId === senderUser.id ? secondWallet : firstWallet;

      if (isLessThan(senderWallet.balance, amount)) {
        throw new BadRequestException({
          code: 'INSUFFICIENT_BALANCE',
          message: 'Insufficient balance',
        });
      }

      senderWallet.balance = subtractAmounts(senderWallet.balance, amount);
      recipientWallet.balance = addAmounts(recipientWallet.balance, amount);
      await manager.save(senderWallet);
      await manager.save(recipientWallet);

      const transaction = manager.create(WalletTransaction, {
        type: 'transfer',
        amount,
        fromWalletId: senderWallet.id,
        toWalletId: recipientWallet.id,
        initiatedByUserId: userId,
      });
      const saved = await manager.save(transaction);

      await this.auditService.record(
        {
          userId,
          eventType: UserEventType.WalletTransferCompleted,
          metadata: {
            amount,
            transactionId: saved.id,
            recipientUserId: recipientUser.id,
          },
        },
        manager,
      );

      this.logger.log('[wallets-service] - transfer completed.');
      return saved;
    });
  }

  // Deposits have only one party, so the original depositor reverses them
  // instantly. Transfers also have only one side allowed to reverse —
  // the recipient — and it's just as instant: they click, the money goes
  // back, the sender has no say and nothing to approve.
  async reverseTransaction(
    userId: string,
    transactionId: string,
  ): Promise<WalletTransaction> {
    return this.dataSource.transaction(async (manager) => {
      const original = await manager.findOne(WalletTransaction, {
        where: { id: transactionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!original) {
        throw new NotFoundException({
          code: 'TRANSACTION_NOT_FOUND',
          message: 'Transaction not found',
        });
      }
      if (original.type === 'reversal') {
        throw new BadRequestException({
          code: 'CANNOT_REVERSE_A_REVERSAL',
          message: 'A reversal cannot be reversed',
        });
      }
      if (original.status === 'reversed') {
        throw new ConflictException({
          code: 'TRANSACTION_ALREADY_REVERSED',
          message: 'Transaction already reversed',
        });
      }

      if (original.type === 'deposit') {
        if (original.initiatedByUserId !== userId) {
          throw new ForbiddenException({
            code: 'CANNOT_REVERSE_OTHERS_TRANSACTION',
            message:
              'Only the user who initiated this transaction can reverse it',
          });
        }
        return this.executeReversal(manager, userId, original);
      }

      const recipientWallet = await manager.findOne(Wallet, {
        where: { id: original.toWalletId! },
      });
      if (!recipientWallet) {
        throw new NotFoundException({
          code: 'WALLET_NOT_FOUND',
          message: 'Wallet not found',
        });
      }
      if (recipientWallet.userId !== userId) {
        throw new ForbiddenException({
          code: 'ONLY_RECIPIENT_CAN_REVERSE',
          message: 'Only the recipient can reverse this transfer',
        });
      }

      return this.executeReversal(manager, userId, original);
    });
  }

  // Shared by the deposit and transfer paths — flips the balances back
  // and writes the compensating "reversal" transaction row.
  private async executeReversal(
    manager: EntityManager,
    userId: string,
    original: WalletTransaction,
  ): Promise<WalletTransaction> {
    // No balance check here on purpose — a reversal corrects something
    // that already happened, so it's allowed to push a wallet negative
    // if the recipient already spent what they received.
    if (original.type === 'deposit') {
      const wallet = await this.lockWalletById(manager, original.toWalletId!);
      wallet.balance = subtractAmounts(wallet.balance, original.amount);
      await manager.save(wallet);
    } else {
      const [firstWalletId, secondWalletId] = [
        original.fromWalletId!,
        original.toWalletId!,
      ].sort();
      const firstWallet = await this.lockWalletById(manager, firstWalletId);
      const secondWallet = await this.lockWalletById(manager, secondWalletId);
      const originalSenderWallet =
        firstWalletId === original.fromWalletId ? firstWallet : secondWallet;
      const originalRecipientWallet =
        firstWalletId === original.fromWalletId ? secondWallet : firstWallet;

      originalSenderWallet.balance = addAmounts(
        originalSenderWallet.balance,
        original.amount,
      );
      originalRecipientWallet.balance = subtractAmounts(
        originalRecipientWallet.balance,
        original.amount,
      );
      await manager.save(originalSenderWallet);
      await manager.save(originalRecipientWallet);
    }

    original.status = 'reversed';
    await manager.save(original);

    const reversal = manager.create(WalletTransaction, {
      type: 'reversal',
      amount: original.amount,
      fromWalletId: original.toWalletId,
      toWalletId: original.type === 'deposit' ? null : original.fromWalletId,
      initiatedByUserId: original.initiatedByUserId,
      reversalOfTransactionId: original.id,
    });
    const saved = await manager.save(reversal);

    await this.auditService.record(
      {
        userId,
        eventType: UserEventType.WalletReversalCompleted,
        metadata: {
          transactionId: original.id,
          reversalTransactionId: saved.id,
        },
      },
      manager,
    );

    this.logger.warn('[wallets-service] - transaction reversed.');
    return saved;
  }

  async listTransactions(userId: string): Promise<WalletTransactionView[]> {
    const wallet = await this.findWalletByUserIdOrFail(
      this.walletsRepository,
      userId,
    );

    const transactions = await this.transactionsRepository.find({
      where: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }],
      order: { createdAt: 'DESC' },
    });

    const counterpartWalletIds = [
      ...new Set(
        transactions
          .map((transaction) =>
            transaction.fromWalletId === wallet.id
              ? transaction.toWalletId
              : transaction.fromWalletId,
          )
          .filter((id): id is string => id !== null),
      ),
    ];

    const counterpartWallets = counterpartWalletIds.length
      ? await this.walletsRepository.find({
          where: { id: In(counterpartWalletIds) },
        })
      : [];
    const counterpartUsers = counterpartWallets.length
      ? await this.dataSource.getRepository(User).find({
          where: { id: In(counterpartWallets.map((w) => w.userId)) },
        })
      : [];

    const nameByWalletId = new Map<string, string>();
    for (const counterpartWallet of counterpartWallets) {
      const user = counterpartUsers.find(
        (candidate) => candidate.id === counterpartWallet.userId,
      );
      if (user) nameByWalletId.set(counterpartWallet.id, user.name);
    }

    return transactions.map((transaction) => {
      const isCredit = transaction.toWalletId === wallet.id;
      const counterpartWalletId = isCredit
        ? transaction.fromWalletId
        : transaction.toWalletId;

      return {
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        status: transaction.status,
        direction: isCredit ? 'credit' : 'debit',
        counterpartName: counterpartWalletId
          ? (nameByWalletId.get(counterpartWalletId) ?? null)
          : null,
        initiatedByUserId: transaction.initiatedByUserId,
        reversalOfTransactionId: transaction.reversalOfTransactionId,
        createdAt: transaction.createdAt,
      };
    });
  }

  private async findWalletByUserIdOrFail(
    repositoryOrManager: Repository<Wallet> | EntityManager,
    userId: string,
  ): Promise<Wallet> {
    const wallet =
      repositoryOrManager instanceof EntityManager
        ? await repositoryOrManager.findOne(Wallet, { where: { userId } })
        : await repositoryOrManager.findOne({ where: { userId } });

    if (!wallet) {
      throw new NotFoundException({
        code: 'WALLET_NOT_FOUND',
        message: 'Wallet not found',
      });
    }
    return wallet;
  }

  private async lockWalletByUserId(
    manager: EntityManager,
    userId: string,
  ): Promise<Wallet> {
    const wallet = await manager.findOne(Wallet, {
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      throw new NotFoundException({
        code: 'WALLET_NOT_FOUND',
        message: 'Wallet not found',
      });
    }
    return wallet;
  }

  private async lockWalletById(
    manager: EntityManager,
    walletId: string,
  ): Promise<Wallet> {
    const wallet = await manager.findOne(Wallet, {
      where: { id: walletId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      throw new NotFoundException({
        code: 'WALLET_NOT_FOUND',
        message: 'Wallet not found',
      });
    }
    return wallet;
  }
}
