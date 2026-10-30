// Trang quản trị cho doanh nghiệp (SPA, điều hướng bằng #hash)
import qrcode from './vendor/qrcode.js';
const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtTime = (t) => (t ? new Date(t).toLocaleString('vi-VN') : '');
const fmtNum = (n) => Number(n || 0).toLocaleString('vi-VN');
const toLocalInput = (t) => (t ? new Date(t - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

const GAMES = {
  wheel: { name: 'Vòng quay may mắn', icon: '🎡', bg: 'linear-gradient(135deg,#ffe3df,#ffd0a8)', desc: 'Kinh điển, hợp mọi dịp khuyến mãi' },
  flip: { name: 'Lật thẻ trúng quà', icon: '🃏', bg: 'linear-gradient(135deg,#e5e0ff,#cfe3ff)', desc: 'Chọn 1 trong 9 thẻ bí ẩn' },
  scratch: { name: 'Cào trúng thưởng', icon: '🎟️', bg: 'linear-gradient(135deg,#e2f6ee,#d6f0ff)', desc: 'Cảm giác cào thẻ thật trên điện thoại' },
  giftbox: { name: 'Mở hộp quà', icon: '🎁', bg: 'linear-gradient(135deg,#fff1c7,#ffd9ec)', desc: 'Chọn hộp may mắn, mở là có quà' },
};
const STATUS = { draft: ['Bản nháp', 'draft'], active: ['Đang chạy', 'active'], ended: ['Đã kết thúc', 'ended'] };
const PRIZE_COLORS = ['#ff4d3d', '#ffb320', '#7c5cff', '#16a3a3', '#ff7ab6', '#3b82f6', '#12a150', '#f97316', '#a855f7', '#0ea5e9', '#84cc16', '#e11d48'];

let me = null;

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/auth/')) { location.hash = '#/login'; throw new Error(data.error); }
  if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra');
  return data;
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

// ---------------- Ảnh: chọn file → thu nhỏ → tải lên ----------------
function pickFile() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/png,image/jpeg,image/webp,image/gif';
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}
async function shrink(file, maxSide) {
  if (file.type === 'image/gif' && file.size < 1_000_000) return readAsDataUrl(file);
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('Không đọc được ảnh này')); i.src = url; });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * scale);
    cv.height = Math.round(img.naturalHeight * scale);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    let out = cv.toDataURL('image/webp', 0.86);
    if (!out.startsWith('data:image/webp')) out = file.type === 'image/png' ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.86);
    return out;
  } finally { URL.revokeObjectURL(url); }
}
const readAsDataUrl = (f) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(f); });
async function uploadImage(maxSide = 1000) {
  const file = await pickFile();
  if (!file) return null;
  if (file.size > 15_000_000) { toast('Ảnh quá lớn, hãy chọn ảnh dưới 15MB'); return null; }
  toast('Đang tải ảnh lên…');
  try {
    const dataUrl = await shrink(file, maxSide);
    const { url } = await api('/images', { method: 'POST', body: { dataUrl } });
    toast('Đã tải ảnh lên');
    return url;
  } catch (e) { toast(e.message); return null; }
}
// Ô chọn ảnh dùng trong form: input ẩn giữ đường dẫn + ảnh xem trước + nút tải lên/xoá
function imageField(name, label, value, hint, maxSide) {
  return `<div class="field img-field" data-max="${maxSide}"><label>${label}</label>
    <input type="hidden" name="${name}" value="${esc(value)}">
    <div class="img-pick">
      <div class="img-thumb">${value ? `<img src="${esc(value)}" alt="">` : '<span>Chưa có ảnh</span>'}</div>
      <div class="img-btns"><button type="button" class="btn small" data-up>📷 Tải ảnh lên</button>
        <button type="button" class="btn ghost small" data-rm ${value ? '' : 'hidden'}>Xoá ảnh</button></div>
    </div>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
}
function bindImageFields(root, onChange) {
  root.querySelectorAll('.img-field').forEach((f) => {
    const inp = f.querySelector('input[type=hidden]');
    const set = (v) => {
      inp.value = v || '';
      f.querySelector('.img-thumb').innerHTML = v ? `<img src="${esc(v)}" alt="">` : '<span>Chưa có ảnh</span>';
      f.querySelector('[data-rm]').hidden = !v;
      onChange?.();
    };
    f.querySelector('[data-up]').onclick = async () => { const u = await uploadImage(+f.dataset.max || 1000); if (u) set(u); };
    f.querySelector('[data-rm]').onclick = () => set('');
  });
}

// ---------------- Mã QR (tạo ngay trên trình duyệt) ----------------
function drawQR(canvas, text, { size = 1000, title = '', sub = '' } = {}) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  const pad = 4;
  const cell = Math.floor(size / (n + pad * 2));
  const qrPx = cell * (n + pad * 2);
  const extra = title ? Math.round(qrPx * 0.2) : 0;
  canvas.width = qrPx;
  canvas.height = qrPx + extra;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect((c + pad) * cell, (r + pad) * cell, cell, cell);
  if (title) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1d2433';
    ctx.font = `700 ${Math.round(qrPx * 0.055)}px "Be Vietnam Pro", Arial, sans-serif`;
    ctx.fillText(title.slice(0, 40), qrPx / 2, qrPx + extra * 0.25);
    ctx.fillStyle = '#667085';
    ctx.font = `500 ${Math.round(qrPx * 0.032)}px "Be Vietnam Pro", Arial, sans-serif`;
    ctx.fillText(sub.slice(0, 70), qrPx / 2, qrPx + extra * 0.62);
  }
}

// ---------------- Router ----------------
const routes = [
  [/^#\/login$/, viewLogin, false],
  [/^#\/register$/, viewRegister, false],
  [/^#\/?$/, viewDashboard, true],
  [/^#\/new$/, viewNew, true],
  [/^#\/c\/([^/]+)(?:\/(\w+))?$/, viewEditor, true],
  [/^#\/redeem$/, viewRedeem, true],
];
async function router() {
  const [h0, q] = (location.hash || '#/').split('?');
  const h = h0;
  const pick = new URLSearchParams(q || '').get('game');
  if (pick && GAMES[pick]) sessionStorage.setItem('rq_pick', pick);
  for (const [re, fn, needAuth] of routes) {
    const m = h.match(re);
    if (!m) continue;
    if (needAuth && !me) {
      try { me = await api('/auth/me'); } catch { location.hash = '#/login'; return; }
    }
    return fn(...m.slice(1));
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', router);

function shell(active, inner) {
  const a = me.account;
  app.innerHTML = `
    <header class="topbar"><div class="in">
      <a class="logo-mark" href="#/"><span class="dot">🎁</span>RinhQuà</a>
      <nav>
        <a href="#/" class="${active === 'home' ? 'on' : ''}">Chiến dịch</a>
        <a href="#/new" class="${active === 'new' ? 'on' : ''}">+ Tạo game</a>
        <a href="#/redeem" class="${active === 'redeem' ? 'on' : ''}">Trao quà</a>
      </nav>
      <div class="who"><b>${esc(a.businessName)}</b><br>Gói ${esc(a.planInfo.label)} · <a href="#" id="logout">Đăng xuất</a></div>
    </div></header>
    <main class="wrap">${inner}</main>`;
  document.getElementById('logout').onclick = async (e) => {
    e.preventDefault();
    await api('/auth/logout', { method: 'POST' });
    me = null;
    location.hash = '#/login';
  };
}

// ---------------- Đăng nhập / Đăng ký ----------------
function authShell(title, sub, form, foot) {
  app.innerHTML = `<div class="auth"><div class="card">
    <a class="logo-mark" href="/"><span class="dot">🎁</span>RinhQuà</a>
    <h1>${title}</h1><p class="muted" style="margin:0 0 20px">${sub}</p>
    <form id="f">${form}<p class="error" id="err"></p><button class="btn block">${title}</button></form>
    <p class="muted" style="text-align:center;font-size:14px;margin:18px 0 0">${foot}</p></div></div>`;
  return document.getElementById('f');
}
function bindAuth(form, path) {
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      await api(path, { method: 'POST', body: Object.fromEntries(new FormData(form)) });
      me = await api('/auth/me');
      location.hash = path.endsWith('register') ? '#/new' : '#/';
    } catch (err) {
      document.getElementById('err').textContent = err.message;
      btn.disabled = false;
    }
  };
}
function viewLogin() {
  bindAuth(authShell('Đăng nhập', 'Quản lý minigame của doanh nghiệp bạn', `
    <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email"></div>
    <div class="field"><label>Mật khẩu</label><input name="password" type="password" required autocomplete="current-password"></div>`,
  'Chưa có tài khoản? <a href="#/register">Đăng ký miễn phí</a>'), '/auth/login');
}
function viewRegister() {
  bindAuth(authShell('Tạo tài khoản', 'Miễn phí – tạo game đầu tiên trong 5 phút', `
    <div class="field"><label>Tên doanh nghiệp / cửa hàng</label><input name="businessName" required maxlength="120"></div>
    <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email"></div>
    <div class="field"><label>Số điện thoại</label><input name="phone" type="tel"></div>
    <div class="field"><label>Mật khẩu</label><input name="password" type="password" minlength="8" required autocomplete="new-password"><span class="hint">Tối thiểu 8 ký tự</span></div>`,
  'Đã có tài khoản? <a href="#/login">Đăng nhập</a>'), '/auth/register');
}

// ---------------- Dashboard ----------------
async function viewDashboard() {
  shell('home', '<p class="muted">Đang tải…</p>');
  me = await api('/auth/me');
  const { campaigns } = await api('/campaigns');
  const plan = me.account.planInfo;
  const used = me.usage.playsThisMonth;
  const totals = campaigns.reduce((s, c) => ({ plays: s.plays + c.stats.plays, wins: s.wins + c.stats.wins, players: s.players + c.stats.players }), { plays: 0, wins: 0, players: 0 });
  shell('home', `
    <div class="page-head"><h1>Chiến dịch của bạn</h1><a class="btn" href="#/new">+ Tạo game mới</a></div>
    <div class="stats">
      <div class="card stat"><div class="n">${fmtNum(totals.players)}</div><div class="l">Khách hàng thu được</div></div>
      <div class="card stat"><div class="n">${fmtNum(totals.plays)}</div><div class="l">Tổng lượt chơi</div></div>
      <div class="card stat"><div class="n">${fmtNum(totals.wins)}</div><div class="l">Quà đã phát</div></div>
      <div class="card stat"><div class="n">${fmtNum(used)}<span class="muted" style="font-size:14px;font-weight:500"> / ${fmtNum(plan.playsPerMonth)}</span></div>
        <div class="l">Lượt chơi tháng này (gói ${esc(plan.label)})</div><div class="meter"><div style="width:${Math.min(100, (used / plan.playsPerMonth) * 100)}%"></div></div></div>
    </div>
    ${campaigns.length ? `<div class="camp-list">${campaigns.map((c) => `
      <a class="card camp" href="#/c/${c.id}">
        <div class="top"><div class="ic" style="background:${GAMES[c.gameType].bg}">${GAMES[c.gameType].icon}</div>
          <div style="flex:1;min-width:0"><h3>${esc(c.name)}</h3><div class="muted" style="font-size:13px">${GAMES[c.gameType].name}</div></div>
          <span class="badge ${STATUS[c.status][1]}">${STATUS[c.status][0]}</span></div>
        <div class="nums"><span><b>${fmtNum(c.stats.players)}</b> khách</span><span><b>${fmtNum(c.stats.plays)}</b> lượt chơi</span><span><b>${fmtNum(c.stats.wins)}</b> quà</span></div>
      </a>`).join('')}</div>`
    : `<div class="card empty"><div class="big">🎡</div><h2>Chưa có chiến dịch nào</h2><p class="muted">Tạo minigame đầu tiên để bắt đầu thu hút khách hàng.</p><a class="btn" href="#/new">Tạo game ngay</a></div>`}`);
}

// ---------------- Tạo mới ----------------
function viewNew() {
  shell('new', `
    <div class="page-head"><h1>Chọn mẫu game</h1></div>
    <div class="templates">${Object.entries(GAMES).map(([k, g]) => `
      <button class="card tpl" data-k="${k}"><div class="art" style="background:${g.bg}">${g.icon}</div>
      <div class="meta"><h3>${g.name}</h3><p>${g.desc}</p></div></button>`).join('')}</div>
    <form class="card section" id="nf" style="margin-top:18px;max-width:560px" hidden>
      <h2>Đặt tên chiến dịch</h2>
      <div class="field"><label>Tên chiến dịch (chỉ bạn nhìn thấy)</label><input name="name" required maxlength="120" placeholder="VD: Sale 11.11 tri ân khách hàng"></div>
      <p class="error" id="err"></p>
      <button class="btn">Tạo và thiết kế →</button>
    </form>`);
  let chosen = null;
  const nf = document.getElementById('nf');
  const pre = sessionStorage.getItem('rq_pick');
  document.querySelectorAll('.tpl').forEach((b) => (b.onclick = () => {
    document.querySelectorAll('.tpl').forEach((x) => x.classList.toggle('on', x === b));
    chosen = b.dataset.k;
    nf.hidden = false;
    nf.name.focus();
  }));
  if (pre) { sessionStorage.removeItem('rq_pick'); document.querySelector(`.tpl[data-k="${pre}"]`)?.click(); }
  nf.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const { campaign } = await api('/campaigns', { method: 'POST', body: { name: nf.name.value, gameType: chosen } });
      location.hash = `#/c/${campaign.id}`;
    } catch (err) { document.getElementById('err').textContent = err.message; }
  };
}

