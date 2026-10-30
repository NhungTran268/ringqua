// 4 mẫu game. Mỗi game nhận: el (khung chứa), prizes, theme, và play() -> Promise<result>.
// Kết quả luôn do server quyết định trước, game chỉ là hiệu ứng hiển thị kết quả đó.

const LOSE = { id: null, name: 'Chúc may mắn', lose: true };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function renderGame(type, el, opts) {
  const fn = { wheel, flip, scratch, giftbox }[type] || wheel;
  el.innerHTML = '';
  el.className = `game game-${type}`;
  return fn(el, opts);
}

// ---------- Vòng quay ----------
function wheelSegments(prizes) {
  const segs = [];
  prizes.forEach((p, i) => {
    segs.push(p);
    if (prizes.length <= 3 || i % 2 === 1) segs.push(LOSE);
  });
  if (!segs.some((s) => s.lose)) segs.push(LOSE);
  while (segs.length < 6) segs.push(segs.length % 2 || !prizes.length ? LOSE : prizes[segs.length % prizes.length]);
  return segs;
}

function wheel(el, { prizes, theme, play }) {
  const segs = wheelSegments(prizes);
  const size = 340;
  el.innerHTML = `
    <div class="wheel-wrap">
      <div class="wheel-pointer"></div>
      <canvas width="${size * 2}" height="${size * 2}" style="width:${size}px;height:${size}px"></canvas>
      <button class="wheel-center" type="button">QUAY</button>
    </div>`;
  const canvas = el.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const r = size, n = segs.length, a = (2 * Math.PI) / n;
  const colors = [theme.primaryColor, '#ffffff'];
  ctx.translate(r, r);
  for (let i = 0; i < n; i++) {
    const start = -Math.PI / 2 + i * a;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r - 14, start, start + a);
    ctx.closePath();
    const fill = segs[i].lose ? '#f4f5f8' : i % 4 === 0 ? theme.primaryColor : i % 4 === 2 ? (theme.accent || '#ffd25e') : '#ffffff';
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.save();
    ctx.rotate(start + a / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = segs[i].lose ? '#667085' : isDark(fill) ? '#ffffff' : '#1d2433';
    ctx.font = '600 26px "Be Vietnam Pro", sans-serif';
    wrapText(ctx, segs[i].name, r - 44, 0, r * 0.62, 28);
    ctx.restore();
  }
  // viền
  ctx.beginPath();
  ctx.arc(0, 0, r - 7, 0, Math.PI * 2);
  ctx.lineWidth = 14;
  ctx.strokeStyle = theme.primaryColor;
  ctx.stroke();
  for (let i = 0; i < n * 2; i++) {
    const ang = (i / (n * 2)) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(ang) * (r - 7), Math.sin(ang) * (r - 7), 4, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? '#fff' : '#ffe08a';
    ctx.fill();
  }

  let rotation = 0;
  let busy = false;
  const btn = el.querySelector('.wheel-center');
  btn.style.background = theme.primaryColor;
  btn.onclick = async () => {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    try {
      const res = await play();
      if (!res) return;
      const match = (fn) => segs.map((s, i) => (fn(s) ? i : -1)).filter((i) => i >= 0);
      let options = res.win ? match((s) => s.id === res.prizeId) : [];
      if (!options.length) options = match((s) => s.lose);
      const idx = options[Math.floor(Math.random() * options.length)];
      const deg = 360 / n;
      const jitter = (Math.random() - 0.5) * deg * 0.6;
      const target = 360 - (idx + 0.5) * deg + jitter;
      rotation += 360 * 6 + ((target - (rotation % 360)) + 360) % 360;
      canvas.style.transition = 'transform 5s cubic-bezier(.17,.67,.12,1)';
      canvas.style.transform = `rotate(${rotation}deg)`;
      await sleep(5200);
      res.show();
    } finally {
      busy = false;
      btn.disabled = false;
    }
  };
}
function isDark(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 < 150;
}
function wrapText(ctx, text, x, y, maxW, lh) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  lines.push(line);
  const shown = lines.slice(0, 2);
  const start = y - ((shown.length - 1) * lh) / 2 + 9;
  shown.forEach((l, i) => ctx.fillText(l, x, start + i * lh));
}

