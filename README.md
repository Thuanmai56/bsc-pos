# Dự án BSC POS - Hướng dẫn Cấu hình & Triển khai Môi trường

Tài liệu này hướng dẫn cách cấu hình biến môi trường, cơ sở dữ liệu D1, KV Namespaces và các Secrets cho dự án BSC POS (bao gồm cả Backend Worker và FrontEnd Pages).

---

## 1. Cấu hình Backend (Cloudflare Workers)

Dự án sử dụng Cloudflare Worker được cấu hình trong file `backend/wrangler.jsonc` chia thành 2 môi trường: **Test** và **Production (Default)**.

### Môi trường Test (`test`)
- **Tên Worker**: `bsc-worker-test`
- **URL mặc định**: `https://bsc-worker-test.thuanmnc.workers.dev`
- **D1 Database**: `blab-db-test` (ID: `c0152835-7d42-4545-8cb4-6658dfc7e97d`)
- **KV Namespace**: `bsc-kv-test` (ID: `749b3a0cb19848e4b943b42d5898efff`)
- **Lệnh deploy**:
  ```bash
  cd backend
  npx wrangler deploy --env test
  ```

### Môi trường Production (Mặc định)
- **Tên Worker**: `bsc-worker-production`
- **URL mặc định**: `https://bsc-worker-production.thuanmnc.workers.dev`
- **D1 Database**: `blab-db-production` (ID: `48479f91-eec7-4da2-b044-edaaf622f195`)
- **KV Namespace**: `bsc` (ID: `7d8b2c94d0644e38a562cde510f500b0`)
- **Lệnh deploy**:
  ```bash
  cd backend
  npx wrangler deploy
  ```

### Các Secrets cần thiết của Worker
Các mã khóa bảo mật được thiết lập riêng biệt cho từng môi trường bằng lệnh của Wrangler:
1. **`LINE_CHANNEL_SECRET`**: Mã secret của LINE Channel.
2. **`LINE_CHANNEL_ACCESS_TOKEN`**: Mã Token truy cập của LINE.

**Cách cập nhật Secrets**:
- Cho **Production**:
  ```bash
  npx wrangler secret put LINE_CHANNEL_SECRET
  npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
  ```
- Cho **Test**:
  ```bash
  npx wrangler secret put LINE_CHANNEL_SECRET --env test
  ```

---

## 2. Cấu hình FrontEnd (Cloudflare Pages)

FrontEnd tĩnh được deploy tự động thông qua liên kết GitHub của dự án `bsc-pos` với Cloudflare Pages.

### Môi trường Test
- **Nhánh Git**: `test`
- **URL**: Xem trong trang quản lý Cloudflare Pages (thường là Preview URL hoặc Subdomain do bạn thiết lập).
- **Cấu hình API**: Biến `WORKER_BASE` trong `index.html` và `orders.html` phải được trỏ đến:
  ```javascript
  const WORKER_BASE = "https://bsc-worker-test.thuanmnc.workers.dev";
  ```

### Môi trường Production
- **Nhánh Git**: `main`
- **URL chính thức**: [https://bsc-pos.pages.dev](https://bsc-pos.pages.dev)
- **Cấu hình API**: Biến `WORKER_BASE` trong `index.html` và `orders.html` được trỏ đến:
  ```javascript
  const WORKER_BASE = "https://bsc-worker-production.thuanmnc.workers.dev";
  ```

---

## 3. Quy trình làm việc và Triển khai (Workflow)

1. **Phát triển và Kiểm thử**:
   - Chạy local frontend trỏ về API test.
   - Khi có thay đổi, push lên nhánh `test` để triển khai tự động bản FrontEnd thử nghiệm.
   - Deploy backend test bằng lệnh: `npx wrangler deploy --env test`.
2. **Đưa lên Production**:
   - Khi tính năng đã ổn định, merge nhánh `test` vào `main`.
   - Đảm bảo `WORKER_BASE` trên nhánh `main` đã được chỉnh sang `https://bsc-worker-production.thuanmnc.workers.dev`.
   - Push nhánh `main` lên GitHub để Cloudflare Pages cập nhật trang bán hàng chính thức.
   - Deploy backend production bằng lệnh: `npx wrangler deploy`.
