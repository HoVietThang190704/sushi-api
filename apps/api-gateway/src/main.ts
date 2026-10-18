import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import cookieParser from 'cookie-parser';
import { JwtService } from '@nestjs/jwt';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. Cấu hình đọc Cookie
  app.use(cookieParser());

  // 2. Cấu hình CORS
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:5173',
    ],
    credentials: true,
  });

  const jwtService = new JwtService();
  const identityServiceUrl =
    process.env.IDENTITY_SERVICE_URL || 'http://localhost:3001';

  // 3. Reverse Proxy: /api/auth/* -> http://localhost:3001/auth/*
  app.use(
    '/api/auth',
    createProxyMiddleware({
      target: identityServiceUrl,
      changeOrigin: true,
      pathRewrite: (path) => `/auth${path}`,
      on: {
        proxyReq: (proxyReq, req: any) => {
          // Re-stream body nếu đã bị Express/NestJS body-parser đọc
          fixRequestBody(proxyReq, req);

          let token = req.headers.authorization?.replace('Bearer ', '');
          if (!token && req.cookies) {
            token = req.cookies['access_token'];
          }

          if (token) {
            try {
              const payload = jwtService.verify(token, {
                secret: process.env.JWT_SECRET,
              });
              if (payload?.sub) proxyReq.setHeader('x-user-id', payload.sub);
              if (payload?.role) proxyReq.setHeader('x-user-role', payload.role);
              if (payload?.branchId)
                proxyReq.setHeader('x-user-branch-id', payload.branchId);
            } catch {}
          }
        },
      },
    }),
  );

  const port = process.env.API_GATEWAY_PORT || 3000;
  await app.listen(port);
  console.log(`API Gateway is running on http://localhost:${port}`);
}
bootstrap();
