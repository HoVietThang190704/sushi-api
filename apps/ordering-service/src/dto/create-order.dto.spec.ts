import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';
import { CreateStaffOrderDto } from './create-staff-order.dto';

describe('CreateOrderDto delivery location', () => {
  const base = {
    customerName: 'A',
    customerPhone: '0901234567',
    address: '12 Main St',
    district: 'Quận 3',
    ward: 'Phường 1',
    items: [{ productId: '00000000-0000-0000-0000-000000000001', quantity: 1 }],
  };
  for (const field of ['address', 'district', 'ward'] as const) {
    it(`rejects missing or blank ${field}`, async () => {
      for (const value of [undefined, '', '   ']) {
        const input = { ...base, [field]: value };
        const errors = await validate(plainToInstance(CreateOrderDto, input));
        expect(errors.map((error) => error.property)).toContain(field);
      }
    });
  }

  it('accepts seeded branchId UUID in CreateStaffOrderDto', async () => {
    const staffInput = {
      ...base,
      branchId: '00000000-0000-0000-0000-000000000001',
    };
    const errors = await validate(
      plainToInstance(CreateStaffOrderDto, staffInput),
    );
    expect(errors).toHaveLength(0);
  });
});
