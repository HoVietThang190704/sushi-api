import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CatalogServiceService } from './catalog-service.service';
import { PrismaService } from './prisma.service';
import { RabbitMQService } from '@common/rabbitmq';
import { CatalogCacheService } from './catalog-cache.service';

describe('CatalogServiceService', () => {
  let service: CatalogServiceService;
  let prisma: PrismaService;
  let rabbitmqService: RabbitMQService;
  let cache: CatalogCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogServiceService,
        {
          provide: PrismaService,
          useValue: {
            productCategory: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            product: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: RabbitMQService,
          useValue: {
            publishEvent: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: CatalogCacheService,
          useValue: {
            remember: jest.fn(
              (_namespace, _key, load: () => Promise<unknown>) => load(),
            ),
            invalidateCategories: jest.fn(),
            invalidateProducts: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CatalogServiceService>(CatalogServiceService);
    prisma = module.get<PrismaService>(PrismaService);
    rabbitmqService = module.get<RabbitMQService>(RabbitMQService);
    cache = module.get<CatalogCacheService>(CatalogCacheService);
  });

  describe('createCategory', () => {
    it('invalidates category lists after a successful insert', async () => {
      jest
        .spyOn(prisma.productCategory, 'create')
        .mockResolvedValue({ id: 'cat-1' } as any);
      await service.createCategory({ name: 'Maki' });
      expect(cache.invalidateCategories).toHaveBeenCalledTimes(1);
    });
    it('should create category and publish catalog.category.created event', async () => {
      const createdCategory = {
        id: 'cat-1',
        name: 'Maki',
        sortOrder: 0,
        parentId: null,
        parent: null,
      };

      jest
        .spyOn(prisma.productCategory, 'create')
        .mockResolvedValue(createdCategory);

      const result = await service.createCategory({ name: 'Maki' });

      expect(result).toEqual(createdCategory);
      expect(rabbitmqService.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'catalog.category.created',
          resource: 'catalog',
          action: 'CREATED',
          payload: {
            id: 'cat-1',
            name: 'Maki',
            parentId: null,
          },
        }),
      );
    });

    it('should throw NotFoundException if parent category does not exist', async () => {
      jest.spyOn(prisma.productCategory, 'findUnique').mockResolvedValue(null);

      await expect(
        service.createCategory({ name: 'Sub Maki', parentId: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createProduct', () => {
    it('invalidates product and category lists after a successful insert', async () => {
      jest.spyOn(prisma.product, 'findUnique').mockResolvedValue(null);
      jest
        .spyOn(prisma.product, 'create')
        .mockResolvedValue({ id: 'prod-1', sku: 'SKU' } as any);
      await service.createProduct({
        name: 'Roll',
        sku: 'SKU',
        type: 'SINGLE' as any,
        sellingPrice: 10,
      });
      expect(cache.invalidateProducts).toHaveBeenCalledTimes(1);
      expect(cache.invalidateCategories).toHaveBeenCalledTimes(1);
    });
    it('should create product and publish catalog.product.created event', async () => {
      const dto = {
        sku: 'SKU-SALMON',
        name: 'Salmon Roll',
        type: 'SINGLE' as any,
        categoryId: 'cat-1',
        sellingPrice: 120000,
      };

      const createdProduct = {
        id: 'prod-1',
        sku: 'SKU-SALMON',
        name: 'Salmon Roll',
        type: 'SINGLE',
        categoryId: 'cat-1',
        sellingPrice: 120000 as any,
        category: { id: 'cat-1', name: 'Maki' },
      };

      jest.spyOn(prisma.product, 'findUnique').mockResolvedValue(null);
      jest
        .spyOn(prisma.productCategory, 'findUnique')
        .mockResolvedValue({ id: 'cat-1', name: 'Maki' } as any);
      jest
        .spyOn(prisma.product, 'create')
        .mockResolvedValue(createdProduct as any);

      const result = await service.createProduct(dto);

      expect(result).toEqual(createdProduct);
      expect(rabbitmqService.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'catalog.product.created',
          resource: 'catalog',
          action: 'CREATED',
          payload: {
            id: 'prod-1',
            sku: 'SKU-SALMON',
            name: 'Salmon Roll',
            categoryId: 'cat-1',
          },
        }),
      );
    });

    it('should throw ConflictException if SKU already exists', async () => {
      jest.spyOn(prisma.product, 'findUnique').mockResolvedValue({
        id: 'existing-id',
        sku: 'SKU-DUP',
      } as any);

      await expect(
        service.createProduct({
          sku: 'SKU-DUP',
          name: 'Duplicate Item',
          type: 'SINGLE' as any,
          sellingPrice: 50000,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
