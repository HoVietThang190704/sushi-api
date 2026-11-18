import {
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { SessionStateService } from './session-state.service';

class FakeRedis {
  store = new Map<string, string>();
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.store.set(key, value);
    return true;
  }
}

describe('session revocation', () => {
  const secret = 'test-secret-abcdef';
  let jwt: JwtService;
  let redis: FakeRedis;
  let state: SessionStateService;

  beforeEach(() => {
    process.env.JWT_SECRET = secret;
    jwt = new JwtService();
    redis = new FakeRedis();
    state = new SessionStateService(redis as never);
  });

  const ctx = (token: string): ExecutionContext => {
    const request = { headers: { authorization: `Bearer ${token}` } };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };
  const token = (tv?: number) =>
    jwt.sign({ sub: 'u1', email: 'a@b.c', role: 'CASHIER', tv }, { secret });

  it('isStale only for tokens older than the published version', async () => {
    expect(await state.isStale('u1', 0)).toBe(false);
    await state.publish('u1', 2);
    expect(await state.isStale('u1', 1)).toBe(true);
    expect(await state.isStale('u1', 2)).toBe(false);
    expect(await state.isStale('u1', 3)).toBe(false);
  });

  it('treats tokens without tv as version 0', async () => {
    await state.publish('u1', 1);
    expect(await state.isStale('u1', 0)).toBe(true);
  });

  it('JwtAuthGuard rejects a revoked token but accepts a fresh one', async () => {
    const guard = new JwtAuthGuard(jwt, state);
    await state.publish('u1', 1);
    await expect(guard.canActivate(ctx(token(0)))).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(guard.canActivate(ctx(token(1)))).resolves.toBe(true);
  });

  it('RolesGuard rejects a revoked token', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['CASHIER']);
    const guard = new RolesGuard(reflector, jwt, state);
    await state.publish('u1', 1);
    await expect(guard.canActivate(ctx(token(0)))).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(guard.canActivate(ctx(token(1)))).resolves.toBe(true);
  });

  it('fails open when Redis has no state (or is down)', async () => {
    const guard = new JwtAuthGuard(jwt, state);
    await expect(guard.canActivate(ctx(token(0)))).resolves.toBe(true);
  });
});
