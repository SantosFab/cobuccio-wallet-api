import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type WalletTransactionType = 'deposit' | 'transfer' | 'reversal';
export type WalletTransactionStatus = 'completed' | 'reversed';

// Named "WalletTransaction", not "Transaction" — this project already
// uses dataSource.transaction() everywhere for DB transactions.
@Entity('wallet_transactions')
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  type: WalletTransactionType;

  @Column({ type: 'varchar', length: 20, default: 'completed' })
  status: WalletTransactionStatus;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: string;

  @Column({ name: 'from_wallet_id', type: 'uuid', nullable: true })
  fromWalletId: string | null;

  @Column({ name: 'to_wallet_id', type: 'uuid', nullable: true })
  toWalletId: string | null;

  @Column({ name: 'initiated_by_user_id', type: 'uuid' })
  initiatedByUserId: string;

  @Column({ name: 'reversal_of_transaction_id', type: 'uuid', nullable: true })
  reversalOfTransactionId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
