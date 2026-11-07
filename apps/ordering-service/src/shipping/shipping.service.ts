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
import { VietnamAddressService } from './vietnam-address.service';

export interface WardLocationItem {
  district: string;
  ward: string;
  wardCode?: string;
  formerWards?: string;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly vietnamAddressService: VietnamAddressService,
  ) {}

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
  // Cung cấp đầy đủ 168 đơn vị hành chính cấp xã của TP.HCM mới theo Nghị quyết 1685
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

    const officialWards = this.vietnamAddressService.getAllWards();
    const locationMap = new Map<string, WardLocationItem>();

    // 1. Khởi tạo sẵn tất cả 168 phường/xã của TP.HCM (mặc định isSupported: false)
    for (const w of officialWards) {
      locationMap.set(w.name.toLowerCase(), {
        district: w.area,
        ward: w.name,
        wardCode: w.code,
        formerWards: w.formerWards,
        isSupported: false,
        supportedBranches: [],
      });
    }

    // 2. Map các rule đang kích hoạt vào phường/xã tương ứng
    for (const rule of rules) {
      const cleanWardName = rule.ward.trim();
      const lowerKey = cleanWardName.toLowerCase();

      let item = locationMap.get(lowerKey);

      // Thử tìm theo định dạng không có prefix
      if (!item) {
        const found = this.vietnamAddressService.findWardByName(cleanWardName);
        if (found) {
          item = locationMap.get(found.name.toLowerCase());
        }
      }

      // Nếu rule thuộc về địa phương khác chưa có trong master list (fallback bảo toàn dữ liệu cũ)
      if (!item) {
        item = {
          district: rule.district,
          ward: rule.ward,
          isSupported: true,
          supportedBranches: [],
        };
        locationMap.set(lowerKey, item);
      }

      item.isSupported = true;
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
    const cleanWard = ward.trim();

    // Điều kiện tìm kiếm theo tên phường (hỗ trợ cả case-insensitive và biến thể tên)
    const wardConditions: Array<{ ward: { equals: string; mode: 'insensitive' } }> = [
      { ward: { equals: cleanWard, mode: 'insensitive' } },
    ];

    const wardDef = this.vietnamAddressService.findWardByName(cleanWard);
    if (wardDef && wardDef.name.toLowerCase() !== cleanWard.toLowerCase()) {
      wardConditions.push({
        ward: { equals: wardDef.name, mode: 'insensitive' },
      });
    }

    if (branchId) {
      const specificRule = await this.prisma.shippingRule.findFirst({
        where: {
          OR: wardConditions,
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
          `Chi nhánh được chọn không hỗ trợ giao hàng tới ${cleanWard}`,
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
        OR: wardConditions,
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
        OR: wardConditions,
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
        `Khu vực ${cleanWard} hiện chưa được hỗ trợ giao hàng tận nơi.`,
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
    const cleanWard = dto.ward.trim();
    let district = dto.district?.trim();

    if (!district) {
      const wardDef = this.vietnamAddressService.findWardByName(cleanWard);
      district = wardDef ? wardDef.area : 'TP. Hồ Chí Minh';
    }

    // Nếu đặt là isDefault, bỏ cờ isDefault của các chi nhánh khác trong cùng ward
    if (dto.isDefault) {
      await this.prisma.shippingRule.updateMany({
        where: {
          ward: cleanWard,
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.shippingRule.upsert({
      where: {
        branchId_district_ward: {
          branchId: dto.branchId,
          district,
          ward: cleanWard,
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
        district,
        ward: cleanWard,
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
