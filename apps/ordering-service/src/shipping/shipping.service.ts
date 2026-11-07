import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  CreateShippingRuleDto,
  UpdateShippingRuleDto,
  CalculateShippingDto,
} from './dto/shipping-rule.dto';

export interface WardLocationItem {
  district: string;
  ward: string;
  isSupported: boolean;
  defaultBranch?: {
    id: string;
    code: string;
    name: string;
    address: string;
  };
  supportedBranches: Array<{
    id: string;
    code: string;
    name: string;
    fee: number;
    isDefault: boolean;
  }>;
}

@Injectable()
export class ShippingService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. Lấy toàn bộ danh sách chi nhánh
  async getBranches() {
    return this.prisma.branch.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  // 2. Lấy danh sách quy tắc phí ship (Dành cho Admin)
  async getShippingRules(district?: string, branchId?: string) {
    return this.prisma.shippingRule.findMany({
      where: {
        ...(district ? { district } : {}),
        ...(branchId ? { branchId } : {}),
      },
      include: {
        branch: {
          select: { id: true, code: true, name: true, address: true },
        },
      },
      orderBy: [{ district: 'asc' }, { ward: 'asc' }],
    });
  }

  // 3. Lấy danh sách các địa điểm Phường/Xã TP.HCM công khai (Dành cho Storefront Dropdown)
  async getLocations(): Promise<WardLocationItem[]> {
    const rules = await this.prisma.shippingRule.findMany({
      where: { isActive: true },
      include: {
        branch: {
          select: { id: true, code: true, name: true, address: true },
        },
      },
      orderBy: [{ district: 'asc' }, { ward: 'asc' }],
    });

    const locationMap = new Map<string, WardLocationItem>();

    for (const rule of rules) {
      const key = `${rule.district}__${rule.ward}`;
      if (!locationMap.has(key)) {
        locationMap.set(key, {
          district: rule.district,
          ward: rule.ward,
          isSupported: true,
          supportedBranches: [],
        });
      }

      const item = locationMap.get(key)!;
      const branchData = {
        id: rule.branch.id,
        code: rule.branch.code,
        name: rule.branch.name,
        fee: Number(rule.fee),
        isDefault: rule.isDefault,
      };

      item.supportedBranches.push(branchData);
      if (rule.isDefault || !item.defaultBranch) {
        item.defaultBranch = {
          id: rule.branch.id,
          code: rule.branch.code,
          name: rule.branch.name,
          address: rule.branch.address,
        };
      }
    }

    return Array.from(locationMap.values());
  }

  // 4. Tính toán phí ship cho một cặp Phường/Xã và Chi nhánh
  async calculateShipping(dto: CalculateShippingDto) {
    const { district, ward, branchId } = dto;

    if (branchId) {
      const specificRule = await this.prisma.shippingRule.findFirst({
        where: {
          district: district.trim(),
          ward: ward.trim(),
          branchId,
          isActive: true,
        },
        include: {
          branch: {
            select: { id: true, code: true, name: true, address: true },
          },
        },
      });

      if (!specificRule) {
        throw new BadRequestException(
          `Chi nhánh được chọn không hỗ trợ giao hàng tới ${ward}, ${district}`,
        );
      }

      return {
        district: specificRule.district,
        ward: specificRule.ward,
        fee: Number(specificRule.fee),
        branch: specificRule.branch,
      };
    }

    // Nếu không truyền branchId, ưu tiên lấy chi nhánh mặc định
    const defaultRule = await this.prisma.shippingRule.findFirst({
      where: {
        district: district.trim(),
        ward: ward.trim(),
        isDefault: true,
        isActive: true,
      },
      include: {
        branch: {
          select: { id: true, code: true, name: true, address: true },
        },
      },
    });

    if (defaultRule) {
      return {
        district: defaultRule.district,
        ward: defaultRule.ward,
        fee: Number(defaultRule.fee),
        branch: defaultRule.branch,
      };
    }

    // Nếu không có isDefault, lấy bất kỳ chi nhánh nào hỗ trợ khu vực này
    const anyRule = await this.prisma.shippingRule.findFirst({
      where: {
        district: district.trim(),
        ward: ward.trim(),
        isActive: true,
      },
      include: {
        branch: {
          select: { id: true, code: true, name: true, address: true },
        },
      },
    });

    if (!anyRule) {
      throw new BadRequestException(
        `Khu vực ${ward}, ${district} hiện chưa được hỗ trợ giao hàng tận nơi.`,
      );
    }

    return {
      district: anyRule.district,
      ward: anyRule.ward,
      fee: Number(anyRule.fee),
      branch: anyRule.branch,
    };
  }

  // 5. Thêm / cập nhật quy tắc phí ship (Admin)
  async upsertShippingRule(dto: CreateShippingRuleDto) {
    // Nếu đặt là isDefault, bỏ cờ isDefault của các chi nhánh khác trong cùng ward/district
    if (dto.isDefault) {
      await this.prisma.shippingRule.updateMany({
        where: {
          district: dto.district,
          ward: dto.ward,
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.shippingRule.upsert({
      where: {
        branchId_district_ward: {
          branchId: dto.branchId,
          district: dto.district,
          ward: dto.ward,
        },
      },
      update: {
        fee: dto.fee,
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
      },
      create: {
        branchId: dto.branchId,
        province: dto.province || 'TP. Hồ Chí Minh',
        district: dto.district,
        ward: dto.ward,
        fee: dto.fee,
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
      },
    });
  }

  // 6. Cập nhật rule theo ID
  async updateShippingRule(id: string, dto: UpdateShippingRuleDto) {
    const existing = await this.prisma.shippingRule.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Shipping rule ID ${id} not found`);
    }

    if (dto.isDefault) {
      await this.prisma.shippingRule.updateMany({
        where: {
          district: existing.district,
          ward: existing.ward,
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.shippingRule.update({
      where: { id },
      data: {
        fee: dto.fee !== undefined ? dto.fee : undefined,
        isDefault: dto.isDefault !== undefined ? dto.isDefault : undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
      },
    });
  }

  // 7. Xóa rule
  async deleteShippingRule(id: string) {
    return this.prisma.shippingRule.delete({
      where: { id },
    });
  }
}
