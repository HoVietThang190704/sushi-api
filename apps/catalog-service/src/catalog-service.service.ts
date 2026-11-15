import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import { Prisma } from '@prisma/client';
import { RabbitMQService } from '@common/rabbitmq';
import { createRealtimeEvent } from '@contracts';
import { CatalogCacheService } from './catalog-cache.service';

export function toSlug(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class CatalogServiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmqService: RabbitMQService,
    private readonly cache: CatalogCacheService,
  ) {}

  // 1. Quản lý Danh mục (Categories)
  async createCategory(dto: CreateCategoryDto) {
    if (dto.parentId) {
      const parent = await this.prisma.productCategory.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
    }

    const category = await this.prisma.productCategory.create({
      data: {
        name: dto.name,
        parentId: dto.parentId,
      },
      include: {
        parent: true,
      },
    });
    await this.cache.invalidateCategories();

    await this.rabbitmqService.publishEvent(
      createRealtimeEvent({
        type: 'catalog.category.created',
        resource: 'catalog',
        action: 'CREATED',
        payload: {
          id: category.id,
          name: category.name,
          parentId: category.parentId,
        },
      }),
    );

    return category;
  }

  async getCategories() {
    return this.cache.remember('categories', 'all', () =>
      this.prisma.productCategory.findMany({
        include: {
          children: true,
          _count: {
            select: { products: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
    );
  }

  async getCategoryById(id: string) {
    const category = await this.cache.remember(
      'categories',
      `detail:${id}`,
      () =>
        this.prisma.productCategory.findUnique({
          where: { id },
          include: {
            parent: true,
            children: true,
            products: {
              orderBy: { createdAt: 'desc' },
            },
            _count: {
              select: { products: true },
            },
          },
        }),
    );

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.productCategory.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new ConflictException('Category cannot be its own parent');
      }
      const parent = await this.prisma.productCategory.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
    }

    const updated = await this.prisma.productCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
      },
      include: {
        parent: true,
        _count: {
          select: { products: true },
        },
      },
    });

    await Promise.all([
      this.cache.invalidateCategories(),
      this.cache.invalidateProducts(),
    ]);

    await this.rabbitmqService.publishEvent(
      createRealtimeEvent({
        type: 'catalog.category.updated',
        resource: 'catalog',
        action: 'UPDATED',
        payload: {
          id: updated.id,
          name: updated.name,
          parentId: updated.parentId,
        },
      }),
    );

    return updated;
  }

  async deleteCategory(id: string) {
    const existing = await this.prisma.productCategory.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    await this.prisma.$transaction([
      this.prisma.product.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      }),
      this.prisma.productCategory.updateMany({
        where: { parentId: id },
        data: { parentId: null },
      }),
      this.prisma.productCategory.delete({
        where: { id },
      }),
    ]);

    await Promise.all([
      this.cache.invalidateCategories(),
      this.cache.invalidateProducts(),
    ]);

    await this.rabbitmqService.publishEvent(
      createRealtimeEvent({
        type: 'catalog.category.deleted',
        resource: 'catalog',
        action: 'DELETED',
        payload: { id },
      }),
    );

    return { id, deleted: true };
  }

  // 2. Quản lý Sản phẩm (Products)
  async createProduct(dto: CreateProductDto) {
    const existingProduct = await this.prisma.product.findUnique({
      where: { sku: dto.sku.toUpperCase() },
    });

    if (existingProduct) {
      throw new ConflictException(
        `Product with SKU '${dto.sku}' already exists`,
      );
    }

    if (dto.categoryId) {
      const category = await this.prisma.productCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    const rawSlug = dto.slug ? toSlug(dto.slug) : toSlug(dto.name);
    let finalSlug = rawSlug;
    const existingSlug = await this.prisma.product.findUnique({
      where: { slug: finalSlug },
    });
    if (existingSlug) {
      finalSlug = `${rawSlug}-${Math.random().toString(36).substring(2, 7)}`;
    }

    const product = await this.prisma.product.create({
      data: {
        sku: dto.sku.toUpperCase(),
        slug: finalSlug,
        barcode: dto.barcode,
        name: dto.name,
        type: dto.type,
        categoryId: dto.categoryId,
        sellingPrice: new Prisma.Decimal(dto.sellingPrice),
        imageUrl: dto.imageUrl,
      },
      include: {
        category: true,
      },
    });
    await Promise.all([
      this.cache.invalidateProducts(),
      this.cache.invalidateCategories(),
    ]);

    await this.rabbitmqService.publishEvent(
      createRealtimeEvent({
        type: 'catalog.product.created',
        resource: 'catalog',
        action: 'CREATED',
        payload: {
          id: product.id,
          sku: product.sku,
          name: product.name,
          categoryId: product.categoryId,
        },
      }),
    );

    return product;
  }

  async getProducts(categoryId?: string, includeInactive = false) {
    const cacheKey = `${categoryId ? `category:${categoryId}` : 'all'}:${includeInactive ? 'all-status' : 'active'}`;
    return this.cache.remember('products', cacheKey, () =>
      this.prisma.product.findMany({
        where: {
          ...(includeInactive ? {} : { isActive: true }),
          ...(categoryId ? { categoryId } : {}),
        },
        include: {
          category: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    if (dto.sku && dto.sku.toUpperCase() !== existing.sku) {
      const skuConflict = await this.prisma.product.findUnique({
        where: { sku: dto.sku.toUpperCase() },
      });
      if (skuConflict && skuConflict.id !== id) {
        throw new ConflictException(
          `Product with SKU '${dto.sku}' already exists`,
        );
      }
    }

    if (dto.categoryId) {
      const category = await this.prisma.productCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.sku !== undefined ? { sku: dto.sku.toUpperCase().trim() } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.barcode !== undefined ? { barcode: dto.barcode || null } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId || null } : {}),
        ...(dto.sellingPrice !== undefined
          ? { sellingPrice: new Prisma.Decimal(dto.sellingPrice) }
          : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: {
        category: true,
      },
    });

    await Promise.all([
      this.cache.invalidateProducts(),
      this.cache.invalidateCategories(),
    ]);

    await this.rabbitmqService.publishEvent(
      createRealtimeEvent({
        type: 'catalog.product.updated',
        resource: 'catalog',
        action: 'UPDATED',
        payload: {
          id: updated.id,
          sku: updated.sku,
          name: updated.name,
          categoryId: updated.categoryId,
          isActive: updated.isActive,
        },
      }),
    );

    return updated;
  }

  async deleteProduct(id: string) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    try {
      await this.prisma.product.delete({
        where: { id },
      });
    } catch {
      // Nếu sản phẩm đã phát sinh trong đơn hàng hoặc combo, chuyển sang tạm ngừng (soft-deactivate)
      await this.prisma.product.update({
        where: { id },
        data: { isActive: false },
      });
    }

    await Promise.all([
      this.cache.invalidateProducts(),
      this.cache.invalidateCategories(),
    ]);

    await this.rabbitmqService.publishEvent(
      createRealtimeEvent({
        type: 'catalog.product.deleted',
        resource: 'catalog',
        action: 'DELETED',
        payload: { id },
      }),
    );

    return { id, deleted: true };
  }

  async getProductById(identifier: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        identifier,
      );

    const product = await this.cache.remember(
      'products',
      `detail:${identifier}`,
      () =>
        this.prisma.product.findFirst({
          where: isUuid
            ? { OR: [{ id: identifier }, { slug: identifier }] }
            : { slug: identifier },
          include: {
            category: true,
            comboItemsAsParent: {
              include: {
                childProduct: true,
              },
            },
          },
        }),
    );

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }
}
