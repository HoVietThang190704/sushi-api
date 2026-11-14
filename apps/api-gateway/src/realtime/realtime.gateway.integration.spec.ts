import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeDomainEvent } from '@contracts';

describe('RealtimeGateway (Real Socket.IO Integration)', () => {
  let app: INestApplication;
  let gateway: RealtimeGateway;
  let jwtService: JwtService;
  let port: number;
  const jwtSecret = 'test-integration-secret-key-12345';

  beforeAll(async () => {
    process.env.JWT_SECRET = jwtSecret;

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        {
          provide: JwtService,
          useValue: new JwtService({ secret: jwtSecret }),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);

    gateway = moduleRef.get<RealtimeGateway>(RealtimeGateway);
    jwtService = moduleRef.get<JwtService>(JwtService);

    const address = app.getHttpServer().address();
    port = typeof address === 'string' ? parseInt(address, 10) : address.port;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should allow anonymous client to connect and receive ONLY store-config:updated (no leaks)', (done) => {
    const anonymousClient: ClientSocketType = ClientSocket(
      `http://localhost:${port}/realtime`,
      {
        transports: ['websocket'],
        reconnection: false,
      },
    );

    let receivedStoreConfigUpdate = false;
    let receivedOrderUpdated = false;
    let receivedRealtimeEvent = false;

    anonymousClient.on('connect', () => {
      // 1. Broadcast internal event (should NOT reach anonymous client)
      const internalEvent: RealtimeDomainEvent = {
        id: 'evt-internal',
        type: 'catalog.product.created',
        resource: 'catalog',
        action: 'CREATED',
        branchId: null,
        timestamp: new Date().toISOString(),
        payload: { secretInfo: 'admin-only-product' },
      };
      gateway.broadcastRealtimeEvent(internalEvent);

      // 2. Broadcast private customer order event (should NOT reach anonymous client)
      const orderEvent: RealtimeDomainEvent = {
        id: 'evt-order',
        type: 'order.status.updated',
        resource: 'order',
        action: 'UPDATED',
        branchId: 'branch-1',
        timestamp: new Date().toISOString(),
        payload: {
          orderCode: 'ORD-LEAK-TEST',
          status: 'PREPARING',
        },
      };
      gateway.broadcastRealtimeEvent(orderEvent);

      // 3. Broadcast public store-config update
      const configEvent: RealtimeDomainEvent = {
        id: 'evt-config',
        type: 'store-config.updated',
        resource: 'order',
        action: 'UPDATED',
        branchId: null,
        timestamp: '2026-11-14T15:00:00.000Z',
        payload: { customerOrderingEnabled: false },
      };
      gateway.broadcastRealtimeEvent(configEvent);
    });

    anonymousClient.on('store-config:updated', (data) => {
      expect(data).toEqual({ timestamp: '2026-11-14T15:00:00.000Z' });
      receivedStoreConfigUpdate = true;
    });

    anonymousClient.on('realtime:event', () => {
      receivedRealtimeEvent = true;
    });

    anonymousClient.on('order:updated', () => {
      receivedOrderUpdated = true;
    });

    // Wait a brief window to confirm no unwanted events leak
    setTimeout(() => {
      anonymousClient.disconnect();
      expect(receivedStoreConfigUpdate).toBe(true);
      expect(receivedRealtimeEvent).toBe(false);
      expect(receivedOrderUpdated).toBe(false);
      done();
    }, 400);
  });

  it('should disconnect client immediately if client supplies an invalid token', (done) => {
    const invalidClient: ClientSocketType = ClientSocket(
      `http://localhost:${port}/realtime`,
      {
        transports: ['websocket'],
        reconnection: false,
        auth: {
          token: 'invalid-malformed-token-xyz',
        },
      },
    );

    invalidClient.on('connect_error', () => {
      // Disconnected / rejected
      invalidClient.disconnect();
      done();
    });

    invalidClient.on('disconnect', () => {
      invalidClient.disconnect();
      done();
    });

    // Fallback timeout in case server failed to disconnect
    setTimeout(() => {
      if (invalidClient.connected) {
        invalidClient.disconnect();
        done(new Error('Expected invalid token client to be disconnected'));
      }
    }, 800);
  });

  it('should allow authenticated admin client to receive store-config:updated and realtime:event', async () => {
    const adminToken = await jwtService.signAsync(
      { sub: 'admin-1', role: 'ADMIN' },
      { secret: jwtSecret },
    );

    const adminClient: ClientSocketType = ClientSocket(
      `http://localhost:${port}/realtime`,
      {
        transports: ['websocket'],
        reconnection: false,
        auth: {
          token: adminToken,
        },
      },
    );

    await new Promise<void>((resolve, reject) => {
      let receivedConfig = false;
      let receivedRealtime = false;

      adminClient.on('connect', () => {
        gateway.broadcastRealtimeEvent({
          id: 'evt-admin-1',
          type: 'store-config.updated',
          resource: 'order',
          action: 'UPDATED',
          branchId: null,
          timestamp: '2026-11-14T16:00:00.000Z',
          payload: {},
        });

        gateway.broadcastRealtimeEvent({
          id: 'evt-admin-2',
          type: 'catalog.product.created',
          resource: 'catalog',
          action: 'CREATED',
          branchId: null,
          timestamp: '2026-11-14T16:00:00.000Z',
          payload: { productId: 'p1' },
        });
      });

      adminClient.on('store-config:updated', (data) => {
        if (data.timestamp === '2026-11-14T16:00:00.000Z') {
          receivedConfig = true;
          if (receivedRealtime) checkFinish();
        }
      });

      adminClient.on('realtime:event', (data) => {
        if (data.id === 'evt-admin-2') {
          receivedRealtime = true;
          if (receivedConfig) checkFinish();
        }
      });

      function checkFinish() {
        adminClient.disconnect();
        resolve();
      }

      setTimeout(() => {
        adminClient.disconnect();
        if (!receivedConfig || !receivedRealtime) {
          reject(
            new Error(
              `Admin failed to receive events: receivedConfig=${receivedConfig}, receivedRealtime=${receivedRealtime}`,
            ),
          );
        }
      }, 1000);
    });
  });
});
