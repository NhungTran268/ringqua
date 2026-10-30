// Toàn bộ API của nền tảng, gom vào 1 router. Dùng chung cho Netlify Function và server chạy thử local.
import { query, tx } from './db.mjs';
import {
  HttpError, json, readJson, getCookie, sessionCookie, signToken, verifyToken,
  hashPassword, verifyPassword, newId, newPrizeCode, now, normalizePhone, isEmail, str, slugify,
} from './util.mjs';

export const GAME_TYPES = ['wheel', 'flip', 'scratch', 'giftbox'];
export const PLANS = {
  free: { label: 'Miễn phí', playsPerMonth: 100, maxActiveCampaigns: 1, watermark: true },
  pro: { label: 'Pro', playsPerMonth: 5000, maxActiveCampaigns: 5, watermark: false },
  business: { label: 'Doanh nghiệp', playsPerMonth: 1_000_000, maxActiveCampaigns: 100, watermark: false },
};
const SESSION_TTL = 60 * 60 * 24 * 14; // 14 ngày
const PLAYER_TTL = 60 * 60 * 24 * 2;

// ---------------- Router ----------------
const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  routes.push({ method, re, keys, handler });
};

export async function handle(req) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, '') || '/';
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = path.match(r.re);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    try {
      return await r.handler({ req, url, params });
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Lỗi hệ thống, vui lòng thử lại' }, 500);
    }
  }
  return json({ error: 'Không tìm thấy' }, 404);
}

// ---------------- Auth ----------------
async function requireAccount(req) {
  const data = verifyToken(getCookie(req, 'rq_session'));
  if (!data || data.t !== 's') throw new HttpError(401, 'Vui lòng đăng nhập');
  const { rows } = await query('SELECT id, email, business_name, phone, plan, created_at FROM accounts WHERE id = $1', [data.aid]);
  if (!rows[0]) throw new HttpError(401, 'Vui lòng đăng nhập');
  return rows[0];
}
const publicAccount = (a) => ({ id: a.id, email: a.email, businessName: a.business_name, phone: a.phone, plan: a.plan, planInfo: PLANS[a.plan] || PLANS.free });

route('POST', '/auth/register', async ({ req }) => {
  const b = await readJson(req);
  const email = str(b.email, 120).toLowerCase();
  const businessName = str(b.businessName, 120);
  const password = String(b.password || '');
  if (!isEmail(email)) throw new HttpError(400, 'Email không hợp lệ');
  if (!businessName) throw new HttpError(400, 'Vui lòng nhập tên doanh nghiệp');
  if (password.length < 8) throw new HttpError(400, 'Mật khẩu tối thiểu 8 ký tự');
  const exists = await query('SELECT 1 FROM accounts WHERE email = $1', [email]);
  if (exists.rows.length) throw new HttpError(409, 'Email này đã được đăng ký');
  const id = newId('a_');
  await query('INSERT INTO accounts (id, email, password_hash, business_name, phone, plan, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [
    id, email, hashPassword(password), businessName, normalizePhone(b.phone), 'free', now(),
  ]);
  const token = signToken({ t: 's', aid: id }, SESSION_TTL);
  return json({ ok: true }, 201, { 'set-cookie': sessionCookie(token, SESSION_TTL) });
});

route('POST', '/auth/login', async ({ req }) => {
  const b = await readJson(req);
  const { rows } = await query('SELECT id, password_hash FROM accounts WHERE email = $1', [str(b.email, 120).toLowerCase()]);
  if (!rows[0] || !verifyPassword(String(b.password || ''), rows[0].password_hash)) throw new HttpError(401, 'Sai email hoặc mật khẩu');
  const token = signToken({ t: 's', aid: rows[0].id }, SESSION_TTL);
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(token, SESSION_TTL) });
});

route('POST', '/auth/logout', async () => json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) }));

route('GET', '/auth/me', async ({ req }) => {
  const a = await requireAccount(req);
  return json({ account: publicAccount(a), usage: await monthUsage(a.id) });
});

async function monthUsage(accountId) {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const { rows } = await query('SELECT COUNT(*) AS n FROM plays WHERE account_id = $1 AND created_at >= $2', [accountId, start]);
  return { playsThisMonth: Number(rows[0].n) };
}

