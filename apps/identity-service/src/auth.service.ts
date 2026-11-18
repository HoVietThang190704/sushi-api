import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { SessionStateService } from '@common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Optional() private readonly sessionState?: SessionStateService,
  ) {}

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async isRefreshTokenMatch(
    rawToken: string,
    storedHash: string,
    precomputedSha256?: string,
  ): Promise<boolean> {
    if (storedHash.startsWith('$2')) {
      return bcrypt.compare(rawToken, storedHash);
    }
    const sha256 = precomputedSha256 ?? this.hashRefreshToken(rawToken);
    return storedHash === sha256;
  }

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        fullName: dto.fullName,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        branchId: true,
        createdAt: true,
      },
    });

    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.branchId,
      this.prisma,
      user.tokenVersion ?? 0,
    );
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        branchId: user.branchId,
        mustChangePassword: user.mustChangePassword ?? false,
      },
      tokens,
    };
  }

  async generateTokens(
    userId: string,
    email: string,
    role: string,
    branchId: string | null,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
    tokenVersion = 0,
  ) {
    const payload = {
      sub: userId,
      email,
      role,
      branchId: branchId || null,
      tv: tokenVersion,
    };

    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    const jwtRefreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: jwtSecret,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(
        { jti: randomUUID(), ...payload },
        {
          secret: jwtRefreshSecret,
          expiresIn: '7d',
        },
      ),
    ]);

    const tokenHash = this.hashRefreshToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await db.refreshToken.create({
      data: {
        tokenHash,
        userId,
        expiresAt,
      },
    });
    return { accessToken, refreshToken };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        branchId: true,
        isActive: true,
        mustChangePassword: true,
        tokenVersion: true,
        createdAt: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }
    return user;
  }

  /** Public-safe profile (never exposes tokenVersion). */
  async getPublicProfile(userId: string) {
    const { tokenVersion, ...profile } = await this.getProfile(userId);
    void tokenVersion;
    return profile;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Mật khẩu mới phải có ít nhất 8 ký tự');
    }
    if (newPassword === currentPassword) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu cũ');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          tokenVersion: { increment: 1 },
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const tokens = await this.generateTokens(
        updated.id,
        updated.email,
        updated.role,
        updated.branchId,
        tx,
        updated.tokenVersion,
      );
      return {
        tokenVersion: updated.tokenVersion,
        user: {
          id: updated.id,
          email: updated.email,
          fullName: updated.fullName,
          role: updated.role,
          branchId: updated.branchId,
          mustChangePassword: false,
        },
        tokens,
      };
    });
    await this.sessionState?.publish(userId, result.tokenVersion);
    const { tokenVersion, ...response } = result;
    void tokenVersion;
    return response;
  }

  async refreshToken(rawRefreshToken: string) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    let payload: {
      sub: string;
      email: string;
      role: string;
      branchId?: string | null;
      tv?: number;
    };
    try {
      const jwtRefreshSecret =
        this.configService.get<string>('JWT_REFRESH_SECRET');
      payload = this.jwtService.verify(rawRefreshToken, {
        secret: jwtRefreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const userId = payload.sub;

    const userTokens = await this.prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const incomingHash = this.hashRefreshToken(rawRefreshToken);
    let matchedTokenRecord: (typeof userTokens)[number] | null = null;
    for (const record of userTokens) {
      const isMatch = await this.isRefreshTokenMatch(
        rawRefreshToken,
        record.tokenHash,
        incomingHash,
      );
      if (isMatch) {
        matchedTokenRecord = record;
        break;
      }
    }

    if (!matchedTokenRecord) {
      throw new UnauthorizedException('Refresh token not found or invalid');
    }

    if (matchedTokenRecord.revokedAt) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (new Date() > matchedTokenRecord.expiresAt) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    const user = await this.getProfile(userId);
    if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
      throw new UnauthorizedException('Session is no longer valid');
    }
    const newTokens = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: {
          id: matchedTokenRecord.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new UnauthorizedException('Refresh token already used');
      }
      return this.generateTokens(
        user.id,
        user.email,
        user.role,
        user.branchId,
        tx,
        user.tokenVersion ?? 0,
      );
    });

    const { tokenVersion, ...publicUser } = user;
    void tokenVersion;
    return {
      user: publicUser,
      tokens: newTokens,
    };
  }

  async revokeToken(rawRefreshToken?: string) {
    if (!rawRefreshToken) return;

    try {
      const jwtRefreshSecret =
        this.configService.get<string>('JWT_REFRESH_SECRET');
      const payload = this.jwtService.verify<{ sub: string }>(rawRefreshToken, {
        secret: jwtRefreshSecret,
      });

      const userTokens = await this.prisma.refreshToken.findMany({
        where: { userId: payload.sub, revokedAt: null },
      });

      const incomingHash = this.hashRefreshToken(rawRefreshToken);
      for (const record of userTokens) {
        if (
          await this.isRefreshTokenMatch(
            rawRefreshToken,
            record.tokenHash,
            incomingHash,
          )
        ) {
          await this.prisma.refreshToken.update({
            where: { id: record.id },
            data: { revokedAt: new Date() },
          });
          break;
        }
      }
    } catch {
      // Ignore invalid or expired token during logout
    }
  }
}
