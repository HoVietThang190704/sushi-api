import * as dotenv from 'dotenv';
dotenv.config({ path: ['.env', 'apps/api/.env'] });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import cookieParser from 'cookie-parser';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

interface AuthenticatedRequest extends Request {
  cookies: Record<string, string>;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. Cấu hình đọc Cookie
  app.use(cookieParser());

  // 2. Cấu hình CORS: Cho phép localhost và toàn bộ dải IP mạng LAN để test trên điện thoại
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (
        !origin ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(
          origin,
        )
      ) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  });

  const jwtService = new JwtService();
  const identityServiceUrl =
    process.env.IDENTITY_SERVICE_URL || 'http://localhost:3001';
  const catalogServiceUrl =
    process.env.CATALOG_SERVICE_URL || 'http://localhost:3002';
  const inventoryServiceUrl =
    process.env.INVENTORY_SERVICE_URL || 'http://localhost:3003';

  // 3. Reverse Proxy: /api/auth/* -> http://localhost:3001/auth/*
  app.use(
    '/api/auth',
    createProxyMiddleware({
      target: identityServiceUrl,
      changeOrigin: true,
      pathRewrite: (path) => `/auth${path}`,
      on: {
        proxyReq: (proxyReq, req) => {
          const customReq = req as AuthenticatedRequest;
          // Re-stream body nếu đã bị Express/NestJS body-parser đọc
          fixRequestBody(proxyReq, req);

          let token = customReq.headers.authorization?.replace('Bearer ', '');
          if (!token && customReq.cookies) {
            token = customReq.cookies['access_token'];
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

  // 4. Reverse Proxy: /api/catalog/* -> http://localhost:3002/catalog/*
  app.use(
    '/api/catalog',
    createProxyMiddleware({
      target: catalogServiceUrl,
      changeOrigin: true,
      pathRewrite: (path) => `/catalog${path}`,
      on: {
        proxyReq: (proxyReq, req) => {
          const customReq = req as AuthenticatedRequest;
          fixRequestBody(proxyReq, req);

          let token = customReq.headers.authorization?.replace('Bearer ', '');
          if (!token && customReq.cookies) {
            token = customReq.cookies['access_token'];
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

  // 5. Reverse Proxy: /api/inventory/* -> http://localhost:3003/inventory/*
  app.use(
    '/api/inventory',
    createProxyMiddleware({
      target: inventoryServiceUrl,
      changeOrigin: true,
      pathRewrite: (path) => `/inventory${path}`,
      on: {
        proxyReq: (proxyReq, req) => {
          const customReq = req as AuthenticatedRequest;
          fixRequestBody(proxyReq, req);

          let token = customReq.headers.authorization?.replace('Bearer ', '');
          if (!token && customReq.cookies) {
            token = customReq.cookies['access_token'];
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
  await app.listen(port, '0.0.0.0');
  console.log(`API Gateway is running on http://0.0.0.0:${port}`);
}
bootstrap();
