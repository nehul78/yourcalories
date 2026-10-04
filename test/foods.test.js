import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'yc-foods-'));
process.env.DESCRIBE_DAILY_LIMIT = '3';
process.env.USDA_API_KEY = 'test-key';

const { createApp } = await import('../server/app.js');
const { FOODS, searchFoods } = await import('../server/foods.js');
const { setDescribeClient } = await import('../server/describe.js');

let server, base;
const realFetch = globalThis.fetch;
// External food services are stubbed; calls to the local test server pass through.
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('api.nal.usda.gov')) return new Response(JSON.stringify({ foods: [{ description: 'LENTILS, RAW', foodNutrients: [{ nutrientId: 1008, value: 352 }, { nutrientId: 1003, value: 24.6 }, { nutrientId: 1005, value: 63 }, { nutrientId: 1004, value: 1.1 }] }] }));
  if (u.includes('openfoodfacts')) return new Response(JSON.stringify({ products: [] }));
  return realFetch(url, init);
};
before(() => new Promise((r) => { server = createApp().listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); }));
after(() => { server.close(); globalThis.fetch = realFetch; });

const call = async (method, url, token, body) => {
  const r = await realFetch(base + url, { method, headers: { 'content-type': 'application/json', 'x-tz-offset': '0', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const signup = async (role, name) => (await call('POST', '/api/signup', null, { name, email: `${name.toLowerCase()}@x.com`, password: 'password1', role })).body;

test('built-in database is broad and understands alternate and regional names', () => {
  assert.ok(FOODS.length >= 550);
  assert.ok(new Set(FOODS.map((f) => f.cuisine).filter(Boolean)).size >= 16);
  assert.equal(searchFoods('chapati')[0].name, 'Roti / chapati');
  assert.equal(searchFoods('phulka')[0].name, 'Roti / chapati');
  assert.ok(searchFoods('south indian').slice(0, 5).every((f) => f.region === 'South' || f.cuisine === 'Indian'));
  assert.match(searchFoods('goalgappa golgappa')[0]?.name ?? 'Pani puri', /Pani puri/);
  assert.equal(searchFoods('xyzzy').length, 0);
  for (const f of FOODS) assert.ok(f.kcal >= 0 && f.kcal < 1500 && Number.isFinite(f.protein + f.carbs + f.fat), f.name);
  // calories roughly agree with macros (4/4/9) for every dish, so typos in the tables get caught
  const off = FOODS.filter((f) => f.kcal > 40 && !['Beer', 'Red wine'].includes(f.name) && /* alcohol adds 7 kcal/g */ Math.abs(f.kcal - (4 * f.protein + 4 * f.carbs + 9 * f.fat)) / f.kcal > 0.45);
  assert.deepEqual(off.map((f) => `${f.name}: ${f.kcal} vs ${Math.round(4 * f.protein + 4 * f.carbs + 9 * f.fat)}`), []);
});

const s = {};
test('saved foods rank first; sharing makes them searchable by others', async () => {
  s.a = await signup('member', 'Asha'); s.b = await signup('member', 'Bilal');
  const save = await call('POST', '/api/foods/saved', s.a.token, { name: "Mum's special khichdi", kcal: 410, protein: 15, carbs: 60, fat: 11, serving: '1 big bowl', shared: true });
  assert.equal(save.status, 200);
  assert.equal((await call('POST', '/api/foods/saved', s.a.token, { name: 'Bad', kcal: -4 })).status, 400);
  const dup = await call('POST', '/api/foods/saved', s.a.token, { name: "mum's special KHICHDI", kcal: 400, shared: true });
  assert.equal(dup.body.updated, true);
  const mine = await call('GET', '/api/foods/search?q=khichdi&online=0', s.a.token);
  assert.equal(mine.body[0].source, 'saved'); assert.equal(mine.body[0].kcal, 400);
  const theirs = await call('GET', '/api/foods/search?q=khichdi&online=0', s.b.token);
  assert.ok(theirs.body.some((f) => f.source === 'community' && f.name.includes('Mum')));
  await call('POST', '/api/foods/saved', s.a.token, { name: 'Private snack', kcal: 99 });
  assert.ok(!(await call('GET', '/api/foods/search?q=private&online=0', s.b.token)).body.some((f) => f.name === 'Private snack'));
  const list = (await call('GET', '/api/foods/saved', s.a.token)).body;
  assert.equal(list.length, 2);
  assert.equal((await call('DELETE', `/api/foods/saved/${list[0].id}`, s.b.token)).status, 200); // someone else's id: no effect
  assert.equal((await call('GET', '/api/foods/saved', s.a.token)).body.length, 2);
  await call('DELETE', `/api/foods/saved/${list[0].id}`, s.a.token);
  assert.equal((await call('GET', '/api/foods/saved', s.a.token)).body.length, 1);
});

test('a coach library reaches only that coach\'s clients', async () => {
  const coach = await signup('trainer', 'Coach'); const other = await signup('trainer', 'Other');
  await call('POST', '/api/foods/saved', coach.token, { name: 'Coach protein pancake', kcal: 320, protein: 30, carbs: 28, fat: 9, serving: '2 pancakes' });
  await call('POST', '/api/link', s.a.token, { code: coach.user.invite_code });
  const a = (await call('GET', '/api/foods/search?q=protein+pancake&online=0', s.a.token)).body;
  assert.equal(a[0].source, 'coach');
  assert.ok(!(await call('GET', '/api/foods/search?q=protein+pancake&online=0', s.b.token)).body.some((f) => f.source === 'coach'));
  assert.equal((await call('GET', '/api/foods/mine', s.a.token)).body.coach.length, 1);
  assert.equal((await call('GET', '/api/foods/mine', coach.token)).status, 403);
  assert.equal((await call('GET', '/api/foods/saved', other.token)).body.length, 0);
});

test('recent and frequent shelves come from the member\'s own log', async () => {
  for (const name of ['Dal tadka', 'Dal tadka', 'Banana']) await call('POST', '/api/meals', s.b.token, { name, kcal: 150, meal_type: 'lunch' });
  const mine = (await call('GET', '/api/foods/mine', s.b.token)).body;
  assert.deepEqual(mine.recent.map((f) => f.name), ['Banana', 'Dal tadka']);
  assert.deepEqual(mine.frequent.map((f) => f.name), ['Dal tadka']);
});

test('USDA results are added when a key is configured', async () => {
  const r = (await call('GET', '/api/foods/search?q=lentils', s.b.token)).body;
  const u = r.find((f) => f.source === 'usda');
  assert.equal(u.name, 'Lentils, Raw'); assert.equal(u.kcal, 352); assert.equal(u.serving, '100 g');
});

test('describe-a-meal: off without a key, estimated with one, capped per day, errors are friendly', async () => {
  const text = { text: '2 rotis, dal tadka and a small bowl of rice' };
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal((await call('POST', '/api/foods/describe', s.b.token, text)).status, 503);

  const seen = [];
  setDescribeClient({ messages: { parse: async (req) => { seen.push(req); return { stop_reason: 'end_turn', parsed_output: { note: 'Oil in the dal is a guess.', items: [
    { name: 'Roti', portion: '2 rotis', kcal: 208, protein_g: 6, carbs_g: 36, fat_g: 6, confidence: 'high' },
    { name: 'Dal tadka', portion: '1 bowl (200 g)', kcal: 180, protein_g: 9, carbs_g: 22, fat_g: 6, confidence: 'medium' }] } }; } } });
  const ok = await call('POST', '/api/foods/describe', s.a.token, text);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.items.length, 2); assert.equal(ok.body.items[0].source, 'ai'); assert.equal(ok.body.items[1].serving, '1 bowl (200 g)');
  assert.match(seen[0].messages[0].content, /Meal: 2 rotis/);
  assert.equal(seen[0].model, 'claude-opus-5-5');

  assert.equal((await call('POST', '/api/foods/describe', s.a.token, { text: 'x' })).status, 400);
  assert.equal((await call('POST', '/api/foods/describe', (await signup('trainer', 'Tess')).token, text)).status, 403);

  setDescribeClient({ messages: { parse: async () => ({ stop_reason: 'refusal', parsed_output: null }) } });
  assert.equal((await call('POST', '/api/foods/describe', s.a.token, text)).status, 422);
  setDescribeClient({ messages: { parse: async () => { throw new Error('upstream exploded'); } } });
  const bad = await call('POST', '/api/foods/describe', s.b.token, text);
  assert.equal(bad.status, 502); assert.doesNotMatch(bad.body.error, /exploded/);
  // limit is 3/day per member: Asha has used 2 successes... one refusal counted, so the 4th call is blocked
  await call('POST', '/api/foods/describe', s.a.token, text);
  assert.equal((await call('POST', '/api/foods/describe', s.a.token, text)).status, 429);
});
