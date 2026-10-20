import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { CatalogServiceModule } from './catalog-service.module';
import { TransformResponseInterceptor, AllExceptionsFilter } from '@common';

async function bootstrap() {
  const app = await NestFactory.create(CatalogServiceModule);

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new TransformResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env.CATALOG_SERVICE_PORT || 3002;
  await app.listen(port);
  console.log(`Catalog Service is running on http://localhost:${port}`);
}
bootstrap();
