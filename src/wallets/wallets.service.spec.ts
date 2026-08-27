import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';

import { AuditService } from '../audit/audit.service';
import { UserEventType } from '../audit/user-event-type';
import { User } from '../users/entities/user.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { Wallet } from './entities/wallet.entity';
import { WalletsService } from './wallets.service';

const VALID_CARD = {
  cardNumber: '4242424242424242',
  cardCvv: '123',
  cardExpiry: '12/30',
};

describe('WalletsService', () => {
  let service: WalletsService;
  let walletsRepository: jest.Mocked<
    Pick<Repository<Wallet>, 'findOne' | 'find'>
  >;
  let transactionsRepository: jest.Mocked<
    Pick<Repository<WalletTransaction>, 'find'>
  >;
  let dataSource: {
    transaction: jest.Mock;
    getRepository: jest.Mock;
  };
  let manager: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let auditService: { record: jest.Mock };

  beforeEach(async () => {
    manager = {
      findOne: jest.fn(),
      create: jest.fn((_entityClass: unknown, data: unknown) => data),
      save: jest.fn((entity: Record<string, unknown>) =>
        Promise.resolve({ id: entity.id ?? 'generated-id', ...entity }),
      ),
    };
    dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => unknown) =>
        callback(manager),
      ),
      getRepository: jest.fn(),
    };
    walletsRepository = { findOne: jest.fn(), find: jest.fn() };
    transactionsRepository = { find: jest.fn() };
    auditService = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        WalletsService,
        { provide: getRepositoryToken(Wallet), useValue: walletsRepository },
        {
          provide: getRepositoryToken(WalletTransaction),
          useValue: transactionsRepository,
        },
        { provide: DataSource, useValue: dataSource },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(WalletsService);
  });

  describe('deposit', () => {
    it('adds to the balance and recomposes a negative balance', async () => {
      manager.findOne.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
        balance: '-50.00',
      });

      const result = await service.deposit('user-1', {
        amount: 30,
        ...VALID_CARD,
      });

      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ balance: '-20.00' }),
      );
      expect(result).toMatchObject({
        type: 'deposit',
        amount: '30.00',
        fromWalletId: null,
        toWalletId: 'wallet-1',
        initiatedByUserId: 'user-1',
      });
    });

    it('rejects a card number other than the test card, without touching the balance', async () => {
      await expect(
        service.deposit('user-1', {
          amount: 30,
          cardNumber: '1111111111111111',
          cardCvv: '123',
          cardExpiry: '12/30',
        }),
      ).rejects.toMatchObject({ response: { code: 'INVALID_CARD' } });

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          eventType: UserEventType.WalletDepositRejectedInvalidCard,
        }),
      );
    });

    it('rejects an expired card', async () => {
      await expect(
        service.deposit('user-1', {
          amount: 30,
          cardNumber: '4242424242424242',
          cardCvv: '123',
          cardExpiry: '01/20',
        }),
      ).rejects.toMatchObject({ response: { code: 'INVALID_CARD' } });
    });
  });

  describe('transfer', () => {
    const senderUser = { id: 'user-a', email: 'a@example.com' } as User;
    const recipientUser = { id: 'user-b', email: 'b@example.com' } as User;

    function mockUsersAndWallets(
      senderWallet: Wallet,
      recipientWallet: Wallet,
    ) {
      manager.findOne.mockImplementation(
        (entityClass: unknown, options: { where: Record<string, unknown> }) => {
          if (entityClass === User) {
            if (options.where.id === senderUser.id)
              return Promise.resolve(senderUser);
            if (options.where.email === recipientUser.email)
              return Promise.resolve(recipientUser);
            return Promise.resolve(null);
          }
          if (entityClass === Wallet) {
            if (options.where.userId === senderUser.id)
              return Promise.resolve({ ...senderWallet });
            if (options.where.userId === recipientUser.id)
              return Promise.resolve({ ...recipientWallet });
          }
          return Promise.resolve(null);
        },
      );
    }

    it('debits the sender and credits the recipient', async () => {
      mockUsersAndWallets(
        { id: 'wallet-a', userId: 'user-a', balance: '100.00' } as Wallet,
        { id: 'wallet-b', userId: 'user-b', balance: '10.00' } as Wallet,
      );

      const result = await service.transfer('user-a', {
        recipientIdentifier: 'b@example.com',
        amount: 20,
      });

      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'wallet-a', balance: '80.00' }),
      );
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'wallet-b', balance: '30.00' }),
      );
      expect(result).toMatchObject({
        type: 'transfer',
        amount: '20.00',
        fromWalletId: 'wallet-a',
        toWalletId: 'wallet-b',
        initiatedByUserId: 'user-a',
      });
    });

    it('looks up the recipient by CPF when the identifier is not an email', async () => {
      manager.findOne.mockImplementation(
        (entityClass: unknown, options: { where: Record<string, unknown> }) => {
          if (entityClass === User) {
            if (options.where.id === senderUser.id)
              return Promise.resolve(senderUser);
            if (options.where.cpf === '52998224725')
              return Promise.resolve(recipientUser);
            return Promise.resolve(null);
          }
          if (entityClass === Wallet) {
            if (options.where.userId === senderUser.id)
              return Promise.resolve({
                id: 'wallet-a',
                userId: 'user-a',
                balance: '100.00',
              });
            if (options.where.userId === recipientUser.id)
              return Promise.resolve({
                id: 'wallet-b',
                userId: 'user-b',
                balance: '10.00',
              });
          }
          return Promise.resolve(null);
        },
      );

      const result = await service.transfer('user-a', {
        recipientIdentifier: '529.982.247-25',
        amount: 20,
      });

      expect(result).toMatchObject({
        fromWalletId: 'wallet-a',
        toWalletId: 'wallet-b',
      });
    });

    it('rejects when the sender does not have enough balance', async () => {
      mockUsersAndWallets(
        { id: 'wallet-a', userId: 'user-a', balance: '10.00' } as Wallet,
        { id: 'wallet-b', userId: 'user-b', balance: '0.00' } as Wallet,
      );

      await expect(
        service.transfer('user-a', {
          recipientIdentifier: 'b@example.com',
          amount: 20,
        }),
      ).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_BALANCE' } });
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rejects transferring to yourself', async () => {
      manager.findOne.mockImplementation(
        (entityClass: unknown, options: { where: Record<string, unknown> }) => {
          if (entityClass === User) {
            if (options.where.id === senderUser.id)
              return Promise.resolve(senderUser);
            if (options.where.email === senderUser.email)
              return Promise.resolve(senderUser);
          }
          return Promise.resolve(null);
        },
      );

      await expect(
        service.transfer('user-a', {
          recipientIdentifier: senderUser.email,
          amount: 20,
        }),
      ).rejects.toMatchObject({
        response: { code: 'CANNOT_TRANSFER_TO_SELF' },
      });
    });

    it('rejects when the recipient does not exist', async () => {
      manager.findOne.mockImplementation(
        (entityClass: unknown, options: { where: Record<string, unknown> }) => {
          if (entityClass === User && options.where.id === senderUser.id) {
            return Promise.resolve(senderUser);
          }
          return Promise.resolve(null);
        },
      );

      await expect(
        service.transfer('user-a', {
          recipientIdentifier: 'missing@example.com',
          amount: 20,
        }),
      ).rejects.toMatchObject({ response: { code: 'RECIPIENT_NOT_FOUND' } });
    });

    it('always locks wallets in ascending user-id order, regardless of who is the sender', async () => {
      // sender id ('user-z') sorts AFTER recipient id ('user-a') — the
      // lock order must still start with 'user-a', not with the sender.
      const senderZ = { id: 'user-z', email: 'z@example.com' } as User;
      const recipientA = { id: 'user-a', email: 'a2@example.com' } as User;

      manager.findOne.mockImplementation(
        (entityClass: unknown, options: { where: Record<string, unknown> }) => {
          if (entityClass === User) {
            if (options.where.id === senderZ.id)
              return Promise.resolve(senderZ);
            if (options.where.email === recipientA.email)
              return Promise.resolve(recipientA);
          }
          if (entityClass === Wallet) {
            if (options.where.userId === senderZ.id)
              return Promise.resolve({
                id: 'wallet-z',
                userId: 'user-z',
                balance: '100.00',
              });
            if (options.where.userId === recipientA.id)
              return Promise.resolve({
                id: 'wallet-a',
                userId: 'user-a',
                balance: '0.00',
              });
          }
          return Promise.resolve(null);
        },
      );

      await service.transfer('user-z', {
        recipientIdentifier: 'a2@example.com',
        amount: 10,
      });

      const walletLockCalls = manager.findOne.mock.calls.filter(
        ([entityClass]) => entityClass === Wallet,
      ) as [unknown, { where: Record<string, unknown> }][];
      expect(walletLockCalls[0][1]).toMatchObject({
        where: { userId: 'user-a' },
      });
      expect(walletLockCalls[1][1]).toMatchObject({
        where: { userId: 'user-z' },
      });
    });
  });

  describe('reverseTransaction', () => {
    it('reverses a deposit and allows the balance to go negative', async () => {
      const original = {
        id: 'tx-1',
        type: 'deposit',
        status: 'completed',
        amount: '50.00',
        fromWalletId: null,
        toWalletId: 'wallet-1',
        initiatedByUserId: 'user-1',
        reversalOfTransactionId: null,
      };
      manager.findOne.mockImplementation(
        (entityClass: unknown, options: { where: Record<string, unknown> }) => {
          if (entityClass === WalletTransaction)
            return Promise.resolve(original);
          if (entityClass === Wallet && options.where.id === 'wallet-1') {
            return Promise.resolve({
              id: 'wallet-1',
              userId: 'user-1',
              balance: '20.00',
            });
          }
          return Promise.resolve(null);
        },
      );

      const result = await service.reverseTransaction('user-1', 'tx-1');

      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'wallet-1', balance: '-30.00' }),
      );
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tx-1', status: 'reversed' }),
      );
      expect(result).toMatchObject({
        type: 'reversal',
        amount: '50.00',
        fromWalletId: 'wallet-1',
        toWalletId: null,
        reversalOfTransactionId: 'tx-1',
      });
    });

    describe('transfer reversal (recipient only, instant)', () => {
      function mockTransferTransaction(original: Record<string, unknown>) {
        manager.findOne.mockImplementation(
          (
            entityClass: unknown,
            options: { where: Record<string, unknown> },
          ) => {
            if (entityClass === WalletTransaction)
              return Promise.resolve(original);
            if (entityClass === Wallet && options.where.id === 'wallet-a') {
              return Promise.resolve({
                id: 'wallet-a',
                userId: 'user-a',
                balance: '80.00',
              });
            }
            if (entityClass === Wallet && options.where.id === 'wallet-b') {
              return Promise.resolve({
                id: 'wallet-b',
                userId: 'user-b',
                balance: '30.00',
              });
            }
            return Promise.resolve(null);
          },
        );
      }

      function buildOriginal(overrides: Record<string, unknown> = {}) {
        return {
          id: 'tx-2',
          type: 'transfer',
          status: 'completed',
          amount: '20.00',
          fromWalletId: 'wallet-a',
          toWalletId: 'wallet-b',
          initiatedByUserId: 'user-a',
          reversalOfTransactionId: null,
          ...overrides,
        };
      }

      it('lets the recipient reverse it instantly', async () => {
        mockTransferTransaction(buildOriginal());

        // wallet-a = sender (user-a), wallet-b = recipient (user-b).
        const result = await service.reverseTransaction('user-b', 'tx-2');

        expect(manager.save).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'wallet-a', balance: '100.00' }),
        );
        expect(manager.save).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'wallet-b', balance: '10.00' }),
        );
        expect(result).toMatchObject({
          type: 'reversal',
          fromWalletId: 'wallet-b',
          toWalletId: 'wallet-a',
          reversalOfTransactionId: 'tx-2',
        });
        expect(auditService.record).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-b',
            eventType: UserEventType.WalletReversalCompleted,
          }),
          manager,
        );
      });

      it('rejects the sender trying to reverse it — only the recipient can', async () => {
        mockTransferTransaction(buildOriginal());

        await expect(
          service.reverseTransaction('user-a', 'tx-2'),
        ).rejects.toMatchObject({
          response: { code: 'ONLY_RECIPIENT_CAN_REVERSE' },
        });
        expect(manager.save).not.toHaveBeenCalled();
      });

      it('rejects someone who is not a party to the transfer', async () => {
        mockTransferTransaction(buildOriginal());

        await expect(
          service.reverseTransaction('someone-else', 'tx-2'),
        ).rejects.toMatchObject({
          response: { code: 'ONLY_RECIPIENT_CAN_REVERSE' },
        });
      });
    });

    it('rejects when the caller is not who initiated the transaction', async () => {
      manager.findOne.mockResolvedValue({
        id: 'tx-1',
        type: 'deposit',
        status: 'completed',
        amount: '50.00',
        fromWalletId: null,
        toWalletId: 'wallet-1',
        initiatedByUserId: 'user-1',
        reversalOfTransactionId: null,
      });

      await expect(
        service.reverseTransaction('someone-else', 'tx-1'),
      ).rejects.toMatchObject({
        response: { code: 'CANNOT_REVERSE_OTHERS_TRANSACTION' },
      });
    });

    it('rejects a transaction that was already reversed', async () => {
      manager.findOne.mockResolvedValue({
        id: 'tx-1',
        type: 'deposit',
        status: 'reversed',
        amount: '50.00',
        fromWalletId: null,
        toWalletId: 'wallet-1',
        initiatedByUserId: 'user-1',
        reversalOfTransactionId: null,
      });

      await expect(
        service.reverseTransaction('user-1', 'tx-1'),
      ).rejects.toMatchObject({
        response: { code: 'TRANSACTION_ALREADY_REVERSED' },
      });
    });

    it('rejects reversing a reversal', async () => {
      manager.findOne.mockResolvedValue({
        id: 'tx-2',
        type: 'reversal',
        status: 'completed',
        amount: '50.00',
        fromWalletId: 'wallet-1',
        toWalletId: null,
        initiatedByUserId: 'user-1',
        reversalOfTransactionId: 'tx-1',
      });

      await expect(
        service.reverseTransaction('user-1', 'tx-2'),
      ).rejects.toMatchObject({
        response: { code: 'CANNOT_REVERSE_A_REVERSAL' },
      });
    });

    it('rejects when the transaction does not exist', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.reverseTransaction('user-1', 'missing-tx'),
      ).rejects.toMatchObject({ response: { code: 'TRANSACTION_NOT_FOUND' } });
    });
  });
});
