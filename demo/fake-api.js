// In-browser stand-in for the server, so the real front end can run as a static demo with sample data.
// Mirrors the rules in server/ (today/yesterday logging, points, check-in, digests) in simplified form.
import { setToken } from '../public/js/api.js';
import { searchFoods, suggestedFoods, suggestCuisines, NATIONALITIES, CUISINES } from '../server/foods.js';

const PARAMS = {
  weight: { label: 'Weight', unit: 'kg' }, waist: { label: 'Waist', unit: 'cm' }, chest: { label: 'Chest', unit: 'cm' },
  hips: { label: 'Hips', unit: 'cm' }, arm: { label: 'Arm', unit: 'cm' }, thigh: { label: 'Thigh', unit: 'cm' },
  body_fat: { label: 'Body fat', unit: '%' }, resting_hr: { label: 'Resting heart rate', unit: 'bpm' }, photo: { label: 'Progress photo', unit: '' }
};
const CYCLE = 30, LEVELS = ['Beginner', 'Steady', 'Consistent', 'Dedicated', 'Athlete', 'Champion', 'Legend'];
const iso = (d) => d.toISOString().slice(0, 10);
const TODAY = () => iso(new Date(Date.now() - new Date().getTimezoneOffset() * 60000));
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
const between = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const loggable = (d) => d === TODAY() || d === addDays(TODAY(), -1);
const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

export const demo = { current: null };
const db = { saved: [], users: {}, meals: [], workouts: [], measurements: [], photos: [], reports: [], notes: [], links: {}, goals: {}, cuisines: {}, id: 1000 };
const nid = () => ++db.id;

/* ---------- sample photo (drawn, no real people) ---------- */
function portrait(hue) {
  const c = Object.assign(document.createElement('canvas'), { width: 300, height: 400 });
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 300, 400);
  g.addColorStop(0, `hsl(${hue},70%,72%)`); g.addColorStop(1, `hsl(${hue + 40},60%,45%)`);
  x.fillStyle = g; x.fillRect(0, 0, 300, 400);
  x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath(); x.arc(150, 140, 52, 0, 7); x.fill();
  x.beginPath(); x.ellipse(150, 330, 100, 110, 0, Math.PI, 0); x.fill();
  return c.toDataURL('image/jpeg', 0.8);
}

