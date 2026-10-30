import crypto from 'node:crypto';

// Khoá ký phiên: lấy từ biến môi trường APP_SECRET nếu có, nếu không thì
// tự tạo một lần và lưu trong bảng app_settings (xem ensureSecret trong app.mjs).
const SECRET = () => {
  const s = process.env.APP_SECRET || globalThis.__RQ_SECRET;
  if (!s) throw new Error('Chưa khởi tạo khoá bảo mật');
  return s;
};
export function setRuntimeSecret(s) {
  globalThis.__RQ_SECRET = s;
}

export const now = () => Date.now();
export const newId = (prefix = '') => prefix + crypto.randomBytes(9).toString('base64url');

// Mã nhận quà: 8 ký tự, bỏ các ký tự dễ nhầm (0/O, 1/I/L)
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newPrizeCode() {
  const bytes = crypto.randomBytes(8);
  let s = '';
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s;
}

// ---- Mật khẩu (scrypt, có sẵn trong Node) ----
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}
export function verifyPassword(pw, stored) {
  const [, saltB64, hashB64] = String(stored).split('$');
  if (!saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = crypto.scryptSync(pw, Buffer.from(saltB64, 'base64url'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

// ---- Token ký HMAC (thay cho JWT, không cần thư viện) ----
export function signToken(payload, ttlSeconds) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url');
  return `${body}.${sig}`;
}
export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

// ---- HTTP helpers ----
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

export function getCookie(req, name) {
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}
export function sessionCookie(token, maxAge) {
  const secure = process.env.LOCAL_SQLITE ? '' : '; Secure';
  return `rq_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'Dữ liệu gửi lên không hợp lệ');
  }
}

export const normalizePhone = (p) => {
  let s = String(p || '').replace(/[\s.\-()]/g, '');
  if (s.startsWith('+84')) s = '0' + s.slice(3);
  else if (s.startsWith('84') && s.length === 11) s = '0' + s.slice(2);
  return /^0[35789]\d{8}$/.test(s) ? s : null;
};
export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));
export const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

export function slugify(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
