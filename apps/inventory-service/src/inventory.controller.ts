import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';

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
}
