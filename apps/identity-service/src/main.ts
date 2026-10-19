import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { IdentityServiceModule } from './identity-service.module';
import { TransformResponseInterceptor, AllExceptionsFilter } from '@common';

async function bootstrap() {
  const app = await NestFactory.create(IdentityServiceModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new TransformResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env.IDENTITY_SERVICE_PORT || 3001;
  await app.listen(port);
  console.log(`Identity Service is running on http://localhost:${port}`);
}
bootstrap();
