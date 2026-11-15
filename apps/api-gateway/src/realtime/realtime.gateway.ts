import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { isCorsOriginAllowed } from '../cors.policy';
import { RealtimeDomainEvent, ORDER_TRACK_SCOPE } from '@contracts';
import { UserRole } from '@prisma/client';

export const REALTIME_ROOMS = {
  SUPER_ADMIN: `role:${UserRole.SUPER_ADMIN}`,
  ADMIN: 'role:ADMIN',
  AUTHENTICATED: 'authenticated',
  PUBLIC_STORE_CONFIG: 'public:store-config',
  branch: (branchId: string) => `branch:${branchId}`,
  order: (orderCode: string) => `order:${orderCode}`,
} as const;

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce(
    (acc, str) => {
      const trimmed = str.trim();
      if (!trimmed) return acc;
      const index = trimmed.indexOf('=');
      if (index > 0) {
        const key = trimmed.slice(0, index).trim();
        const val = trimmed.slice(index + 1).trim();
        try {
          acc[key] = decodeURIComponent(val);
        } catch {
          acc[key] = val;
        }
      }
      return acc;
    },
    {} as Record<string, string>,
  );
}

export interface AuthenticatedUserPayload {
  sub?: string;
  id?: string;
  email?: string;
  role?: string;
  branchId?: string | null;
  scope?: string;
  orderCode?: string;
  [key: string]: unknown;
}

export const isOriginAllowed = isCorsOriginAllowed;

@WebSocketGateway({
  cors: {
    origin: (
      origin: string,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  },
  allowRequest: (
    req: IncomingMessage,
    callback: (err: string | null, success: boolean) => void,
  ) => {
    const rawOrigin = req.headers?.origin;
    const origin = typeof rawOrigin === 'string' ? rawOrigin : undefined;
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback('Origin not allowed by WebSocket policy', false);
    }
  },
  namespace: '/realtime',
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwtService: JwtService) {}

  private extractToken(client: Socket): string | undefined {
    // 1. From handshake auth token (explicit token from client, e.g. guest tracking ticket)
    if (client.handshake.auth?.token) {
      const token = String(client.handshake.auth.token);
      return token.replace(/^Bearer\s+/i, '').trim();
    }

    // 2. From handshake authorization header
    const authHeader = client.handshake.headers?.authorization;
    if (authHeader) {
      return String(authHeader)
        .replace(/^Bearer\s+/i, '')
        .trim();
    }

    // 3. From cookie header (fallback for dashboard web app session cookies)
    const cookieHeader = client.handshake.headers?.cookie;
    if (cookieHeader) {
      const cookies = parseCookies(cookieHeader);
      if (cookies['access_token']) {
        return cookies['access_token'];
      }
    }

    return undefined;
  }

  async handleConnection(client: Socket): Promise<void> {
    const socketData = (client.data ?? {}) as {
      isPublic?: boolean;
      user?: AuthenticatedUserPayload;
    };
    client.data = socketData;

    const token = this.extractToken(client);
    if (!token) {
      socketData.isPublic = true;
      await client.join(REALTIME_ROOMS.PUBLIC_STORE_CONFIG);
      this.logger.log(
        `Public client connected to store-config room: ${client.id}`,
      );
      return;
    }

    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error('JWT_SECRET is not configured on server');
      }
      const payload: AuthenticatedUserPayload =
        await this.jwtService.verifyAsync(token, { secret });

      socketData.user = payload;

      // Guest order tracking token: joins only the specific order room
      if (payload.scope === ORDER_TRACK_SCOPE && payload.orderCode) {
        await client.join(REALTIME_ROOMS.order(payload.orderCode));
        this.logger.log(
          `Guest tracker connected: ${client.id} (order: ${payload.orderCode})`,
        );
        return;
      }

      if (payload.branchId) {
        await client.join(REALTIME_ROOMS.branch(payload.branchId));
      }
      if (payload.role) {
        await client.join(`role:${payload.role}`);
      }
      await client.join(REALTIME_ROOMS.AUTHENTICATED);
      await client.join(REALTIME_ROOMS.PUBLIC_STORE_CONFIG);

      this.logger.log(
        `Client connected: ${client.id} (user: ${payload.sub || payload.id || 'unknown'}, role: ${payload.role || 'none'}, branch: ${payload.branchId || 'none'})`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Socket connection rejected: invalid token (${message}, id: ${client.id})`,
      );
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  broadcastRealtimeEvent(event: RealtimeDomainEvent): void {
    if (event.type === 'store-config.updated') {
      this.server
        .to(REALTIME_ROOMS.PUBLIC_STORE_CONFIG)
        .emit('store-config:updated', {
          timestamp: event.timestamp || new Date().toISOString(),
        });
    }

    if (event.branchId) {
      this.server
        .to(REALTIME_ROOMS.branch(event.branchId))
        .to(REALTIME_ROOMS.SUPER_ADMIN)
        .to(REALTIME_ROOMS.ADMIN)
        .emit('realtime:event', event);
    } else {
      this.server
        .to(REALTIME_ROOMS.AUTHENTICATED)
        .emit('realtime:event', event);
    }

    // Broadcast to specific order room for customers/guests
    const orderCode = (event.payload?.orderCode || event.payload?.code) as
      string | undefined;
    if (orderCode && event.resource === 'order') {
      this.server.to(REALTIME_ROOMS.order(orderCode)).emit('order:updated', {
        orderCode,
        type: event.type,
        status: event.payload?.status,
        paymentStatus: event.payload?.paymentStatus,
        timestamp: event.timestamp || new Date().toISOString(),
      });
    }
  }
}
