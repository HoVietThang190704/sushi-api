import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { OrderingServiceModule } from './ordering-service.module';
import { TransformResponseInterceptor, AllExceptionsFilter } from '@common';

async function bootstrap() {
  const app = await NestFactory.create(OrderingServiceModule);

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

  const port = process.env.ORDERING_SERVICE_PORT || 3004;
  await app.listen(port);
  console.log(`Ordering Service is running on http://localhost:${port}`);
}
void bootstrap();
