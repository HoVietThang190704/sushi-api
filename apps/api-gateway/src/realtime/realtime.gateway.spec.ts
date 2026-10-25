import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';
import { Server, Socket } from 'socket.io';
import { RealtimeDomainEvent } from '@contracts';

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let jwtService: jest.Mocked<Partial<JwtService>>;
  let mockServer: {
    to: jest.Mock;
    emit: jest.Mock;
  };

  beforeEach(async () => {
    jwtService = {
      verifyAsync: jest.fn(),
    };

    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        {
          provide: JwtService,
          useValue: jwtService,
        },
      ],
    }).compile();

    gateway = module.get<RealtimeGateway>(RealtimeGateway);
    gateway.server = mockServer as unknown as Server;
  });

  describe('handleConnection', () => {
    it('should authenticate successfully with access_token cookie and join branch, role, and authenticated rooms', async () => {
      const mockClient = {
        id: 'socket-1',
        handshake: {
          headers: {
            cookie:
              'other_cookie=xyz; access_token=valid-jwt-token; theme=dark',
          },
          auth: {},
        },
        data: {},
        join: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn(),
      } as unknown as Socket;

      const userPayload = {
        sub: 'user-123',
        role: 'BRANCH_MANAGER',
        branchId: 'branch-99',
      };
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue(userPayload);

      await gateway.handleConnection(mockClient);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-jwt-token', {
        secret: expect.any(String),
      });
      expect(mockClient.data.user).toEqual(userPayload);
      expect(mockClient.join).toHaveBeenCalledWith('branch:branch-99');
      expect(mockClient.join).toHaveBeenCalledWith('role:BRANCH_MANAGER');
      expect(mockClient.join).toHaveBeenCalledWith('authenticated');
      expect(mockClient.disconnect).not.toHaveBeenCalled();
    });

    it('should authenticate successfully with handshake auth token', async () => {
      const mockClient = {
        id: 'socket-2',
        handshake: {
          headers: {},
          auth: {
            token: 'Bearer auth-token-123',
          },
        },
        data: {},
        join: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn(),
      } as unknown as Socket;

      const userPayload = {
        sub: 'user-456',
        role: 'ADMIN',
      };
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue(userPayload);

      await gateway.handleConnection(mockClient);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('auth-token-123', {
        secret: expect.any(String),
      });
      expect(mockClient.data.user).toEqual(userPayload);
      expect(mockClient.join).toHaveBeenCalledWith('role:ADMIN');
      expect(mockClient.join).toHaveBeenCalledWith('authenticated');
      expect(mockClient.join).not.toHaveBeenCalledWith(
        expect.stringContaining('branch:'),
      );
      expect(mockClient.disconnect).not.toHaveBeenCalled();
    });

    it('should authenticate successfully with Authorization header', async () => {
      const mockClient = {
        id: 'socket-3',
        handshake: {
          headers: {
            authorization: 'Bearer header-token-456',
          },
          auth: {},
        },
        data: {},
        join: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn(),
      } as unknown as Socket;

      const userPayload = {
        sub: 'user-789',
        role: 'STAFF',
        branchId: 'branch-10',
      };
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue(userPayload);

      await gateway.handleConnection(mockClient);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('header-token-456', {
        secret: expect.any(String),
      });
      expect(mockClient.data.user).toEqual(userPayload);
      expect(mockClient.join).toHaveBeenCalledWith('branch:branch-10');
      expect(mockClient.join).toHaveBeenCalledWith('role:STAFF');
      expect(mockClient.join).toHaveBeenCalledWith('authenticated');
      expect(mockClient.disconnect).not.toHaveBeenCalled();
    });

    it('should disconnect client when token is missing', async () => {
      const mockClient = {
        id: 'socket-no-token',
        handshake: {
          headers: {},
          auth: {},
        },
        data: {},
        join: jest.fn(),
        disconnect: jest.fn(),
      } as unknown as Socket;

      await gateway.handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalled();
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
      expect(mockClient.join).not.toHaveBeenCalled();
    });

    it('should disconnect client when token verification fails', async () => {
      const mockClient = {
        id: 'socket-invalid-token',
        handshake: {
          headers: {
            cookie: 'access_token=bad-token',
          },
          auth: {},
        },
        data: {},
        join: jest.fn(),
        disconnect: jest.fn(),
      } as unknown as Socket;

      (jwtService.verifyAsync as jest.Mock).mockRejectedValue(
        new Error('jwt expired'),
      );

      await gateway.handleConnection(mockClient);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('bad-token', {
        secret: expect.any(String),
      });
      expect(mockClient.disconnect).toHaveBeenCalled();
      expect(mockClient.join).not.toHaveBeenCalled();
    });
  });

  describe('broadcastRealtimeEvent', () => {
    it('should emit to branch room when event has branchId', () => {
      const event: RealtimeDomainEvent = {
        id: 'event-1',
        type: 'inventory.stock.updated',
        resource: 'inventory',
        action: 'UPDATED',
        branchId: 'branch-abc',
        timestamp: new Date().toISOString(),
        payload: { ingredientId: 'ing-1', quantity: 50 },
      };

      gateway.broadcastRealtimeEvent(event);

      expect(mockServer.to).toHaveBeenCalledWith('branch:branch-abc');
      expect(mockServer.emit).toHaveBeenCalledWith('realtime:event', event);
    });

    it('should emit to authenticated room when event does not have branchId', () => {
      const event: RealtimeDomainEvent = {
        id: 'event-2',
        type: 'catalog.product.created',
        resource: 'catalog',
        action: 'CREATED',
        branchId: null,
        timestamp: new Date().toISOString(),
        payload: { productId: 'prod-1', name: 'Salmon Nigiri' },
      };

      gateway.broadcastRealtimeEvent(event);

      expect(mockServer.to).toHaveBeenCalledWith('authenticated');
      expect(mockServer.emit).toHaveBeenCalledWith('realtime:event', event);
    });
  });
});
