import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CatalogServiceService } from './catalog-service.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './guards/roles.decorator';
import { CloudinaryService } from '@common';

@Controller('catalog')
export class CatalogServiceController {
  constructor(
    private readonly catalogService: CatalogServiceService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // ==========================================
  // Image Upload (Cloudinary)
  // ==========================================

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.cloudinaryService.uploadImage(file);
  }

  // ==========================================
  // Categories
  // ==========================================

  // CHỈ ADMIN / MANAGER MỚI TẠO ĐƯỢC
  @Post('categories')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
  @UseGuards(RolesGuard)
  async createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalogService.createCategory(dto);
  }

  // AI CŨNG XEM ĐƯỢC (Public)
  @Get('categories')
  async getCategories() {
    return this.catalogService.getCategories();
  }

  // ==========================================
  // Products
  // ==========================================

  // CHỈ ADMIN / MANAGER MỚI TẠO ĐƯỢC
  @Post('products')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
  @UseGuards(RolesGuard)
  async createProduct(@Body() dto: CreateProductDto) {
    return this.catalogService.createProduct(dto);
  }

  // AI CŨNG XEM ĐƯỢC (Public)
  @Get('products')
  async getProducts(@Query('categoryId') categoryId?: string) {
    return this.catalogService.getProducts(categoryId);
  }

  // AI CŨNG XEM ĐƯỢC (Public)
  @Get('products/:id')
  async getProductById(@Param('id') id: string) {
    return this.catalogService.getProductById(id);
  }
}