// ---------------- Trình chỉnh sửa ----------------
async function viewEditor(id, tab = 'design') {
  shell('home', '<p class="muted">Đang tải…</p>');
  let c;
  try { c = (await api(`/campaigns/${id}`)).campaign; } catch (e) { shell('home', `<p class="error">${esc(e.message)}</p>`); return; }
  const tabs = { design: 'Thiết kế', prizes: 'Quà tặng & tỉ lệ', share: 'Xuất bản & chia sẻ', results: 'Khách hàng & kết quả' };
  shell('home', `
    <div class="page-head">
      <div><a href="#/" class="muted" style="font-size:13px;text-decoration:none">← Tất cả chiến dịch</a>
        <h1>${esc(c.name)} <span class="badge ${STATUS[c.status][1]}" style="vertical-align:middle">${STATUS[c.status][0]}</span></h1></div>
      <div style="display:flex;gap:8px">${c.status !== 'active' ? '<button class="btn" id="quickpub">Xuất bản</button>' : `<a class="btn ghost" target="_blank" href="/play/${esc(c.slug)}">Mở trang game ↗</a>`}</div>
    </div>
    <div class="tabs">${Object.entries(tabs).map(([k, v]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${v}</button>`).join('')}</div>
    <div class="editor">
      <div id="pane"></div>
      <div class="preview-col"><div class="phone"><iframe id="pv" title="Xem trước"></iframe></div>
        <p class="muted" style="text-align:center;font-size:12px">Xem trước trên điện thoại · <a href="#" id="pvopen">mở tab mới</a></p></div>
    </div>`);
  document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => (location.hash = `#/c/${id}/${b.dataset.t}`)));
  const qp = document.getElementById('quickpub');
  if (qp) qp.onclick = () => (location.hash = `#/c/${id}/share`);
  let pvUrl = '';
  const refreshPreview = async () => {
    const { token } = await api(`/campaigns/${id}/preview-token`, { method: 'POST' });
    pvUrl = `/play/${encodeURIComponent(c.slug)}?preview=${encodeURIComponent(token)}`;
    const frame = document.getElementById('pv');
    if (frame) frame.src = pvUrl;
  };
  document.getElementById('pvopen').onclick = (e) => { e.preventDefault(); window.open(pvUrl, '_blank'); };
  refreshPreview();
  const save = async (body, msg = 'Đã lưu') => {
    const res = await api(`/campaigns/${id}`, { method: 'PUT', body });
    c = res.campaign;
    toast(msg);
    refreshPreview();
    return c;
  };
  const pane = document.getElementById('pane');
  ({ design: paneDesign, prizes: panePrizes, share: paneShare, results: paneResults }[tab] || paneDesign)(pane, c, save, () => viewEditor(id, tab));
}

