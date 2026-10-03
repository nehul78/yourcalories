// Tiny UI toolkit: escaped templates, sheets, toasts, rings, charts.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
class Raw { constructor(s) { this.s = s; } }
export const raw = (s) => new Raw(s);
const part = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(part).join('') : v === false || v == null ? '' : esc(v));
/** Tagged template: interpolated values are HTML-escaped unless wrapped in raw() or produced by h``. */
export const h = (strings, ...vals) => raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? part(vals[i]) : ''), ''));
export const render = (el, tpl) => { el.innerHTML = tpl.s; };
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Delegated click handling: <button data-act="name" data-id="1"> -> handlers.name(el, event). */
export function bind(root, handlers) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (el && root.contains(el) && handlers[el.dataset.act]) handlers[el.dataset.act](el, e);
  });
}

export function toast(msg) {
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

let sheetEl;
export function sheet(content, { onClose } = {}) {
  closeSheet();
  const scrim = Object.assign(document.createElement('div'), { className: 'scrim' });
  const el = Object.assign(document.createElement('div'), { className: 'sheet' });
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  render(el, content);
  scrim.onclick = () => closeSheet();
  document.body.append(scrim, el);
  sheetEl = { el, scrim, onClose };
  return el;
}
export function closeSheet() {
  if (!sheetEl) return;
  sheetEl.el.remove(); sheetEl.scrim.remove(); sheetEl.onClose?.();
  sheetEl = null;
}
export const fmtN = (n, d = 0) => (n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d }));
export const fmtDate = (d, opts = { month: 'short', day: 'numeric' }) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, opts);

export function ring(value, goal, color = 'var(--blue)', size = 132, stroke = 14) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const p = goal ? Math.min(1, value / goal) : 0;
  const over = goal && value > goal * 1.1;
  return raw(`<svg width="${size}" height="${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--fill)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${over ? 'var(--orange)' : color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" style="transition:stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)"/></svg>`);
}

/** Minimal line chart for a [{date, v}] series with an optional goal line. */
export function lineChart(series, goal) {
  if (series.length < 2) return raw('<div class="empty">Log your weight on two different days to see a trend.</div>');
  const W = 520, H = 190, pad = 28;
  const vals = series.map((s) => s.v).concat(goal ?? []);
  const lo = Math.min(...vals) - 1, hi = Math.max(...vals) + 1;
  const t0 = Date.parse(series[0].date), t1 = Date.parse(series.at(-1).date);
  const x = (d) => pad + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - pad * 2);
  const y = (v) => H - pad - ((v - lo) / (hi - lo)) * (H - pad * 2);
  const path = series.map((s, i) => `${i ? 'L' : 'M'}${x(s.date).toFixed(1)},${y(s.v).toFixed(1)}`).join('');
  const last = series.at(-1);
  return raw(`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight trend">
    ${goal ? `<line x1="${pad}" x2="${W - pad}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--green)" stroke-dasharray="4 5"/><text x="${pad}" y="${y(goal) - 6}" fill="var(--green)" font-size="12">Goal ${goal}</text>` : ''}
    <path d="${path}" fill="none" stroke="var(--blue)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    ${series.map((s) => `<circle cx="${x(s.date)}" cy="${y(s.v)}" r="4" fill="var(--blue)"/>`).join('')}
    <text x="${x(last.date) - 4}" y="${y(last.v) - 10}" text-anchor="end" fill="var(--ink)" font-size="13" font-weight="600">${last.v}</text>
    <text x="${pad}" y="${H - 6}" fill="var(--mute)" font-size="11">${fmtDate(series[0].date)}</text>
    <text x="${W - pad}" y="${H - 6}" fill="var(--mute)" text-anchor="end" font-size="11">${fmtDate(last.date)}</text></svg>`);
}

export const icons = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
  coach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M17 6.5a3 3 0 0 1 0 5.5M18.5 14.8c1.8.6 3 2.2 3.3 4.7"/></svg>',
  me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.2 4-6 8-6s7.2 1.8 8 6"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21a2 2 0 0 0 4 0"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.5c2.5 0 4.2 1.4 4.6 4.5"/></svg>'
};

/** Downscale a user photo to a JPEG data URL (keeps uploads small and strips EXIF). */
export async function photoToDataUrl(file, max = 1200) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

/** Mounts a fresh container in root so each screen has its own event listeners. */
export function mount(root) {
  const div = Object.assign(document.createElement('div'), { className: 'enter' });
  root.replaceChildren(div);
  window.scrollTo(0, 0);
  return div;
}
