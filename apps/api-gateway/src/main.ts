import * as dotenv from 'dotenv';
dotenv.config({ path: ['.env', 'apps/api/.env'] });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import cookieParser from 'cookie-parser';
import { JwtService } from '@nestjs/jwt';
import type { ClientRequest } from 'node:http';
import type { Express, Request } from 'express';
import { RateLimitService } from './rate-limit/rate-limit.service';
import { createRateLimitMiddleware } from './rate-limit/rate-limit.middleware';
import { isCorsOriginAllowed } from './cors.policy';

interface AuthenticatedRequest extends Request {
  cookies: Record<string, string>;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. Cấu hình đọc Cookie
  app.use(cookieParser());

  // Never trust client-supplied forwarding headers unless the deployment has a known proxy hop count.
  const proxyHops = Number(process.env.TRUSTED_PROXY_HOPS || '0');
  if (Number.isInteger(proxyHops) && proxyHops > 0) {
    (app.getHttpAdapter().getInstance() as Express).set(
      'trust proxy',
      proxyHops,
    );
  }
  app.use(createRateLimitMiddleware(app.get(RateLimitService)));

  // 2. Cấu hình CORS an toàn theo môi trường
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (isCorsOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
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
  const orderingServiceUrl =
    process.env.ORDERING_SERVICE_URL || 'http://localhost:3004';

  // Helper to sanitize incoming client headers and inject verified JWT claims
  const handleProxyAuth = (proxyReq: ClientRequest, req: Request) => {
    const customReq = req as AuthenticatedRequest;
    fixRequestBody(proxyReq, req);

    // SECURITY: Always strip incoming untrusted x-user-* headers from client
    proxyReq.removeHeader('x-user-id');
    proxyReq.removeHeader('x-user-role');
    proxyReq.removeHeader('x-user-branch-id');

    let token = customReq.headers.authorization?.replace('Bearer ', '');
    if (!token && customReq.cookies) {
      token = customReq.cookies['access_token'];
    }

    if (token) {
      proxyReq.setHeader('authorization', `Bearer ${token}`);
      try {
        const payload = jwtService.verify<{
          sub?: string;
          role?: string;
          branchId?: string;
        }>(token, {
          secret: process.env.JWT_SECRET,
        });
        if (payload?.sub) proxyReq.setHeader('x-user-id', payload.sub);
        if (payload?.role) proxyReq.setHeader('x-user-role', payload.role);
        if (payload?.branchId)
          proxyReq.setHeader('x-user-branch-id', payload.branchId);
      } catch {
        // Downstream guard will handle invalid/expired token
      }
    }
  };

  // 3. Reverse Proxy: /api/auth/* -> http://localhost:3001/auth/*
  app.use(
    '/api/auth',
    createProxyMiddleware({
      target: identityServiceUrl,
      changeOrigin: true,
      pathRewrite: (path) => `/auth${path}`,
      on: {
        proxyReq: handleProxyAuth,
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
        proxyReq: handleProxyAuth,
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
        proxyReq: handleProxyAuth,
      },
    }),
  );

  // 6. Reverse Proxy: /api/orders/* -> http://localhost:3004/orders/*
  app.use(
    '/api/orders',
    createProxyMiddleware({
      target: orderingServiceUrl,
      changeOrigin: true,
      pathRewrite: (path) => `/orders${path}`,
      on: {
        proxyReq: handleProxyAuth,
      },
    }),
  );

  // 7. Reverse Proxy: /api/shipping/* -> http://localhost:3004/shipping/*
  app.use(
    '/api/shipping',
    createProxyMiddleware({
      target: orderingServiceUrl,
      changeOrigin: true,
      pathRewrite: (path) => `/shipping${path}`,
      on: {
        proxyReq: handleProxyAuth,
      },
    }),
  );

  const port = process.env.PORT || process.env.API_GATEWAY_PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`API Gateway is running on http://0.0.0.0:${port}`);
}
void bootstrap();