function paneDesign(pane, c, save) {
  const g = c.config;
  pane.innerHTML = `<form id="df">
    <div class="card section"><h2>Loại game</h2>
      <div class="field"><select name="gameType">${Object.entries(GAMES).map(([k, v]) => `<option value="${k}" ${k === c.gameType ? 'selected' : ''}>${v.icon} ${v.name}</option>`).join('')}</select></div>
      <div class="field"><label>Tên chiến dịch (nội bộ)</label><input name="name" value="${esc(c.name)}" maxlength="120"></div>
    </div>
    <div class="card section"><h2>Nội dung hiển thị</h2>
      <div class="field"><label>Tiêu đề lớn</label><input name="title" value="${esc(g.title)}" maxlength="120"></div>
      <div class="field"><label>Mô tả ngắn</label><input name="subtitle" value="${esc(g.subtitle)}" maxlength="200"></div>
      <div class="field"><label>Thể lệ chương trình</label><textarea name="rules" rows="4">${esc(g.rules)}</textarea></div>
      <div class="row">
        <div class="field"><label>Lời chúc khi trúng</label><input name="winText" value="${esc(g.winText)}"></div>
        <div class="field"><label>Lời chúc khi không trúng</label><input name="loseText" value="${esc(g.loseText)}"></div>
      </div>
      <div class="field"><label>Hướng dẫn nhận quà</label><input name="redeemInstruction" value="${esc(g.redeemInstruction)}"></div>
    </div>
    <div class="card section"><h2>Thương hiệu</h2>
      <div class="row">
        <div class="field"><label>Màu chủ đạo</label><div class="color-row"><input type="color" name="primaryColor" value="${esc(g.primaryColor)}"><span class="muted">Nút, vòng quay, tiêu đề</span></div></div>
        <div class="field"><label>Màu nền</label><div class="color-row"><input type="color" name="bgColor" value="${esc(g.bgColor)}"><span class="muted">Nền trang game</span></div></div>
      </div>
      <div class="row">
        ${imageField('logoUrl', 'Logo', g.logoUrl, 'PNG nền trong suốt là đẹp nhất', 600)}
        ${imageField('bannerUrl', 'Ảnh banner (tuỳ chọn)', g.bannerUrl, 'Ảnh ngang, hiện dưới tiêu đề', 1400)}
      </div>
    </div>
    <div class="card section"><h2>Thu thập thông tin & luật chơi</h2>
      <label class="check"><input type="checkbox" checked disabled> Số điện thoại (bắt buộc – dùng để chống chơi trùng)</label>
      <label class="check"><input type="checkbox" name="f_name" ${g.fields?.name ? 'checked' : ''}> Họ và tên</label>
      <label class="check"><input type="checkbox" name="f_email" ${g.fields?.email ? 'checked' : ''}> Email</label>
      <div class="row" style="margin-top:10px">
        <div class="field"><label>Số lượt chơi mỗi số điện thoại</label><input type="number" name="playsPerPlayer" min="1" max="100" value="${g.playsPerPlayer}"></div>
        <div></div>
        <div class="field"><label>Bắt đầu (tuỳ chọn)</label><input type="datetime-local" name="startAt" value="${toLocalInput(g.startAt)}"></div>
        <div class="field"><label>Kết thúc (tuỳ chọn)</label><input type="datetime-local" name="endAt" value="${toLocalInput(g.endAt)}"></div>
      </div>
    </div>
    <div class="savebar"><span class="grow">Thay đổi sẽ hiện ngay ở khung xem trước sau khi lưu.</span><button class="btn">Lưu thay đổi</button></div>
  </form>`;
  const f = document.getElementById('df');
  bindImageFields(f);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    try {
      await save({
        name: v.name, gameType: v.gameType,
        config: {
          title: v.title, subtitle: v.subtitle, rules: v.rules, winText: v.winText, loseText: v.loseText, redeemInstruction: v.redeemInstruction,
          primaryColor: v.primaryColor, bgColor: v.bgColor, logoUrl: v.logoUrl, bannerUrl: v.bannerUrl,
          fields: { name: !!v.f_name, email: !!v.f_email }, playsPerPlayer: v.playsPerPlayer,
          startAt: v.startAt ? new Date(v.startAt).toISOString() : null, endAt: v.endAt ? new Date(v.endAt).toISOString() : null,
        },
      });
    } catch (err) { toast(err.message); }
  };
}

