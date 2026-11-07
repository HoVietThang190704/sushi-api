import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ShippingService } from './shipping.service';
import { VietnamAddressService } from './vietnam-address.service';
import { PrismaService } from '../prisma.service';
import { CalculateShippingDto } from './dto/shipping-rule.dto';

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

    it('should fallback to default rule if specified branchId does not deliver to ward', async () => {
      // First call (with specific branchId) returns null
      prismaMock.shippingRule.findFirst.mockResolvedValueOnce(null);
      // Fallback call (defaultRule) returns rule with default branch
      prismaMock.shippingRule.findFirst.mockResolvedValueOnce({
        district: 'Quận 3',
        ward: 'Phường 1',
        fee: 22000,
        branch: mockBranchQ1,
      });

      const result = await service.calculateShipping({
        ward: 'Phường 1',
        district: 'Quận 3',
        branchId: mockBranchBT.id, // BT does not deliver to Phường 1, fallback to Q1
      });

      expect(result).toBeDefined();
      expect(result.branch.code).toBe('HANBI-Q1');
      expect(result.fee).toBe(22000);
    });
  });
});
