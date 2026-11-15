import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { UpsertRecipeDto } from './dto/upsert-recipe.dto';
import { RolesGuard, Roles, CurrentUser } from '@common';
import type { RequestUser } from '@common';

@Controller('inventory')
@UseGuards(RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('ingredients')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'KITCHEN_STAFF')
  getIngredients(@CurrentUser() user?: RequestUser) {
    return this.inventoryService.getIngredients(user);
  }

  @Post('ingredients')
  @Roles('SUPER_ADMIN')
  createIngredient(@Body() dto: CreateIngredientDto) {
    return this.inventoryService.createIngredient(dto);
  }

  @Get('alerts')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER', 'KITCHEN_STAFF')
  getAlerts(@CurrentUser() user?: RequestUser) {
    return this.inventoryService.getAlerts(user);
  }

  @Post('transactions')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
  createTransaction(
    @Body() dto: CreateTransactionDto,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.inventoryService.createTransaction(dto, user);
  }

  @Get('transactions')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER', 'KITCHEN_STAFF')
  getTransactions(
    @Query() query: TransactionQueryDto,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.inventoryService.getTransactions(query, user);
  }

  @Get('warehouses')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'KITCHEN_STAFF')
  getWarehouses(@CurrentUser() user?: RequestUser) {
    return this.inventoryService.getWarehouses(user);
  }

  @Post('warehouses')
  @Roles('SUPER_ADMIN')
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.inventoryService.createWarehouse(dto);
  }

  @Get('warehouses/:id/stocks')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'KITCHEN_STAFF')
  getWarehouseStocks(
    @Param('id') warehouseId: string,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.inventoryService.getWarehouseStocks(warehouseId, user);
  }

  @Post('warehouses/:id/stocks/:ingredientId')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER')
  adjustWarehouseStock(
    @Param('id') warehouseId: string,
    @Param('ingredientId') ingredientId: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.inventoryService.adjustWarehouseStock(
      warehouseId,
      ingredientId,
      dto,
      user,
    );
  }

  @Get('recipes')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER', 'KITCHEN_STAFF')
  getRecipes() {
    return this.inventoryService.getRecipes();
  }

  @Get('recipes/product/:productId')
  @Roles('SUPER_ADMIN', 'BRANCH_MANAGER', 'KITCHEN_STAFF')
  getRecipeByProduct(@Param('productId') productId: string) {
    return this.inventoryService.getRecipeByProduct(productId);
  }

  @Post('recipes')
  @Roles('SUPER_ADMIN')
  upsertRecipe(@Body() dto: UpsertRecipeDto) {
    return this.inventoryService.upsertRecipe(dto);
  }

  @Delete('recipes/:id')
  @Roles('SUPER_ADMIN')
  deleteRecipe(@Param('id') id: string) {
    return this.inventoryService.deleteRecipe(id);
  }
}