function panePrizes(pane, c, save, reload) {
  let prizes = c.prizes.map((p) => ({ ...p }));
  const draw = () => {
    const total = prizes.reduce((s, p) => s + (Number(p.chance) || 0), 0);
    pane.innerHTML = `
      <div class="card section"><h2>Danh sách quà tặng</h2>
        <p class="muted" style="font-size:14px;margin-top:-6px">Tỉ lệ trúng là xác suất mỗi lượt chơi trúng quà đó. Phần còn lại là "Chúc may mắn". Khi quà hết số lượng, hệ thống tự chuyển thành không trúng – không bao giờ phát vượt.</p>
        <table class="prize-table"><thead><tr><th>Tên quà</th><th>Số lượng</th><th>Tỉ lệ %</th><th>Còn lại</th><th></th></tr></thead><tbody>
        ${prizes.map((p, i) => `<tr data-i="${i}">
          <td><input data-k="name" value="${esc(p.name)}" placeholder="VD: Voucher 50k" maxlength="80"></td>
          <td><input class="num" data-k="quantity" type="number" min="0" value="${p.quantity}"></td>
          <td><input class="num" data-k="chance" type="number" min="0" max="100" value="${p.chance}"></td>
          <td class="left">${p.id ? `${fmtNum(p.remaining)} / ${fmtNum(p.quantity)}` : 'mới'}</td>
          <td><button class="rm" data-rm="${i}" title="Xoá">✕</button></td></tr>
          <tr data-i="${i}"><td colspan="5" style="padding-top:0"><div class="prize-img-row">
            <div class="img-thumb small">${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="">` : '<span>🎁</span>'}</div>
            <button type="button" class="btn ghost small" data-pimg="${i}">📷 ${p.imageUrl ? 'Đổi ảnh quà' : 'Thêm ảnh quà'}</button>
            ${p.imageUrl ? `<button type="button" class="btn ghost small" data-pimgrm="${i}">Xoá ảnh</button>` : ''}</div></td></tr>`).join('')}
        </tbody></table>
        <button class="btn ghost small" id="add" style="margin-top:10px" ${prizes.length >= 12 ? 'disabled' : ''}>+ Thêm quà</button>
        <div class="chance-bar">${prizes.map((p, i) => `<div style="width:${Math.min(100, Number(p.chance) || 0)}%;background:${PRIZE_COLORS[i % 12]}" title="${esc(p.name)}"></div>`).join('')}</div>
        <p style="font-size:14px;margin:0" class="${total > 100 ? 'error' : 'muted'}">Tổng tỉ lệ trúng: <b>${total}%</b> · Không trúng: <b>${Math.max(0, 100 - total)}%</b>${total > 100 ? ' – vượt quá 100%!' : ''}</p>
      </div>
      <div class="savebar"><span class="grow">Có thể sửa số lượng, tỉ lệ cả khi chiến dịch đang chạy.</span><button class="btn" id="sv">Lưu quà tặng</button></div>`;
    pane.querySelectorAll('input[data-k]').forEach((inp) => (inp.oninput = () => {
      prizes[inp.closest('tr').dataset.i][inp.dataset.k] = inp.value;
      if (inp.dataset.k === 'chance') {
        const t = prizes.reduce((s, p) => s + (Number(p.chance) || 0), 0);
        const bar = pane.querySelector('.chance-bar');
        bar.innerHTML = prizes.map((p, i) => `<div style="width:${Math.min(100, Number(p.chance) || 0)}%;background:${PRIZE_COLORS[i % 12]}"></div>`).join('');
        bar.nextElementSibling.className = t > 100 ? 'error' : 'muted';
        bar.nextElementSibling.innerHTML = `Tổng tỉ lệ trúng: <b>${t}%</b> · Không trúng: <b>${Math.max(0, 100 - t)}%</b>${t > 100 ? ' – vượt quá 100%!' : ''}`;
      }
    }));
    pane.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { prizes.splice(+b.dataset.rm, 1); draw(); }));
    pane.querySelectorAll('[data-pimg]').forEach((b) => (b.onclick = async () => { const u = await uploadImage(500); if (u) { prizes[+b.dataset.pimg].imageUrl = u; draw(); } }));
    pane.querySelectorAll('[data-pimgrm]').forEach((b) => (b.onclick = () => { prizes[+b.dataset.pimgrm].imageUrl = ''; draw(); }));
    document.getElementById('add').onclick = () => { prizes.push({ name: '', quantity: 10, chance: 5, imageUrl: '' }); draw(); };
    document.getElementById('sv').onclick = async () => {
      try { const nc = await save({ prizes }); prizes = nc.prizes.map((p) => ({ ...p })); draw(); } catch (err) { toast(err.message); }
    };
  };
  draw();
}

function paneShare(pane, c, save, reload) {
  const link = `${location.origin}/play/${c.slug}`;
  const embed = `<iframe src="${link}" style="width:100%;max-width:480px;height:820px;border:0;border-radius:16px" allow="clipboard-write"></iframe>`;
  pane.innerHTML = `
    <div class="card section"><h2>Trạng thái</h2>
      <div class="status-box">
        <span class="badge ${STATUS[c.status][1]}" style="font-size:14px;padding:6px 14px">${STATUS[c.status][0]}</span>
        ${c.status !== 'active' ? '<button class="btn" data-s="active">🚀 Xuất bản – cho phép khách chơi</button>' : '<button class="btn danger" data-s="ended">Kết thúc chương trình</button><button class="btn ghost" data-s="draft">Tạm dừng</button>'}
      </div>
      <p class="muted" style="font-size:13px;margin:10px 0 0">${c.status === 'active' ? 'Khách hàng đang có thể chơi qua link bên dưới.' : 'Khi chưa xuất bản, khách mở link sẽ thấy "Trò chơi chưa mở". Bạn vẫn chơi thử được ở khung xem trước.'}</p>
    </div>
    <div class="card section"><h2>Link & mã QR</h2>
      <div class="share-grid">
        <div>
          <div class="field"><label>Link trò chơi – gửi qua Zalo, Facebook, SMS</label>
            <div class="copy-row"><input readonly value="${esc(link)}" id="lnk"><button class="btn small" data-copy="lnk">Sao chép</button></div></div>
          <div class="field"><label>Đổi đuôi link</label>
            <div class="copy-row"><input id="slug" value="${esc(c.slug)}" maxlength="40"><button class="btn ghost small" id="saveslug">Lưu</button></div>
            <span class="hint">Chỉ dùng chữ thường không dấu, số và dấu gạch ngang.</span></div>
          <div class="field"><label>Nhúng vào website (dán mã này vào trang của bạn)</label>
            <div class="copy-row"><input readonly value="${esc(embed)}" id="emb"><button class="btn small" data-copy="emb">Sao chép</button></div></div>
        </div>
        <div class="qr"><canvas id="qrc" class="qr-canvas"></canvas>
          <p class="muted" style="font-size:12px">In mã QR đặt tại quầy, bàn ăn, túi hàng…</p>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:center">
            <button type="button" class="btn small" id="qrdl">⬇ Tải ảnh QR (PNG)</button>
            <button type="button" class="btn ghost small" id="qrdl2">⬇ QR kèm tên chương trình</button></div></div>
      </div>
    </div>
    <div class="card section"><h2>Vùng nguy hiểm</h2>
      <button class="btn danger small" id="del">Xoá chiến dịch</button>
      <span class="muted" style="font-size:13px;margin-left:8px">Xoá cả dữ liệu khách hàng và lịch sử trúng thưởng. Không thể khôi phục.</span>
    </div>`;
  pane.querySelectorAll('[data-s]').forEach((b) => (b.onclick = async () => {
    try { await save({ status: b.dataset.s }, b.dataset.s === 'active' ? 'Đã xuất bản! Khách hàng có thể chơi ngay.' : 'Đã cập nhật trạng thái'); reload(); } catch (err) { toast(err.message); }
  }));
  drawQR(document.getElementById('qrc'), link, { size: 360 });
  const dl = (withTitle) => {
    const cv = document.createElement('canvas');
    drawQR(cv, link, { size: 1200, title: withTitle ? (c.config.title || c.name) : '', sub: withTitle ? 'Quét mã để chơi và nhận quà' : '' });
    cv.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `qr-${c.slug}${withTitle ? '-in' : ''}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('Đã tải ảnh QR về máy');
    }, 'image/png');
  };
  document.getElementById('qrdl').onclick = () => dl(false);
  document.getElementById('qrdl2').onclick = () => dl(true);
  pane.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => { navigator.clipboard.writeText(document.getElementById(b.dataset.copy).value); toast('Đã sao chép'); }));
  document.getElementById('saveslug').onclick = async () => {
    try { await save({ slug: document.getElementById('slug').value }, 'Đã đổi link'); reload(); } catch (err) { toast(err.message); }
  };
  document.getElementById('del').onclick = async () => {
    if (!confirm(`Xoá vĩnh viễn chiến dịch "${c.name}"?`)) return;
    await api(`/campaigns/${c.id}`, { method: 'DELETE' });
    toast('Đã xoá');
    location.hash = '#/';
  };
}

