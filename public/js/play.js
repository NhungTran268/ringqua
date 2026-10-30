import { renderGame } from './games.js';

const root = document.getElementById('root');
const slug = decodeURIComponent(location.pathname.split('/')[2] || '');
const preview = new URLSearchParams(location.search).get('preview');
const qs = preview ? `?preview=${encodeURIComponent(preview)}` : '';
const storeKey = `rq_player_${slug}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(path, body) {
  const res = await fetch(`/api/public/campaigns/${encodeURIComponent(slug)}${path}${qs}`, body
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    : {});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Có lỗi xảy ra'), { status: res.status });
  return data;
}

let C; // campaign
let session = null; // { token, playsLeft, wins }

async function main() {
  try {
    C = (await api('')).campaign;
  } catch (e) {
    root.innerHTML = `<div class="play-shell closed"><div class="big">😕</div><h2>${esc(e.message)}</h2></div>`;
    return;
  }
  const cfg = C.config;
  document.title = cfg.title || C.name;
  document.body.style.setProperty('--theme-bg', cfg.bgColor);
  document.body.style.setProperty('--theme', cfg.primaryColor);
  try { session = JSON.parse(sessionStorage.getItem(storeKey) || 'null'); } catch { session = null; }
  render();
}

function render() {
  const cfg = C.config;
  const av = C.availability;
  root.innerHTML = `
    ${av.preview ? '<div class="preview-bar">Chế độ xem trước – lượt chơi thử vẫn được ghi nhận và trừ quà</div>' : ''}
    <div class="play-shell">
      <header class="play-head">
        ${cfg.logoUrl ? `<img class="logo" src="${esc(cfg.logoUrl)}" alt="">` : `<div class="biz">${esc(C.businessName)}</div>`}
        <h1>${esc(cfg.title)}</h1>
        <p>${esc(cfg.subtitle)}</p>
      </header>
      ${cfg.bannerUrl ? `<img class="banner" src="${esc(cfg.bannerUrl)}" alt="">` : ''}
      <section id="stage"></section>
      <section class="panel" id="wins" hidden></section>
      <section class="panel">
        <h2>🎁 Cơ cấu giải thưởng</h2>
        <div class="prize-list">${C.prizes.map((p) => `
          <div class="prize-item ${p.soldOut ? 'out' : ''}">${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="">` : '<span class="ic">🎁</span>'}<span>${esc(p.name)}</span></div>`).join('')}
        </div>
      </section>
      ${cfg.rules ? `<section class="panel"><h2>📋 Thể lệ</h2><div class="rules">${esc(cfg.rules)}</div></section>` : ''}
      ${C.watermark ? '<div class="watermark">Tạo minigame miễn phí với <a href="/" target="_blank">RinhQuà</a></div>' : ''}
    </div>`;
  renderStage();
}

function renderStage() {
  const stage = document.getElementById('stage');
  const av = C.availability;
  if (!av.open) {
    stage.innerHTML = `<div class="panel closed"><div class="big">⏳</div><h2>${esc(av.reason)}</h2></div>`;
    return;
  }
  renderWins();
  if (!session) return renderJoin(stage);
  stage.innerHTML = `
    <div class="center" style="margin:6px 0 4px"><span class="plays-left">Bạn còn <b id="left">${session.playsLeft}</b> lượt chơi</span></div>
    <div id="game"></div>
    <p class="center" style="margin-top:8px"><a href="#" id="switch" class="muted" style="font-size:13px">Không phải bạn? Đổi số điện thoại</a></p>`;
  document.getElementById('switch').onclick = (e) => { e.preventDefault(); session = null; sessionStorage.removeItem(storeKey); renderStage(); };
  renderGame(C.gameType, document.getElementById('game'), {
    prizes: C.prizes,
    theme: { primaryColor: C.config.primaryColor, accent: '#ffd25e' },
    play: doPlay,
  });
}

