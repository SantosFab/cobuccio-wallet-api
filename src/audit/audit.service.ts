import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { UserEvent } from './entities/user-event.entity';
import { UserEventType } from './user-event-type';

export interface RecordUserEventParams {
  userId: string | null;
  eventType: UserEventType;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(UserEvent)
    private readonly userEventsRepository: Repository<UserEvent>,
  ) {}

  // `manager` is passed by callers that already have an open
  // dataSource.transaction() (wallet operations) — writing the event
  // through that same manager makes it atomic with the business change
  // it's recording. Callers without a transaction (auth/users) just omit
  // it and use the injected repository directly.
  async record(
    params: RecordUserEventParams,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager
      ? manager.getRepository(UserEvent)
      : this.userEventsRepository;

    await repository.save(
      repository.create({
        userId: params.userId,
        eventType: params.eventType,
        metadata: params.metadata ?? null,
      }),
    );
  }
}