async function paneResults(pane, c) {
  const s = c.stats;
  let filter = '';
  const load = async () => {
    const { plays } = await api(`/campaigns/${c.id}/plays?filter=${filter}`);
    document.getElementById('rows').innerHTML = plays.length ? plays.map((p) => `<tr>
      <td>${fmtTime(p.createdAt)}</td><td>${esc(p.name || '')}</td><td>${esc(p.phone)}</td>
      <td>${p.prize ? `<b>${esc(p.prize)}</b>` : '<span class="muted">Không trúng</span>'}</td>
      <td>${p.code ? `<code>${esc(p.code)}</code>` : ''}</td>
      <td>${p.redeemedAt ? `<span class="badge active">Đã trao</span>` : p.code ? '<span class="badge draft">Chưa trao</span>' : ''}</td></tr>`).join('')
      : '<tr><td colspan="6" class="muted" style="text-align:center;padding:30px">Chưa có dữ liệu</td></tr>';
  };
  pane.innerHTML = `
    <div class="stats">
      <div class="card stat"><div class="n">${fmtNum(s.players)}</div><div class="l">Khách hàng</div></div>
      <div class="card stat"><div class="n">${fmtNum(s.plays)}</div><div class="l">Lượt chơi</div></div>
      <div class="card stat"><div class="n">${fmtNum(s.wins)}</div><div class="l">Trúng quà</div></div>
      <div class="card stat"><div class="n">${fmtNum(s.redeemed)}</div><div class="l">Đã trao quà</div></div>
    </div>
    <div class="card section">
      <div class="page-head" style="margin-bottom:10px"><div class="filters">
        <button data-f="" class="on">Tất cả</button><button data-f="win">Trúng quà</button><button data-f="redeemed">Đã trao</button></div>
        <a class="btn ghost small" href="/api/campaigns/${c.id}/plays?format=csv&limit=1000">⬇ Tải Excel (CSV)</a></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Thời gian</th><th>Họ tên</th><th>Điện thoại</th><th>Kết quả</th><th>Mã quà</th><th>Trạng thái</th></tr></thead>
      <tbody id="rows"><tr><td colspan="6" class="muted">Đang tải…</td></tr></tbody></table></div>
    </div>`;
  pane.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => {
    filter = b.dataset.f;
    pane.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === b));
    load();
  }));
  load();
}

