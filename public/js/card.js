// Draws the shareable progress card: a celebration on good progress, an uplifting one otherwise.
const MOTIVATE = [
  ['Every healthy choice', 'is a vote for who you are becoming.'],
  ['Progress is not a straight line.', 'You showed up. That counts.'],
  ['Small steps, repeated,', 'beat big plans abandoned.'],
  ['Be patient with yourself.', 'Your future self is already proud.'],
  ['One good day', 'at a time. Today is a fresh start.']
];

function rng(seed) { let s = seed * 2654435761 % 2 ** 32 || 1; return () => (s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32; }
function rounded(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

export async function drawCard(photoUrl, { mood, delta, name, date, id = 1 }) {
  const W = 1080, H = 1350;
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = c.getContext('2d');
  const rand = rng(id + 7);
  const celebrate = mood === 'celebrate';
  const g = ctx.createLinearGradient(0, 0, W, H);
  (celebrate ? [[0, '#ffb347'], [.5, '#ff5e7e'], [1, '#7b5cff']] : [[0, '#ffd89b'], [.55, '#ff9a8b'], [1, '#6a82fb']]).forEach(([o, col]) => g.addColorStop(o, col));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  if (celebrate) { // confetti
    const cols = ['#fff', '#ffe066', '#7cf7c8', '#8ecbff', '#ff9ec4'];
    for (let i = 0; i < 90; i++) {
      ctx.save(); ctx.translate(rand() * W, rand() * H); ctx.rotate(rand() * 6.28);
      ctx.fillStyle = cols[i % cols.length]; ctx.globalAlpha = 0.55 + rand() * 0.45;
      if (i % 3) ctx.fillRect(-9, -4, 18, 8); else { ctx.beginPath(); ctx.arc(0, 0, 6, 0, 6.28); ctx.fill(); }
      ctx.restore();
    }
  } else { // soft sun
    const sun = ctx.createRadialGradient(W * .8, H * .12, 20, W * .8, H * .12, 520);
    sun.addColorStop(0, 'rgba(255,255,255,.75)'); sun.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
  }

  const img = await loadImg(photoUrl);
  const pw = 780, ph = 880, px = (W - pw) / 2, py = 150;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
  ctx.fillStyle = '#fff'; rounded(ctx, px - 14, py - 14, pw + 28, ph + 28, 44); ctx.fill(); ctx.restore();
  ctx.save(); rounded(ctx, px, py, pw, ph, 32); ctx.clip();
  const k = Math.max(pw / img.width, ph / img.height);
  ctx.drawImage(img, px + (pw - img.width * k) / 2, py + (ph - img.height * k) / 2, img.width * k, img.height * k);
  ctx.restore();

  ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 14;
  ctx.font = '600 34px -apple-system, "SF Pro Text", Helvetica, Arial, sans-serif';
  ctx.fillText(`${name} · ${date}`.toUpperCase(), W / 2, 92);
  if (celebrate) {
    ctx.font = '800 92px -apple-system, "SF Pro Display", Helvetica, Arial, sans-serif';
    const amount = delta != null && Math.abs(delta) >= 0.1 ? `${delta > 0 ? '+' : '−'}${Math.abs(delta)} kg` : 'Goal on track';
    ctx.fillText(amount, W / 2, 1150);
    ctx.font = '500 44px -apple-system, Helvetica, Arial, sans-serif';
    ctx.fillText('Progress worth celebrating 🎉', W / 2, 1218);
  } else {
    const [a, b] = MOTIVATE[id % MOTIVATE.length];
    ctx.font = '700 58px -apple-system, "SF Pro Display", Helvetica, Arial, sans-serif';
    ctx.fillText(a, W / 2, 1140);
    ctx.font = '500 48px -apple-system, Helvetica, Arial, sans-serif';
    ctx.fillText(b, W / 2, 1210);
  }
  ctx.shadowBlur = 0; ctx.globalAlpha = .85; ctx.font = '600 30px -apple-system, Helvetica, Arial, sans-serif';
  ctx.fillText('YourCalories', W / 2, 1292);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

export async function shareOrSave(blob, filename, text) {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'saved';
}
