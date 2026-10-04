import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'yc-'));
process.env.CYCLE_DAYS = '0'; // monthly check-in opens immediately so the report flow is testable

const { createApp } = await import('../server/app.js');
const { sendDigests } = await import('../server/scheduler.js');
const { addDays, localDate } = await import('../server/logic.js');
const { all, get, run } = await import('../server/db.js');

let server, base;
before(() => new Promise((r) => { server = createApp().listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); }));
after(() => server.close());

const call = async (method, url, token, body) => {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', 'x-tz-offset': '0', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, body: ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};
const today = localDate(0), yesterday = addDays(today, -1);
const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const s = {};
test('sign up a coach and a member; roles are distinct', async () => {
  const t = await call('POST', '/api/signup', null, { name: 'Coach Sam', email: 'sam@x.com', password: 'password1', role: 'trainer' });
  assert.equal(t.status, 200); assert.ok(t.body.user.invite_code);
  const m = await call('POST', '/api/signup', null, { name: 'Maya', email: 'maya@x.com', password: 'password1', role: 'member' });
  assert.equal(m.body.user.invite_code, null);
  Object.assign(s, { t: t.body.token, m: m.body.token, code: t.body.user.invite_code });
  assert.equal((await call('POST', '/api/signup', null, { name: 'x', email: 'sam@x.com', password: 'password1', role: 'member' })).status, 409);
  assert.equal((await call('GET', '/api/trainer/members', s.m)).status, 403);
  assert.equal((await call('POST', '/api/meals', s.t, {})).status, 403);
});

test('nationality drives cuisine suggestions; onboarding saves', async () => {
  const sug = await call('GET', '/api/cuisines/suggest?nationality=India', s.m);
  assert.equal(sug.body[0], 'Indian');
  await call('PUT', '/api/me/profile', s.m, { nationality: 'India', sex: 'female', birth_year: 1994, height_cm: 165 });
  await call('PUT', '/api/me/cuisines', s.m, { cuisines: [{ cuisine: 'Indian', freq: 'usually' }, { cuisine: 'Italian', freq: 'sometimes' }] });
  const food = await call('GET', '/api/foods/search?q=rice&online=0', s.m);
  assert.ok(food.body.length);
  const me = await call('GET', '/api/me', s.m);
  assert.equal(me.body.cuisines.length, 2);
});

test('goal from parameters; trainer can then lock the plan', async () => {
  await call('POST', '/api/measurements', s.m, { weight: 70, waist: 80 });
  const sug = await call('POST', '/api/plan/suggest', s.m, { weight: 70, type: 'lose', target_weight: 65 });
  assert.ok(sug.body.calories > 1200);
  assert.equal((await call('PUT', '/api/goal', s.m, { type: 'lose', target_weight: 65, ...sug.body })).status, 200);
  assert.equal((await call('POST', '/api/link', s.m, { code: 'NOPE' })).status, 404);
  assert.equal((await call('POST', '/api/link', s.m, { code: s.code })).status, 200);
  const list = await call('GET', '/api/trainer/members', s.t);
  s.mid = list.body[0].id;
  const put = await call('PUT', `/api/trainer/members/${s.mid}/plan`, s.t, { required_params: ['weight', 'waist', 'photo'], goal: { type: 'lose', target_weight: 64, calories: 1800, protein_g: 130, carbs_g: 180, fat_g: 55, workouts_per_week: 4 } });
  assert.equal(put.body.goal.set_by, 'trainer');
  assert.equal((await call('PUT', '/api/goal', s.m, { type: 'gain', calories: 3000 })).status, 403);
  const me = await call('GET', '/api/me', s.m);
  assert.deepEqual(me.body.trainer.required_params, ['weight', 'waist', 'photo']);
});

test('can only log today or yesterday; yesterday earns fewer points', async () => {
  const ok = await call('POST', '/api/meals', s.m, { name: 'Dal', kcal: 300, meal_type: 'lunch' });
  assert.equal(ok.status, 200);
  const y = await call('POST', '/api/meals', s.m, { name: 'Toast', kcal: 100, date: yesterday });
  assert.equal(y.body.late, true);
  assert.equal((await call('POST', '/api/meals', s.m, { name: 'Old', kcal: 100, date: addDays(today, -2) })).status, 400);
  assert.equal((await call('POST', '/api/meals', s.m, { name: 'Future', kcal: 100, date: addDays(today, 1) })).status, 400);
  assert.equal((await call('POST', '/api/workouts', s.m, { type: 'Run', minutes: 30, date: addDays(today, -5) })).status, 400);
  const w = await call('POST', '/api/workouts', s.m, { type: 'Run', minutes: 30, kcal_burned: 250 });
  assert.equal(w.status, 200);
  // locked: cannot delete an older meal
  await run('INSERT INTO meals (member_id,date,name,kcal) VALUES (?,?,?,?)', (await get('SELECT id FROM users WHERE email=?', 'maya@x.com')).id, addDays(today, -3), 'old', 1);
  const old = await get("SELECT id FROM meals WHERE name='old'");
  assert.equal((await call('DELETE', `/api/meals/${old.id}`, s.m)).status, 400);
  const me = await call('GET', '/api/me', s.m);
  assert.ok(me.body.points.total >= 5 + 2 + 10);
});

test('monthly report only after every mandatory parameter is in', async () => {
  let me = await call('GET', '/api/me', s.m);
  assert.deepEqual(me.body.checkin.missing, ['photo']); // weight + waist already logged today
  assert.equal((await call('GET', '/api/reports', s.t)).body.length, 0);
  const photo = await call('POST', '/api/photos', s.m, { image: tiny });
  assert.equal(photo.status, 200);
  assert.ok(photo.body.report_id, 'report generated once photo completed the set');
  const reports = (await call('GET', '/api/reports', s.t)).body;
  assert.equal(reports.length, 1);
  const pdf = await call('GET', `/api/reports/${reports[0].id}/pdf`, s.t);
  assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
  const other = await call('POST', '/api/signup', null, { name: 'Eve', email: 'eve@x.com', password: 'password1', role: 'trainer' });
  assert.equal((await call('GET', `/api/reports/${reports[0].id}/pdf`, other.body.token)).status, 404);
  assert.equal((await call('GET', `/api/photos/${photo.body.id}/file`, s.t)).status, 200); // linked coach may see it
  assert.equal((await call('GET', `/api/photos/${photo.body.id}/file`, other.body.token)).status, 404);
});

test('photo mood: positive progress celebrates, otherwise motivates', async () => {
  // a month passes: backdate the earlier photo and weigh-in
  await run('UPDATE photos SET date = ?', addDays(today, -30));
  await run('UPDATE measurements SET date = ?', addDays(today, -30));
  await call('POST', '/api/measurements', s.m, { weight: 68 });
  const up = await call('POST', '/api/photos', s.m, { image: tiny });
  assert.equal(up.body.mood, 'celebrate'); assert.equal(up.body.delta_kg, -2);
  await run('UPDATE photos SET date = ?', addDays(today, -30));
  await call('POST', '/api/measurements', s.m, { weight: 71 });
  const down = await call('POST', '/api/photos', s.m, { image: tiny });
  assert.equal(down.body.mood, 'motivate');
});

test('trainer receives one digest at their chosen time, not before', async () => {
  await call('PUT', '/api/me/settings', s.t, { notify_time: '20:00' });
  const at = (h, m) => Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8), h, m);
  await sendDigests(at(19, 30));
  assert.equal((await call('GET', '/api/notifications', s.t)).body.filter((n) => n.kind === 'digest').length, 0);
  await sendDigests(at(20, 1));
  await sendDigests(at(20, 2));
  const d = (await call('GET', '/api/notifications', s.t)).body.filter((n) => n.kind === 'digest');
  assert.equal(d.length, 1);
  assert.equal(d[0].payload.rows[0].name, 'Maya');
  assert.match(d[0].payload.rows[0].lines[1], /Run 30 min/);
});
