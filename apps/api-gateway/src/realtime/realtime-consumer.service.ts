import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as amqp from 'amqplib';
import { REALTIME_EXCHANGE, RealtimeDomainEvent } from '@contracts';
import { RealtimeGateway } from './realtime.gateway';

export const REALTIME_QUEUE = 'api_gateway_realtime';

@Injectable()
export class RealtimeConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeConsumerService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private isDestroyed = false;

  constructor(private readonly realtimeGateway: RealtimeGateway) {}

  async onModuleInit(): Promise<void> {
    await this.initRabbitMQ();
  }

  async initRabbitMQ(): Promise<void> {
    try {
      const url =
        process.env.RABBITMQ_URL ||
        'amqp://sushi_app:change_me_local@localhost:5672';
      this.connection = await amqp.connect(url);

      this.connection.on('error', (err: Error) => {
        this.logger.warn(`RabbitMQ connection error: ${err.message}`);
        this.channel = null;
        this.connection = null;
      });

      this.connection.on('close', () => {
        if (!this.isDestroyed) {
          this.logger.warn(
            'RabbitMQ connection closed. Attempting reconnect...',
          );
        }
        this.channel = null;
        this.connection = null;
      });

      this.channel = await this.connection.createChannel();

      this.channel.on('error', (err: Error) => {
        this.logger.warn(`RabbitMQ channel error: ${err.message}`);
        this.channel = null;
      });

      this.channel.on('close', () => {
        this.channel = null;
      });

      await this.channel.assertExchange(REALTIME_EXCHANGE, 'topic', {
        durable: true,
      });

      await this.channel.assertQueue(REALTIME_QUEUE, {
        exclusive: false,
        durable: true,
      });

      await this.channel.bindQueue(REALTIME_QUEUE, REALTIME_EXCHANGE, '#');

      await this.channel.consume(
        REALTIME_QUEUE,
        (msg: amqp.ConsumeMessage | null) => {
          if (!msg) return;
          this.handleMessage(msg);
        },
        { noAck: false },
      );

      this.logger.log(
        `RabbitMQ RealtimeConsumer bound queue "${REALTIME_QUEUE}" to exchange "${REALTIME_EXCHANGE}" with key "#"`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to connect to RabbitMQ for realtime consumer: ${message}`,
      );
      this.channel = null;
      this.connection = null;
    }
  }

  private handleMessage(msg: amqp.ConsumeMessage): void {
    try {
      const content = msg.content.toString();
      const event = JSON.parse(content) as RealtimeDomainEvent;

      if (!event || !event.type) {
        this.logger.warn(
          'Received invalid realtime event payload from RabbitMQ',
        );
        this.channel?.ack(msg);
        return;
      }

      this.realtimeGateway.broadcastRealtimeEvent(event);
      this.channel?.ack(msg);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Error processing realtime RabbitMQ message: ${message}`,
      );
      // Ack to avoid poison message clogging the queue
      this.channel?.ack(msg);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.isDestroyed = true;
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Error closing RabbitMQ realtime consumer: ${message}`);
    } finally {
      this.channel = null;
      this.connection = null;
    }
  }
}
