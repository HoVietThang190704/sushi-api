import { Test, TestingModule } from '@nestjs/testing';
import { RabbitMQService } from './rabbitmq.service';
import * as amqp from 'amqplib';
import { REALTIME_EXCHANGE, RealtimeDomainEvent } from '@contracts';

jest.mock('amqplib');

describe('RabbitMQService', () => {
  let service: RabbitMQService;
  let mockChannel: {
    assertExchange: jest.Mock;
    publish: jest.Mock;
    on: jest.Mock;
    close: jest.Mock;
  };
  let mockConnection: {
    createConfirmChannel: jest.Mock;
    on: jest.Mock;
    close: jest.Mock;
  };

  const sampleEvent: RealtimeDomainEvent = {
    id: 'test-uuid-1',
    type: 'inventory.stock.updated',
    resource: 'inventory',
    action: 'UPDATED',
    branchId: 'branch-1',
    timestamp: new Date().toISOString(),
    payload: {
      ingredientId: 'ing-1',
      quantity: 10,
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn(
        (
          _exchange: string,
          _routingKey: string,
          _content: Buffer,
          _options: unknown,
          cb?: (err: Error | null) => void,
        ) => {
          cb?.(null);
          return true;
        },
      ),
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockConnection = {
      createConfirmChannel: jest.fn().mockResolvedValue(mockChannel),
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };

    (amqp.connect as jest.Mock).mockResolvedValue(mockConnection);

    const module: TestingModule = await Test.createTestingModule({
      providers: [RabbitMQService],
    }).compile();

    service = module.get<RabbitMQService>(RabbitMQService);
  });

  describe('connect & initialization', () => {
    it('should connect to RabbitMQ confirm channel and assert topic exchange', async () => {
      await service.onModuleInit();

      expect(amqp.connect).toHaveBeenCalled();
      expect(mockConnection.createConfirmChannel).toHaveBeenCalled();
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        REALTIME_EXCHANGE,
        'topic',
        { durable: true },
      );
    });

    it('should catch connection failure and not throw', async () => {
      (amqp.connect as jest.Mock).mockRejectedValueOnce(
        new Error('ECONNREFUSED'),
      );

      await expect(service.connect()).resolves.toBeUndefined();
    });
  });

  describe('publishEvent', () => {
    it('should publish message and return true when broker confirms (ACK)', async () => {
      await service.connect();

      const result = await service.publishEvent(sampleEvent);

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        REALTIME_EXCHANGE,
        sampleEvent.type,
        Buffer.from(JSON.stringify(sampleEvent)),
        {
          persistent: true,
          contentType: 'application/json',
        },
        expect.any(Function),
      );
    });

    it('should return false when broker NACKs the published message', async () => {
      await service.connect();
      mockChannel.publish.mockImplementationOnce(
        (
          _exchange: string,
          _routingKey: string,
          _content: Buffer,
          _options: unknown,
          cb?: (err: Error | null) => void,
        ) => {
          cb?.(new Error('Broker NACK'));
          return true;
        },
      );

      const result = await service.publishEvent(sampleEvent);

      expect(result).toBe(false);
    });

    it('should return false and invalidate channel when broker confirm times out', async () => {
      await service.connect();
      mockChannel.publish.mockImplementationOnce(() => {
        // Never invokes confirm callback
        return true;
      });

      const result = await service.publishEvent(sampleEvent, undefined, 25);

      expect(result).toBe(false);

      // Next publish should trigger reconnect since channel was invalidated
      await service.publishEvent(sampleEvent);
      expect(mockConnection.createConfirmChannel).toHaveBeenCalledTimes(2);
    });

    it('should support custom routingKey override', async () => {
      await service.connect();

      const result = await service.publishEvent(
        sampleEvent,
        'custom.routing.key',
      );

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        REALTIME_EXCHANGE,
        'custom.routing.key',
        expect.any(Buffer),
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('should return false safely when channel is unavailable and connection fails', async () => {
      (amqp.connect as jest.Mock).mockRejectedValue(
        new Error('Connection lost'),
      );

      const result = await service.publishEvent(sampleEvent);

      expect(result).toBe(false);
    });

    it('should catch exceptions thrown during publish and return false without throwing', async () => {
      await service.connect();
      mockChannel.publish.mockImplementationOnce(() => {
        throw new Error('Socket closed unexpectedly');
      });

      const result = await service.publishEvent(sampleEvent);

      expect(result).toBe(false);
    });
  });

  describe('onModuleDestroy', () => {
    it('should close channel and connection gracefully', async () => {
      await service.connect();
      await service.onModuleDestroy();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it('should handle errors on close gracefully without throwing', async () => {
      await service.connect();
      mockChannel.close.mockRejectedValueOnce(new Error('Close error'));

      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });
  });
});
