import { ForbiddenException } from '@nestjs/common';
import { assertBranchAccess, resolveBranchScope } from './branch-scope';

describe('resolveBranchScope', () => {
  const admin = { role: 'SUPER_ADMIN', branchId: null };
  const manager = { role: 'BRANCH_MANAGER', branchId: 'b1' };

  it('lets SUPER_ADMIN pick any branch or none', () => {
    expect(resolveBranchScope(admin, 'b9')).toBe('b9');
    expect(resolveBranchScope(admin)).toBeUndefined();
    expect(resolveBranchScope(admin, '  ')).toBeUndefined();
  });

  it('binds other roles to their own branch', () => {
    expect(resolveBranchScope(manager)).toBe('b1');
    expect(resolveBranchScope(manager, 'b1')).toBe('b1');
  });

  it('rejects other roles requesting a different branch', () => {
    expect(() => resolveBranchScope(manager, 'b2')).toThrow(ForbiddenException);
  });

  it('rejects non-admin without an assigned branch', () => {
    expect(() =>
      resolveBranchScope({ role: 'CASHIER', branchId: null }),
    ).toThrow(ForbiddenException);
  });
});

describe('assertBranchAccess', () => {
  it('allows SUPER_ADMIN everywhere', () => {
    expect(() =>
      assertBranchAccess({ role: 'SUPER_ADMIN', branchId: null }, 'any'),
    ).not.toThrow();
  });

  it('allows same branch and rejects others or missing', () => {
    const user = { role: 'CASHIER', branchId: 'b1' };
    expect(() => assertBranchAccess(user, 'b1')).not.toThrow();
    expect(() => assertBranchAccess(user, 'b2')).toThrow(ForbiddenException);
    expect(() => assertBranchAccess(user, null)).toThrow(ForbiddenException);
  });
});
