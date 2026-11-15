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

## Đồng bộ Schema Prisma (Triển khai)

Repository hiện quản lý schema tập trung tại `prisma/schema.prisma` (chưa dùng thư mục `prisma/migrations/`). Khi triển khai phiên bản API có `Order.idempotencyFingerprint` lên môi trường mới, **phải đồng bộ schema trước khi khởi chạy `ordering-service` mới**:

1. **Cập nhật cột trên database đích (chạy trước khi start service):**
   - Cách chuẩn của repo:
     ```bash
     npx prisma db push
     ```
   - Hoặc nếu môi trường không cho phép `db push` trực tiếp, chạy DDL an toàn trước khi deploy:
     ```sql
     ALTER TABLE "ordering"."orders"
       ADD COLUMN IF NOT EXISTS "idempotency_fingerprint" VARCHAR(64);
     ```
2. **Tạo lại Prisma Client & build service:**
   - Nếu đang chạy `pnpm dev` trên Windows, dừng tiến trình đang giữ file `query_engine-windows.dll.node` để tránh lỗi `EPERM` khi `generate`:
     ```bash
     npx prisma generate
     pnpm build
     ```
3. **Kiểm tra sau triển khai:**
   - Xác nhận cột `idempotency_fingerprint` đã tồn tại và cho phép `NULL` trên `ordering.orders`:
     ```sql
     SELECT column_name, data_type, character_maximum_length, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'ordering'
       AND table_name = 'orders'
       AND column_name = 'idempotency_fingerprint';
     ```
   - Kỳ vọng: 1 dòng với `data_type = 'character varying'`, `character_maximum_length = 64`, `is_nullable = 'YES'`.

## Hợp đồng Idempotency Retry (`POST /api/orders`)

- Khi tạo đơn công khai lần đầu thành công, API trả về `{ order, trackingToken, isDuplicate: false }`.
- Khi client gửi lại cùng `idempotencyKey` và khớp payload gốc:
  - API trả về phản hồi kín `{ order: null, trackingToken: null, isDuplicate: true, message }`.
  - API cố ý **không** trả lại thông tin đơn hàng hay `trackingToken` để tránh lộ dữ liệu đơn hàng qua khóa trùng lặp.
  - Client nào bật `idempotencyKey` bắt buộc phải kiểm tra `res.isDuplicate === true` (hoặc `res.order === null`) trước khi đọc `res.order.code`.
- Storefront hiện tại đang đọc thẳng `res.order.code` ở màn hình thanh toán nên **không** bật gửi `idempotencyKey` cho đến khi frontend xử lý nhánh `isDuplicate: true`.

## Phân trang `GET /api/orders`

- Khi client gửi `limit`, `ordering-service` áp dụng giới hạn tối đa `200` bản ghi mỗi trang (hỗ trợ `page` khi đi cùng `limit`).
- Khi client không gửi `limit`, `GET /api/orders` tạm giữ nguyên hành vi trả toàn bộ danh sách để tương thích với trang quản trị hiện tại chưa có phân trang.
- Chỉ bật `limit` mặc định ở API sau khi `admin-web` hoàn tất hỗ trợ phân trang phía server.
