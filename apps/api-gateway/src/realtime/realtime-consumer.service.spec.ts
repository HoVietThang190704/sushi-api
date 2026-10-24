import { Test, TestingModule } from '@nestjs/testing';
import {
  RealtimeConsumerService,
  REALTIME_QUEUE,
} from './realtime-consumer.service';
import { RealtimeGateway } from './realtime.gateway';
import { REALTIME_EXCHANGE, RealtimeDomainEvent } from '@contracts';
import * as amqp from 'amqplib';

jest.mock('amqplib');

describe('RealtimeConsumerService', () => {
  let service: RealtimeConsumerService;
  let mockRealtimeGateway: {
    broadcastRealtimeEvent: jest.Mock;
  };
  let mockChannel: {
    assertExchange: jest.Mock;
    assertQueue: jest.Mock;
    bindQueue: jest.Mock;
    consume: jest.Mock;
    ack: jest.Mock;
    close: jest.Mock;
    on: jest.Mock;
  };
  let mockConnection: {
    createChannel: jest.Mock;
    close: jest.Mock;
    on: jest.Mock;
  };

  beforeEach(async () => {
    mockRealtimeGateway = {
      broadcastRealtimeEvent: jest.fn(),
    };

    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      assertQueue: jest.fn().mockResolvedValue({ queue: REALTIME_QUEUE }),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn(),
      ack: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };

    (amqp.connect as jest.Mock).mockResolvedValue(mockConnection);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeConsumerService,
        {
          provide: RealtimeGateway,
          useValue: mockRealtimeGateway,
        },
      ],
    }).compile();

    service = module.get<RealtimeConsumerService>(RealtimeConsumerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should connect to RabbitMQ and setup queue binding and consumer', async () => {
    await service.initRabbitMQ();

    expect(amqp.connect).toHaveBeenCalled();
    expect(mockConnection.createChannel).toHaveBeenCalled();
    expect(mockChannel.assertExchange).toHaveBeenCalledWith(
      REALTIME_EXCHANGE,
      'topic',
      { durable: true },
    );
    expect(mockChannel.assertQueue).toHaveBeenCalledWith(REALTIME_QUEUE, {
      exclusive: false,
      durable: true,
    });
    expect(mockChannel.bindQueue).toHaveBeenCalledWith(
      REALTIME_QUEUE,
      REALTIME_EXCHANGE,
      '#',
    );
    expect(mockChannel.consume).toHaveBeenCalledWith(
      REALTIME_QUEUE,
      expect.any(Function),
      { noAck: false },
    );
  });

  it('should process message, broadcast event and ack message', async () => {
    let messageHandler!: (msg: amqp.ConsumeMessage | null) => void;
    mockChannel.consume.mockImplementation(
      (_queue: string, callback: (msg: amqp.ConsumeMessage | null) => void) => {
        messageHandler = callback;
      },
    );

    await service.initRabbitMQ();

    const sampleEvent: RealtimeDomainEvent = {
      id: 'test-event-1',
      type: 'inventory.stock.updated',
      resource: 'inventory',
      action: 'UPDATED',
      branchId: 'branch-1',
      timestamp: new Date().toISOString(),
      payload: { quantity: 100 },
    };

    const mockMsg = {
      content: Buffer.from(JSON.stringify(sampleEvent)),
    } as amqp.ConsumeMessage;

    messageHandler(mockMsg);

    expect(mockRealtimeGateway.broadcastRealtimeEvent).toHaveBeenCalledWith(
      sampleEvent,
    );
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
  });

  it('should safely handle and ack invalid JSON payload without crashing', async () => {
    let messageHandler!: (msg: amqp.ConsumeMessage | null) => void;
    mockChannel.consume.mockImplementation(
      (_queue: string, callback: (msg: amqp.ConsumeMessage | null) => void) => {
        messageHandler = callback;
      },
    );

    await service.initRabbitMQ();

    const mockMsg = {
      content: Buffer.from('invalid-json{{{'),
    } as amqp.ConsumeMessage;

    expect(() => messageHandler(mockMsg)).not.toThrow();
    expect(mockRealtimeGateway.broadcastRealtimeEvent).not.toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
  });

  it('should close channel and connection on module destroy', async () => {
    await service.initRabbitMQ();
    await service.onModuleDestroy();

    expect(mockChannel.close).toHaveBeenCalled();
    expect(mockConnection.close).toHaveBeenCalled();
  });
});
