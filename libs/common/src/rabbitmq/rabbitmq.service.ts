import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as amqp from 'amqplib';
import { REALTIME_EXCHANGE, RealtimeDomainEvent } from '@contracts';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async connect(): Promise<void> {
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
        this.logger.warn('RabbitMQ connection closed');
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

      this.logger.log(
        `Connected to RabbitMQ and asserted topic exchange "${REALTIME_EXCHANGE}"`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to connect to RabbitMQ: ${message}`);
      this.channel = null;
      this.connection = null;
    }
  }

  async publishEvent(
    event: RealtimeDomainEvent,
    routingKey?: string,
  ): Promise<boolean> {
    try {
      if (!this.channel) {
        await this.connect();
      }

      if (!this.channel) {
        this.logger.warn(
          `Cannot publish event "${event.type}": RabbitMQ channel unavailable`,
        );
        return false;
      }

      const key = routingKey || event.type;
      const content = Buffer.from(JSON.stringify(event));

      const published = this.channel.publish(REALTIME_EXCHANGE, key, content, {
        persistent: true,
        contentType: 'application/json',
      });

      return published;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Error publishing event "${event?.type ?? 'unknown'}": ${message}`,
      );
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Error closing RabbitMQ connection: ${message}`);
    } finally {
      this.channel = null;
      this.connection = null;
    }
  }
}
