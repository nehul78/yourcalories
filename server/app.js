import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { all, get, run } from './db.js';
import * as L from './logic.js';
import { NATIONALITIES, CUISINES, suggestCuisines, searchFoods, suggestedFoods } from './foods.js';
import { searchUsda } from './usda.js';
import { describeMeal, describeEnabled, checkQuota } from './describe.js';
import { publicKey } from './push.js';
import { tryGenerateReport } from './report.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (res, code, error) => res.status(code).json({ error });
const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s));

function publicUser(u) {
  return { id: u.id, role: u.role, name: u.name, email: u.email, nationality: u.nationality, sex: u.sex, birth_year: u.birth_year, height_cm: u.height_cm, activity: u.activity, onboarded: !!u.onboarded, invite_code: u.invite_code, notify_time: u.notify_time, push: !!u.push_sub };
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  /* ---------- auth ---------- */
  const auth = wrap(async (req, res, next) => {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '') || req.query.t;
    const user = token && await get('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', token);
    if (!user) return fail(res, 401, 'Please sign in again.');
    const off = Number(req.headers['x-tz-offset']);
    if (Number.isFinite(off)) { await L.touchTz(user.id, off); user.tz_offset = off; }
    req.user = user;
    req.today = L.localDate(user.tz_offset);
    next();
  });
  const only = (role) => (req, res, next) => (req.user.role === role ? next() : fail(res, 403, `Only ${role}s can do this.`));
  const session = async (userId) => {
    const token = L.newToken();
    await run('INSERT INTO sessions (token, user_id) VALUES (?,?)', token, userId);
    return token;
  };

  app.post('/api/signup', wrap(async (req, res) => {
    const { name, email, password, role } = req.body || {};
    if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || '')) return fail(res, 400, 'Enter your name and a valid email.');
    if ((password || '').length < 8) return fail(res, 400, 'Password must be at least 8 characters.');
    if (!['member', 'trainer'].includes(role)) return fail(res, 400, 'Choose whether you are training or coaching.');
    if (await get('SELECT 1 FROM users WHERE email = ?', email.toLowerCase())) return fail(res, 409, 'That email already has an account.');
    const { salt, hash } = L.hashPassword(password);
    const off = Number(req.headers['x-tz-offset']) || 0;
    const info = await run('INSERT INTO users (role,name,email,pass_hash,salt,invite_code,onboarded,tz_offset) VALUES (?,?,?,?,?,?,?,?)',
      role, name.trim(), email.toLowerCase(), hash, salt, role === 'trainer' ? await L.newInviteCode() : null, role === 'trainer' ? 1 : 0, off);
    const user = await get('SELECT * FROM users WHERE id = ?', info.lastInsertRowid);
    res.json({ token: await session(user.id), user: publicUser(user) });
  }));

  app.post('/api/login', wrap(async (req, res) => {
    const { email, password } = req.body || {};
    const user = await get('SELECT * FROM users WHERE email = ?', (email || '').toLowerCase());
    if (!user || !L.checkPassword(password || '', user)) return fail(res, 401, 'Email or password is incorrect.');
    res.json({ token: await session(user.id), user: publicUser(user) });
  }));

  app.post('/api/logout', auth, wrap(async (req, res) => {
    await run('DELETE FROM sessions WHERE token = ?', (req.headers.authorization || '').replace(/^Bearer /, ''));
    res.json({ ok: true });
  }));

  app.get('/api/meta', (_req, res) => res.json({ nationalities: NATIONALITIES, cuisines: CUISINES, params: L.PARAMS, vapid: publicKey, cycle_days: L.CYCLE_DAYS }));
  app.get('/api/cuisines/suggest', (req, res) => res.json(suggestCuisines(String(req.query.nationality || ''))));

  /* ---------- me ---------- */
  const memberState = async (u, today) => {
    const link = await get('SELECT l.*, t.name AS trainer_name FROM links l JOIN users t ON t.id = l.trainer_id WHERE l.member_id = ?', u.id);
    return {
      user: publicUser(u), today,
      cuisines: await all('SELECT cuisine, freq FROM cuisines WHERE user_id = ?', u.id),
      goal: await get('SELECT * FROM goals WHERE member_id = ?', u.id) || null,
      trainer: link ? { name: link.trainer_name, required_params: JSON.parse(link.required_params), linked_at: link.created_at } : null,
      points: await L.computePoints(u.id, today),
      photo: await L.photoDue(u.id, today),
      checkin: await L.checkinStatus(u.id, today),
      progress: await L.progress(u.id),
      latest: await get('SELECT * FROM measurements WHERE member_id = ? ORDER BY date DESC LIMIT 1', u.id) || null
    };
  };
  app.get('/api/me', auth, wrap(async (req, res) => {
    if (req.user.role === 'trainer') return res.json({ user: publicUser(req.user), today: req.today });
    res.json(await memberState(req.user, req.today));
  }));

  app.put('/api/me/profile', auth, wrap(async (req, res) => {
    const b = req.body || {};
    const u = req.user;
    const height = num(b.height_cm), by = num(b.birth_year);
    if (height != null && (height < 100 || height > 250)) return fail(res, 400, 'Height should be between 100 and 250 cm.');
    if (by != null && (by < 1920 || by > new Date().getFullYear() - 10)) return fail(res, 400, 'Check your birth year.');
    await run('UPDATE users SET nationality=?, sex=?, birth_year=?, height_cm=?, activity=?, name=? WHERE id=?',
      b.nationality ?? u.nationality, b.sex ?? u.sex, by ?? u.birth_year, height ?? u.height_cm, b.activity ?? u.activity, (b.name || u.name).trim(), u.id);
    res.json(publicUser(await get('SELECT * FROM users WHERE id = ?', u.id)));
  }));

  app.put('/api/me/cuisines', auth, only('member'), wrap(async (req, res) => {
    const list = (req.body?.cuisines || []).filter((c) => CUISINES.includes(c.cuisine) && ['usually', 'sometimes'].includes(c.freq));
    await run('DELETE FROM cuisines WHERE user_id = ?', req.user.id);
    for (const c of list) await run('INSERT OR REPLACE INTO cuisines VALUES (?,?,?)', req.user.id, c.cuisine, c.freq);
    res.json({ ok: true, count: list.length });
  }));

  app.put('/api/me/finish-onboarding', auth, only('member'), wrap(async (req, res) => {
    await run('UPDATE users SET onboarded = 1 WHERE id = ?', req.user.id);
    res.json({ ok: true });
  }));

  app.put('/api/me/settings', auth, wrap(async (req, res) => {
    const { notify_time } = req.body || {};
    if (notify_time !== undefined) {
      if (req.user.role !== 'trainer') return fail(res, 403, 'Only coaches have a digest time.');
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(notify_time)) return fail(res, 400, 'Use HH:MM.');
      await run('UPDATE users SET notify_time = ?, last_digest_date = NULL WHERE id = ?', notify_time, req.user.id);
    }
    res.json(publicUser(await get('SELECT * FROM users WHERE id = ?', req.user.id)));
  }));

  app.post('/api/push', auth, wrap(async (req, res) => {
    const sub = req.body?.subscription;
    await run('UPDATE users SET push_sub = ? WHERE id = ?', sub ? JSON.stringify(sub) : null, req.user.id);
    res.json({ ok: true });
  }));

  app.get('/api/notifications', auth, wrap(async (req, res) => {
    const rows = await all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 60', req.user.id);
    res.json(rows.map((n) => ({ ...n, payload: n.payload ? JSON.parse(n.payload) : null })));
  }));
  app.post('/api/notifications/read', auth, wrap(async (req, res) => {
    await run('UPDATE notifications SET read = 1 WHERE user_id = ?', req.user.id);
    res.json({ ok: true });
  }));

  /* ---------- goal ---------- */
  app.post('/api/plan/suggest', auth, wrap(async (req, res) => {
    const b = req.body || {};
    const u = req.body.member_id && req.user.role === 'trainer' ? await get('SELECT * FROM users WHERE id = ?', b.member_id) : req.user;
    const weight = num(b.weight);
    if (!weight || !(u.height_cm || num(b.height_cm))) return fail(res, 400, 'Add your weight and height first.');
    res.json(L.suggestPlan({ ...u, height_cm: u.height_cm || num(b.height_cm), weight, type: b.type, target_weight: num(b.target_weight), target_date: b.target_date }, req.today));
  }));

  async function saveGoal(memberId, b, setBy, today) {
    const type = b.type;
    if (!['lose', 'gain', 'maintain'].includes(type)) throw Object.assign(new Error('Pick lose, gain or maintain.'), { status: 400 });
    const calories = Math.round(num(b.calories));
    if (!(calories >= 800 && calories <= 6000)) throw Object.assign(new Error('Daily calories should be between 800 and 6000.'), { status: 400 });
    const cur = await get('SELECT * FROM goals WHERE member_id = ?', memberId);
    const start = num(b.start_weight) ?? cur?.start_weight ?? (await get('SELECT weight FROM measurements WHERE member_id = ? AND weight IS NOT NULL ORDER BY date DESC LIMIT 1', memberId))?.weight ?? null;
    const target = type === 'maintain' ? start : num(b.target_weight);
    await run(`INSERT INTO goals (member_id,type,start_weight,target_weight,target_date,calories,protein_g,carbs_g,fat_g,workouts_per_week,set_by,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
         ON CONFLICT(member_id) DO UPDATE SET type=excluded.type,start_weight=excluded.start_weight,target_weight=excluded.target_weight,target_date=excluded.target_date,
         calories=excluded.calories,protein_g=excluded.protein_g,carbs_g=excluded.carbs_g,fat_g=excluded.fat_g,workouts_per_week=excluded.workouts_per_week,set_by=excluded.set_by,updated_at=CURRENT_TIMESTAMP`,
      memberId, type, start, target, isDate(b.target_date) ? b.target_date : null, calories, num(b.protein_g), num(b.carbs_g), num(b.fat_g), Math.round(num(b.workouts_per_week) ?? 3), setBy);
    return await get('SELECT * FROM goals WHERE member_id = ?', memberId);
  }

  app.put('/api/goal', auth, only('member'), wrap(async (req, res) => {
    const cur = await get('SELECT * FROM goals WHERE member_id = ?', req.user.id);
    const linked = await get('SELECT 1 FROM links WHERE member_id = ?', req.user.id);
    if (cur?.set_by === 'trainer' && linked) return fail(res, 403, 'Your coach set this plan. Ask them to change it.');
    res.json(await saveGoal(req.user.id, req.body || {}, 'self', req.today));
  }));

  /* ---------- measurements ---------- */
  app.post('/api/measurements', auth, only('member'), wrap(async (req, res) => {
    const b = req.body || {};
    const date = b.date || req.today;
    if (!L.loggable(date, req.today)) return fail(res, 400, 'You can only add entries for today or yesterday.');
    const vals = {};
    for (const k of Object.keys(L.PARAMS)) {
      if (k === 'photo') continue;
      const v = num(b[k]);
      if (v != null) { if (v <= 0 || v > 600) return fail(res, 400, `${L.PARAMS[k].label} looks wrong.`); vals[k] = v; }
    }
    if (!Object.keys(vals).length) return fail(res, 400, 'Enter at least one value.');
    const cols = Object.keys(vals);
    await run(`INSERT INTO measurements (member_id,date,${cols.join(',')}) VALUES (?,?,${cols.map(() => '?').join(',')})
         ON CONFLICT(member_id,date) DO UPDATE SET ${cols.map((c) => `${c}=excluded.${c}`).join(',')}`, req.user.id, date, ...cols.map((c) => vals[c]));
    if (vals.weight != null) {
      const g = await get('SELECT * FROM goals WHERE member_id = ?', req.user.id);
      if (g && g.start_weight == null) await run('UPDATE goals SET start_weight = ?, target_weight = COALESCE(target_weight, ?) WHERE member_id = ?', vals.weight, g.type === 'maintain' ? vals.weight : null, req.user.id);
    }
    const report_id = await tryGenerateReport(req.user.id, req.today);
    res.json({ ok: true, report_id });
  }));
  app.get('/api/measurements', auth, only('member'), wrap(async (req, res) =>
    res.json(await all('SELECT * FROM measurements WHERE member_id = ? ORDER BY date', req.user.id))));

  /* ---------- food & logging ---------- */
  const foodRow = (f, source) => ({ id: f.id, name: f.name, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, serving: f.serving || '1 serving', source });
  const likeAll = (q) => q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 4);
  app.get('/api/foods/search', auth, wrap(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const cuisines = await all('SELECT cuisine, freq FROM cuisines WHERE user_id = ?', req.user.id);
    if (!q) return res.json(suggestedFoods(cuisines));
    // 1. foods this person saved, their coach's library, then the built-in dishes
    const terms = likeAll(q), cond = terms.map(() => 'LOWER(name) LIKE ?').join(' AND '), args = terms.map((t) => `%${t}%`);
    const link = await get('SELECT trainer_id FROM links WHERE member_id = ?', req.user.id);
    const mine = await all(`SELECT * FROM custom_foods WHERE user_id = ? AND scope = 'member' AND ${cond} ORDER BY id DESC LIMIT 5`, req.user.id, ...args);
    const coach = link ? await all(`SELECT * FROM custom_foods WHERE user_id = ? AND scope = 'coach' AND ${cond} ORDER BY id DESC LIMIT 5`, link.trainer_id, ...args) : [];
    const community = await all(`SELECT * FROM custom_foods WHERE shared = 1 AND scope = 'member' AND user_id != ? AND ${cond} ORDER BY id DESC LIMIT 4`, req.user.id, ...args);
    const builtin = searchFoods(q, cuisines);
    // 2. generic ingredients (USDA) and packaged products (Open Food Facts), in parallel; both optional
    let off = [];
    const offTask = q.length >= 3 && req.query.online !== '0' ? (async () => {
      try {
        const r = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=8&fields=product_name,brands,nutriments,serving_size,code`, { signal: AbortSignal.timeout(4000) });
        off = (await r.json()).products.map(offToFood).filter(Boolean);
      } catch { /* offline is fine: built-in results still work */ }
    })() : null;
    const [usda] = await Promise.all([req.query.online === '0' ? [] : searchUsda(q), offTask]);
    res.json([...mine.map((f) => foodRow(f, 'saved')), ...coach.map((f) => foodRow(f, 'coach')), ...builtin, ...usda, ...off, ...community.map((f) => foodRow(f, 'community'))]);
  }));

  /* saved foods: a member's own list, or a coach's library shown to all their clients */
  const cleanFood = (b) => {
    const kcal = num(b.kcal);
    if (!b.name?.trim() || kcal == null || kcal < 0 || kcal > 5000) return null;
    return { name: b.name.trim().slice(0, 120), kcal, protein: num(b.protein) ?? 0, carbs: num(b.carbs) ?? 0, fat: num(b.fat) ?? 0, serving: String(b.serving || '').trim().slice(0, 60) || null };
  };
  app.get('/api/foods/saved', auth, wrap(async (req, res) => {
    const rows = await all('SELECT * FROM custom_foods WHERE user_id = ? ORDER BY id DESC', req.user.id);
    res.json(rows.map((f) => ({ ...foodRow(f, req.user.role === 'trainer' ? 'coach' : 'saved'), shared: !!f.shared })));
  }));
  app.post('/api/foods/saved', auth, wrap(async (req, res) => {
    const f = cleanFood(req.body || {});
    if (!f) return fail(res, 400, 'Add a name and calories (0–5000).');
    const count = (await get('SELECT COUNT(*) AS n FROM custom_foods WHERE user_id = ?', req.user.id)).n;
    if (count >= 300) return fail(res, 400, 'You have reached the limit of 300 saved foods.');
    const dup = await get('SELECT id FROM custom_foods WHERE user_id = ? AND LOWER(name) = ?', req.user.id, f.name.toLowerCase());
    const scope = req.user.role === 'trainer' ? 'coach' : 'member', shared = scope === 'member' && req.body.shared ? 1 : 0;
    if (dup) {
      await run('UPDATE custom_foods SET kcal=?, protein=?, carbs=?, fat=?, serving=?, shared=? WHERE id = ?', f.kcal, f.protein, f.carbs, f.fat, f.serving, shared, dup.id);
      return res.json({ id: dup.id, updated: true });
    }
    const info = await run('INSERT INTO custom_foods (user_id,scope,name,kcal,protein,carbs,fat,serving,shared) VALUES (?,?,?,?,?,?,?,?,?)', req.user.id, scope, f.name, f.kcal, f.protein, f.carbs, f.fat, f.serving, shared);
    res.json({ id: Number(info.lastInsertRowid) });
  }));
  app.delete('/api/foods/saved/:id', auth, wrap(async (req, res) => {
    await run('DELETE FROM custom_foods WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
    res.json({ ok: true });
  }));
  // The "quick add" shelf: what this person logged recently and most often, plus saved and coach foods.
  app.get('/api/foods/mine', auth, only('member'), wrap(async (req, res) => {
    const pick = 'SELECT name, kcal, protein, carbs, fat FROM meals WHERE member_id = ?';
    const recent = await all(`${pick} AND id IN (SELECT MAX(id) FROM meals WHERE member_id = ? GROUP BY LOWER(name)) ORDER BY id DESC LIMIT 8`, req.user.id, req.user.id);
    const frequent = await all(`SELECT name, kcal, protein, carbs, fat, COUNT(*) AS n FROM meals WHERE member_id = ? GROUP BY LOWER(name) HAVING n >= 2 ORDER BY n DESC, MAX(id) DESC LIMIT 8`, req.user.id);
    const saved = await all("SELECT * FROM custom_foods WHERE user_id = ? AND scope = 'member' ORDER BY id DESC LIMIT 30", req.user.id);
    const link = await get('SELECT trainer_id FROM links WHERE member_id = ?', req.user.id);
    const coach = link ? await all("SELECT * FROM custom_foods WHERE user_id = ? AND scope = 'coach' ORDER BY id DESC LIMIT 30", link.trainer_id) : [];
    const tag = (rows, source) => rows.map((f) => ({ ...foodRow(f, source), serving: f.serving || '1 serving' }));
    res.json({ recent: tag(recent, 'typed'), frequent: tag(frequent, 'typed'), saved: tag(saved, 'saved'), coach: tag(coach, 'coach') });
  }));

  // Plain-language meal -> itemised estimate (Claude). Members only; a daily cap keeps costs predictable.
  app.post('/api/foods/describe', auth, only('member'), wrap(async (req, res) => {
    if (!describeEnabled()) return fail(res, 503, 'Meal descriptions are switched off on this server. Search or type your food instead.');
    const text = String(req.body?.text || '').trim().slice(0, 500);
    if (text.length < 3) return fail(res, 400, 'Describe what you ate, for example “2 rotis, dal and a small bowl of rice”.');
    if (!checkQuota(req.user.id)) return fail(res, 429, 'You have used today’s meal descriptions. Search or type your food instead, or try again tomorrow.');
    const cuisines = await all('SELECT cuisine, freq FROM cuisines WHERE user_id = ?', req.user.id);
    try {
      res.json(await describeMeal(text, { cuisines, nationality: req.user.nationality }));
    } catch (err) {
      if (err.status === 422) return fail(res, 422, err.message);
      console.error('describe failed', err.status || '', err.message);
      fail(res, 502, 'The estimate service is unavailable right now. Search or type your food instead.');
    }
  }));
  app.get('/api/foods/barcode/:code', auth, wrap(async (req, res) => {
    if (!/^\d{6,14}$/.test(req.params.code)) return fail(res, 400, 'That does not look like a barcode.');
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${req.params.code}.json?fields=product_name,brands,nutriments,serving_size,code`, { signal: AbortSignal.timeout(5000) });
      const j = await r.json();
      const food = j.status === 1 && offToFood(j.product);
      if (food) return res.json(food);
    } catch { /* fall through */ }
    fail(res, 404, 'Product not found. You can type it in instead.');
  }));
  function offToFood(p) {
    const n = p?.nutriments || {};
    const per = n['energy-kcal_serving'] != null ? 'serving' : '100g';
    const k = (key) => Number(n[`${key}_${per}`] ?? n[`${key}_100g`] ?? 0);
    const kcal = Number(n[`energy-kcal_${per}`] ?? n['energy-kcal_100g']);
    if (!p?.product_name || !Number.isFinite(kcal)) return null;
    return { name: [p.brands?.split(',')[0], p.product_name].filter(Boolean).join(' · '), kcal: Math.round(kcal), protein: Math.round(k('proteins') * 10) / 10, carbs: Math.round(k('carbohydrates') * 10) / 10, fat: Math.round(k('fat') * 10) / 10, serving: per === 'serving' ? p.serving_size || '1 serving' : '100 g', source: 'openfoodfacts' };
  }

  function checkDate(req, res) {
    const date = req.body?.date || req.query.date || req.today;
    if (!isDate(date)) { fail(res, 400, 'Invalid date.'); return null; }
    if (!L.loggable(date, req.today)) { fail(res, 400, 'Entries can only be added or changed for today and yesterday.'); return null; }
    return date;
  }

  app.get('/api/day', auth, only('member'), wrap(async (req, res) => {
    const date = req.query.date || req.today;
    if (!isDate(date)) return fail(res, 400, 'Invalid date.');
    res.json({ ...await L.daySummary(req.user.id, date), editable: L.loggable(date, req.today) });
  }));

  app.post('/api/meals', auth, only('member'), wrap(async (req, res) => {
    const date = checkDate(req, res); if (!date) return;
    const b = req.body;
    const kcal = num(b.kcal);
    if (!b.name?.trim() || kcal == null || kcal < 0 || kcal > 5000) return fail(res, 400, 'Add a name and calories (0–5000).');
    const late = date === req.today ? 0 : 1;
    const info = await run('INSERT INTO meals (member_id,date,meal_type,name,kcal,protein,carbs,fat,source,late) VALUES (?,?,?,?,?,?,?,?,?,?)',
      req.user.id, date, ['breakfast', 'lunch', 'dinner', 'snack'].includes(b.meal_type) ? b.meal_type : 'snack', b.name.trim().slice(0, 120), kcal, num(b.protein) ?? 0, num(b.carbs) ?? 0, num(b.fat) ?? 0, ['builtin', 'openfoodfacts', 'scan', 'typed', 'saved', 'coach', 'community', 'usda', 'ai'].includes(b.source) ? b.source : 'typed', late);
    res.json({ id: Number(info.lastInsertRowid), late: !!late, points: await L.computePoints(req.user.id, req.today) });
  }));
  app.delete('/api/meals/:id', auth, only('member'), wrap(async (req, res) => {
    const m = await get('SELECT * FROM meals WHERE id = ? AND member_id = ?', req.params.id, req.user.id);
    if (!m) return fail(res, 404, 'Not found.');
    if (!L.loggable(m.date, req.today)) return fail(res, 400, 'Older entries are locked.');
    await run('DELETE FROM meals WHERE id = ?', m.id);
    res.json({ ok: true });
  }));

  app.post('/api/workouts', auth, only('member'), wrap(async (req, res) => {
    const date = checkDate(req, res); if (!date) return;
    const b = req.body;
    const minutes = Math.round(num(b.minutes));
    if (!b.type?.trim() || !(minutes > 0 && minutes <= 600)) return fail(res, 400, 'Add the workout type and minutes.');
    await run('INSERT INTO workouts (member_id,date,type,minutes,kcal_burned,notes,late) VALUES (?,?,?,?,?,?,?)',
      req.user.id, date, b.type.trim().slice(0, 60), minutes, Math.round(num(b.kcal_burned) ?? 0), (b.notes || '').slice(0, 300), date === req.today ? 0 : 1);
    res.json({ ok: true, points: await L.computePoints(req.user.id, req.today) });
  }));
  app.delete('/api/workouts/:id', auth, only('member'), wrap(async (req, res) => {
    const w = await get('SELECT * FROM workouts WHERE id = ? AND member_id = ?', req.params.id, req.user.id);
    if (!w) return fail(res, 404, 'Not found.');
    if (!L.loggable(w.date, req.today)) return fail(res, 400, 'Older entries are locked.');
    await run('DELETE FROM workouts WHERE id = ?', w.id);
    res.json({ ok: true });
  }));

  app.get('/api/history', auth, only('member'), wrap(async (req, res) => {
    const from = L.addDays(req.today, -29);
    res.json(await all('SELECT date, ROUND(SUM(kcal)) kcal, COUNT(*) meals FROM meals WHERE member_id = ? AND date >= ? GROUP BY date ORDER BY date', req.user.id, from));
  }));

  /* ---------- photos ---------- */
  app.post('/api/photos', auth, only('member'), wrap(async (req, res) => {
    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(req.body?.image || '');
    if (!m) return fail(res, 400, 'Send a JPEG, PNG or WebP image.');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 8_000_000) return fail(res, 413, 'Photo is too large.');
    const pr = await L.progress(req.user.id);
    const file = `${req.user.id}-${crypto.randomUUID()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    const info = await run('INSERT INTO photos (member_id,date,file,data,mood,delta_kg) VALUES (?,?,?,?,?,?)', req.user.id, req.today, file, buf, pr.mood, pr.delta);
    const report_id = await tryGenerateReport(req.user.id, req.today);
    res.json({ id: Number(info.lastInsertRowid), mood: pr.mood, delta_kg: pr.delta, report_id });
  }));
  app.get('/api/photos', auth, only('member'), wrap(async (req, res) =>
    res.json(await all('SELECT id, date, mood, delta_kg FROM photos WHERE member_id = ? ORDER BY date DESC, id DESC', req.user.id))));
  const canSee = async (user, photoOwner) => user.id === photoOwner || await get('SELECT 1 FROM links WHERE member_id = ? AND trainer_id = ?', photoOwner, user.id);
  app.get('/api/photos/:id/file', auth, wrap(async (req, res) => {
    const p = await get('SELECT * FROM photos WHERE id = ?', req.params.id);
    if (!p || !await canSee(req.user, p.member_id)) return fail(res, 404, 'Not found.');
    res.type(path.extname(p.file)).send(p.data);
  }));
  app.delete('/api/photos/:id', auth, only('member'), wrap(async (req, res) => {
    const p = await get('SELECT * FROM photos WHERE id = ? AND member_id = ?', req.params.id, req.user.id);
    if (!p) return fail(res, 404, 'Not found.');
    await run('DELETE FROM photos WHERE id = ?', p.id);
    res.json({ ok: true });
  }));

  /* ---------- coach link ---------- */
  app.post('/api/link', auth, only('member'), wrap(async (req, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const t = await get("SELECT * FROM users WHERE invite_code = ? AND role = 'trainer'", code);
    if (!t) return fail(res, 404, 'No coach found with that code.');
    await run(`INSERT INTO links (member_id, trainer_id, cycle_start) VALUES (?,?,?)
         ON CONFLICT(member_id) DO UPDATE SET trainer_id = excluded.trainer_id, cycle_start = excluded.cycle_start, required_params = '["weight"]'`, req.user.id, t.id, req.today);
    await run('INSERT INTO notifications (user_id, kind, title, body) VALUES (?,?,?,?)', t.id, 'link', `${req.user.name} joined you`, 'Set their goal and the parameters you want tracked.');
    res.json({ ok: true, trainer: { name: t.name } });
  }));
  app.delete('/api/link', auth, only('member'), wrap(async (req, res) => {
    await run('DELETE FROM links WHERE member_id = ?', req.user.id);
    res.json({ ok: true });
  }));

  app.get('/api/reports', auth, wrap(async (req, res) => {
    const col = req.user.role === 'trainer' ? 'trainer_id' : 'member_id';
    const f = req.query.member_id && req.user.role === 'trainer' ? ' AND r.member_id = ?' : '';
    const rows = await all(`SELECT r.id, r.period_start, r.period_end, r.created_at, u.name AS member_name FROM reports r JOIN users u ON u.id = r.member_id WHERE r.${col} = ?${f} ORDER BY r.id DESC`, req.user.id, ...(f ? [req.query.member_id] : []));
    res.json(rows);
  }));
  app.get('/api/reports/:id/pdf', auth, wrap(async (req, res) => {
    const r = await get('SELECT * FROM reports WHERE id = ?', req.params.id);
    if (!r || (r.member_id !== req.user.id && r.trainer_id !== req.user.id)) return fail(res, 404, 'Not found.');
    res.type('application/pdf').attachment(`health-report-${r.period_end}.pdf`).send(r.data);
  }));

  /* ---------- trainer ---------- */
  const myMember = async (req, res) => {
    const id = Number(req.params.id);
    const l = await get('SELECT * FROM links WHERE member_id = ? AND trainer_id = ?', id, req.user.id);
    if (!l) { fail(res, 404, 'Client not found.'); return null; }
    return { link: l, user: await get('SELECT * FROM users WHERE id = ?', id) };
  };

  app.get('/api/trainer/members', auth, only('trainer'), wrap(async (req, res) => {
    const rows = await all('SELECT u.* FROM links l JOIN users u ON u.id = l.member_id WHERE l.trainer_id = ? ORDER BY u.name', req.user.id);
    res.json(await Promise.all(rows.map(async (m) => {
      const d = await L.memberDigest(m, req.today);
      const st = await L.checkinStatus(m.id, req.today);
      return { id: m.id, name: m.name, ...d, goal: await get('SELECT type, calories FROM goals WHERE member_id = ?', m.id) || null, checkin: st && { missing: st.missing, open: st.open, days_left: st.days_left }, points: (await L.computePoints(m.id, req.today)).total };
    })));
  }));

  app.get('/api/trainer/members/:id', auth, only('trainer'), wrap(async (req, res) => {
    const m = await myMember(req, res); if (!m) return;
    const id = m.user.id;
    const days = await Promise.all(Array.from({ length: 7 }, (_, i) => L.daySummary(id, L.addDays(req.today, i - 6))));
    res.json({
      user: { ...publicUser(m.user), email: undefined },
      goal: await get('SELECT * FROM goals WHERE member_id = ?', id) || null,
      required_params: JSON.parse(m.link.required_params),
      cuisines: await all('SELECT cuisine, freq FROM cuisines WHERE user_id = ?', id),
      measurements: await all('SELECT * FROM measurements WHERE member_id = ? ORDER BY date', id),
      days: days.map((d) => ({ date: d.date, kcal: d.kcal, protein: d.protein, carbs: d.carbs, fat: d.fat, meals: d.meals.map((x) => ({ name: x.name, kcal: x.kcal, meal_type: x.meal_type, late: x.late })), workouts: d.workouts })),
      photos: await all('SELECT id, date, mood, delta_kg FROM photos WHERE member_id = ? ORDER BY date DESC', id),
      reports: await all('SELECT id, period_start, period_end FROM reports WHERE member_id = ? ORDER BY id DESC', id),
      points: await L.computePoints(id, req.today),
      checkin: await L.checkinStatus(id, req.today),
      today: req.today
    });
  }));

  app.put('/api/trainer/members/:id/plan', auth, only('trainer'), wrap(async (req, res) => {
    const m = await myMember(req, res); if (!m) return;
    const b = req.body || {};
    if (b.required_params) {
      const keys = b.required_params.filter((k) => k in L.PARAMS);
      if (!keys.length) return fail(res, 400, 'Pick at least one parameter to track.');
      await run('UPDATE links SET required_params = ? WHERE member_id = ?', JSON.stringify(keys), m.user.id);
    }
    let goal = await get('SELECT * FROM goals WHERE member_id = ?', m.user.id) || null;
    if (b.goal) goal = await saveGoal(m.user.id, b.goal, 'trainer', req.today);
    await run('INSERT INTO notifications (user_id, kind, title, body) VALUES (?,?,?,?)', m.user.id, 'plan', 'Your coach updated your plan', goal ? `${goal.calories} kcal/day · ${goal.workouts_per_week} workouts/week` : 'New tracking requirements are set.');
    res.json({ ok: true, goal });
  }));

  app.delete('/api/trainer/members/:id', auth, only('trainer'), wrap(async (req, res) => {
    const m = await myMember(req, res); if (!m) return;
    await run('DELETE FROM links WHERE member_id = ?', m.user.id);
    res.json({ ok: true });
  }));

  /* ---------- static & errors ---------- */
  app.use(express.static(path.resolve('public'), { extensions: ['html'] }));
  app.use('/api', (_req, res) => fail(res, 404, 'Unknown endpoint.'));
  app.use((err, _req, res, _next) => {
    if (err.status && err.status < 500) return fail(res, err.status, err.message);
    console.error(err);
    fail(res, 500, 'Something went wrong.');
  });
  return app;
}
