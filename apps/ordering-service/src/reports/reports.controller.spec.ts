import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { AuthModule, ROLES_KEY } from '@common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

describe('ReportsController access control', () => {
  it('is restricted to SUPER_ADMIN and BRANCH_MANAGER (profit data)', async () => {
    const module = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [ReportsController],
      providers: [
        { provide: ReportsService, useValue: { getAnalytics: jest.fn() } },
      ],
    }).compile();

    const roles = module
      .get(Reflector)
      .get<string[]>(ROLES_KEY, ReportsController);
    expect(roles).toEqual(['SUPER_ADMIN', 'BRANCH_MANAGER']);
    expect(roles).not.toContain('CASHIER');
    expect(roles).not.toContain('KITCHEN_STAFF');
  });
});
