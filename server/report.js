import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { DATA_DIR, all, get, run } from './db.js';
import { PARAMS, addDays, checkinStatus, computePoints, daysBetween, localDate } from './logic.js';
import { notify } from './push.js';

const C = { ink: '#1d1d1f', mute: '#6e6e73', line: '#d2d2d7', blue: '#0071e3', green: '#30a14e', orange: '#ff9f0a', bg: '#f5f5f7' };
const fmt = (n, d = 1) => (n == null ? '—' : Number(n).toFixed(d).replace(/\.0+$/, ''));

function collect(member, trainer, start, end) {
  const goal = get('SELECT * FROM goals WHERE member_id = ?', member.id);
  const link = get('SELECT * FROM links WHERE member_id = ?', member.id);
  const meas = all('SELECT * FROM measurements WHERE member_id = ? AND date BETWEEN ? AND ? ORDER BY date', member.id, start, end);
  const meals = all('SELECT date, SUM(kcal) kcal, SUM(protein) p, SUM(carbs) c, SUM(fat) f, COUNT(*) n FROM meals WHERE member_id = ? AND date BETWEEN ? AND ? GROUP BY date', member.id, start, end);
  const workouts = all('SELECT * FROM workouts WHERE member_id = ? AND date BETWEEN ? AND ?', member.id, start, end);
  const span = daysBetween(start, end) + 1;
  const avg = (k) => (meals.length ? meals.reduce((s, m) => s + m[k], 0) / meals.length : null);
  const target = goal?.calories;
  const adherent = target ? meals.filter((m) => m.n >= 2 && m.kcal >= target * 0.85 && m.kcal <= target * 1.1).length : null;
  return { goal, link, meas, span, daysLogged: meals.length, avgKcal: avg('kcal'), avgP: avg('p'), avgC: avg('c'), avgF: avg('f'), adherent, workouts, member, trainer, start, end };
}

function heading(doc, text) {
  doc.moveDown(0.9).font('Helvetica-Bold').fontSize(13).fillColor(C.ink).text(text);
  doc.moveTo(doc.x, doc.y + 3).lineTo(doc.page.width - doc.page.margins.right, doc.y + 3).strokeColor(C.line).lineWidth(0.6).stroke();
  doc.moveDown(0.6).font('Helvetica').fontSize(10).fillColor(C.ink);
}

function tile(doc, x, y, w, label, value, sub, color = C.blue) {
  doc.roundedRect(x, y, w, 64, 10).fillColor(C.bg).fill();
  doc.fillColor(C.mute).font('Helvetica').fontSize(8.5).text(label.toUpperCase(), x + 12, y + 10, { width: w - 24, characterSpacing: 0.4 });
  doc.fillColor(color).font('Helvetica-Bold').fontSize(20).text(value, x + 12, y + 24, { width: w - 24 });
  if (sub) doc.fillColor(C.mute).font('Helvetica').fontSize(8.5).text(sub, x + 12, y + 48, { width: w - 24 });
}

function weightChart(doc, series, goal, x, y, w, h) {
  doc.roundedRect(x, y, w, h, 10).fillColor(C.bg).fill();
  if (series.length < 2) {
    doc.fillColor(C.mute).fontSize(10).text('Not enough weight entries to draw a trend.', x, y + h / 2 - 5, { width: w, align: 'center' });
    return;
  }
  const pad = 26;
  const vals = series.map((s) => s.v).concat(goal?.target_weight ?? []);
  const lo = Math.min(...vals) - 1, hi = Math.max(...vals) + 1;
  const t0 = Date.parse(series[0].d), t1 = Date.parse(series.at(-1).d) || t0 + 1;
  const px = (d) => x + pad + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (w - pad * 2);
  const py = (v) => y + h - pad + ((lo - v) / (hi - lo)) * (h - pad * 2);
  if (goal?.target_weight) {
    doc.dash(3, { space: 3 }).moveTo(x + pad, py(goal.target_weight)).lineTo(x + w - pad, py(goal.target_weight)).strokeColor(C.green).lineWidth(0.8).stroke().undash();
    doc.fillColor(C.green).fontSize(8).text(`Goal ${fmt(goal.target_weight)} kg`, x + pad, py(goal.target_weight) - 11);
  }
  doc.lineWidth(2).strokeColor(C.blue);
  series.forEach((s, i) => (i ? doc.lineTo(px(s.d), py(s.v)) : doc.moveTo(px(s.d), py(s.v))));
  doc.stroke();
  series.forEach((s) => doc.circle(px(s.d), py(s.v), 2.8).fillColor(C.blue).fill());
  doc.fillColor(C.mute).fontSize(8);
  doc.text(`${fmt(series[0].v)} kg`, px(series[0].d) - 4, py(series[0].v) + 6);
  doc.text(`${fmt(series.at(-1).v)} kg`, px(series.at(-1).d) - 24, py(series.at(-1).v) - 14);
  doc.text(series[0].d, x + pad, y + h - 16);
  doc.text(series.at(-1).d, x + w - pad - 50, y + h - 16);
}

