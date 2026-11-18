import { ForbiddenException } from '@nestjs/common';
import type { RequestUser } from '@common';
import {
  assertCanManageStaff,
  assertCanManageTarget,
  resolveAssignment,
} from './staff-policy';

const admin: RequestUser = {
  sub: 'a1',
  email: 'a@x.com',
  role: 'SUPER_ADMIN',
  branchId: null,
};
const manager: RequestUser = {
  sub: 'm1',
  email: 'm@x.com',
  role: 'BRANCH_MANAGER',
  branchId: 'b1',
};

describe('staff policy', () => {
  describe('assertCanManageStaff', () => {
    it('allows admin and branch-bound manager only', () => {
      expect(() => assertCanManageStaff(admin)).not.toThrow();
      expect(() => assertCanManageStaff(manager)).not.toThrow();
      expect(() =>
        assertCanManageStaff({ ...manager, branchId: null }),
      ).toThrow(ForbiddenException);
      expect(() =>
        assertCanManageStaff({ ...manager, role: 'CASHIER' }),
      ).toThrow(ForbiddenException);
    });
  });

  describe('resolveAssignment', () => {
    it('admin must give branch-bound roles a branch', () => {
      expect(() => resolveAssignment(admin, 'CASHIER', undefined)).toThrow(
        ForbiddenException,
      );
      expect(resolveAssignment(admin, 'CASHIER', 'b2')).toEqual({
        role: 'CASHIER',
        branchId: 'b2',
      });
    });

    it('admin accounts carry no branch', () => {
      expect(resolveAssignment(admin, 'SUPER_ADMIN', 'b2').branchId).toBeNull();
    });

    it('manager is forced into own branch with allowed roles only', () => {
      expect(resolveAssignment(manager, 'KITCHEN_STAFF', undefined)).toEqual({
        role: 'KITCHEN_STAFF',
        branchId: 'b1',
      });
      expect(() => resolveAssignment(manager, 'KITCHEN_STAFF', 'b2')).toThrow(
        ForbiddenException,
      );
    });

    it('manager cannot create managers or super admins', () => {
      expect(() => resolveAssignment(manager, 'SUPER_ADMIN', null)).toThrow(
        ForbiddenException,
      );
      expect(() =>
        resolveAssignment(manager, 'BRANCH_MANAGER', 'b1'),
      ).toThrow(ForbiddenException);
    });

    it('rejects unknown roles', () => {
      expect(() => resolveAssignment(admin, 'CUSTOMER', null)).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('assertCanManageTarget', () => {
    const cashier = { id: 'c1', role: 'CASHIER', branchId: 'b1' };

    it('manager manages same-branch cashier/kitchen', () => {
      expect(() => assertCanManageTarget(manager, cashier)).not.toThrow();
    });

    it('manager cannot touch other branches, peers, admins or self', () => {
      expect(() =>
        assertCanManageTarget(manager, { ...cashier, branchId: 'b2' }),
      ).toThrow(ForbiddenException);
      expect(() =>
        assertCanManageTarget(manager, { ...cashier, role: 'BRANCH_MANAGER' }),
      ).toThrow(ForbiddenException);
      expect(() =>
        assertCanManageTarget(manager, { ...cashier, role: 'SUPER_ADMIN' }),
      ).toThrow(ForbiddenException);
      expect(() =>
        assertCanManageTarget(manager, { ...cashier, id: 'm1' }),
      ).toThrow(ForbiddenException);
    });

    it('admin manages anyone', () => {
      expect(() =>
        assertCanManageTarget(admin, { ...cashier, branchId: 'b9' }),
      ).not.toThrow();
    });
  });
});
