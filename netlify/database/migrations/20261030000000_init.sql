-- RinhQua: schema khởi tạo. Chỉ dùng kiểu dữ liệu chung cho Postgres + SQLite (để chạy thử local).
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  business_name TEXT NOT NULL,
  phone TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at BIGINT NOT NULL
);

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  game_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  config TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX idx_campaigns_account ON campaigns(account_id);

CREATE TABLE prizes (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  remaining INTEGER NOT NULL DEFAULT 0,
  chance INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_prizes_campaign ON prizes(campaign_id);

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  created_at BIGINT NOT NULL,
  UNIQUE (campaign_id, phone)
);

CREATE TABLE plays (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  prize_id TEXT,
  prize_name TEXT,
  code TEXT UNIQUE,
  redeemed_at BIGINT,
  redeemed_by TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX idx_plays_campaign ON plays(campaign_id);
CREATE INDEX idx_plays_player ON plays(player_id);
CREATE INDEX idx_plays_account_time ON plays(account_id, created_at);
