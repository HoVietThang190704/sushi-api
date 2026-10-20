import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { InventoryServiceModule } from './inventory-service.module';
import { TransformResponseInterceptor, AllExceptionsFilter } from '@common';

async function bootstrap() {
  const app = await NestFactory.create(InventoryServiceModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new TransformResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env.INVENTORY_SERVICE_PORT || 3003;
  await app.listen(port);
  console.log(`Inventory Service is running on http://localhost:${port}`);
}
bootstrap();
