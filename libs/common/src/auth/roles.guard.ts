import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ROLES_KEY } from './roles.decorator';
import type { RequestUser } from './current-user.decorator';
import { SessionStateService } from './session-state.service';

interface RequestWithAuth extends Request {
  cookies: Record<string, string>;
  user?: RequestUser;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @Optional() private readonly sessionState?: SessionStateService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuth>();

    if (!request.user) {
      const authHeader = request.headers.authorization;
      let token = authHeader
        ? authHeader.replace(/^Bearer\s+/i, '').trim()
        : '';

      if (!token && request.cookies) {
        token = request.cookies['access_token'] || '';
      }

      if (!token) {
        throw new UnauthorizedException(
          'Authentication required. Missing token.',
        );
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new UnauthorizedException(
          'JWT_SECRET is not configured on server',
        );
      }

      let payload: RequestUser;
      try {
        payload = await this.jwtService.verifyAsync<RequestUser>(token, {
          secret,
        });
      } catch {
        throw new UnauthorizedException('Invalid or expired access token');
      }
      if (
        this.sessionState &&
        (await this.sessionState.isStale(payload.sub, payload.tv ?? 0))
      ) {
        throw new UnauthorizedException('Session has been revoked');
      }
      request.user = payload;
    }

    const user = request.user;
    if (!user || !user.role) {
      throw new UnauthorizedException('Authentication required');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Access denied. Role '${user.role}' lacks permission.`,
      );
    }

    return true;
  }
}
