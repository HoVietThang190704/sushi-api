import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import type { RequestUser } from './current-user.decorator';

interface MockRequest {
  headers: Record<string, string>;
  cookies: Record<string, string>;
  user?: RequestUser;
}

describe('Auth Guards', () => {
  let jwtService: JwtService;
  let reflector: Reflector;
  let jwtAuthGuard: JwtAuthGuard;
  let rolesGuard: RolesGuard;
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-jwt-secret-key-123456';
    jwtService = new JwtService();
    reflector = new Reflector();
    jwtAuthGuard = new JwtAuthGuard(jwtService);
    rolesGuard = new RolesGuard(reflector, jwtService);
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  const createMockContext = (
    headers: Record<string, string> = {},
    cookies: Record<string, string> = {},
  ): ExecutionContext => {
    const request: MockRequest = {
      headers: { ...headers },
      cookies: { ...cookies },
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  describe('JwtAuthGuard', () => {
    it('should throw UnauthorizedException if token is missing', async () => {
      const context = createMockContext();
      await expect(jwtAuthGuard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if token is invalid', async () => {
      const context = createMockContext({
        authorization: 'Bearer invalid.token.value',
      });
      await expect(jwtAuthGuard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should authenticate successfully with valid Bearer token and attach request.user', async () => {
      const payload: RequestUser = {
        sub: 'user-1',
        email: 'test@example.com',
        role: 'ADMIN',
        branchId: 'b-1',
      };
      const token = jwtService.sign(payload, {
        secret: 'test-jwt-secret-key-123456',
      });
      const context = createMockContext({ authorization: `Bearer ${token}` });

      const allowed = await jwtAuthGuard.canActivate(context);
      expect(allowed).toBe(true);

      const req = context.switchToHttp().getRequest<MockRequest>();
      expect(req.user).toMatchObject(payload);
    });

    it('should authenticate successfully with access_token cookie', async () => {
      const payload: RequestUser = {
        sub: 'user-2',
        email: 'staff@example.com',
        role: 'STAFF',
      };
      const token = jwtService.sign(payload, {
        secret: 'test-jwt-secret-key-123456',
      });
      const context = createMockContext({}, { access_token: token });

      const allowed = await jwtAuthGuard.canActivate(context);
      expect(allowed).toBe(true);

      const req = context.switchToHttp().getRequest<MockRequest>();
      expect(req.user).toMatchObject(payload);
    });

    it('should throw UnauthorizedException if JWT_SECRET is not set', async () => {
      delete process.env.JWT_SECRET;
      const context = createMockContext({ authorization: 'Bearer some.token' });
      await expect(jwtAuthGuard.canActivate(context)).rejects.toThrow(
        'JWT_SECRET is not configured on server',
      );
    });
  });

  describe('RolesGuard', () => {
    it('should allow access if no roles are required on endpoint', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
      const context = createMockContext();
      const allowed = await rolesGuard.canActivate(context);
      expect(allowed).toBe(true);
    });

    it('should authenticate and allow access if user has one of the required roles', async () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue(['ADMIN', 'SUPER_ADMIN']);
      const payload: RequestUser = {
        sub: 'user-1',
        email: 'admin@test.com',
        role: 'ADMIN',
      };
      const token = jwtService.sign(payload, {
        secret: 'test-jwt-secret-key-123456',
      });
      const context = createMockContext({ authorization: `Bearer ${token}` });

      const allowed = await rolesGuard.canActivate(context);
      expect(allowed).toBe(true);
    });

    it('should throw ForbiddenException if authenticated user role is not in allowed roles', async () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue(['SUPER_ADMIN']);
      const payload: RequestUser = {
        sub: 'user-3',
        email: 'staff@test.com',
        role: 'STAFF',
      };
      const token = jwtService.sign(payload, {
        secret: 'test-jwt-secret-key-123456',
      });
      const context = createMockContext({ authorization: `Bearer ${token}` });

      await expect(rolesGuard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should reject unauthenticated request when roles are required', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
      const context = createMockContext();

      await expect(rolesGuard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
