import {
  Column,
  CreateDateColumn,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Address } from './address.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'char', length: 11, unique: true })
  cpf: string;

  @Column({ type: 'varchar', length: 11 })
  phone: string;

  // The `pg` driver returns `decimal`/`numeric` columns as strings to avoid
  // floating-point precision loss, so money fields are typed `string` here
  // (not `number`) all the way through — only converted at the API boundary.
  @Column({ name: 'monthly_income', type: 'decimal', precision: 12, scale: 2 })
  monthlyIncome: string;

  @Column({ type: 'varchar', length: 255, select: false })
  password: string;

  // Inverse side, no @JoinColumn — Address is the owning side and holds
  // the foreign key (address.user_id).
  @OneToOne(() => Address, (address) => address.user)
  address: Address;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
