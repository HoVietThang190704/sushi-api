import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { RealtimeDomainEvent } from '@contracts';

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, str) => {
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
  }, {} as Record<string, string>);
}

export interface AuthenticatedUserPayload {
  sub?: string;
  id?: string;
  email?: string;
  role?: string;
  branchId?: string | null;
  [key: string]: unknown;
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
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
    // 1. From cookie header
    const cookieHeader = client.handshake.headers?.cookie;
    if (cookieHeader) {
      const cookies = parseCookies(cookieHeader);
      if (cookies['access_token']) {
        return cookies['access_token'];
      }
    }

    // 2. From handshake auth token
    if (client.handshake.auth?.token) {
      const token = String(client.handshake.auth.token);
      return token.replace(/^Bearer\s+/i, '').trim();
    }

    // 3. From handshake authorization header
    const authHeader = client.handshake.headers?.authorization;
    if (authHeader) {
      return String(authHeader).replace(/^Bearer\s+/i, '').trim();
    }

    return undefined;
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(
        `Socket connection rejected: missing token (id: ${client.id})`,
      );
      client.disconnect();
      return;
    }

    try {
      const secret = process.env.JWT_SECRET || 'your-secret-key';
      const payload: AuthenticatedUserPayload =
        await this.jwtService.verifyAsync(token, { secret });

      client.data = client.data || {};
      client.data.user = payload;

      if (payload.branchId) {
        await client.join(`branch:${payload.branchId}`);
      }
      if (payload.role) {
        await client.join(`role:${payload.role}`);
      }
      await client.join('authenticated');

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
    if (event.branchId) {
      this.server.to(`branch:${event.branchId}`).emit('realtime:event', event);
    } else {
      this.server.to('authenticated').emit('realtime:event', event);
    }
  }
}
