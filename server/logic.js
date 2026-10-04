import crypto from 'node:crypto';
import { all, get, run } from './db.js';

export const CYCLE_DAYS = Number(process.env.CYCLE_DAYS || 30);
export const PARAMS = {
  weight: { label: 'Weight', unit: 'kg' },
  waist: { label: 'Waist', unit: 'cm' },
  chest: { label: 'Chest', unit: 'cm' },
  hips: { label: 'Hips', unit: 'cm' },
  arm: { label: 'Arm', unit: 'cm' },
  thigh: { label: 'Thigh', unit: 'cm' },
  body_fat: { label: 'Body fat', unit: '%' },
  resting_hr: { label: 'Resting heart rate', unit: 'bpm' },
  photo: { label: 'Progress photo', unit: '' }
};

/* ---------- auth ---------- */
export const hashPassword = (pw, salt = crypto.randomBytes(16).toString('hex')) =>
  ({ salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') });
export const checkPassword = (pw, user) => {
  const { hash } = hashPassword(pw, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.pass_hash, 'hex'));
};
export const newToken = () => crypto.randomBytes(32).toString('hex');
export const newInviteCode = async () => {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (;;) {
    const code = Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
    if (!await get('SELECT 1 FROM users WHERE invite_code = ?', code)) return code;
  }
};

/* ---------- dates (all dates are the user's local calendar days, YYYY-MM-DD) ---------- */
export const localDate = (tzOffsetMin = 0, now = Date.now()) =>
  new Date(now - tzOffsetMin * 60000).toISOString().slice(0, 10);
export const localMinutes = (tzOffsetMin = 0, now = Date.now()) => {
  const d = new Date(now - tzOffsetMin * 60000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
export const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
// The rule that powers the points system: you can log for today and yesterday, nothing older.
export const loggable = (date, today) => date === today || date === addDays(today, -1);

/* ---------- plan suggestions ---------- */
const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
export function suggestPlan({ sex, birth_year, height_cm, weight, activity = 'light', type = 'maintain', target_weight, target_date }, today) {
  const age = birth_year ? Number(today.slice(0, 4)) - birth_year : 30;
  const base = 10 * weight + 6.25 * height_cm - 5 * age + (sex === 'male' ? 5 : sex === 'female' ? -161 : -78);
  const tdee = base * (ACTIVITY[activity] || 1.375);
  let delta = type === 'lose' ? -500 : type === 'gain' ? 300 : 0;
  if (target_date && target_weight && type !== 'maintain') {
    const days = Math.max(14, daysBetween(today, target_date));
    const perDay = ((target_weight - weight) * 7700) / days;
    delta = Math.max(-900, Math.min(600, perDay));
  }
  const calories = Math.round(Math.max(1200, tdee + delta) / 10) * 10;
  const protein_g = Math.round(weight * (type === 'maintain' ? 1.4 : 1.8));
  const fat_g = Math.round((calories * 0.27) / 9);
  const carbs_g = Math.max(0, Math.round((calories - protein_g * 4 - fat_g * 9) / 4));
  return { calories, protein_g, carbs_g, fat_g, tdee: Math.round(tdee) };
}

/* ---------- daily data ---------- */
export async function daySummary(memberId, date) {
  const meals = await all('SELECT * FROM meals WHERE member_id = ? AND date = ? ORDER BY created_at, id', memberId, date);
  const workouts = await all('SELECT * FROM workouts WHERE member_id = ? AND date = ? ORDER BY id', memberId, date);
  const sum = (k) => Math.round(meals.reduce((s, m) => s + (m[k] || 0), 0));
  return {
    date, meals, workouts,
    kcal: sum('kcal'), protein: sum('protein'), carbs: sum('carbs'), fat: sum('fat'),
    burned: workouts.reduce((s, w) => s + (w.kcal_burned || 0), 0),
    workout_minutes: workouts.reduce((s, w) => s + w.minutes, 0)
  };
}

/* ---------- points ---------- */
export const LEVELS = ['Beginner', 'Steady', 'Consistent', 'Dedicated', 'Athlete', 'Champion', 'Legend'];
export async function computePoints(memberId, today) {
  const goal = await get('SELECT * FROM goals WHERE member_id = ?', memberId);
  const days = new Map();
  const day = (d) => days.get(d) || days.set(d, { meals: [], workouts: [], kcal: 0, extra: 0 }).get(d);
  for (const m of await all('SELECT date, kcal, late FROM meals WHERE member_id = ?', memberId)) {
    const e = day(m.date); e.meals.push(m.late); e.kcal += m.kcal;
  }
  for (const w of await all('SELECT date, late FROM workouts WHERE member_id = ?', memberId)) day(w.date).workouts.push(w.late);
  for (const m of await all('SELECT date FROM measurements WHERE member_id = ?', memberId)) day(m.date).extra += 15;
  for (const p of await all('SELECT date FROM photos WHERE member_id = ?', memberId)) day(p.date).extra += 50;

  const perDay = {};
  const mealDays = [...days].filter(([, e]) => e.meals.length).map(([d]) => d).sort();
  const streakAt = {};
  mealDays.forEach((d, i) => { streakAt[d] = i && daysBetween(mealDays[i - 1], d) === 1 ? streakAt[mealDays[i - 1]] + 1 : 1; });
  for (const [d, e] of days) {
    let p = e.meals.slice(0, 4).reduce((s, late) => s + (late ? 2 : 5), 0);
    p += e.workouts.slice(0, 2).reduce((s, late) => s + (late ? 5 : 10), 0);
    p += e.extra;
    if (goal && e.meals.length >= 3 && e.kcal >= goal.calories * 0.85 && e.kcal <= goal.calories * 1.1) p += 25;
    if (streakAt[d]) p += Math.min(streakAt[d], 7) * 2;
    perDay[d] = p;
  }
  const total = Object.values(perDay).reduce((a, b) => a + b, 0);
  const last = mealDays[mealDays.length - 1];
  const streak = last && daysBetween(last, today) <= 1 ? streakAt[last] : 0;
  const level = Math.min(LEVELS.length - 1, Math.floor(total / 250));
  return {
    total, today: perDay[today] || 0, streak, level: LEVELS[level],
    next_level_at: level < LEVELS.length - 1 ? (level + 1) * 250 : null,
    week: Array.from({ length: 7 }, (_, i) => perDay[addDays(today, i - 6)] || 0)
  };
}

/* ---------- progress, photos, check-ins ---------- */
const weightOn = async (memberId, date) =>
  (await get('SELECT weight FROM measurements WHERE member_id = ? AND weight IS NOT NULL AND date <= ? ORDER BY date DESC LIMIT 1', memberId, date))?.weight ?? null;

export async function progress(memberId) {
  const goal = await get('SELECT * FROM goals WHERE member_id = ?', memberId);
  const latest = await get('SELECT weight, date FROM measurements WHERE member_id = ? AND weight IS NOT NULL ORDER BY date DESC LIMIT 1', memberId);
  const lastPhoto = await get('SELECT date FROM photos WHERE member_id = ? ORDER BY date DESC, id DESC LIMIT 1', memberId);
  const current = latest?.weight ?? null;
  const reference = (lastPhoto && await weightOn(memberId, lastPhoto.date)) ?? goal?.start_weight ?? null;
  const delta = current != null && reference != null ? Math.round((current - reference) * 10) / 10 : null;
  let positive = null;
  if (delta != null && goal) positive = goal.type === 'lose' ? delta < 0 : goal.type === 'gain' ? delta > 0 : Math.abs(delta) <= 1;
  let pct = null;
  if (goal && current != null && goal.start_weight != null && goal.target_weight != null && goal.start_weight !== goal.target_weight)
    pct = Math.max(0, Math.min(100, Math.round(((goal.start_weight - current) / (goal.start_weight - goal.target_weight)) * 100)));
  return { current, delta, positive, mood: positive ? 'celebrate' : 'motivate', percent_to_goal: pct };
}

export async function photoDue(memberId, today) {
  const last = await get('SELECT date FROM photos WHERE member_id = ? ORDER BY date DESC, id DESC LIMIT 1', memberId);
  if (!last) return { due: true, last: null, days_since: null };
  const days_since = daysBetween(last.date, today);
  return { due: days_since >= CYCLE_DAYS, last: last.date, days_since };
}

/** Mandatory-parameter check for the monthly trainer report. */
export async function checkinStatus(memberId, today) {
  const link = await get('SELECT * FROM links WHERE member_id = ?', memberId);
  if (!link) return null;
  const required = JSON.parse(link.required_params);
  const opens = addDays(link.cycle_start, CYCLE_DAYS);
  const open = today >= opens;
  const have = new Set();
  for (const m of await all('SELECT * FROM measurements WHERE member_id = ? AND date >= ? AND date <= ?', memberId, opens, today))
    for (const k of Object.keys(PARAMS)) if (m[k] != null) have.add(k);
  if (await get('SELECT 1 FROM photos WHERE member_id = ? AND date >= ?', memberId, opens)) have.add('photo');
  const missing = required.filter((k) => !have.has(k));
  return {
    required, missing, open, opens,
    days_left: Math.max(0, daysBetween(today, opens)),
    ready: open && missing.length === 0,
    period_start: link.cycle_start
  };
}

/* ---------- trainer digest ---------- */
export async function memberDigest(member, date) {
  const goal = await get('SELECT * FROM goals WHERE member_id = ?', member.id);
  const d = await daySummary(member.id, date);
  const pts = await computePoints(member.id, date);
  const lines = [];
  const logged = d.meals.length > 0;
  lines.push(logged ? `${d.kcal} kcal${goal ? ` of ${goal.calories}` : ''} · P ${d.protein}g · C ${d.carbs}g · F ${d.fat}g` : 'No meals logged');
  lines.push(d.workouts.length ? d.workouts.map((w) => `${w.type} ${w.minutes} min`).join(', ') : 'No workout');
  lines.push(`Streak ${pts.streak} day${pts.streak === 1 ? '' : 's'} · ${pts.today} pts`);
  let status = 'quiet';
  if (logged && goal) status = d.kcal <= goal.calories * 1.1 && d.kcal >= goal.calories * 0.8 ? 'on-track' : 'off-track';
  else if (logged) status = 'logged';
  return { member_id: member.id, name: member.name, status, kcal: d.kcal, target: goal?.calories ?? null, lines, workouts: d.workouts.length };
}

export const touchTz = async (userId, offset) => {
  if (Number.isFinite(offset)) await run('UPDATE users SET tz_offset = ? WHERE id = ? AND tz_offset != ?', offset, userId, offset);
};
