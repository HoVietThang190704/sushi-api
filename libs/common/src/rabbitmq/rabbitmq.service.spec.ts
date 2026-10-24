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
    createChannel: jest.Mock;
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
      publish: jest.fn().mockReturnValue(true),
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
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
    it('should connect to RabbitMQ and assert topic exchange', async () => {
      await service.onModuleInit();

      expect(amqp.connect).toHaveBeenCalled();
      expect(mockConnection.createChannel).toHaveBeenCalled();
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
    it('should publish message successfully when channel is ready', async () => {
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
      );
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