export function renderReport(member, trainer, start, end, file) {
  const r = collect(member, trainer, start, end);
  const pts = computePoints(member.id, end);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Health report – ${member.name}`, Author: 'YourCalories' } });
    const out = createWriteStream(file);
    out.on('finish', resolve).on('error', reject);
    doc.pipe(out);
    const W = doc.page.width - 96;

    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.blue).text('YOURCALORIES · MONTHLY HEALTH REPORT', { characterSpacing: 0.8 });
    doc.moveDown(0.3).fontSize(26).fillColor(C.ink).text(member.name);
    doc.font('Helvetica').fontSize(10.5).fillColor(C.mute)
      .text(`${start} to ${end}  ·  prepared for coach ${trainer.name}  ·  generated ${localDate()}`);

    // headline tiles
    const w = (W - 24) / 3, y0 = doc.y + 14;
    const first = r.meas.find((m) => m.weight != null), last = [...r.meas].reverse().find((m) => m.weight != null);
    const dW = first && last ? last.weight - first.weight : null;
    const good = r.goal && dW != null ? (r.goal.type === 'lose' ? dW < 0 : r.goal.type === 'gain' ? dW > 0 : Math.abs(dW) <= 1) : null;
    tile(doc, 48, y0, w, 'Weight change', dW == null ? '—' : `${dW > 0 ? '+' : ''}${fmt(dW)} kg`, last ? `now ${fmt(last.weight)} kg` : '', good == null ? C.ink : good ? C.green : C.orange);
    tile(doc, 48 + w + 12, y0, w, 'Days logged', `${r.daysLogged} / ${r.span}`, r.adherent != null ? `${r.adherent} days on calorie target` : '');
    tile(doc, 48 + (w + 12) * 2, y0, w, 'Points', String(pts.total), `${pts.level} · ${pts.streak}-day streak`, C.orange);
    doc.y = y0 + 80;

    heading(doc, 'Plan');
    if (r.goal) {
      const g = r.goal;
      doc.text(`Goal: ${g.type === 'lose' ? 'Lose weight' : g.type === 'gain' ? 'Gain weight' : 'Maintain weight'}${g.target_weight ? ` — ${fmt(g.start_weight)} kg → ${fmt(g.target_weight)} kg` : ''}${g.target_date ? ` by ${g.target_date}` : ''}`);
      doc.text(`Daily targets: ${g.calories} kcal · protein ${g.protein_g ?? '—'} g · carbs ${g.carbs_g ?? '—'} g · fat ${g.fat_g ?? '—'} g · ${g.workouts_per_week} workouts / week`);
      doc.fillColor(C.mute).text(`Plan set by ${g.set_by === 'trainer' ? 'coach' : 'member'}.`).fillColor(C.ink);
    } else doc.text('No goal set.');

    heading(doc, 'Weight trend');
    const cy = doc.y;
    weightChart(doc, r.meas.filter((m) => m.weight != null).map((m) => ({ d: m.date, v: m.weight })), r.goal, 48, cy, W, 140);
    doc.y = cy + 152;

    heading(doc, 'Body measurements');
    const rows = Object.keys(PARAMS).filter((k) => k !== 'photo');
    const colX = [48, 200, 290, 380, 470];
    doc.font('Helvetica-Bold').fillColor(C.mute).fontSize(9);
    const ty = doc.y;
    ['Measure', 'Start', 'End', 'Change'].forEach((t, i) => doc.text(t, colX[i], ty, { width: 80 }));
    doc.font('Helvetica').fillColor(C.ink).fontSize(10);
    doc.y = ty + 16;
    const required = JSON.parse(r.link?.required_params || '[]');
    for (const k of rows) {
      const vals = r.meas.filter((m) => m[k] != null).map((m) => m[k]);
      if (!vals.length && !required.includes(k)) continue;
      const ry = doc.y;
      doc.text(`${PARAMS[k].label}${required.includes(k) ? ' *' : ''}`, colX[0], ry, { width: 140 });
      doc.text(vals.length ? `${fmt(vals[0])} ${PARAMS[k].unit}` : '—', colX[1], ry, { width: 80 });
      doc.text(vals.length ? `${fmt(vals.at(-1))} ${PARAMS[k].unit}` : '—', colX[2], ry, { width: 80 });
      const ch = vals.length > 1 ? vals.at(-1) - vals[0] : null;
      doc.text(ch == null ? '—' : `${ch > 0 ? '+' : ''}${fmt(ch)}`, colX[3], ry, { width: 80 });
      doc.y = ry + 16;
    }
    doc.fillColor(C.mute).fontSize(8.5).text('* mandatory parameter requested by your coach', 48, doc.y + 2).fillColor(C.ink).fontSize(10);

    heading(doc, 'Nutrition');
    const t = r.goal?.calories;
    doc.text(`Average intake on logged days: ${fmt(r.avgKcal, 0)} kcal${t ? ` (target ${t}${r.avgKcal ? `, ${r.avgKcal > t ? '+' : ''}${Math.round(((r.avgKcal - t) / t) * 100)}%` : ''})` : ''}`);
    doc.text(`Average macros: protein ${fmt(r.avgP, 0)} g · carbs ${fmt(r.avgC, 0)} g · fat ${fmt(r.avgF, 0)} g`);
    doc.text(`Logging consistency: ${r.daysLogged} of ${r.span} days (${Math.round((r.daysLogged / r.span) * 100)}%)`);

    heading(doc, 'Training');
    const mins = r.workouts.reduce((s, x) => s + x.minutes, 0);
    const perWeek = r.workouts.length / (r.span / 7);
    doc.text(`${r.workouts.length} sessions · ${mins} minutes · ${fmt(perWeek)} per week${r.goal ? ` (target ${r.goal.workouts_per_week})` : ''}`);
    const byType = {};
    r.workouts.forEach((x) => { byType[x.type] = (byType[x.type] || 0) + 1; });
    if (r.workouts.length) doc.fillColor(C.mute).text(Object.entries(byType).map(([k, v]) => `${k} ×${v}`).join('  ·  ')).fillColor(C.ink);

    doc.fontSize(8).fillColor(C.mute).text('Calorie and macro values are estimates from the member\'s own logs. This report is a coaching aid, not medical advice.', 48, doc.page.height - 72, { width: W });
    doc.end();
  });
}

/** Generates the monthly report once all mandatory parameters for the cycle are in. */
export async function tryGenerateReport(memberId, today) {
  const st = checkinStatus(memberId, today);
  if (!st?.ready) return null;
  if (get('SELECT 1 FROM reports WHERE member_id = ? AND period_end >= ?', memberId, today)) return null; // one report per day at most
  const member = get('SELECT * FROM users WHERE id = ?', memberId);
  const link = get('SELECT * FROM links WHERE member_id = ?', memberId);
  const trainer = get('SELECT * FROM users WHERE id = ?', link.trainer_id);
  const file = `${memberId}-${today}-${Date.now()}.pdf`;
  await renderReport(member, trainer, link.cycle_start, today, path.join(DATA_DIR, 'reports', file));
  const info = run('INSERT INTO reports (member_id, trainer_id, period_start, period_end, file) VALUES (?,?,?,?,?)', memberId, trainer.id, link.cycle_start, today, file);
  run('UPDATE links SET cycle_start = ? WHERE member_id = ?', today, memberId);
  const id = Number(info.lastInsertRowid);
  await notify(trainer.id, {
    kind: 'report', title: `Monthly report ready — ${member.name}`,
    body: `${member.name} completed every mandatory check-in. Their PDF health report (${link.cycle_start} → ${today}) is ready.`,
    payload: { report_id: id, member_id: memberId }
  });
  await notify(memberId, { kind: 'report', title: 'Your monthly report was sent', body: `${trainer.name} now has your health report for ${link.cycle_start} → ${today}.`, payload: { report_id: id } });
  return id;
}