function renderJoin(stage) {
  const f = C.config.fields || {};
  stage.innerHTML = `
    <form class="panel" id="join">
      <h2 class="center">Nhập thông tin để nhận lượt chơi</h2>
      ${f.name ? '<div class="field"><label>Họ và tên</label><input name="name" autocomplete="name" required maxlength="80"></div>' : ''}
      <div class="field"><label>Số điện thoại</label><input name="phone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="09xx xxx xxx"></div>
      ${f.email ? '<div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" required></div>' : ''}
      <p class="error" id="err"></p>
      <button class="btn block" style="background:${esc(C.config.primaryColor)}">Bắt đầu chơi 🎉</button>
      <p class="muted center" style="font-size:12px;margin:10px 0 0">Thông tin chỉ dùng để xác nhận và trao quà.</p>
    </form>`;
  const form = document.getElementById('join');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    document.getElementById('err').textContent = '';
    try {
      const data = await api('/join', Object.fromEntries(new FormData(form)));
      session = data;
      sessionStorage.setItem(storeKey, JSON.stringify(session));
      renderStage();
    } catch (err) {
      document.getElementById('err').textContent = err.message;
      btn.disabled = false;
    }
  };
}

function renderWins() {
  const box = document.getElementById('wins');
  if (!session?.wins?.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<h2>🏆 Quà của bạn</h2><ul class="my-wins">${session.wins.map((w) => `<li><span>${esc(w.prize)}</span><code>${esc(w.code)}</code></li>`).join('')}</ul>
    <p class="muted" style="font-size:13px;margin:8px 0 0">${esc(C.config.redeemInstruction)}</p>`;
}

async function doPlay() {
  if (session.playsLeft <= 0) {
    showModal({ title: 'Bạn đã hết lượt chơi', body: '<p class="muted">Cảm ơn bạn đã tham gia chương trình!</p>', emoji: '🙏' });
    return null;
  }
  let result;
  try {
    result = (await api('/play', { token: session.token })).result;
  } catch (e) {
    if (e.status === 401) { session = null; sessionStorage.removeItem(storeKey); renderStage(); }
    showModal({ title: e.message, emoji: '⚠️' });
    return null;
  }
  session.playsLeft = Math.max(0, result.playsLeft);
  if (result.win) session.wins = [...(session.wins || []), { prize: result.prize, code: result.code }];
  sessionStorage.setItem(storeKey, JSON.stringify(session));
  return {
    ...result,
    show: (again) => {
      const left = document.getElementById('left');
      if (left) left.textContent = session.playsLeft;
      renderWins();
      const cfg = C.config;
      if (result.win) confetti();
      showModal({
        emoji: result.win ? '🎉' : '🍀',
        title: result.win ? cfg.winText : cfg.loseText,
        body: result.win
          ? `${result.imageUrl ? `<img class="prize-img" src="${esc(result.imageUrl)}" alt="">` : ''}
             <div class="prize-name">${esc(result.prize)}</div>
             <div class="code-box"><small>Mã nhận quà</small><strong>${esc(result.code)}</strong></div>
             <p class="muted" style="font-size:13px">${esc(cfg.redeemInstruction)}</p>`
          : '',
        action: session.playsLeft > 0 ? { label: `Chơi tiếp (còn ${session.playsLeft} lượt)`, fn: again } : null,
      });
    },
  };
}

function showModal({ emoji, title, body = '', action }) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <div class="emoji">${emoji || ''}</div><h2>${esc(title)}</h2>${body}
    <div class="actions">${action ? `<button class="btn" data-a="go" style="background:${esc(C.config.primaryColor)}">${esc(action.label)}</button>` : ''}
    <button class="btn ghost" data-a="close">Đóng</button></div></div>`;
  document.body.appendChild(bg);
  bg.onclick = (e) => {
    const a = e.target.dataset.a;
    if (a === 'go') { bg.remove(); action.fn?.(); }
    else if (a === 'close' || e.target === bg) { bg.remove(); if (action) action.fn?.(); }
  };
}

function confetti() {
  const colors = [C.config.primaryColor, '#ffb320', '#7c5cff', '#16a3a3', '#ff7ab6'];
  for (let i = 0; i < 80; i++) {
    const d = document.createElement('div');
    d.className = 'confetti';
    d.style.left = Math.random() * 100 + 'vw';
    d.style.background = colors[i % colors.length];
    d.style.animationDuration = 2 + Math.random() * 2 + 's';
    d.style.animationDelay = Math.random() * 0.5 + 's';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 5000);
  }
}

main();