// ---------------- Campaigns (quản trị) ----------------
const DEFAULT_CONFIG = {
  title: 'Vòng quay may mắn',
  subtitle: 'Quay là trúng – quà tặng hấp dẫn đang chờ bạn!',
  primaryColor: '#e5322d',
  bgColor: '#fff4e6',
  logoUrl: '',
  bannerUrl: '',
  rules: 'Mỗi số điện thoại được tham gia theo số lượt quy định. Quà được trao khi xuất trình mã nhận quà.',
  loseText: 'Chúc bạn may mắn lần sau!',
  winText: 'Chúc mừng bạn đã trúng',
  redeemInstruction: 'Chụp màn hình mã này và xuất trình tại cửa hàng để nhận quà.',
  fields: { name: true, email: false },
  playsPerPlayer: 1,
  startAt: null,
  endAt: null,
};

function cleanConfig(input = {}, base = DEFAULT_CONFIG) {
  const c = { ...base };
  for (const k of ['title', 'subtitle', 'rules', 'loseText', 'winText', 'redeemInstruction']) if (k in input) c[k] = str(input[k], 2000);
  for (const k of ['logoUrl', 'bannerUrl']) if (k in input) c[k] = /^https?:\/\//.test(input[k] || '') ? str(input[k], 500) : '';
  for (const k of ['primaryColor', 'bgColor']) if (/^#[0-9a-fA-F]{6}$/.test(input[k] || '')) c[k] = input[k];
  if (input.fields) c.fields = { name: !!input.fields.name, email: !!input.fields.email };
  if ('playsPerPlayer' in input) c.playsPerPlayer = Math.min(100, Math.max(1, parseInt(input.playsPerPlayer, 10) || 1));
  for (const k of ['startAt', 'endAt']) if (k in input) c[k] = input[k] ? Number(new Date(input[k]).getTime()) || null : null;
  return c;
}

function cleanPrizes(list) {
  if (!Array.isArray(list)) throw new HttpError(400, 'Danh sách quà không hợp lệ');
  if (list.length > 12) throw new HttpError(400, 'Tối đa 12 loại quà');
  const out = list.map((p, i) => ({
    id: p.id ? str(p.id, 40) : null,
    name: str(p.name, 80),
    imageUrl: /^https?:\/\//.test(p.imageUrl || '') ? str(p.imageUrl, 500) : '',
    quantity: Math.max(0, parseInt(p.quantity, 10) || 0),
    chance: Math.min(100, Math.max(0, parseInt(p.chance, 10) || 0)),
    sort: i,
  }));
  if (out.some((p) => !p.name)) throw new HttpError(400, 'Mỗi phần quà cần có tên');
  const total = out.reduce((s, p) => s + p.chance, 0);
  if (total > 100) throw new HttpError(400, `Tổng tỉ lệ trúng đang là ${total}%, không được vượt quá 100%`);
  return out;
}

async function loadCampaign(accountId, id) {
  const { rows } = await query('SELECT * FROM campaigns WHERE id = $1 AND account_id = $2', [id, accountId]);
  if (!rows[0]) throw new HttpError(404, 'Không tìm thấy chiến dịch');
  return rows[0];
}
async function loadPrizes(campaignId) {
  const { rows } = await query('SELECT * FROM prizes WHERE campaign_id = $1 ORDER BY sort', [campaignId]);
  return rows.map((p) => ({ id: p.id, name: p.name, imageUrl: p.image_url || '', quantity: Number(p.quantity), remaining: Number(p.remaining), chance: Number(p.chance) }));
}
const campaignOut = (c, prizes, stats) => ({
  id: c.id, slug: c.slug, name: c.name, gameType: c.game_type, status: c.status,
  config: JSON.parse(c.config), createdAt: Number(c.created_at), updatedAt: Number(c.updated_at),
  ...(prizes ? { prizes } : {}), ...(stats ? { stats } : {}),
});

async function uniqueSlug(base) {
  let slug = slugify(base) || 'game';
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? slug : `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const { rows } = await query('SELECT 1 FROM campaigns WHERE slug = $1', [candidate]);
    if (!rows.length) return candidate;
  }
  return `${slug}-${newId()}`.toLowerCase();
}

route('GET', '/campaigns', async ({ req }) => {
  const a = await requireAccount(req);
  const { rows } = await query(
    `SELECT c.*,
       (SELECT COUNT(*) FROM plays p WHERE p.campaign_id = c.id) AS plays,
       (SELECT COUNT(*) FROM plays p WHERE p.campaign_id = c.id AND p.prize_id IS NOT NULL) AS wins,
       (SELECT COUNT(*) FROM players pl WHERE pl.campaign_id = c.id) AS players
     FROM campaigns c WHERE c.account_id = $1 ORDER BY c.created_at DESC`,
    [a.id],
  );
  return json({ campaigns: rows.map((c) => campaignOut(c, null, { plays: Number(c.plays), wins: Number(c.wins), players: Number(c.players) })) });
});

route('POST', '/campaigns', async ({ req }) => {
  const a = await requireAccount(req);
  const b = await readJson(req);
  const name = str(b.name, 120) || 'Chiến dịch mới';
  const gameType = GAME_TYPES.includes(b.gameType) ? b.gameType : 'wheel';
  const titles = { wheel: 'Vòng quay may mắn', flip: 'Lật thẻ trúng quà', scratch: 'Cào trúng thưởng', giftbox: 'Mở hộp quà bí mật' };
  const config = cleanConfig({ ...(b.config || {}), title: b.config?.title || titles[gameType] });
  const id = newId('c_');
  const t = now();
  await query('INSERT INTO campaigns (id, account_id, slug, name, game_type, status, config, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
    id, a.id, await uniqueSlug(b.slug || name), name, gameType, 'draft', JSON.stringify(config), t, t,
  ]);
  const prizes = cleanPrizes(b.prizes || [
    { name: 'Voucher 50.000đ', quantity: 50, chance: 20 },
    { name: 'Voucher 20.000đ', quantity: 100, chance: 30 },
    { name: 'Freeship', quantity: 200, chance: 30 },
  ]);
  for (const p of prizes) {
    await query('INSERT INTO prizes (id, campaign_id, name, image_url, quantity, remaining, chance, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [
      newId('p_'), id, p.name, p.imageUrl, p.quantity, p.quantity, p.chance, p.sort,
    ]);
  }
  const c = await loadCampaign(a.id, id);
  return json({ campaign: campaignOut(c, await loadPrizes(id)) }, 201);
});

route('GET', '/campaigns/:id', async ({ req, params }) => {
  const a = await requireAccount(req);
  const c = await loadCampaign(a.id, params.id);
  return json({ campaign: campaignOut(c, await loadPrizes(c.id), await campaignStats(c.id)) });
});

route('PUT', '/campaigns/:id', async ({ req, params }) => {
  const a = await requireAccount(req);
  const c = await loadCampaign(a.id, params.id);
  const b = await readJson(req);
  const name = 'name' in b ? str(b.name, 120) || c.name : c.name;
  const gameType = GAME_TYPES.includes(b.gameType) ? b.gameType : c.game_type;
  const config = cleanConfig(b.config || {}, JSON.parse(c.config));
  let status = c.status;
  if (b.status && ['draft', 'active', 'ended'].includes(b.status)) status = b.status;
  if (status === 'active' && c.status !== 'active') {
    const plan = PLANS[a.plan] || PLANS.free;
    const { rows } = await query("SELECT COUNT(*) AS n FROM campaigns WHERE account_id = $1 AND status = 'active' AND id <> $2", [a.id, c.id]);
    if (Number(rows[0].n) >= plan.maxActiveCampaigns)
      throw new HttpError(403, `Gói ${plan.label} chỉ cho phép ${plan.maxActiveCampaigns} chiến dịch chạy cùng lúc. Hãy kết thúc chiến dịch khác hoặc nâng cấp gói.`);
  }
  let slug = c.slug;
  if (b.slug && slugify(b.slug) !== c.slug) {
    const s = slugify(b.slug);
    if (!s) throw new HttpError(400, 'Đường dẫn không hợp lệ');
    const { rows } = await query('SELECT 1 FROM campaigns WHERE slug = $1 AND id <> $2', [s, c.id]);
    if (rows.length) throw new HttpError(409, 'Đường dẫn này đã có người dùng');
    slug = s;
  }
  const prizes = b.prizes ? cleanPrizes(b.prizes) : null;

  await tx(async (db) => {
    await db.query('UPDATE campaigns SET name=$1, game_type=$2, status=$3, config=$4, slug=$5, updated_at=$6 WHERE id=$7', [
      name, gameType, status, JSON.stringify(config), slug, now(), c.id,
    ]);
    if (!prizes) return;
    const { rows: existing } = await db.query('SELECT * FROM prizes WHERE campaign_id = $1 FOR UPDATE', [c.id]);
    const keep = new Set(prizes.filter((p) => p.id).map((p) => p.id));
    for (const old of existing) {
      if (keep.has(old.id)) continue;
      const used = await db.query('SELECT 1 FROM plays WHERE prize_id = $1 LIMIT 1', [old.id]);
      if (used.rows.length) throw new HttpError(400, `Quà "${old.name}" đã có người trúng nên không thể xoá. Hãy đặt tỉ lệ về 0% thay vì xoá.`);
      await db.query('DELETE FROM prizes WHERE id = $1', [old.id]);
    }
    for (const p of prizes) {
      const old = existing.find((e) => e.id === p.id);
      if (old) {
        const given = Number(old.quantity) - Number(old.remaining);
        const remaining = Math.max(0, p.quantity - given);
        await db.query('UPDATE prizes SET name=$1, image_url=$2, quantity=$3, remaining=$4, chance=$5, sort=$6 WHERE id=$7', [
          p.name, p.imageUrl, Math.max(p.quantity, given), remaining, p.chance, p.sort, old.id,
        ]);
      } else {
        await db.query('INSERT INTO prizes (id, campaign_id, name, image_url, quantity, remaining, chance, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [
          newId('p_'), c.id, p.name, p.imageUrl, p.quantity, p.quantity, p.chance, p.sort,
        ]);
      }
    }
  });
  const updated = await loadCampaign(a.id, c.id);
  return json({ campaign: campaignOut(updated, await loadPrizes(c.id), await campaignStats(c.id)) });
});

route('DELETE', '/campaigns/:id', async ({ req, params }) => {
  const a = await requireAccount(req);
  const c = await loadCampaign(a.id, params.id);
  await query('DELETE FROM campaigns WHERE id = $1', [c.id]);
  return json({ ok: true });
});

async function campaignStats(campaignId) {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*) FROM plays WHERE campaign_id = $1) AS plays,
       (SELECT COUNT(*) FROM plays WHERE campaign_id = $1 AND prize_id IS NOT NULL) AS wins,
       (SELECT COUNT(*) FROM plays WHERE campaign_id = $1 AND redeemed_at IS NOT NULL) AS redeemed,
       (SELECT COUNT(*) FROM players WHERE campaign_id = $1) AS players`,
    [campaignId],
  );
  const r = rows[0];
  return { plays: Number(r.plays), wins: Number(r.wins), redeemed: Number(r.redeemed), players: Number(r.players) };
}

