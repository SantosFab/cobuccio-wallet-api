import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  // Same convention as User.monthlyIncome: the pg driver returns
  // decimal/numeric as a string to avoid float precision loss. Can go
  // negative — see wallets.service.ts reverseTransaction().
  @Column({ type: 'decimal', precision: 14, scale: 2, default: '0.00' })
  balance: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
