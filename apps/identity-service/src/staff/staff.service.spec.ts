import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { RequestUser } from '@common';
import { StaffService } from './staff.service';

const admin: RequestUser = {
  sub: 'admin-1',
  email: 'admin@x.com',
  role: 'SUPER_ADMIN',
  branchId: null,
};
const manager: RequestUser = {
  sub: 'mgr-1',
  email: 'mgr@x.com',
  role: 'BRANCH_MANAGER',
  branchId: 'b1',
};

function makeUser(over: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    email: 'u1@x.com',
    fullName: 'U One',
    phone: null,
    role: 'CASHIER',
    branchId: 'b1',
    isActive: true,
    mustChangePassword: false,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe('StaffService', () => {
  let tx: any;
  let prisma: any;
  let branches: { assertBranchExists: jest.Mock };
  let sessionState: { publish: jest.Mock };
  let service: StaffService;

  beforeEach(() => {
    tx = {
      user: {
        create: jest.fn(async ({ data }: any) => makeUser(data)),
        update: jest.fn(async ({ data }: any) => ({
          ...makeUser(),
          ...data,
          tokenVersion: 3,
        })),
        count: jest.fn().mockResolvedValue(1),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn(async (arg: any) =>
        typeof arg === 'function' ? arg(tx) : Promise.all(arg),
      ),
    };
    branches = { assertBranchExists: jest.fn().mockResolvedValue(undefined) };
    sessionState = { publish: jest.fn().mockResolvedValue(undefined) };
    service = new StaffService(
      prisma,
      branches as never,
      sessionState as never,
    );
  });

  describe('create', () => {
    it('creates account with temp password and audit entry', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const res = await service.create(admin, {
        email: 'New@X.com',
        fullName: 'New',
        role: 'CASHIER',
        branchId: 'b1',
      });
      expect(branches.assertBranchExists).toHaveBeenCalledWith('b1');
      const data = tx.user.create.mock.calls[0][0].data;
      expect(data.email).toBe('new@x.com');
      expect(data.mustChangePassword).toBe(true);
      expect(data.passwordHash).not.toBe(res.temporaryPassword);
      expect(res.temporaryPassword.length).toBeGreaterThanOrEqual(12);
      expect(tx.auditLog.create).toHaveBeenCalled();
    });

    it('rejects duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      await expect(
        service.create(admin, {
          email: 'u1@x.com',
          fullName: 'Dup',
          role: 'CASHIER',
          branchId: 'b1',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('forces manager-created staff into own branch and blocks escalation', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await service.create(manager, {
        email: 'k@x.com',
        fullName: 'K',
        role: 'KITCHEN_STAFF',
      });
      expect(tx.user.create.mock.calls[0][0].data.branchId).toBe('b1');
      await expect(
        service.create(manager, {
          email: 'a@x.com',
          fullName: 'A',
          role: 'SUPER_ADMIN',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('list', () => {
    it('scopes manager to own branch regardless of query', async () => {
      await service.list(manager, { branchId: 'b2' });
      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe('b1');
    });

    it('lets admin filter by any branch and excludes customers', async () => {
      await service.list(admin, { branchId: 'b2' });
      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe('b2');
      expect(where.role).toEqual({
        in: expect.not.arrayContaining(['CUSTOMER']),
      });
    });
  });

  describe('update', () => {
    it('revokes sessions and publishes version on role/branch change', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      await service.update(admin, 'u1', { branchId: 'b2' });
      expect(branches.assertBranchExists).toHaveBeenCalledWith('b2');
      expect(tx.refreshToken.updateMany).toHaveBeenCalled();
      expect(sessionState.publish).toHaveBeenCalledWith('u1', 3);
    });

    it('does not revoke when only name changes', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      await service.update(admin, 'u1', { fullName: 'Renamed' });
      expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(sessionState.publish).not.toHaveBeenCalled();
    });

    it('blocks self role change', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ id: 'admin-1', role: 'SUPER_ADMIN', branchId: null }),
      );
      await expect(
        service.update(admin, 'admin-1', { role: 'CASHIER', branchId: 'b1' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks manager editing another branch', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ branchId: 'b2' }));
      await expect(
        service.update(manager, 'u1', { fullName: 'x' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks demoting the last SUPER_ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ id: 'sa-2', role: 'SUPER_ADMIN', branchId: null }),
      );
      tx.user.count.mockResolvedValue(0);
      await expect(
        service.update(admin, 'sa-2', { role: 'CASHIER', branchId: 'b1' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('404 when target is not staff', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ role: 'CUSTOMER' }));
      await expect(service.update(admin, 'u1', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('setStatus', () => {
    it('deactivation revokes sessions and publishes', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      await service.setStatus(admin, 'u1', false);
      expect(tx.refreshToken.updateMany).toHaveBeenCalled();
      expect(sessionState.publish).toHaveBeenCalledWith('u1', 3);
    });

    it('reactivation does not revoke', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ isActive: false }));
      await service.setStatus(admin, 'u1', true);
      expect(sessionState.publish).not.toHaveBeenCalled();
    });

    it('cannot deactivate self or the last SUPER_ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'admin-1' }));
      await expect(service.setStatus(admin, 'admin-1', false)).rejects.toThrow(
        ForbiddenException,
      );
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ id: 'sa-2', role: 'SUPER_ADMIN', branchId: null }),
      );
      tx.user.count.mockResolvedValue(0);
      await expect(service.setStatus(admin, 'sa-2', false)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('resetPassword', () => {
    it('sets must-change flag, revokes sessions, returns temp password', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      const res = await service.resetPassword(admin, 'u1');
      expect(res.temporaryPassword).toBeTruthy();
      const data = tx.user.update.mock.calls[0][0].data;
      expect(data.mustChangePassword).toBe(true);
      expect(sessionState.publish).toHaveBeenCalledWith('u1', 3);
    });
  });
});