route('GET', '/campaigns/:id/plays', async ({ req, url, params }) => {
  const a = await requireAccount(req);
  const c = await loadCampaign(a.id, params.id);
  const only = url.searchParams.get('filter');
  const where = only === 'win' ? 'AND p.prize_id IS NOT NULL' : only === 'redeemed' ? 'AND p.redeemed_at IS NOT NULL' : '';
  const limit = Math.min(1000, parseInt(url.searchParams.get('limit'), 10) || 200);
  const { rows } = await query(
    `SELECT p.id, p.prize_name, p.code, p.redeemed_at, p.redeemed_by, p.created_at, pl.name, pl.phone, pl.email
     FROM plays p JOIN players pl ON pl.id = p.player_id
     WHERE p.campaign_id = $1 ${where} ORDER BY p.created_at DESC LIMIT ${limit}`,
    [c.id],
  );
  const list = rows.map((r) => ({
    id: r.id, prize: r.prize_name, code: r.code, redeemedAt: r.redeemed_at ? Number(r.redeemed_at) : null, redeemedBy: r.redeemed_by,
    createdAt: Number(r.created_at), name: r.name, phone: r.phone, email: r.email,
  }));
  if (url.searchParams.get('format') === 'csv') {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const fmt = (t) => (t ? new Date(t).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '');
    const lines = [['Thời gian', 'Họ tên', 'Số điện thoại', 'Email', 'Kết quả', 'Mã nhận quà', 'Đã trao quà lúc', 'Người trao'].map(esc).join(',')];
    for (const r of list) lines.push([fmt(r.createdAt), r.name, r.phone, r.email, r.prize || 'Không trúng', r.code, fmt(r.redeemedAt), r.redeemedBy].map(esc).join(','));
    return new Response('﻿' + lines.join('\r\n'), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${c.slug}-ket-qua.csv"` },
    });
  }
  return json({ plays: list });
});

