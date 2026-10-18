import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CatalogServiceService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.productCategory.create({
      data: {
        name: dto.name,
        parentId: dto.parentId,
      },
      include: {
        parent: true,
      },
    });
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

    return this.prisma.product.create({
      data: {
        sku: dto.sku.toUpperCase(),
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

  async getProductById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
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
