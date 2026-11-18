import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

interface BranchLike {
  id?: unknown;
  isActive?: unknown;
}

/**
 * Validates branch IDs against ordering-service (which owns `Branch`)
 * over HTTP, rather than reading another service's tables.
 */
@Injectable()
export class BranchDirectoryService {
  private baseUrl(): string {
    return process.env.ORDERING_SERVICE_URL || 'http://localhost:3004';
  }

  async assertBranchExists(branchId: string): Promise<void> {
    let body: unknown;
    try {
      const res = await fetch(`${this.baseUrl()}/shipping/branches`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      body = await res.json();
    } catch {
      throw new ServiceUnavailableException(
        'Không thể xác thực chi nhánh, vui lòng thử lại',
      );
    }

    const list = Array.isArray(body)
      ? body
      : Array.isArray((body as { data?: unknown })?.data)
        ? (body as { data: unknown[] }).data
        : [];
    const found = (list as BranchLike[]).some(
      (b) => b.id === branchId && b.isActive !== false,
    );
    if (!found) {
      throw new BadRequestException('Chi nhánh không tồn tại hoặc đã ngưng');
    }
  }
}
