# RinhQuà – Nền tảng minigame marketing cho doanh nghiệp

Doanh nghiệp tự tạo minigame (vòng quay, lật thẻ, cào, mở hộp quà) để thu data khách hàng và phát quà có kiểm soát. Mô hình tham khảo: woay.vn.

## Đã có trong bản MVP (giai đoạn 1)

| Nhóm | Tính năng |
|---|---|
| Tài khoản | Đăng ký / đăng nhập doanh nghiệp (email + mật khẩu), gói Free/Pro/Business |
| Game | 4 mẫu: `wheel` vòng quay, `flip` lật thẻ, `scratch` cào, `giftbox` hộp quà |
| Thiết kế | Tiêu đề, mô tả, thể lệ, màu, logo, banner, lời chúc, xem trước trên khung điện thoại |
| Quà | Tối đa 12 quà/chiến dịch, số lượng + tỉ lệ trúng %, ảnh quà, sửa khi đang chạy |
| Luật chơi | Số lượt / số điện thoại, giờ bắt đầu – kết thúc, trạng thái nháp / chạy / kết thúc |
| Chống gian lận | Kết quả tính trên server, khoá kho quà (không phát vượt), khoá theo người chơi, mã nhận quà duy nhất, mỗi mã chỉ trao 1 lần |
| Phân phối | Link riêng `/play/<slug>`, mã QR, mã nhúng iframe, đổi đuôi link |
| Báo cáo | Thống kê, danh sách người chơi, lọc trúng / đã trao, xuất CSV (mở bằng Excel) |
| Trao quà | Trang "Trao quà": nhập mã → kiểm tra → xác nhận + tên nhân viên trao |

## Kiến trúc

- **Frontend**: HTML + JavaScript thuần (không cần build), thư mục `public/`
  - `index.html` – trang giới thiệu
  - `app.html` + `js/admin.js` – trang quản trị (điều hướng bằng `#/...`)
  - `play.html` + `js/play.js` + `js/games.js` – trang người chơi + 4 game
- **Backend**: 1 Netlify Function `netlify/functions/api.mjs` phục vụ `/api/*`
  - `lib/app.mjs` – toàn bộ API (router, nghiệp vụ)
  - `lib/db.mjs` – Postgres trên Netlify; SQLite khi chạy thử local
  - `lib/util.mjs` – băm mật khẩu (scrypt), token ký HMAC, tiện ích
- **Database**: Netlify Database (Postgres). Bảng tạo bằng migration trong `netlify/database/migrations/` – Netlify tự áp dụng khi deploy.
- **Khoá bảo mật**: tự tạo lần chạy đầu và lưu trong bảng `app_settings`. Có thể ghi đè bằng biến môi trường `APP_SECRET`.

## Chạy thử trên máy

```bash
node --experimental-sqlite dev-server.mjs   # cần Node 22+
# mở http://localhost:8888
```
Dữ liệu local lưu ở `local.sqlite` (xoá file để làm lại từ đầu).

## Deploy

Repo này được nối với Netlify (project `ringqua`, địa chỉ ringqua.netlify.app). Mỗi lần push lên nhánh `main`, Netlify tự build và cập nhật web, kể cả tự chạy migration database.

**Quy tắc database:** không sửa file migration đã chạy. Muốn đổi cấu trúc thì tạo file mới, ví dụ `netlify/database/migrations/20261115000000_them_cot.sql`.

## API chính

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | /api/auth/register, /login, /logout | Tài khoản |
| GET | /api/auth/me | Thông tin + lượt dùng tháng |
| GET/POST | /api/campaigns | Danh sách / tạo chiến dịch |
| GET/PUT/DELETE | /api/campaigns/:id | Chi tiết / sửa (kèm `prizes`, `status`, `slug`) / xoá |
| GET | /api/campaigns/:id/plays?filter=win\|redeemed&format=csv | Kết quả |
| POST | /api/campaigns/:id/preview-token | Token xem trước bản nháp |
| GET/POST | /api/redeem/:code | Kiểm tra / xác nhận trao quà |
| GET | /api/public/campaigns/:slug | Cấu hình game công khai |
| POST | /api/public/campaigns/:slug/join | Người chơi nhập SĐT → token |
| POST | /api/public/campaigns/:slug/play | Chơi 1 lượt (server quay quà) |

## Lộ trình tiếp theo

**Giai đoạn 2 – thu tiền & chống gian lận mạnh hơn**
- Thanh toán gói Pro qua chuyển khoản VietQR, PayOS hoặc SePay, tự nâng gói
- Xác thực OTP qua SMS hoặc Zalo ZNS (eSMS, ViHAT…)
- Tải ảnh logo/quà trực tiếp (Netlify Blobs) thay vì dán link
- Quên mật khẩu, nhiều nhân viên/phân quyền cho chuỗi cửa hàng
- Giới hạn tần suất (rate limit) theo IP

**Giai đoạn 3 – mở rộng**
- Thêm mẫu game: đua top, sưu tầm, mini quiz, lắc xì, hứng quà
- Gửi mã quà qua SMS/email, nhập sẵn mã voucher
- Tên miền riêng cho từng doanh nghiệp, đăng nhập Zalo/Google
- Tích hợp Google Sheets, CRM, Haravan, Sapo, Zalo Mini App, API mở
