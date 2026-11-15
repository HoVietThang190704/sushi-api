import { Test, TestingModule } from '@nestjs/testing';
import { CatalogServiceController } from './catalog-service.controller';
import { CatalogServiceService } from './catalog-service.service';
import { CloudinaryService, RolesGuard } from '@common';
import { RabbitMQService } from '@common/rabbitmq';
import { PrismaService } from './prisma.service';
import { CatalogCacheService } from './catalog-cache.service';

describe('CatalogServiceController', () => {
  let controller: CatalogServiceController;
  let service: CatalogServiceService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [CatalogServiceController],
      providers: [
        CatalogServiceService,
        {
          provide: PrismaService,
          useValue: {
            productCategory: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
            },
            product: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
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
            remember: jest.fn(),
            invalidateCategories: jest.fn(),
            invalidateProducts: jest.fn(),
          },
        },
        {
          provide: CloudinaryService,
          useValue: {
            uploadImage: jest
              .fn()
              .mockResolvedValue({ secure_url: 'https://example.com/img.jpg' }),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = app.get<CatalogServiceController>(CatalogServiceController);
    service = app.get<CatalogServiceService>(CatalogServiceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('categories', () => {
    it('should call catalogService.createCategory', async () => {
      const dto = { name: 'Sushi Rolls' };
      const expected = { id: 'cat-1', name: 'Sushi Rolls', parentId: null };
      jest.spyOn(service, 'createCategory').mockResolvedValue(expected as any);

      const result = await controller.createCategory(dto);
      expect(result).toEqual(expected);
      expect(service.createCategory).toHaveBeenCalledWith(dto);
    });

    it('should call catalogService.getCategories', async () => {
      const expected = [{ id: 'cat-1', name: 'Sushi Rolls' }];
      jest.spyOn(service, 'getCategories').mockResolvedValue(expected as any);

      const result = await controller.getCategories();
      expect(result).toEqual(expected);
      expect(service.getCategories).toHaveBeenCalled();
    });
  });

  describe('products', () => {
    it('should call catalogService.createProduct', async () => {
      const dto = {
        sku: 'SKU-001',
        name: 'Sake Nigiri',
        type: 'SINGLE' as any,
        sellingPrice: 50000,
      };
      const expected = { id: 'prod-1', ...dto };
      jest.spyOn(service, 'createProduct').mockResolvedValue(expected as any);

      const result = await controller.createProduct(dto);
      expect(result).toEqual(expected);
      expect(service.createProduct).toHaveBeenCalledWith(dto);
    });

    it('should call catalogService.getProducts', async () => {
      const expected = [{ id: 'prod-1', name: 'Sake Nigiri' }];
      jest.spyOn(service, 'getProducts').mockResolvedValue(expected as any);

      const result = await controller.getProducts();
      expect(result).toEqual(expected);
      expect(service.getProducts).toHaveBeenCalledWith(undefined);
    });
  });
});
