import { OutboxStatus, Prisma } from '@prisma/client';
import {
  OutboxDispatcherService,
  OutboxEventRecord,
  OutboxPrismaLike,
} from './outbox-dispatcher.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';

describe('OutboxDispatcherService', () => {
  const samplePayload = {
    id: 'evt-1',
    type: 'order.status.updated',
    resource: 'order',
    action: 'UPDATED',
    branchId: 'branch-1',
    timestamp: new Date().toISOString(),
    payload: {
      orderId: 'order-1',
      status: 'PREPARING',
    },
  };

  function createInMemoryOutboxStore(initialRows: OutboxEventRecord[]) {
    const rows = new Map<string, OutboxEventRecord>(
      initialRows.map((r) => [r.id, { ...r }]),
    );

    const prisma: OutboxPrismaLike = {
      outboxEvent: {
        findMany: jest.fn(async () => {
          const now = new Date();
          return Array.from(rows.values()).filter((r) => {
            const validStatus =
              r.status === OutboxStatus.PENDING ||
              r.status === OutboxStatus.FAILED;
            const readyAttempt =
              !r.nextAttemptAt || r.nextAttemptAt.getTime() <= now.getTime();
            const leaseFree =
              !r.claimedUntil || r.claimedUntil.getTime() < now.getTime();
            return validStatus && readyAttempt && leaseFree;
          });
        }),
        updateMany: jest.fn(async (args: Prisma.OutboxEventUpdateManyArgs) => {
          const where = args.where ?? {};
          const id = typeof where.id === 'string' ? where.id : undefined;
          if (!id) return { count: 0 };
          const current = rows.get(id);
          if (!current) return { count: 0 };

          if (
            typeof where.status === 'string' &&
            current.status !== where.status
          ) {
            return { count: 0 };
          }

          if (
            typeof where.claimedBy === 'string' &&
            current.claimedBy !== where.claimedBy
          ) {
            return { count: 0 };
          }

          if (Array.isArray(where.OR)) {
            const now = new Date();
            const isLeaseExpiredOrNull =
              !current.claimedUntil ||
              current.claimedUntil.getTime() < now.getTime();
            if (!isLeaseExpiredOrNull) {
              return { count: 0 };
            }
          }

          const data = args.data as Record<string, unknown>;
          const nextRow: OutboxEventRecord = { ...current };

          if ('status' in data && typeof data.status === 'string') {
            nextRow.status = data.status as OutboxStatus;
          }
          if ('claimedBy' in data) {
            nextRow.claimedBy = (data.claimedBy as string | null) ?? null;
          }
          if ('claimedUntil' in data) {
            nextRow.claimedUntil = (data.claimedUntil as Date | null) ?? null;
          }
          if ('nextAttemptAt' in data) {
            nextRow.nextAttemptAt = (data.nextAttemptAt as Date | null) ?? null;
          }
          if ('publishedAt' in data) {
            nextRow.publishedAt = (data.publishedAt as Date | null) ?? null;
          }
          if ('lastError' in data) {
            nextRow.lastError = (data.lastError as string | null) ?? null;
          }
          if (
            'retryCount' in data &&
            typeof data.retryCount === 'object' &&
            data.retryCount !== null &&
            'increment' in data.retryCount
          ) {
            const inc = Number(
              (data.retryCount as { increment: number }).increment,
            );
            nextRow.retryCount = (nextRow.retryCount ?? 0) + inc;
          }

          rows.set(id, nextRow);
          return { count: 1 };
        }),
      },
    };

    return { rows, prisma };
  }

  it('should mark event FAILED with backoff when publish returns false, then publish on subsequent retry', async () => {
    const { rows, prisma } = createInMemoryOutboxStore([
      {
        id: 'outbox-1',
        aggregateType: 'order',
        aggregateId: 'order-1',
        eventType: 'order.status.updated',
        payload: samplePayload,
        status: OutboxStatus.PENDING,
        retryCount: 0,
        claimedBy: null,
        claimedUntil: null,
        nextAttemptAt: null,
        createdAt: new Date(),
      },
    ]);

    const publishEvent = jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const rabbitmqService = {
      publishEvent,
    } as unknown as RabbitMQService;

    const dispatcher = new OutboxDispatcherService(prisma, rabbitmqService, {
      workerId: 'worker-1',
      baseBackoffMs: 10,
      maxBackoffMs: 100,
    });

    // Attempt 1 fails (unconfirmed)
    const firstPublished = await dispatcher.dispatchBatch();
    expect(firstPublished).toBe(0);

    const afterFail = rows.get('outbox-1')!;
    expect(afterFail.status).toBe(OutboxStatus.FAILED);
    expect(afterFail.retryCount).toBe(1);
    expect(afterFail.claimedBy).toBeNull();
    expect(afterFail.claimedUntil).toBeNull();
    expect(afterFail.nextAttemptAt).toBeInstanceOf(Date);

    // Expire backoff window and retry
    afterFail.nextAttemptAt = new Date(Date.now() - 100);
    rows.set('outbox-1', afterFail);

    const secondPublished = await dispatcher.dispatchBatch();
    expect(secondPublished).toBe(1);
    expect(publishEvent).toHaveBeenCalledTimes(2);

    const afterSuccess = rows.get('outbox-1')!;
    expect(afterSuccess.status).toBe(OutboxStatus.PUBLISHED);
    expect(afterSuccess.publishedAt).toBeInstanceOf(Date);
    expect(afterSuccess.claimedBy).toBeNull();
    expect(afterSuccess.claimedUntil).toBeNull();
  });

  it('should prevent duplicate publish when two dispatchers race on the same pending row', async () => {
    const { rows, prisma } = createInMemoryOutboxStore([
      {
        id: 'outbox-race-1',
        aggregateType: 'inventory',
        aggregateId: 'ing-1',
        eventType: 'inventory.stock.updated',
        payload: samplePayload,
        status: OutboxStatus.PENDING,
        retryCount: 0,
        claimedBy: null,
        claimedUntil: null,
        nextAttemptAt: null,
        createdAt: new Date(),
      },
    ]);

    const publishEvent = jest.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return true;
    });
    const rabbitmqService = {
      publishEvent,
    } as unknown as RabbitMQService;

    const dispatcherA = new OutboxDispatcherService(prisma, rabbitmqService, {
      workerId: 'worker-A',
    });
    const dispatcherB = new OutboxDispatcherService(prisma, rabbitmqService, {
      workerId: 'worker-B',
    });

    const [countA, countB] = await Promise.all([
      dispatcherA.dispatchBatch(),
      dispatcherB.dispatchBatch(),
    ]);

    expect(countA + countB).toBe(1);
    expect(publishEvent).toHaveBeenCalledTimes(1);
    expect(rows.get('outbox-race-1')?.status).toBe(OutboxStatus.PUBLISHED);
  });

  it('should reclaim and publish an event whose previous worker lease has expired', async () => {
    const expiredLease = new Date(Date.now() - 5_000);
    const { rows, prisma } = createInMemoryOutboxStore([
      {
        id: 'outbox-stale-1',
        aggregateType: 'order',
        aggregateId: 'order-2',
        eventType: 'order.status.updated',
        payload: samplePayload,
        status: OutboxStatus.PENDING,
        retryCount: 0,
        claimedBy: 'crashed-worker',
        claimedUntil: expiredLease,
        nextAttemptAt: null,
        createdAt: new Date(),
      },
    ]);

    const publishEvent = jest.fn().mockResolvedValue(true);
    const rabbitmqService = {
      publishEvent,
    } as unknown as RabbitMQService;

    const recoveryDispatcher = new OutboxDispatcherService(
      prisma,
      rabbitmqService,
      { workerId: 'recovery-worker' },
    );

    const published = await recoveryDispatcher.dispatchBatch();

    expect(published).toBe(1);
    expect(publishEvent).toHaveBeenCalledTimes(1);
    expect(rows.get('outbox-stale-1')?.status).toBe(OutboxStatus.PUBLISHED);
  });

  it('should not throw if post-publish database status update fails', async () => {
    let callNum = 0;
    const prisma: OutboxPrismaLike = {
      outboxEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'outbox-db-err',
            aggregateType: 'order',
            aggregateId: 'order-3',
            eventType: 'order.status.updated',
            payload: samplePayload,
            status: OutboxStatus.PENDING,
            retryCount: 0,
          },
        ]),
        updateMany: jest.fn().mockImplementation(async () => {
          callNum += 1;
          if (callNum === 1) {
            return { count: 1 };
          }
          throw new Error('DB connection dropped after publish');
        }),
      },
    };

    const rabbitmqService = {
      publishEvent: jest.fn().mockResolvedValue(true),
    } as unknown as RabbitMQService;

    const dispatcher = new OutboxDispatcherService(prisma, rabbitmqService);

    await expect(dispatcher.dispatchBatch()).resolves.toBe(0);
  });
});
