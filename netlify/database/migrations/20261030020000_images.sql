-- Ảnh do doanh nghiệp tải lên (logo, banner, ảnh quà). Lưu dạng base64, đã thu nhỏ ở trình duyệt.
CREATE TABLE images (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX idx_images_account ON images(account_id);
