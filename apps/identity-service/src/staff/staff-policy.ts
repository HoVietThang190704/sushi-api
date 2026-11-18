import { ForbiddenException } from '@nestjs/common';
import type { RequestUser } from '@common';

export const STAFF_ROLES = [
  'SUPER_ADMIN',
  'BRANCH_MANAGER',
  'CASHIER',
  'KITCHEN_STAFF',
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Roles that must always be bound to exactly one branch. */
export const BRANCH_BOUND_ROLES: readonly string[] = [
  'BRANCH_MANAGER',
  'CASHIER',
  'KITCHEN_STAFF',
];

/** Roles a BRANCH_MANAGER may create / manage. */
export const MANAGER_ASSIGNABLE_ROLES: readonly string[] = [
  'CASHIER',
  'KITCHEN_STAFF',
];

export interface StaffTarget {
  id: string;
  role: string;
  branchId: string | null;
}

export function isSuperAdmin(actor: RequestUser): boolean {
  return actor.role === 'SUPER_ADMIN';
}

/** Throws unless actor may manage staff at all. */
export function assertCanManageStaff(actor: RequestUser): void {
  if (actor.role === 'SUPER_ADMIN') return;
  if (actor.role === 'BRANCH_MANAGER' && actor.branchId) return;
  throw new ForbiddenException('Không có quyền quản lý nhân sự');
}

/** Throws unless actor may act on the existing target account. */
export function assertCanManageTarget(
  actor: RequestUser,
  target: StaffTarget,
): void {
  assertCanManageStaff(actor);
  if (isSuperAdmin(actor)) return;
  if (
    target.id === actor.sub ||
    !MANAGER_ASSIGNABLE_ROLES.includes(target.role) ||
    target.branchId !== actor.branchId
  ) {
    throw new ForbiddenException('Không có quyền thao tác tài khoản này');
  }
}

/**
 * Validates and normalizes the (role, branchId) a staff account is
 * being given. Managers are forced into their own branch.
 */
export function resolveAssignment(
  actor: RequestUser,
  role: string,
  branchId: string | null | undefined,
): { role: StaffRole; branchId: string | null } {
  assertCanManageStaff(actor);
  if (!(STAFF_ROLES as readonly string[]).includes(role)) {
    throw new ForbiddenException('Vai trò không hợp lệ');
  }

  if (!isSuperAdmin(actor)) {
    if (!MANAGER_ASSIGNABLE_ROLES.includes(role)) {
      throw new ForbiddenException('Không được gán vai trò này');
    }
    if (branchId && branchId !== actor.branchId) {
      throw new ForbiddenException('Không được gán sang chi nhánh khác');
    }
    return { role: role as StaffRole, branchId: actor.branchId ?? null };
  }

  if (BRANCH_BOUND_ROLES.includes(role)) {
    if (!branchId) {
      throw new ForbiddenException('Vai trò này bắt buộc thuộc một chi nhánh');
    }
    return { role: role as StaffRole, branchId };
  }
  return { role: role as StaffRole, branchId: null };
}