// ---------------- Trao quà ----------------
function viewRedeem() {
  shell('redeem', `
    <div class="redeem-box">
      <div class="page-head"><h1>Trao quà cho khách</h1></div>
      <form class="card section" id="rf">
        <p class="muted" style="margin-top:0">Nhập mã nhận quà khách xuất trình. Mỗi mã chỉ được trao <b>1 lần</b> – chống nhân viên hoặc khách gian lận.</p>
        <div class="field"><input class="code" name="code" maxlength="12" required placeholder="ABCD2345" autocomplete="off"></div>
        <button class="btn block">Kiểm tra mã</button>
        <div id="ticket"></div>
      </form>
    </div>`);
  const f = document.getElementById('rf');
  const box = document.getElementById('ticket');
  const show = (t) => {
    box.innerHTML = `<div class="ticket ${t.redeemedAt ? 'used' : 'ok'}">
      <h2 style="font-size:18px">${t.redeemedAt ? '⚠️ Mã đã được sử dụng' : '✅ Mã hợp lệ'}</h2>
      <dl><dt>Quà tặng</dt><dd style="font-size:17px">${esc(t.prize)}</dd><dt>Chiến dịch</dt><dd>${esc(t.campaign)}</dd>
      <dt>Khách hàng</dt><dd>${esc(t.name || '')} · ${esc(t.phone)}</dd><dt>Trúng lúc</dt><dd>${fmtTime(t.createdAt)}</dd>
      ${t.redeemedAt ? `<dt>Đã trao lúc</dt><dd>${fmtTime(t.redeemedAt)} (${esc(t.redeemedBy || '')})</dd>` : ''}</dl>
      ${t.redeemedAt ? '' : `<div class="field"><label>Người trao quà</label><input id="staff" placeholder="Tên nhân viên"></div><button type="button" class="btn block" id="give" style="background:var(--ok)">Xác nhận đã trao quà</button>`}
    </div>`;
    const give = document.getElementById('give');
    if (give) give.onclick = async () => {
      give.disabled = true;
      try { show((await api(`/redeem/${encodeURIComponent(t.code)}`, { method: 'POST', body: { staff: document.getElementById('staff').value } })).ticket); toast('Đã ghi nhận trao quà'); }
      catch (err) { toast(err.message); give.disabled = false; }
    };
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    box.innerHTML = '';
    try { show((await api(`/redeem/${encodeURIComponent(f.code.value.trim().toUpperCase())}`)).ticket); }
    catch (err) { box.innerHTML = `<p class="error" style="margin-top:12px">${esc(err.message)}</p>`; }
  };
}

router();
