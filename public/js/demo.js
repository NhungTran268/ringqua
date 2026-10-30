// Trang chơi thử: chạy hoàn toàn trên trình duyệt, không ghi dữ liệu, không trừ quà.
import { renderGame } from './games.js';

const GAMES = {
  wheel: { name: 'Vòng quay may mắn', icon: '🎡', desc: 'Bấm QUAY và xem vận may của bạn hôm nay!' },
  flip: { name: 'Lật thẻ trúng quà', icon: '🃏', desc: 'Chọn 1 trong 9 thẻ bí ẩn – quà gì đang chờ bạn?' },
  scratch: { name: 'Cào trúng thưởng', icon: '🎟️', desc: 'Nhận thẻ rồi dùng ngón tay cào lớp bạc để xem quà.' },
  giftbox: { name: 'Mở hộp quà', icon: '🎁', desc: 'Chọn một hộp quà may mắn và mở ra nhé!' },
};
const PRIZES = [
  { id: 'p1', name: 'Voucher 50.000đ', chance: 15 },
  { id: 'p2', name: 'Voucher 20.000đ', chance: 25 },
  { id: 'p3', name: 'Freeship', chance: 25 },
  { id: 'p4', name: 'Ly nước miễn phí', chance: 10 },
];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const type = location.pathname.split('/')[2] in GAMES ? location.pathname.split('/')[2] : 'wheel';
const g = GAMES[type];
document.title = `Chơi thử ${g.name} – RinhQuà`;
document.getElementById('title').textContent = g.name;
document.getElementById('desc').textContent = g.desc;
document.getElementById('cta').href = `/app#/register?game=${type}`;
document.getElementById('switcher').innerHTML = Object.entries(GAMES)
  .map(([k, v]) => `<a href="/demo/${k}" class="${k === type ? 'on' : ''}">${v.icon} ${v.name}</a>`).join('');
document.getElementById('prizes').innerHTML = PRIZES
  .map((p) => `<div class="prize-item"><span class="ic">🎁</span><span>${esc(p.name)}</span></div>`).join('');

function fakeCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => A[Math.floor(Math.random() * A.length)]).join('');
}

async function play() {
  await new Promise((r) => setTimeout(r, 250));
  const roll = Math.random() * 100;
  let acc = 0, won = null;
  for (const p of PRIZES) { acc += p.chance; if (roll < acc) { won = p; break; } }
  const res = { win: !!won, prizeId: won?.id || null, prize: won?.name || null, imageUrl: '', code: won ? fakeCode() : null };
  return { ...res, show: (again) => showResult(res, again) };
}

function showResult(res, again) {
  if (res.win) confetti();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <div class="emoji">${res.win ? '🎉' : '🍀'}</div>
    <h2>${res.win ? 'Chúc mừng bạn đã trúng' : 'Chúc bạn may mắn lần sau!'}</h2>
    ${res.win ? `<div class="prize-name">${esc(res.prize)}</div>
      <div class="code-box"><small>Mã nhận quà (bản chơi thử)</small><strong>${esc(res.code)}</strong></div>
      <p class="muted" style="font-size:13px">Đây là bản chơi thử – quà và mã chỉ để minh hoạ. Khách của bạn sẽ nhận mã thật để đổi quà tại cửa hàng.</p>` : ''}
    <div class="actions">
      <button class="btn" data-a="again">Chơi lại</button>
      <a class="btn ghost" href="/app#/register?game=${type}">Tạo game này cho cửa hàng tôi</a>
    </div></div>`;
  document.body.appendChild(bg);
  bg.onclick = (e) => {
    if (e.target.dataset.a === 'again' || e.target === bg) { bg.remove(); again?.(); }
  };
}

function confetti() {
  const colors = ['#ff4d3d', '#ffb320', '#7c5cff', '#16a3a3', '#ff7ab6'];
  for (let i = 0; i < 80; i++) {
    const d = document.createElement('div');
    d.className = 'confetti';
    d.style.left = Math.random() * 100 + 'vw';
    d.style.background = colors[i % colors.length];
    d.style.animationDuration = 2 + Math.random() * 2 + 's';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 5000);
  }
}

renderGame(type, document.getElementById('game'), {
  prizes: PRIZES,
  theme: { primaryColor: '#ff4d3d', accent: '#ffd25e' },
  play,
});
