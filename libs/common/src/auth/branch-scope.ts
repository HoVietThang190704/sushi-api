import { ForbiddenException } from '@nestjs/common';
import type { RequestUser } from './current-user.decorator';

/**
 * Resolves which branch a request may operate on.
 *
 * - SUPER_ADMIN: may target any branch; returns the requested id, or
 *   `undefined` meaning "all branches".
 * - Everyone else: always bound to their own branch. Requesting another
 *   branch is rejected rather than silently rewritten.
 */
export function resolveBranchScope(
  user: Pick<RequestUser, 'role' | 'branchId'>,
  requestedBranchId?: string | null,
): string | undefined {
  const requested = requestedBranchId?.trim() || undefined;
  if (user.role === 'SUPER_ADMIN') return requested;

  if (!user.branchId) {
    throw new ForbiddenException('Tài khoản chưa được gán chi nhánh');
  }
  if (requested && requested !== user.branchId) {
    throw new ForbiddenException('Không có quyền truy cập chi nhánh này');
  }
  return user.branchId;
}

/** Throws unless the user may access a resource owned by `branchId`. */
export function assertBranchAccess(
  user: Pick<RequestUser, 'role' | 'branchId'>,
  branchId: string | null | undefined,
): void {
  if (user.role === 'SUPER_ADMIN') return;
  if (!user.branchId || !branchId || user.branchId !== branchId) {
    throw new ForbiddenException('Không có quyền truy cập chi nhánh này');
  }
}
