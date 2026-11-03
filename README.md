# sushi-api

Backend services and API Gateway for Sushi Platform.
Built with NestJS (Multi-App Monorepo).

## Development

Chạy tất cả microservices cùng lúc:
```bash
pnpm dev
# hoặc
pnpm start:dev
```

Chạy riêng từng service:
```bash
pnpm start:gateway:dev     # API Gateway (:3000)
pnpm start:identity:dev    # Identity Service (:3001)
pnpm start:catalog:dev     # Catalog Service (:3002)
pnpm start:inventory:dev   # Inventory Service (:3003)
pnpm start:ordering:dev    # Ordering Service (:3004)
```