/* ---------- seed data ---------- */
function seed() {
  const T = TODAY();
  db.users = {
    1: { id: 1, role: 'member', name: 'Maya Patel', email: 'maya@example.com', nationality: 'India', sex: 'female', birth_year: 1994, height_cm: 165, activity: 'light', onboarded: true },
    2: { id: 2, role: 'trainer', name: 'Coach Sam', email: 'sam@example.com', invite_code: 'DEMO42', notify_time: '20:00', onboarded: true },
    3: { id: 3, role: 'member', name: 'Arjun Rao', email: 'arjun@example.com', nationality: 'India', sex: 'male', birth_year: 1990, height_cm: 178, activity: 'moderate', onboarded: true }
  };
  db.cuisines = { 1: [['Indian', 'usually'], ['Italian', 'sometimes'], ['Chinese', 'sometimes']], 3: [['Indian', 'usually']] };
  db.links = { 1: { trainer_id: 2, required: ['weight', 'waist', 'photo'], cycle_start: addDays(T, -31), created_at: addDays(T, -31) }, 3: { trainer_id: 2, required: ['weight'], cycle_start: addDays(T, -10), created_at: addDays(T, -10) } };
  db.goals = {
    1: { member_id: 1, type: 'lose', start_weight: 74, target_weight: 66, target_date: addDays(T, 120), calories: 1850, protein_g: 130, carbs_g: 200, fat_g: 55, workouts_per_week: 4, set_by: 'trainer' },
    3: { member_id: 3, type: 'gain', start_weight: 68, target_weight: 74, target_date: null, calories: 2900, protein_g: 160, carbs_g: 380, fat_g: 85, workouts_per_week: 4, set_by: 'trainer' }
  };
  const dishes = [['breakfast', 'Plain dosa', 133, 3, 22, 4], ['breakfast', 'Masala chai', 90, 2, 14, 3], ['lunch', 'Dal tadka', 180, 9, 22, 6], ['lunch', 'Steamed basmati rice', 205, 4, 45, 0.4], ['lunch', 'Chicken tikka salad', 320, 30, 12, 16], ['snack', 'Greek yogurt', 130, 17, 8, 3], ['dinner', 'Paneer butter masala', 350, 14, 12, 28], ['dinner', 'Roti / chapati', 208, 6, 36, 6], ['dinner', 'Grilled fish with veg', 360, 38, 14, 16]];
  for (let i = 1; i <= 28; i++) {
    if (i % 9 === 4) continue;
    const d = addDays(T, -i);
    dishes.filter((_, k) => (k + i) % 3 !== 0 || k < 5).slice(0, 7 - (i % 3)).forEach(([mt, name, kcal, p, c, f]) => db.meals.push({ id: nid(), member_id: 1, date: d, meal_type: mt, name, kcal, protein: p, carbs: c, fat: f, late: 0 }));
    if (i % 2 === 0) db.workouts.push({ id: nid(), member_id: 1, date: d, type: i % 4 ? 'Strength' : 'Run', minutes: 45, kcal_burned: 320, late: 0 });
    if (i % 3 === 0) db.measurements.push({ id: nid(), member_id: 1, date: d, weight: Math.round((71.2 + i * 0.1) * 10) / 10 });
  }
  db.measurements.push({ id: nid(), member_id: 1, date: addDays(T, -31), weight: 73.6, waist: 86 });
  db.measurements.push({ id: nid(), member_id: 3, date: addDays(T, -2), weight: 68.5 });
  [['breakfast', 'Banana', 105, 1.3, 27, .4]].forEach(([mt, name, kcal, p, c, f]) => db.meals.push({ id: nid(), member_id: 3, date: T, meal_type: mt, name, kcal, protein: p, carbs: c, fat: f, late: 0 }));
  [['breakfast', 'Plain dosa', 133, 3, 22, 4], ['breakfast', 'Masala chai', 90, 2, 14, 3], ['lunch', 'Dal tadka', 180, 9, 22, 6]].forEach(([mt, name, kcal, p, c, f]) => db.meals.push({ id: nid(), member_id: 1, date: T, meal_type: mt, name, kcal, protein: p, carbs: c, fat: f, late: 0 }));
  db.photos = [{ id: 1, member_id: 1, date: addDays(T, -31), mood: 'motivate', delta_kg: null, data: portrait(200) }];
  db.notes = [
    { id: 1, user_id: 1, kind: 'plan', title: 'Your coach updated your plan', body: '1850 kcal/day · 4 workouts/week', read: 1, created_at: addDays(T, -31) + 'T09:00:00Z' },
    { id: 2, user_id: 2, kind: 'digest', title: 'Daily digest · yesterday', body: '2 clients: 1 on track, 1 haven\'t logged.', read: 0, created_at: addDays(T, -1) + 'T20:00:00Z', payload: { date: addDays(T, -1), rows: [digest(db.users[1], addDays(T, -1)), digest(db.users[3], addDays(T, -1))] } }
  ];
}