// ---------------- Trao quà (chống gian lận: mỗi mã chỉ trao 1 lần) ----------------
async function findCode(accountId, code) {
  const { rows } = await query(
    `SELECT p.*, pl.name, pl.phone, c.name AS campaign_name FROM plays p
     JOIN players pl ON pl.id = p.player_id JOIN campaigns c ON c.id = p.campaign_id
     WHERE p.code = $1 AND p.account_id = $2`,
    [str(code, 20).toUpperCase(), accountId],
  );
  if (!rows[0]) throw new HttpError(404, 'Mã không tồn tại hoặc không thuộc doanh nghiệp của bạn');
  const r = rows[0];
  return { code: r.code, prize: r.prize_name, campaign: r.campaign_name, name: r.name, phone: r.phone, createdAt: Number(r.created_at), redeemedAt: r.redeemed_at ? Number(r.redeemed_at) : null, redeemedBy: r.redeemed_by };
}
route('GET', '/redeem/:code', async ({ req, params }) => {
  const a = await requireAccount(req);
  return json({ ticket: await findCode(a.id, params.code) });
});
route('POST', '/redeem/:code', async ({ req, params }) => {
  const a = await requireAccount(req);
  const b = await readJson(req).catch(() => ({}));
  const ticket = await findCode(a.id, params.code);
  if (ticket.redeemedAt) throw new HttpError(409, `Mã này đã được trao quà lúc ${new Date(ticket.redeemedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);
  const { rowCount } = await query('UPDATE plays SET redeemed_at = $1, redeemed_by = $2 WHERE code = $3 AND account_id = $4 AND redeemed_at IS NULL', [
    now(), str(b.staff, 80) || 'Quản trị', ticket.code, a.id,
  ]);
  if (!rowCount) throw new HttpError(409, 'Mã này vừa được trao quà');
  return json({ ticket: await findCode(a.id, params.code) });
});

// ---------------- Người chơi (công khai) ----------------
async function loadPublicCampaign(slug) {
  const { rows } = await query('SELECT c.*, a.plan, a.business_name FROM campaigns c JOIN accounts a ON a.id = c.account_id WHERE c.slug = $1', [slug]);
  if (!rows[0]) throw new HttpError(404, 'Không tìm thấy trò chơi');
  return rows[0];
}
function availability(c, cfg) {
  const t = now();
  if (c.status === 'draft') return { open: false, reason: 'Trò chơi chưa mở' };
  if (c.status === 'ended') return { open: false, reason: 'Chương trình đã kết thúc' };
  if (cfg.startAt && t < cfg.startAt) return { open: false, reason: `Chương trình bắt đầu lúc ${new Date(cfg.startAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` };
  if (cfg.endAt && t > cfg.endAt) return { open: false, reason: 'Chương trình đã kết thúc' };
  return { open: true };
}

route('GET', '/public/campaigns/:slug', async ({ url, params }) => {
  const c = await loadPublicCampaign(params.slug);
  const cfg = JSON.parse(c.config);
  // Chủ chiến dịch có thể xem trước bản nháp bằng token preview
  const preview = verifyToken(url.searchParams.get('preview'));
  const isPreview = preview && preview.t === 'pv' && preview.cid === c.id;
  const prizes = await loadPrizes(c.id);
  const plan = PLANS[c.plan] || PLANS.free;
  return json({
    campaign: {
      slug: c.slug, name: c.name, gameType: c.game_type, businessName: c.business_name,
      config: { ...cfg }, watermark: plan.watermark,
      prizes: prizes.map((p) => ({ id: p.id, name: p.name, imageUrl: p.imageUrl, soldOut: p.remaining <= 0 })),
      availability: isPreview ? { open: true, preview: true } : availability(c, cfg),
    },
  });
});

route('POST', '/campaigns/:id/preview-token', async ({ req, params }) => {
  const a = await requireAccount(req);
  const c = await loadCampaign(a.id, params.id);
  return json({ token: signToken({ t: 'pv', cid: c.id }, 60 * 60) });
});

route('POST', '/public/campaigns/:slug/join', async ({ req, params, url }) => {
  const c = await loadPublicCampaign(params.slug);
  const cfg = JSON.parse(c.config);
  const preview = verifyToken(url.searchParams.get('preview'));
  const isPreview = preview && preview.t === 'pv' && preview.cid === c.id;
  const av = isPreview ? { open: true } : availability(c, cfg);
  if (!av.open) throw new HttpError(403, av.reason);
  const b = await readJson(req);
  const phone = normalizePhone(b.phone);
  if (!phone) throw new HttpError(400, 'Số điện thoại không hợp lệ');
  const name = str(b.name, 80);
  if (cfg.fields?.name && !name) throw new HttpError(400, 'Vui lòng nhập họ tên');
  const email = str(b.email, 120);
  if (cfg.fields?.email && !isEmail(email)) throw new HttpError(400, 'Email không hợp lệ');

  let { rows } = await query('SELECT id FROM players WHERE campaign_id = $1 AND phone = $2', [c.id, phone]);
  let playerId = rows[0]?.id;
  if (!playerId) {
    playerId = newId('u_');
    try {
      await query('INSERT INTO players (id, campaign_id, name, phone, email, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [playerId, c.id, name, phone, email || null, now()]);
    } catch {
      ({ rows } = await query('SELECT id FROM players WHERE campaign_id = $1 AND phone = $2', [c.id, phone]));
      playerId = rows[0]?.id;
      if (!playerId) throw new HttpError(500, 'Không thể đăng ký, vui lòng thử lại');
    }
  }
  const used = await query('SELECT COUNT(*) AS n FROM plays WHERE player_id = $1', [playerId]);
  const playsLeft = Math.max(0, cfg.playsPerPlayer - Number(used.rows[0].n));
  const history = await query('SELECT prize_name, code, created_at FROM plays WHERE player_id = $1 AND prize_id IS NOT NULL ORDER BY created_at', [playerId]);
  return json({
    token: signToken({ t: 'p', pid: playerId, cid: c.id, pv: !!isPreview }, PLAYER_TTL),
    playsLeft,
    wins: history.rows.map((h) => ({ prize: h.prize_name, code: h.code })),
  });
});

route('POST', '/public/campaigns/:slug/play', async ({ req, params }) => {
  const c = await loadPublicCampaign(params.slug);
  const cfg = JSON.parse(c.config);
  const b = await readJson(req);
  const tok = verifyToken(b.token);
  if (!tok || tok.t !== 'p' || tok.cid !== c.id) throw new HttpError(401, 'Phiên chơi đã hết hạn, vui lòng nhập lại thông tin');
  const av = tok.pv ? { open: true } : availability(c, cfg);
  if (!av.open) throw new HttpError(403, av.reason);

  // Giới hạn lượt chơi theo gói của doanh nghiệp
  const plan = PLANS[c.plan] || PLANS.free;
  const usage = await monthUsage(c.account_id);
  if (usage.playsThisMonth >= plan.playsPerMonth) throw new HttpError(403, 'Chương trình tạm hết lượt chơi trong tháng. Vui lòng quay lại sau!');

  const result = await tx(async (db) => {
    // Khoá người chơi để chặn bấm nhiều lần cùng lúc
    const pl = await db.query('SELECT id FROM players WHERE id = $1 FOR UPDATE', [tok.pid]);
    if (!pl.rows[0]) throw new HttpError(401, 'Phiên chơi không hợp lệ');
    const used = await db.query('SELECT COUNT(*) AS n FROM plays WHERE player_id = $1', [tok.pid]);
    const usedN = Number(used.rows[0].n);
    if (usedN >= cfg.playsPerPlayer) throw new HttpError(403, 'Bạn đã hết lượt chơi');

    // Khoá kho quà để không phát vượt số lượng
    const { rows: prizes } = await db.query('SELECT * FROM prizes WHERE campaign_id = $1 ORDER BY sort FOR UPDATE', [c.id]);
    const roll = (await import('node:crypto')).randomInt(0, 10000) / 100; // 0.00 - 99.99
    let acc = 0;
    let won = null;
    for (const p of prizes) {
      acc += Number(p.chance);
      if (roll < acc) {
        if (Number(p.remaining) > 0) won = p;
        break;
      }
    }
    const code = won ? newPrizeCode() : null;
    if (won) await db.query('UPDATE prizes SET remaining = remaining - 1 WHERE id = $1', [won.id]);
    await db.query('INSERT INTO plays (id, campaign_id, account_id, player_id, prize_id, prize_name, code, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [
      newId('g_'), c.id, c.account_id, tok.pid, won?.id || null, won?.name || null, code, now(),
    ]);
    return { win: !!won, prizeId: won?.id || null, prize: won?.name || null, imageUrl: won?.image_url || '', code, playsLeft: cfg.playsPerPlayer - usedN - 1 };
  });
  return json({ result });
});

route('GET', '/health', async () => {
  await query('SELECT 1 AS ok');
  return json({ ok: true });
});
