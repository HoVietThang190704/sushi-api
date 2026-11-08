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
## Redis cache và rate limiting

Catalog-service cache danh mục, danh sách sản phẩm (theo từng categoryId) và
chi tiết sản phẩm trong Redis trong 60 giây. Khi tạo danh mục/sản phẩm thành
công, cache liên quan được vô hiệu hóa. PostgreSQL vẫn là nguồn dữ liệu chuẩn;
nếu Redis lỗi, request đọc bỏ qua cache. Cache TanStack Query phía trình duyệt
độc lập và vẫn có thể hiển thị dữ liệu cũ.

Gateway giới hạn theo IP: `POST /api/auth/login` (10/5 phút),
`POST /api/auth/register` (5/giờ), `POST /api/auth/refresh` (30/5 phút) và
`POST /api/orders` (10/phút). Vượt ngưỡng trả 429 kèm `Retry-After`. Nếu Redis
lỗi, request vẫn đi tiếp và ghi cảnh báo có giới hạn tần suất.
`GET /health/redis` trả `ready` hoặc `degraded` để theo dõi.

Cấu hình `REDIS_URL` cho gateway và catalog-service. Mặc định không tin cậy
header IP từ proxy; chỉ đặt `TRUSTED_PROXY_HOPS` bằng số hop proxy tin cậy
trực tiếp phía trước gateway. RabbitMQ tiếp tục xử lý sự kiện; refresh token
tiếp tục lưu trong PostgreSQL.
