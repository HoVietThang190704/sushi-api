import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { RequestUser } from '@common';
import { SessionStateService } from '@common';
import { PrismaService } from '../prisma.service';
import { BranchDirectoryService } from './branch-directory.service';
import {
  CreateStaffDto,
  ListStaffQueryDto,
  UpdateStaffDto,
} from './dto/staff.dto';
import {
  STAFF_ROLES,
  assertCanManageStaff,
  assertCanManageTarget,
  isSuperAdmin,
  resolveAssignment,
} from './staff-policy';

const STAFF_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  branchId: true,
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchDirectoryService,
    private readonly sessionState: SessionStateService,
  ) {}

  private generateTempPassword(): string {
    return randomBytes(9).toString('base64url');
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actor: RequestUser,
    action: string,
    targetUserId: string,
    before: unknown,
    after: unknown,
  ) {
    await tx.auditLog.create({
      data: {
        actorId: actor.sub,
        action,
        targetUserId,
        before: (before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (after ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private async revokeSessions(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<number> {
    const bumped = await tx.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return bumped.tokenVersion;
  }

  private async getTarget(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: STAFF_SELECT,
    });
    if (!user || !(STAFF_ROLES as readonly string[]).includes(user.role)) {
      throw new NotFoundException('Không tìm thấy nhân viên');
    }
    return user;
  }

  private async assertNotLastSuperAdmin(
    tx: Prisma.TransactionClient,
    targetId: string,
  ) {
    const others = await tx.user.count({
      where: { role: 'SUPER_ADMIN', isActive: true, id: { not: targetId } },
    });
    if (others === 0) {
      throw new ForbiddenException(
        'Không thể thao tác trên SUPER_ADMIN cuối cùng',
      );
    }
  }

  async list(actor: RequestUser, query: ListStaffQueryDto) {
    assertCanManageStaff(actor);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.UserWhereInput = {
      role: query.role
        ? (query.role as Prisma.UserWhereInput['role'])
        : { in: [...STAFF_ROLES] },
    };
    if (isSuperAdmin(actor)) {
      if (query.branchId) where.branchId = query.branchId;
    } else {
      where.branchId = actor.branchId;
    }
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: STAFF_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async create(actor: RequestUser, dto: CreateStaffDto) {
    const assignment = resolveAssignment(actor, dto.role, dto.branchId);
    if (assignment.branchId) {
      await this.branches.assertBranchExists(assignment.branchId);
    }

    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email đã được sử dụng');
    }

    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName: dto.fullName,
          phone: dto.phone || null,
          role: assignment.role,
          branchId: assignment.branchId,
          mustChangePassword: true,
        },
        select: STAFF_SELECT,
      });
      await this.audit(tx, actor, 'STAFF_CREATED', created.id, null, {
        role: created.role,
        branchId: created.branchId,
        email: created.email,
      });
      return created;
    });

    return { user, temporaryPassword: tempPassword };
  }

  async update(actor: RequestUser, id: string, dto: UpdateStaffDto) {
    const target = await this.getTarget(id);
    assertCanManageTarget(actor, target);

    const roleChanging = dto.role !== undefined && dto.role !== target.role;
    const branchChanging =
      dto.branchId !== undefined && dto.branchId !== target.branchId;

    let nextRole = target.role as string;
    let nextBranchId = target.branchId;
    if (roleChanging || branchChanging) {
      if (target.id === actor.sub) {
        throw new ForbiddenException(
          'Không thể tự đổi vai trò hoặc chi nhánh của chính mình',
        );
      }
      const assignment = resolveAssignment(
        actor,
        dto.role ?? target.role,
        dto.branchId !== undefined ? dto.branchId : target.branchId,
      );
      nextRole = assignment.role;
      nextBranchId = assignment.branchId;
      if (nextBranchId && nextBranchId !== target.branchId) {
        await this.branches.assertBranchExists(nextBranchId);
      }
    }

    let revokedTv: number | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      if (target.role === 'SUPER_ADMIN' && nextRole !== 'SUPER_ADMIN') {
        await this.assertNotLastSuperAdmin(tx, target.id);
      }
      const user = await tx.user.update({
        where: { id },
        data: {
          fullName: dto.fullName,
          phone: dto.phone,
          role: nextRole as Prisma.UserUpdateInput['role'],
          branchId: nextBranchId,
        },
        select: STAFF_SELECT,
      });
      if (roleChanging || branchChanging) {
        revokedTv = await this.revokeSessions(tx, id);
      }
      await this.audit(
        tx,
        actor,
        'STAFF_UPDATED',
        id,
        {
          fullName: target.fullName,
          phone: target.phone,
          role: target.role,
          branchId: target.branchId,
        },
        {
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
          branchId: user.branchId,
        },
      );
      return user;
    });
    if (revokedTv !== null) await this.sessionState.publish(id, revokedTv);
    return updated;
  }

  async setStatus(actor: RequestUser, id: string, isActive: boolean) {
    const target = await this.getTarget(id);
    assertCanManageTarget(actor, target);
    if (target.id === actor.sub) {
      throw new ForbiddenException('Không thể tự khóa tài khoản của mình');
    }

    let revokedTv: number | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      if (!isActive && target.role === 'SUPER_ADMIN') {
        await this.assertNotLastSuperAdmin(tx, target.id);
      }
      const user = await tx.user.update({
        where: { id },
        data: { isActive },
        select: STAFF_SELECT,
      });
      if (!isActive) revokedTv = await this.revokeSessions(tx, id);
      await this.audit(
        tx,
        actor,
        isActive ? 'STAFF_ACTIVATED' : 'STAFF_DEACTIVATED',
        id,
        { isActive: target.isActive },
        { isActive },
      );
      return user;
    });
    if (revokedTv !== null) await this.sessionState.publish(id, revokedTv);
    return result;
  }

  async resetPassword(actor: RequestUser, id: string) {
    const target = await this.getTarget(id);
    assertCanManageTarget(actor, target);
    if (target.id === actor.sub) {
      throw new BadRequestException(
        'Hãy dùng chức năng đổi mật khẩu cho tài khoản của bạn',
      );
    }

    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    let revokedTv = 0;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true },
      });
      revokedTv = await this.revokeSessions(tx, id);
      await this.audit(tx, actor, 'STAFF_PASSWORD_RESET', id, null, null);
    });
    await this.sessionState.publish(id, revokedTv);
    return { temporaryPassword: tempPassword };
  }
}
