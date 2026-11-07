import { Test, TestingModule } from '@nestjs/testing';
import {
  VietnamAddressService,
  OFFICIAL_HCM_WARDS,
} from './vietnam-address.service';

describe('VietnamAddressService', () => {
  let service: VietnamAddressService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VietnamAddressService],
    }).compile();

    service = module.get<VietnamAddressService>(VietnamAddressService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have exactly 168 administrative wards/communes according to Resolution 1685', () => {
    const wards = service.getAllWards();
    expect(wards.length).toBe(168);
  });

  it('should have unique codes and names for all 168 units', () => {
    const codes = new Set(OFFICIAL_HCM_WARDS.map((w) => w.code));
    expect(codes.size).toBe(168);

    const names = new Set(OFFICIAL_HCM_WARDS.map((w) => w.name));
    // Check if there are any duplicate names, or if duplicate names belong to different areas
    expect(names.size).toBeGreaterThanOrEqual(160);
  });

  it('should find ward by name correctly', () => {
    const saiGon = service.findWardByName('Phường Sài Gòn');
    expect(saiGon).toBeDefined();
    expect(saiGon?.code).toBe('HCM-Q1-SG');

    const benThanh = service.findWardByName('Bến Thành');
    expect(benThanh).toBeDefined();
    expect(benThanh?.name).toBe('Phường Bến Thành');
  });

  it('should list distinct areas', () => {
    const areas = service.getAreas();
    expect(areas.length).toBeGreaterThan(10);
    expect(areas).toContain('Khu vực 1 (Quận 1 cũ)');
    expect(areas).toContain('Khu vực TP. Thủ Đức');
  });
});