/* ---------- logic ---------- */
function day(mid, date) {
  const meals = db.meals.filter((m) => m.member_id === mid && m.date === date), workouts = db.workouts.filter((w) => w.member_id === mid && w.date === date);
  const s = (k) => Math.round(meals.reduce((a, m) => a + (m[k] || 0), 0));
  return { date, meals, workouts, kcal: s('kcal'), protein: s('protein'), carbs: s('carbs'), fat: s('fat'), burned: 0, workout_minutes: workouts.reduce((a, w) => a + w.minutes, 0) };
}
function points(mid) {
  const T = TODAY(), g = db.goals[mid], days = {}, d = (k) => (days[k] ??= { meals: [], workouts: [], kcal: 0, extra: 0 });
  db.meals.filter((m) => m.member_id === mid).forEach((m) => { const e = d(m.date); e.meals.push(m.late); e.kcal += m.kcal; });
  db.workouts.filter((w) => w.member_id === mid).forEach((w) => d(w.date).workouts.push(w.late));
  db.measurements.filter((m) => m.member_id === mid).forEach((m) => { d(m.date).extra += 15; });
  db.photos.filter((p) => p.member_id === mid).forEach((p) => { d(p.date).extra += 50; });
  const md = Object.keys(days).filter((k) => days[k].meals.length).sort(), streakAt = {};
  md.forEach((k, i) => { streakAt[k] = i && between(md[i - 1], k) === 1 ? streakAt[md[i - 1]] + 1 : 1; });
  const per = {};
  for (const [k, e] of Object.entries(days)) {
    let p = e.meals.slice(0, 4).reduce((a, l) => a + (l ? 2 : 5), 0) + e.workouts.slice(0, 2).reduce((a, l) => a + (l ? 5 : 10), 0) + e.extra;
    if (g && e.meals.length >= 3 && e.kcal >= g.calories * .85 && e.kcal <= g.calories * 1.1) p += 25;
    if (streakAt[k]) p += Math.min(streakAt[k], 7) * 2;
    per[k] = p;
  }
  const total = Object.values(per).reduce((a, b) => a + b, 0), last = md.at(-1), lvl = Math.min(6, Math.floor(total / 250));
  return { total, today: per[T] || 0, streak: last && between(last, T) <= 1 ? streakAt[last] : 0, level: LEVELS[lvl], next_level_at: lvl < 6 ? (lvl + 1) * 250 : null, week: [] };
}
const wOn = (mid, date) => db.measurements.filter((m) => m.member_id === mid && m.weight != null && m.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0]?.weight ?? null;
function progress(mid) {
  const g = db.goals[mid], ws = db.measurements.filter((m) => m.member_id === mid && m.weight != null).sort((a, b) => b.date.localeCompare(a.date));
  const lp = db.photos.filter((p) => p.member_id === mid).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)[0];
  const current = ws[0]?.weight ?? null, ref = (lp && wOn(mid, lp.date)) ?? g?.start_weight ?? null;
  const delta = current != null && ref != null ? Math.round((current - ref) * 10) / 10 : null;
  let positive = null;
  if (delta != null && g) positive = g.type === 'lose' ? delta < 0 : g.type === 'gain' ? delta > 0 : Math.abs(delta) <= 1;
  const pct = g && current != null && g.target_weight != null && g.start_weight !== g.target_weight ? Math.max(0, Math.min(100, Math.round(((g.start_weight - current) / (g.start_weight - g.target_weight)) * 100))) : null;
  return { current, delta, positive, mood: positive ? 'celebrate' : 'motivate', percent_to_goal: pct };
}
function photoDue(mid) {
  const lp = db.photos.filter((p) => p.member_id === mid).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!lp) return { due: true, last: null, days_since: null };
  const ds = between(lp.date, TODAY());
  return { due: ds >= CYCLE, last: lp.date, days_since: ds };
}
function checkin(mid) {
  const l = db.links[mid]; if (!l) return null;
  const opens = addDays(l.cycle_start, CYCLE), T = TODAY(), have = new Set();
  db.measurements.filter((m) => m.member_id === mid && m.date >= opens && m.date <= T).forEach((m) => Object.keys(PARAMS).forEach((k) => m[k] != null && have.add(k)));
  if (db.photos.some((p) => p.member_id === mid && p.date >= opens)) have.add('photo');
  const missing = l.required.filter((k) => !have.has(k));
  return { required: l.required, missing, open: T >= opens, opens, days_left: Math.max(0, between(T, opens)), ready: T >= opens && !missing.length, period_start: l.cycle_start };
}
function digest(u, date) {
  const g = db.goals[u.id], d = day(u.id, date), p = points(u.id), logged = d.meals.length > 0;
  let status = 'quiet';
  if (logged && g) status = d.kcal <= g.calories * 1.1 && d.kcal >= g.calories * .8 ? 'on-track' : 'off-track'; else if (logged) status = 'logged';
  return { member_id: u.id, name: u.name, status, kcal: d.kcal, target: g?.calories ?? null, workouts: d.workouts.length,
    lines: [logged ? `${d.kcal} kcal${g ? ` of ${g.calories}` : ''} · P ${d.protein}g · C ${d.carbs}g · F ${d.fat}g` : 'No meals logged', d.workouts.length ? d.workouts.map((w) => `${w.type} ${w.minutes} min`).join(', ') : 'No workout', `Streak ${p.streak} day${p.streak === 1 ? '' : 's'} · ${p.today} pts`] };
}
function tryReport(mid) {
  const st = checkin(mid), T = TODAY();
  if (!st?.ready || db.reports.some((r) => r.member_id === mid && r.period_end === T)) return null;
  const l = db.links[mid], m = db.users[mid], r = { id: nid(), member_id: mid, trainer_id: l.trainer_id, period_start: l.cycle_start, period_end: T, created_at: T };
  db.reports.push(r); l.cycle_start = T;
  const note = (user_id, title, body) => db.notes.push({ id: nid(), user_id, kind: 'report', title, body, read: 0, created_at: new Date().toISOString(), payload: { report_id: r.id, member_id: mid } });
  note(l.trainer_id, `Monthly report ready — ${m.name}`, `${m.name} completed every mandatory check-in. Their PDF health report (${r.period_start} → ${T}) is ready.`);
  note(mid, 'Your monthly report was sent', `${db.users[l.trainer_id].name} now has your health report.`);
  return r.id;
}
function suggest(u, b) {
  const T = TODAY(), age = u.birth_year ? +T.slice(0, 4) - u.birth_year : 30, w = num(b.weight), h = u.height_cm || num(b.height_cm);
  const mult = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 }[u.activity] || 1.375;
  const tdee = (10 * w + 6.25 * h - 5 * age + (u.sex === 'male' ? 5 : u.sex === 'female' ? -161 : -78)) * mult;
  let delta = b.type === 'lose' ? -500 : b.type === 'gain' ? 300 : 0;
  if (b.target_date && num(b.target_weight) && b.type !== 'maintain') delta = Math.max(-900, Math.min(600, ((num(b.target_weight) - w) * 7700) / Math.max(14, between(T, b.target_date))));
  const calories = Math.round(Math.max(1200, tdee + delta) / 10) * 10, protein_g = Math.round(w * (b.type === 'maintain' ? 1.4 : 1.8)), fat_g = Math.round(calories * .27 / 9);
  return { calories, protein_g, carbs_g: Math.max(0, Math.round((calories - protein_g * 4 - fat_g * 9) / 4)), fat_g, tdee: Math.round(tdee) };
}
const pub = (u) => ({ id: u.id, role: u.role, name: u.name, email: u.email, nationality: u.nationality, sex: u.sex, birth_year: u.birth_year, height_cm: u.height_cm, activity: u.activity, onboarded: !!u.onboarded, invite_code: u.invite_code || null, notify_time: u.notify_time, push: false });
function memberState(u) {
  const l = db.links[u.id], last = db.measurements.filter((m) => m.member_id === u.id).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  return { user: pub(u), today: TODAY(), cuisines: (db.cuisines[u.id] || []).map(([cuisine, freq]) => ({ cuisine, freq })), goal: db.goals[u.id] || null,
    trainer: l ? { name: db.users[l.trainer_id].name, required_params: l.required, linked_at: l.created_at } : null,
    points: points(u.id), photo: photoDue(u.id), checkin: checkin(u.id), progress: progress(u.id), latest: last };
}
const PDF = () => { const t = 'BT /F1 22 Tf 60 760 Td (YourCalories - sample monthly health report) Tj ET'; const o = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>', '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>', `<</Length ${t.length}>>stream\n${t}\nendstream`, '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>']; return `%PDF-1.4\n${o.map((x, i) => `${i + 1} 0 obj\n${x}\nendobj\n`).join('')}trailer<</Root 1 0 R/Size 6>>\n%%EOF`; };

/* ---------- router ---------- */
const E = (status, error) => [status, { error }];
function route(method, path, q, body = {}) {
  const u = db.users[demo.current], T = TODAY();
  const m = (re) => path.match(re);
  let r;
  if (path === '/api/meta') return [200, { nationalities: NATIONALITIES, cuisines: CUISINES, params: PARAMS, vapid: '', cycle_days: CYCLE }];
  if (path === '/api/signup') {
    const id = nid(); db.users[id] = { id, role: body.role, name: body.name, email: body.email, onboarded: body.role === 'trainer', invite_code: body.role === 'trainer' ? Math.random().toString(36).slice(2, 8).toUpperCase() : null, notify_time: '20:00', activity: 'light' };
    demo.current = id; return [200, { token: 'demo', user: pub(db.users[id]) }];
  }
  if (path === '/api/login') { demo.current = /coach|sam/i.test(body.email || '') ? 2 : 1; return [200, { token: 'demo', user: pub(db.users[demo.current]) }]; }
  if (path === '/api/logout') { demo.current = null; return [200, { ok: true }]; }
  if (path === '/api/cuisines/suggest') return [200, suggestCuisines(q.get('nationality') || '')];
  if (!u) return E(401, 'Please sign in again.');
  if (path === '/api/me') return [200, u.role === 'trainer' ? { user: pub(u), today: T } : memberState(u)];
  if (path === '/api/me/profile') { for (const k of ['nationality', 'sex', 'activity', 'name']) if (body[k]) u[k] = body[k]; if (num(body.birth_year)) u.birth_year = num(body.birth_year); if (num(body.height_cm)) u.height_cm = num(body.height_cm); return [200, pub(u)]; }
  if (path === '/api/me/cuisines') { db.cuisines[u.id] = (body.cuisines || []).map((c) => [c.cuisine, c.freq]); return [200, { ok: true }]; }
  if (path === '/api/me/finish-onboarding') { u.onboarded = true; return [200, { ok: true }]; }
  if (path === '/api/me/settings') { if (body.notify_time) u.notify_time = body.notify_time; return [200, pub(u)]; }
  if (path === '/api/push') return [200, { ok: true }];
  if (path === '/api/notifications') return [200, db.notes.filter((n) => n.user_id === u.id).sort((a, b) => b.id - a.id).map((n) => ({ payload: null, ...n }))];
  if (path === '/api/notifications/read') { db.notes.forEach((n) => { if (n.user_id === u.id) n.read = 1; }); return [200, { ok: true }]; }
  if (path === '/api/plan/suggest') {
    const who = body.member_id && u.role === 'trainer' ? db.users[body.member_id] : u;
    if (!num(body.weight) || !(who.height_cm || num(body.height_cm))) return E(400, 'Add your weight and height first.');
    return [200, suggest(who, body)];
  }
  const saveGoal = (id, b, by) => {
    if (!['lose', 'gain', 'maintain'].includes(b.type)) return null;
    const cur = db.goals[id], start = num(b.start_weight) ?? cur?.start_weight ?? db.measurements.filter((x) => x.member_id === id && x.weight).sort((a, c) => c.date.localeCompare(a.date))[0]?.weight ?? null;
    return (db.goals[id] = { member_id: id, type: b.type, start_weight: start, target_weight: b.type === 'maintain' ? start : num(b.target_weight), target_date: b.target_date || null, calories: Math.round(num(b.calories)), protein_g: num(b.protein_g), carbs_g: num(b.carbs_g), fat_g: num(b.fat_g), workouts_per_week: Math.round(num(b.workouts_per_week) ?? 3), set_by: by });
  };
  if (path === '/api/goal') {
    if (db.goals[u.id]?.set_by === 'trainer' && db.links[u.id]) return E(403, 'Your coach set this plan. Ask them to change it.');
    const c = num(body.calories); if (!(c >= 800 && c <= 6000)) return E(400, 'Daily calories should be between 800 and 6000.');
    return [200, saveGoal(u.id, body, 'self') ];
  }
  if (path === '/api/measurements' && method === 'POST') {
    const date = body.date || T; if (!loggable(date)) return E(400, 'You can only add entries for today or yesterday.');
    const vals = {}; Object.keys(PARAMS).forEach((k) => { if (k !== 'photo' && num(body[k]) > 0) vals[k] = num(body[k]); });
    if (!Object.keys(vals).length) return E(400, 'Enter at least one value.');
    let row = db.measurements.find((x) => x.member_id === u.id && x.date === date); if (!row) db.measurements.push((row = { id: nid(), member_id: u.id, date }));
    Object.assign(row, vals);
    return [200, { ok: true, report_id: tryReport(u.id) }];
  }
  if (path === '/api/measurements') return [200, db.measurements.filter((x) => x.member_id === u.id).sort((a, b) => a.date.localeCompare(b.date))];
  const cu = () => (db.cuisines[u.id] || []).map(([cuisine, freq]) => ({ cuisine, freq }));
  const row = (f, source) => ({ id: f.id, name: f.name, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, serving: f.serving || '1 serving', source });
  if (path === '/api/foods/search') {
    const term = (q.get('q') || '').trim().toLowerCase();
    if (!term) return [200, suggestedFoods(cu())];
    const mine = db.saved.filter((f) => f.user_id === u.id && term.split(/\s+/).every((t) => f.name.toLowerCase().includes(t))).map((f) => row(f, u.role === 'trainer' ? 'coach' : 'saved'));
    const coach = db.saved.filter((f) => f.scope === 'coach' && db.links[u.id]?.trainer_id === f.user_id && term.split(/\s+/).every((t) => f.name.toLowerCase().includes(t))).map((f) => row(f, 'coach'));
    return [200, [...mine, ...coach, ...searchFoods(term, cu())]];
  }
  if (path === '/api/foods/mine') {
    const mine = db.meals.filter((x) => x.member_id === u.id).sort((a, b) => b.id - a.id), seen = new Set(), recent = [], count = {};
    for (const x of mine) { const k = x.name.toLowerCase(); count[k] = (count[k] || 0) + 1; if (!seen.has(k) && recent.length < 8) { seen.add(k); recent.push(x); } }
    const tag = (a) => a.map((f) => ({ name: f.name, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, serving: f.serving || '1 serving', source: 'typed' }));
    const freq = [...new Map(mine.map((x) => [x.name.toLowerCase(), x])).values()].filter((x) => count[x.name.toLowerCase()] >= 2).sort((a, b) => count[b.name.toLowerCase()] - count[a.name.toLowerCase()]).slice(0, 8);
    const tid = db.links[u.id]?.trainer_id;
    return [200, { recent: tag(recent), frequent: tag(freq), saved: db.saved.filter((f) => f.user_id === u.id && f.scope === 'member').map((f) => row(f, 'saved')), coach: db.saved.filter((f) => f.scope === 'coach' && f.user_id === tid).map((f) => row(f, 'coach')) }];
  }
  if (path === '/api/foods/saved' && method === 'GET') return [200, db.saved.filter((f) => f.user_id === u.id).map((f) => row(f, u.role === 'trainer' ? 'coach' : 'saved'))];
  if (path === '/api/foods/saved' && method === 'POST') {
    if (!body.name?.trim() || !(num(body.kcal) >= 0)) return E(400, 'Add a name and calories (0–5000).');
    const f = { id: nid(), user_id: u.id, scope: u.role === 'trainer' ? 'coach' : 'member', name: body.name.trim(), kcal: num(body.kcal), protein: num(body.protein) || 0, carbs: num(body.carbs) || 0, fat: num(body.fat) || 0, serving: body.serving || null };
    db.saved.unshift(f); return [200, { id: f.id }];
  }
  if ((r = m(/^\/api\/foods\/saved\/(\d+)$/))) { db.saved = db.saved.filter((f) => !(f.id === +r[1] && f.user_id === u.id)); return [200, { ok: true }]; }
  if (path === '/api/foods/describe') {
    // Offline stand-in for the Claude estimate: matches each part of the sentence against the built-in dishes.
    const parts = String(body.text || '').toLowerCase().split(/,|\band\b|\bwith\b|\+/).map((x) => x.trim()).filter(Boolean);
    if (!parts.length || String(body.text).trim().length < 3) return E(400, 'Describe what you ate, for example “2 rotis, dal and a small bowl of rice”.');
    const items = parts.map((part) => {
      const qty = Number(part.match(/^(\d+(?:\.\d+)?)\s/)?.[1]) || (/\b(small|half)\b/.test(part) ? 0.6 : 1);
      const words = part.replace(/^\d+(\.\d+)?\s*/, '').replace(/\b(a|an|the|small|large|big|bowl|of|plate|cup|glass|piece|pieces)\b/g, '').trim();
      const hit = searchFoods(words.replace(/s$/, ''), cu(), 1)[0] || searchFoods(words.split(' ')[0] || words, cu(), 1)[0];
      const k = Math.round((hit ? hit.kcal : 220) * qty), r1 = (n) => Math.round((n || 0) * qty * 10) / 10;
      return { name: hit ? hit.name : part, serving: hit ? `${qty} × ${hit.serving}` : 'assumed 1 portion', kcal: k, protein: r1(hit?.protein ?? 8), carbs: r1(hit?.carbs ?? 28), fat: r1(hit?.fat ?? 9), confidence: hit ? 'medium' : 'low', source: 'ai' };
    });
    return [200, { items, note: 'Demo estimate from sample data. The real app asks Claude, which also handles mixed dishes and unusual foods.' }];
  }
  if ((r = m(/^\/api\/foods\/barcode\/(.+)$/))) return /^\d{6,14}$/.test(r[1]) ? [200, { name: 'Nature Valley · Oats & honey bar', kcal: 190, protein: 4, carbs: 29, fat: 7, serving: '2 bars', source: 'openfoodfacts' }] : E(400, 'That does not look like a barcode.');
  if (path === '/api/day') { const date = q.get('date') || T; return [200, { ...day(u.id, date), editable: loggable(date) }]; }
  if (path === '/api/meals' && method === 'POST') {
    const date = body.date || T; if (!loggable(date)) return E(400, 'Entries can only be added or changed for today and yesterday.');
    if (!body.name?.trim() || !(num(body.kcal) >= 0)) return E(400, 'Add a name and calories (0–5000).');
    db.meals.push({ id: nid(), member_id: u.id, date, meal_type: body.meal_type || 'snack', name: body.name, kcal: num(body.kcal), protein: num(body.protein) || 0, carbs: num(body.carbs) || 0, fat: num(body.fat) || 0, late: date === T ? 0 : 1 });
    return [200, { late: date !== T, points: points(u.id) }];
  }
  if ((r = m(/^\/api\/meals\/(\d+)$/))) { db.meals = db.meals.filter((x) => !(x.id === +r[1] && x.member_id === u.id)); return [200, { ok: true }]; }
  if (path === '/api/workouts' && method === 'POST') {
    const date = body.date || T; if (!loggable(date)) return E(400, 'Entries can only be added or changed for today and yesterday.');
    if (!(num(body.minutes) > 0)) return E(400, 'Add the workout type and minutes.');
    db.workouts.push({ id: nid(), member_id: u.id, date, type: body.type, minutes: Math.round(num(body.minutes)), kcal_burned: num(body.kcal_burned) || 0, late: date === T ? 0 : 1 });
    return [200, { ok: true }];
  }
  if ((r = m(/^\/api\/workouts\/(\d+)$/))) { db.workouts = db.workouts.filter((x) => !(x.id === +r[1] && x.member_id === u.id)); return [200, { ok: true }]; }
  if (path === '/api/history') {
    const from = addDays(T, -29), out = {};
    db.meals.filter((x) => x.member_id === u.id && x.date >= from).forEach((x) => { const e = (out[x.date] ??= { date: x.date, kcal: 0, meals: 0 }); e.kcal += x.kcal; e.meals++; });
    return [200, Object.values(out).sort((a, b) => a.date.localeCompare(b.date)).map((e) => ({ ...e, kcal: Math.round(e.kcal) }))];
  }
  if (path === '/api/photos' && method === 'POST') {
    if (!/^data:image\//.test(body.image || '')) return E(400, 'Send a JPEG, PNG or WebP image.');
    const pr = progress(u.id), p = { id: nid(), member_id: u.id, date: T, mood: pr.mood, delta_kg: pr.delta, data: body.image };
    db.photos.push(p); return [200, { id: p.id, mood: p.mood, delta_kg: p.delta_kg, report_id: tryReport(u.id) }];
  }
  if (path === '/api/photos') return [200, db.photos.filter((p) => p.member_id === u.id).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).map(({ data, member_id, ...p }) => p)];
  if ((r = m(/^\/api\/photos\/(\d+)\/file$/))) { const p = db.photos.find((x) => x.id === +r[1]); return p ? ['blob', p.data] : E(404, 'Not found.'); }
  if ((r = m(/^\/api\/photos\/(\d+)$/)) && method === 'DELETE') { db.photos = db.photos.filter((p) => !(p.id === +r[1] && p.member_id === u.id)); return [200, { ok: true }]; }
  if (path === '/api/link' && method === 'POST') {
    const t = Object.values(db.users).find((x) => x.role === 'trainer' && x.invite_code === String(body.code || '').toUpperCase());
    if (!t) return E(404, 'No coach found with that code.');
    db.links[u.id] = { trainer_id: t.id, required: ['weight'], cycle_start: T, created_at: T };
    db.notes.push({ id: nid(), user_id: t.id, kind: 'link', title: `${u.name} joined you`, body: 'Set their goal and the parameters you want tracked.', read: 0, created_at: new Date().toISOString() });
    return [200, { ok: true, trainer: { name: t.name } }];
  }
  if (path === '/api/link') { delete db.links[u.id]; return [200, { ok: true }]; }
  if (path === '/api/reports') {
    const key = u.role === 'trainer' ? 'trainer_id' : 'member_id';
    return [200, db.reports.filter((x) => x[key] === u.id).sort((a, b) => b.id - a.id).map((x) => ({ ...x, member_name: db.users[x.member_id].name }))];
  }
  if (m(/^\/api\/reports\/\d+\/pdf$/)) return ['pdf', PDF()];
  const mine = () => Object.keys(db.links).filter((id) => db.links[id].trainer_id === u.id).map((id) => db.users[id]);
  if (path === '/api/trainer/members') return [200, mine().map((x) => { const st = checkin(x.id); return { id: x.id, name: x.name, ...digest(x, T), goal: db.goals[x.id] ? { type: db.goals[x.id].type, calories: db.goals[x.id].calories } : null, checkin: st && { missing: st.missing, open: st.open, days_left: st.days_left }, points: points(x.id).total }; })];
  if ((r = m(/^\/api\/trainer\/members\/(\d+)$/))) {
    const id = +r[1], x = db.users[id];
    if (db.links[id]?.trainer_id !== u.id) return E(404, 'Client not found.');
    if (method === 'DELETE') { delete db.links[id]; return [200, { ok: true }]; }
    return [200, { user: { ...pub(x), email: undefined }, goal: db.goals[id] || null, required_params: db.links[id].required, cuisines: (db.cuisines[id] || []).map(([cuisine, freq]) => ({ cuisine, freq })),
      measurements: db.measurements.filter((y) => y.member_id === id).sort((a, b) => a.date.localeCompare(b.date)),
      days: Array.from({ length: 7 }, (_, i) => day(id, addDays(T, i - 6))).map((d) => ({ date: d.date, kcal: d.kcal, protein: d.protein, carbs: d.carbs, fat: d.fat, meals: d.meals, workouts: d.workouts })),
      photos: db.photos.filter((p) => p.member_id === id).map(({ data, member_id, ...p }) => p), reports: db.reports.filter((y) => y.member_id === id).sort((a, b) => b.id - a.id), points: points(id), checkin: checkin(id), today: T }];
  }
  if ((r = m(/^\/api\/trainer\/members\/(\d+)\/plan$/))) {
    const id = +r[1]; if (db.links[id]?.trainer_id !== u.id) return E(404, 'Client not found.');
    if (body.required_params) { if (!body.required_params.length) return E(400, 'Pick at least one parameter to track.'); db.links[id].required = body.required_params; }
    const g = body.goal ? saveGoal(id, body.goal, 'trainer') : db.goals[id];
    db.notes.push({ id: nid(), user_id: id, kind: 'plan', title: 'Your coach updated your plan', body: g ? `${g.calories} kcal/day · ${g.workouts_per_week} workouts/week` : 'New tracking requirements are set.', read: 0, created_at: new Date().toISOString() });
    return [200, { ok: true, goal: g }];
  }
  return E(404, 'Unknown endpoint.');
}

seed();
demo.current = 1; // open straight into the member's Today screen
setToken('demo');
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api')) return realFetch(input, init);
  await new Promise((r) => setTimeout(r, 60));
  const body = init.body ? JSON.parse(init.body) : {};
  let [status, payload] = route((init.method || 'GET').toUpperCase(), url.pathname, url.searchParams, body);
  if (status === 'blob') { const b = await (await realFetch(payload)).blob(); return new Response(b, { status: 200 }); }
  if (status === 'pdf') return new Response(new Blob([payload], { type: 'application/pdf' }), { status: 200 });
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
};
