-- Lưu cấu hình hệ thống (ví dụ khoá ký phiên đăng nhập, tự tạo lần đầu chạy)
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