// ---------- Lật thẻ ----------
function flip(el, { prizes, theme, play }) {
  const N = 9;
  el.innerHTML = `<p class="game-hint">Chọn 1 thẻ bất kỳ để lật</p><div class="flip-grid"></div>`;
  const grid = el.querySelector('.flip-grid');
  const reset = () => {
    grid.innerHTML = Array.from({ length: N }, (_, i) => `
      <button class="flip-card" type="button" data-i="${i}">
        <div class="flip-inner">
          <div class="flip-front" style="background:${theme.primaryColor}"><span>?</span></div>
          <div class="flip-back"></div>
        </div>
      </button>`).join('');
  };
  reset();
  let busy = false;
  grid.onclick = async (e) => {
    const card = e.target.closest('.flip-card');
    if (!card || busy || card.classList.contains('flipped')) return;
    busy = true;
    try {
      const res = await play();
      if (!res) return;
      card.querySelector('.flip-back').innerHTML = cardFace(res.win ? { name: res.prize, imageUrl: res.imageUrl } : LOSE, true);
      card.classList.add('flipped', res.win ? 'win' : 'lose');
      await sleep(900);
      const decoys = shuffle([...prizes, ...prizes, LOSE, LOSE, LOSE, LOSE]);
      grid.querySelectorAll('.flip-card:not(.flipped)').forEach((c, i) => {
        c.querySelector('.flip-back').innerHTML = cardFace(decoys[i % decoys.length]);
        c.classList.add('flipped', 'dim');
      });
      await sleep(900);
      res.show(() => reset());
    } finally {
      busy = false;
    }
  };
}
const cardFace = (p, mine) => `
  ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="">` : `<div class="face-icon">${p.lose ? '🍀' : '🎁'}</div>`}
  <div class="face-name">${esc(p.name)}</div>`;

// ---------- Cào trúng thưởng ----------
function scratch(el, { theme, play }) {
  const W = 320, H = 190;
  const start = () => {
    el.innerHTML = `
      <div class="scratch-card" style="width:${W}px;height:${H}px">
        <div class="scratch-under"><div class="face-icon">🎟️</div><div class="face-name">Nhấn để nhận thẻ cào</div></div>
        <canvas width="${W * 2}" height="${H * 2}" style="width:${W}px;height:${H}px"></canvas>
      </div>
      <button class="btn scratch-btn" type="button" style="background:${theme.primaryColor}">Nhận thẻ cào</button>
      <p class="game-hint scratch-hint" hidden>Dùng ngón tay hoặc chuột cào lớp phủ bạc</p>`;
    const canvas = el.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, W * 2, H * 2);
    g.addColorStop(0, '#b9bec9'); g.addColorStop(.5, '#e6e8ee'); g.addColorStop(1, '#a9afbb');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W * 2, H * 2);
    ctx.fillStyle = '#6b7280';
    ctx.font = '700 34px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CÀO ĐỂ XEM QUÀ', W, H + 12);
    const btn = el.querySelector('.scratch-btn');
    let ready = false, done = false, res = null, drawing = false;
    btn.onclick = async () => {
      btn.disabled = true;
      res = await play();
      if (!res) { btn.disabled = false; return; }
      el.querySelector('.scratch-under').innerHTML = cardFace(res.win ? { name: res.prize, imageUrl: res.imageUrl } : LOSE);
      el.querySelector('.scratch-under').classList.add(res.win ? 'win' : 'lose');
      btn.hidden = true;
      el.querySelector('.scratch-hint').hidden = false;
      ready = true;
    };
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return [(t.clientX - r.left) * 2, (t.clientY - r.top) * 2];
    };
    const scratchAt = (e) => {
      if (!ready || done || !drawing) return;
      e.preventDefault();
      const [x, y] = pos(e);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, 36, 0, Math.PI * 2);
      ctx.fill();
      checkCleared();
    };
    let checks = 0;
    const checkCleared = () => {
      if (++checks % 6) return;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let clear = 0;
      for (let i = 3; i < data.length; i += 64) if (data[i] === 0) clear++;
      if (clear / (data.length / 64) > 0.45) finish();
    };
    const finish = async () => {
      if (done) return;
      done = true;
      canvas.style.transition = 'opacity .5s';
      canvas.style.opacity = '0';
      await sleep(600);
      res.show(start);
    };
    canvas.addEventListener('pointerdown', (e) => { if (!ready) return btn.click(); drawing = true; canvas.setPointerCapture(e.pointerId); scratchAt(e); });
    canvas.addEventListener('pointermove', scratchAt);
    canvas.addEventListener('pointerup', () => (drawing = false));
    canvas.style.touchAction = 'none';
  };
  start();
}

// ---------- Hộp quà ----------
function giftbox(el, { theme, play }) {
  const N = 6;
  const palette = [theme.primaryColor, '#ffb320', '#7c5cff', '#16a3a3', '#ff7ab6', '#3b82f6'];
  const reset = () => {
    el.innerHTML = `<p class="game-hint">Chọn 1 hộp quà may mắn</p><div class="box-grid">${Array.from({ length: N }, (_, i) => `
      <button class="gift" type="button" style="--c:${palette[i % palette.length]}">
        <div class="gift-lid"><span class="bow"></span></div>
        <div class="gift-body"></div>
        <div class="gift-prize"></div>
      </button>`).join('')}</div>`;
  };
  reset();
  let busy = false;
  el.onclick = async (e) => {
    const box = e.target.closest('.gift');
    if (!box || busy || box.classList.contains('open')) return;
    busy = true;
    try {
      box.classList.add('shake');
      const [res] = await Promise.all([play(), sleep(900)]);
      box.classList.remove('shake');
      if (!res) return;
      box.querySelector('.gift-prize').innerHTML = cardFace(res.win ? { name: res.prize, imageUrl: res.imageUrl } : LOSE);
      box.classList.add('open', res.win ? 'win' : 'lose');
      el.querySelectorAll('.gift:not(.open)').forEach((b) => b.classList.add('dim'));
      await sleep(1300);
      res.show(reset);
    } finally {
      busy = false;
    }
  };
}
