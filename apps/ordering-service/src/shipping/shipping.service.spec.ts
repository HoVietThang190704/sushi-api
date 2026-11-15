import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ShippingService } from './shipping.service';
import { VietnamAddressService } from './vietnam-address.service';
import { PrismaService } from '../prisma.service';
import { CalculateShippingDto } from './dto/shipping-rule.dto';
import { BadRequestException } from '@nestjs/common';

describe('ShippingService', () => {
  let service: ShippingService;
  let prismaMock: any;

  const mockBranchQ1 = {
    id: '00000000-0000-0000-0000-000000000001',
    code: 'HANBI-Q1',
    name: 'Hanbi Sushi Quận 1',
    address: '12 Lê Thánh Tôn, Q1',
  };

  const mockBranchBT = {
    id: '00000000-0000-0000-0000-000000000002',
    code: 'HANBI-BT',
    name: 'Hanbi Sushi Bình Thạnh',
    address: '45 Nguyễn Gia Trí, Bình Thạnh',
  };

  beforeEach(async () => {
    prismaMock = {
      branch: {
        findMany: jest.fn().mockResolvedValue([mockBranchQ1, mockBranchBT]),
      },
      shippingRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rule-1',
            branchId: mockBranchQ1.id,
            district: 'Quận 3',
            ward: 'Phường 1',
            fee: 22000,
            isDefault: true,
            isActive: true,
            branch: mockBranchQ1,
          },
        ]),
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShippingService,
        VietnamAddressService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<ShippingService>(ShippingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('CalculateShippingDto validation', () => {
    it('should accept 8-4-4-4-12 sequential UUIDs used in seed data', async () => {
      const dto = plainToInstance(CalculateShippingDto, {
        ward: 'Phường 1',
        district: 'Quận 3',
        branchId: '00000000-0000-0000-0000-000000000001',
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject malformed non-UUID strings', async () => {
      const dto = plainToInstance(CalculateShippingDto, {
        ward: 'Phường 1',
        branchId: 'invalid-branch-id',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('branchId');
    });
  });

  describe('calculateShipping', () => {
    it('uses district alongside ward and accepts a configured zero fee', async () => {
      prismaMock.shippingRule.findFirst.mockResolvedValueOnce({
        district: 'Quận 3',
        ward: 'Phường 1',
        fee: 0,
        branch: mockBranchQ1,
      });
      const result = await service.calculateShipping({
        district: 'Quận 3',
        ward: 'Phường 1',
        branchId: mockBranchQ1.id,
      });
      expect(result.fee).toBe(0);
      expect(prismaMock.shippingRule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            district: expect.objectContaining({ equals: 'Quận 3' }),
            branchId: mockBranchQ1.id,
          }),
        }),
      );
    });

    it('rejects an explicitly selected branch without a matching rule', async () => {
      prismaMock.shippingRule.findFirst.mockResolvedValue(null);
      await expect(
        service.calculateShipping({
          district: 'Quận 3',
          ward: 'Phường 1',
          branchId: mockBranchBT.id,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    it('should calculate shipping with specific branchId matching a rule', async () => {
      prismaMock.shippingRule.findFirst.mockResolvedValueOnce({
        district: 'Quận 3',
        ward: 'Phường 1',
        fee: 22000,
        branch: mockBranchQ1,
      });

      const result = await service.calculateShipping({
        ward: 'Phường 1',
        district: 'Quận 3',
        branchId: mockBranchQ1.id,
      });

      expect(result).toBeDefined();
      expect(result.fee).toBe(22000);
      expect(result.branch.code).toBe('HANBI-Q1');
    });

    it('does not silently switch away from a requested branch', async () => {
      prismaMock.shippingRule.findFirst.mockResolvedValueOnce(null);
      prismaMock.shippingRule.findFirst.mockResolvedValueOnce({
        district: 'Quận 3',
        ward: 'Phường 1',
        fee: 22000,
        branch: mockBranchQ1,
      });

      await expect(
        service.calculateShipping({
          ward: 'Phường 1',
          district: 'Quận 3',
          branchId: mockBranchBT.id,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.shippingRule.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  describe('getShippingRules branch isolation', () => {
    const managerUser = {
      sub: 'manager-1',
      email: 'manager@hanbisushi.vn',
      role: 'BRANCH_MANAGER',
      branchId: mockBranchQ1.id,
    };

    const cashierUser = {
      sub: 'cashier-1',
      email: 'cashier@hanbisushi.vn',
      role: 'CASHIER',
      branchId: mockBranchQ1.id,
    };

    const superAdminUser = {
      sub: 'admin-1',
      email: 'admin@hanbisushi.vn',
      role: 'SUPER_ADMIN',
      branchId: null,
    };

    it('should scope getShippingRules to user.branchId for BRANCH_MANAGER and CASHIER when branchId is omitted', async () => {
      await service.getShippingRules('Quận 3', undefined, managerUser);
      expect(prismaMock.shippingRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { district: 'Quận 3', branchId: mockBranchQ1.id },
        }),
      );

      prismaMock.shippingRule.findMany.mockClear();
      await service.getShippingRules(undefined, undefined, cashierUser);
      expect(prismaMock.shippingRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { branchId: mockBranchQ1.id },
        }),
      );
    });

    it('should reject cross-branch getShippingRules for non-SUPER_ADMIN and missing branchId', async () => {
      await expect(
        service.getShippingRules(undefined, mockBranchBT.id, managerUser),
      ).rejects.toThrow(
        'Bạn chỉ có quyền xem quy tắc giao hàng của chi nhánh được phân công!',
      );

      await expect(
        service.getShippingRules(undefined, undefined, {
          ...cashierUser,
          branchId: null,
        }),
      ).rejects.toThrow(
        'Tài khoản nhân viên chưa được gán chi nhánh hoạt động!',
      );
    });

    it('should allow SUPER_ADMIN to view all branches or filter any branchId', async () => {
      await service.getShippingRules(undefined, undefined, superAdminUser);
      expect(prismaMock.shippingRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );

      prismaMock.shippingRule.findMany.mockClear();
      await service.getShippingRules(
        undefined,
        mockBranchBT.id,
        superAdminUser,
      );
      expect(prismaMock.shippingRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { branchId: mockBranchBT.id },
        }),
      );
    });
  });
});
