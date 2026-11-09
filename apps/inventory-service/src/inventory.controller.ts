import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('ingredients')
  getIngredients() {
    return this.inventoryService.getIngredients();
  }

  @Post('ingredients')
  createIngredient(@Body() dto: CreateIngredientDto) {
    return this.inventoryService.createIngredient(dto);
  }

  @Get('alerts')
  getAlerts() {
    return this.inventoryService.getAlerts();
  }

  @Post('transactions')
  createTransaction(@Body() dto: CreateTransactionDto) {
    return this.inventoryService.createTransaction(dto);
  }

  @Get('transactions')
  getTransactions(@Query() query: TransactionQueryDto) {
    return this.inventoryService.getTransactions(query);
  }

  @Get('warehouses')
  getWarehouses() {
    return this.inventoryService.getWarehouses();
  }

  @Post('warehouses')
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.inventoryService.createWarehouse(dto);
  }

  @Get('warehouses/:id/stocks')
  getWarehouseStocks(@Param('id') warehouseId: string) {
    return this.inventoryService.getWarehouseStocks(warehouseId);
  }

  @Post('warehouses/:id/stocks/:ingredientId')
  adjustWarehouseStock(
    @Param('id') warehouseId: string,
    @Param('ingredientId') ingredientId: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.inventoryService.adjustWarehouseStock(
      warehouseId,
      ingredientId,
      dto,
    );
  }
}
