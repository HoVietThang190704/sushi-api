import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { OutboxStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { RealtimeDomainEvent } from '@contracts';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';

export interface OutboxEventRecord {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.JsonValue;
  status: OutboxStatus;
  retryCount: number;
  lastError?: string | null;
  claimedBy?: string | null;
  claimedUntil?: Date | null;
  nextAttemptAt?: Date | null;
  createdAt?: Date;
  publishedAt?: Date | null;
}

export interface OutboxEventDelegate {
  findMany(args: Prisma.OutboxEventFindManyArgs): Promise<OutboxEventRecord[]>;
  updateMany?(
    args: Prisma.OutboxEventUpdateManyArgs,
  ): Promise<Prisma.BatchPayload>;
  update?(args: Prisma.OutboxEventUpdateArgs): Promise<unknown>;
}

export interface OutboxPrismaLike {
  outboxEvent?: OutboxEventDelegate;
}

export interface OutboxDispatcherOptions {
  workerId?: string;
  pollIntervalMs?: number;
  leaseDurationMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  batchSize?: number;
}

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private readonly workerId: string;
  private readonly pollIntervalMs: number;
  private readonly leaseDurationMs: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly defaultBatchSize: number;
  private timer: NodeJS.Timeout | null = null;
  private isDispatching = false;

  constructor(
    private readonly prisma: OutboxPrismaLike,
    private readonly rabbitmqService: RabbitMQService,
    options?: OutboxDispatcherOptions,
  ) {
    this.workerId = options?.workerId ?? `outbox-worker-${randomUUID()}`;
    this.pollIntervalMs = options?.pollIntervalMs ?? 5_000;
    this.leaseDurationMs = options?.leaseDurationMs ?? 60_000;
    this.baseBackoffMs = options?.baseBackoffMs ?? 2_000;
    this.maxBackoffMs = options?.maxBackoffMs ?? 300_000;
    this.defaultBatchSize = options?.batchSize ?? 20;
  }

  onModuleInit(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.isDispatching) return;
    this.isDispatching = true;
    try {
      await this.dispatchBatch(this.defaultBatchSize);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Outbox dispatch tick failed: ${message}`);
    } finally {
      this.isDispatching = false;
    }
  }

  async dispatchBatch(batchSize = this.defaultBatchSize): Promise<number> {
    const delegate = this.prisma?.outboxEvent;
    if (!delegate) return 0;

    const now = new Date();
    const candidates = await delegate.findMany({
      where: {
        status: {
          in: [OutboxStatus.PENDING, OutboxStatus.FAILED],
        },
        AND: [
          {
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
          {
            OR: [{ claimedUntil: null }, { claimedUntil: { lt: now } }],
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return 0;
    }

    let publishedCount = 0;

    for (const record of candidates) {
      const claimNow = new Date();
      const leaseUntil = new Date(claimNow.getTime() + this.leaseDurationMs);

      if (typeof delegate.updateMany === 'function') {
        try {
          const claimed = await delegate.updateMany({
            where: {
              id: record.id,
              status: record.status,
              OR: [{ claimedUntil: null }, { claimedUntil: { lt: claimNow } }],
            },
            data: {
              claimedBy: this.workerId,
              claimedUntil: leaseUntil,
            },
          });

          if (!claimed || claimed.count !== 1) {
            continue;
          }
        } catch (claimErr: unknown) {
          const message =
            claimErr instanceof Error ? claimErr.message : String(claimErr);
          this.logger.warn(
            `Failed to claim outbox event "${record.id}": ${message}`,
          );
          continue;
        }
      }

      let published = false;
      let publishError = 'RabbitMQ publishEvent returned false (unconfirmed)';

      try {
        const payload = record.payload as unknown as RealtimeDomainEvent;
        published = await this.rabbitmqService.publishEvent(payload);
      } catch (err: unknown) {
        published = false;
        publishError = err instanceof Error ? err.message : String(err);
      }

      if (published) {
        try {
          const publishedData: Prisma.OutboxEventUpdateManyMutationInput = {
            status: OutboxStatus.PUBLISHED,
            publishedAt: new Date(),
            claimedBy: null,
            claimedUntil: null,
            nextAttemptAt: null,
            lastError: null,
          };

          if (typeof delegate.updateMany === 'function') {
            await delegate.updateMany({
              where: {
                id: record.id,
                claimedBy: this.workerId,
              },
              data: publishedData,
            });
          } else if (typeof delegate.update === 'function') {
            await delegate.update({
              where: { id: record.id },
              data: publishedData,
            });
          }
          publishedCount++;
        } catch (updateErr: unknown) {
          const message =
            updateErr instanceof Error ? updateErr.message : String(updateErr);
          this.logger.warn(
            `Outbox event "${record.id}" published but status update failed: ${message}`,
          );
        }
      } else {
        const nextRetryCount = (record.retryCount ?? 0) + 1;
        const backoffMs = Math.min(
          this.baseBackoffMs * Math.pow(2, Math.max(0, nextRetryCount - 1)),
          this.maxBackoffMs,
        );
        const nextAttemptAt = new Date(Date.now() + backoffMs);

        try {
          const failureData: Prisma.OutboxEventUpdateManyMutationInput = {
            status: OutboxStatus.FAILED,
            retryCount: { increment: 1 },
            lastError: publishError,
            claimedBy: null,
            claimedUntil: null,
            nextAttemptAt,
          };

          if (typeof delegate.updateMany === 'function') {
            await delegate.updateMany({
              where: {
                id: record.id,
                claimedBy: this.workerId,
              },
              data: failureData,
            });
          } else if (typeof delegate.update === 'function') {
            await delegate.update({
              where: { id: record.id },
              data: failureData,
            });
          }
        } catch (failUpdateErr: unknown) {
          const message =
            failUpdateErr instanceof Error
              ? failUpdateErr.message
              : String(failUpdateErr);
          this.logger.warn(
            `Failed to record retry backoff for outbox event "${record.id}": ${message}`,
          );
        }
      }
    }

    return publishedCount;
  }
}
