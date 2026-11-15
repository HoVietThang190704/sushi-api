import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CatalogServiceService } from './catalog-service.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import { RolesGuard, Roles, CloudinaryService } from '@common';

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
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
  @UseGuards(RolesGuard)
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

  @Get('categories/:id')
  async getCategoryById(@Param('id') id: string) {
    return this.catalogService.getCategoryById(id);
  }

  @Patch('categories/:id')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
  @UseGuards(RolesGuard)
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.catalogService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
  @UseGuards(RolesGuard)
  async deleteCategory(@Param('id') id: string) {
    return this.catalogService.deleteCategory(id);
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
  async getProducts(
    @Query('categoryId') categoryId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.catalogService.getProducts(
      categoryId,
      includeInactive === 'true',
    );
  }

  // AI CŨNG XEM ĐƯỢC (Public)
  @Get('products/:id')
  async getProductById(@Param('id') id: string) {
    return this.catalogService.getProductById(id);
  }

  @Patch('products/:id')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
  @UseGuards(RolesGuard)
  async updateProduct(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.catalogService.updateProduct(id, dto);
  }

  @Delete('products/:id')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
  @UseGuards(RolesGuard)
  async deleteProduct(@Param('id') id: string) {
    return this.catalogService.deleteProduct(id);
  }
}
