import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';
import { PrismaService } from './prisma.service';

jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

describe('AuthService refresh rotation', () => {
  const secret = 'test-refresh-secret';
  const user = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'test@example.com',
    fullName: 'Test',
    role: 'STAFF',
    branchId: null,
    isActive: true,
  };
  const jwt = new JwtService();
  let records: Array<{
    id: string;
    userId: string;
    tokenHash: string;
    revokedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
  }>;
  let prisma: any;
  let service: AuthService;
  let failCreate: boolean;

  beforeEach(() => {
    records = [];
    failCreate = false;
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      refreshToken: {
        findMany: jest.fn(async () => [...records]),
        create: jest.fn(async ({ data }: any) => {
          if (failCreate) throw new Error('insert failed');
          const row = {
            ...data,
            id: `token-${records.length}`,
            revokedAt: null,
            createdAt: new Date(),
          };
          records.push(row);
          return row;
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const row = records.find(
            (r) =>
              r.id === where.id &&
              !r.revokedAt &&
              r.expiresAt > where.expiresAt.gt,
          );
          if (!row) return { count: 0 };
          row.revokedAt = data.revokedAt;
          return { count: 1 };
        }),
      },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => {
        const snapshot = records.map((row) => ({ ...row }));
        try {
          return await fn(prisma);
        } catch (error) {
          if (!(error instanceof UnauthorizedException)) records = snapshot;
          throw error;
        }
      }),
    };
    const config = {
      get: (key: string) =>
        key === 'JWT_REFRESH_SECRET' ? secret : 'test-access-secret',
    };
    service = new AuthService(
      prisma as PrismaService,
      jwt,
      config as ConfigService,
    );
  });

  async function issue() {
    return service.generateTokens(
      user.id,
      user.email,
      user.role,
      user.branchId,
    );
  }

  it('issues distinct refresh JWTs and jti values within the same second', async () => {
    const a = await issue();
    const b = await issue();
    expect(a.refreshToken).not.toBe(b.refreshToken);
    const first = jwt.verify<{ jti: string }>(a.refreshToken, { secret });
    const second = jwt.verify<{ jti: string }>(b.refreshToken, { secret });
    expect(first.jti).toBeTruthy();
    expect(second.jti).toBeTruthy();
    expect(first.jti).not.toBe(second.jti);
  });

  it('permits only one concurrent refresh and does not revoke its replacement', async () => {
    const { refreshToken } = await issue();
    const results = await Promise.allSettled([
      service.refreshToken(refreshToken),
      service.refreshToken(refreshToken),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(records).toHaveLength(2);
    expect(records.filter((r) => !r.revokedAt)).toHaveLength(1);
    expect(records[1].revokedAt).toBeNull();
    const winner = results.find(
      (r) => r.status === 'fulfilled',
    ) as PromiseFulfilledResult<
      Awaited<ReturnType<AuthService['refreshToken']>>
    >;
    expect(winner.value.tokens.refreshToken).not.toBe(refreshToken);
    const winnerHash = createHash('sha256')
      .update(winner.value.tokens.refreshToken)
      .digest('hex');
    expect(winnerHash === records[0].tokenHash).toBe(false);
    expect(winnerHash === records[1].tokenHash).toBe(true);
    await expect(
      service.refreshToken(winner.value.tokens.refreshToken),
    ).resolves.toHaveProperty('tokens');
  });

  it('rolls back the claim when replacement persistence fails', async () => {
    const { refreshToken } = await issue();
    failCreate = true;
    await expect(service.refreshToken(refreshToken)).rejects.toThrow(
      'insert failed',
    );
    expect(records[0].revokedAt).toBeNull();
    failCreate = false;
    await expect(service.refreshToken(refreshToken)).resolves.toHaveProperty(
      'tokens',
    );
  });

  it('embeds the token version in issued tokens', async () => {
    const tokens = await service.generateTokens(
      user.id,
      user.email,
      user.role,
      user.branchId,
      prisma,
      4,
    );
    const claims = jwt.verify<{ tv: number }>(tokens.refreshToken, { secret });
    expect(claims.tv).toBe(4);
  });

  it('rejects refresh once the user token version has been bumped', async () => {
    const { refreshToken } = await issue();
    const bumped = { ...user, tokenVersion: 1 };
    prisma.user.findUnique.mockResolvedValue(bumped);
    await expect(service.refreshToken(refreshToken)).rejects.toThrow(
      'Session is no longer valid',
    );
    expect(records[0].revokedAt).toBeNull();
  });

  it('does not expose tokenVersion in refresh response', async () => {
    const { refreshToken } = await issue();
    const result = await service.refreshToken(refreshToken);
    expect(result.user).not.toHaveProperty('tokenVersion');
  });

  it('rejects refresh for deactivated users', async () => {
    const { refreshToken } = await issue();
    prisma.user.findUnique.mockResolvedValue({ ...user, isActive: false });
    await expect(service.refreshToken(refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects revoked and expired refresh records', async () => {
    const { refreshToken } = await issue();
    records[0].expiresAt = new Date(0);
    await expect(service.refreshToken(refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    records[0].expiresAt = new Date(Date.now() + 60_000);
    records[0].revokedAt = new Date();
    await expect(service.refreshToken(refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
