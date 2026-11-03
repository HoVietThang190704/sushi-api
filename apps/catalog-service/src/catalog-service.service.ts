import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { Prisma } from '@prisma/client';
import { RabbitMQService } from '@common/rabbitmq';
import { createRealtimeEvent } from '@contracts';

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
    return this.prisma.productCategory.findMany({
      include: {
        children: true,
        _count: {
          select: { products: true },
        },
      },
      orderBy: { name: 'asc' },
    });
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

  async getProducts(categoryId?: string) {
    return this.prisma.product.findMany({
      where: {
        isActive: true,
        ...(categoryId ? { categoryId } : {}),
      },
      include: {
        category: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProductById(identifier: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        identifier,
      );

    const product = await this.prisma.product.findFirst({
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
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }
}
