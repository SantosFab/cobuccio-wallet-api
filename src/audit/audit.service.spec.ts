import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { EntityManager, Repository } from 'typeorm';

import { AuditService } from './audit.service';
import { UserEvent } from './entities/user-event.entity';
import { UserEventType } from './user-event-type';

describe('AuditService', () => {
  let service: AuditService;
  let repository: jest.Mocked<Pick<Repository<UserEvent>, 'create' | 'save'>>;

  beforeEach(async () => {
    repository = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- TypeORM's overloaded create() signature doesn't unify with jest.fn()'s inferred type.
      create: jest.fn((data) => data as UserEvent) as any,
      save: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getRepositoryToken(UserEvent), useValue: repository },
      ],
    }).compile();

    service = module.get(AuditService);
  });

  it('saves through the injected repository when no manager is given', async () => {
    await service.record({
      userId: 'user-1',
      eventType: UserEventType.AuthLoginSucceeded,
    });

    expect(repository.create).toHaveBeenCalledWith({
      userId: 'user-1',
      eventType: UserEventType.AuthLoginSucceeded,
      metadata: null,
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('defaults metadata to null when not provided', async () => {
    await service.record({
      userId: null,
      eventType: UserEventType.AuthLoginFailed,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: null }),
    );
  });

  it('writes through the given manager instead of the injected repository, when passed', async () => {
    const managerRepository = {
      create: jest.fn((data: unknown) => data as UserEvent),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue(managerRepository),
    } as unknown as EntityManager;

    await service.record(
      {
        userId: 'user-1',
        eventType: UserEventType.WalletDepositCompleted,
        metadata: { amount: '10.00' },
      },
      manager,
    );

    expect(manager.getRepository).toHaveBeenCalledWith(UserEvent);
    expect(managerRepository.save).toHaveBeenCalledTimes(1);
    expect(repository.save).not.toHaveBeenCalled();
  });
});
