import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    // Nếu endpoint không yêu cầu roles cụ thể -> Public (cho phép qua)
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // 1. Kiểm tra header nội bộ do API Gateway tiêm xuống
    let userRole = request.headers['x-user-role'];

    // 2. Fallback: Nếu gọi trực tiếp cổng 3002 có Bearer Token hoặc Cookie
    if (!userRole) {
      let token = request.headers.authorization?.replace('Bearer ', '');
      if (!token && request.cookies) {
        token = request.cookies['access_token'];
      }

      if (token) {
        try {
          const secret = this.configService.get<string>('JWT_SECRET');
          const payload = this.jwtService.verify(token, { secret });
          userRole = payload?.role;
        } catch {
          // Token không hợp lệ hoặc hết hạn
        }
      }
    }

    // 3. Nếu chưa đăng nhập (không có role)
    if (!userRole) {
      throw new UnauthorizedException(
        'Authentication required. Please login to perform this action.',
      );
    }

    // 4. Nếu role không nằm trong danh sách quyền được phép
    const hasRole = requiredRoles.includes(userRole);
    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Role '${userRole}' does not have permission to perform this action.`,
      );
    }

    return true;
  }
}
