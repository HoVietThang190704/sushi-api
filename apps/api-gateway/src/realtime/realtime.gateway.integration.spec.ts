import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  io as ClientSocket,
  Socket as ClientSocketType,
} from 'socket.io-client';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeDomainEvent } from '@contracts';
import * as http from 'node:http';
import type { IncomingMessage } from 'node:http';

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

  describe('WebSocket handshake Origin policy', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalCorsAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS;

    afterEach(() => {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
      if (originalCorsAllowedOrigins === undefined) {
        delete process.env.CORS_ALLOWED_ORIGINS;
      } else {
        process.env.CORS_ALLOWED_ORIGINS = originalCorsAllowedOrigins;
      }
    });

    const rawWebsocketUpgradeWithOrigin = (origin?: string) =>
      new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port,
          path: '/socket.io/?EIO=4&transport=websocket',
          method: 'GET',
          headers: {
            Connection: 'Upgrade',
            Upgrade: 'websocket',
            'Sec-WebSocket-Version': '13',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            ...(origin ? { Origin: origin } : {}),
          },
        });
        req.on('upgrade', (res, socket) => {
          socket.destroy();
          resolve({ statusCode: res.statusCode ?? 101, body: '' });
        });
        req.on('response', (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += String(chunk);
          });
          res.on('end', () => {
            resolve({ statusCode: res.statusCode ?? 0, body });
          });
        });
        req.on('error', reject);
        req.end();
      });

    const httpPollingWithOrigin = (origin?: string) =>
      new Promise<{ statusCode: number; allowOrigin?: string }>(
        (resolve, reject) => {
          const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: '/socket.io/?EIO=4&transport=polling',
            method: 'GET',
            headers: origin ? { Origin: origin } : undefined,
          });
          req.on('response', (res) => {
            res.resume();
            const allowOriginHeader =
              res.headers['access-control-allow-origin'];
            resolve({
              statusCode: res.statusCode ?? 0,
              allowOrigin: Array.isArray(allowOriginHeader)
                ? allowOriginHeader[0]
                : allowOriginHeader,
            });
          });
          req.on('error', reject);
          req.end();
        },
      );

    it('should invoke allowRequest and reject disallowed origin on real WebSocket upgrade and HTTP polling', async () => {
      process.env.NODE_ENV = 'production';
      process.env.CORS_ALLOWED_ORIGINS = 'https://hanbisushi.vn';

      const namespaceServer = gateway.server as unknown as {
        server?: {
          engine?: {
            on: (
              event: string,
              listener: (err: {
                code: number;
                message: string;
                context?: { message?: string };
              }) => void,
            ) => void;
            off: (event: string, listener: (...args: any[]) => void) => void;
            opts?: {
              allowRequest?: (
                req: IncomingMessage,
                fn: (err: string | null, success: boolean) => void,
              ) => void;
            };
          };
        };
      };

      const engine = namespaceServer.server?.engine;
      expect(typeof engine?.opts?.allowRequest).toBe('function');

      const connectionErrors: Array<{
        code: number;
        message: string;
        context?: { message?: string };
      }> = [];
      const onConnectionError = (err: {
        code: number;
        message: string;
        context?: { message?: string };
      }) => {
        connectionErrors.push(err);
      };
      engine?.on('connection_error', onConnectionError);

      try {
        const result = await rawWebsocketUpgradeWithOrigin(
          'https://evil-attacker.example',
        );
        expect(result.statusCode).not.toBe(101);
        expect(result.body).toBe('Origin not allowed by WebSocket policy');
        expect(connectionErrors).toContainEqual(
          expect.objectContaining({
            code: 4, // Engine.IO Server.errors.FORBIDDEN
            context: { message: 'Origin not allowed by WebSocket policy' },
          }),
        );

        const pollingDisallowed = await httpPollingWithOrigin(
          'https://evil-attacker.example',
        );
        expect(pollingDisallowed.allowOrigin).toBeUndefined();
        expect(pollingDisallowed.statusCode).toBe(403);

        const pollingAllowed = await httpPollingWithOrigin(
          'https://hanbisushi.vn',
        );
        expect(pollingAllowed.statusCode).toBe(200);
        expect(pollingAllowed.allowOrigin).toBe('https://hanbisushi.vn');
      } finally {
        engine?.off('connection_error', onConnectionError);
      }
    });

    it('should allow WebSocket handshake from allowlisted origin in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.CORS_ALLOWED_ORIGINS = 'https://hanbisushi.vn';

      const result = await rawWebsocketUpgradeWithOrigin(
        'https://hanbisushi.vn',
      );
      expect(result).toEqual({ statusCode: 101, body: '' });
    });

    it('should allow WebSocket handshake when Origin header is absent (non-browser client)', async () => {
      process.env.NODE_ENV = 'production';
      process.env.CORS_ALLOWED_ORIGINS = 'https://hanbisushi.vn';

      const result = await rawWebsocketUpgradeWithOrigin(undefined);
      expect(result).toEqual({ statusCode: 101, body: '' });
    });
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
