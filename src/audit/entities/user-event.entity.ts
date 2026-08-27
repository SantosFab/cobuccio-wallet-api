import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { UserEventType } from '../user-event-type';

@Entity('user_events')
export class UserEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Nullable: some events (e.g. a failed login for an email that matches
  // no user) have no real user to attach to.
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  // Kept as varchar in the database (not a native Postgres enum) — same
  // reasoning as WalletTransaction.status: adding a new event type later
  // is a plain INSERT-compatible value, not an ALTER TYPE migration.
  // UserEventType is still enforced at the TypeScript layer below.
  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: UserEventType;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
