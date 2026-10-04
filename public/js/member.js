import { GET, POST, PUT, DEL, blobUrl, ctx } from './api.js';
import { h, raw, render, bind, mount, $, $$, toast, sheet, closeSheet, fmtN, fmtDate, ring, lineChart, icons, photoToDataUrl } from './ui.js';
import { drawCard, shareOrSave } from './card.js';

const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
const mealNow = () => { const hr = new Date().getHours(); return hr < 10 ? 'breakfast' : hr < 15 ? 'lunch' : hr < 18 ? 'snack' : 'dinner'; };
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const WORKOUTS = { Run: 10, Walk: 4, Strength: 6, Cycling: 8, Swim: 9, Yoga: 3, HIIT: 11, Sport: 7 };

export function memberApp(root, initial, { signOut, reload }) {
  const S = { me: initial, tab: 'today', day: 'today', data: null, history: [], photos: [], measures: [], notes: [], reports: [] };
  const view = mount(root);
  const dateOf = () => (S.day === 'today' ? S.me.today : addDays(S.me.today, -1));

  async function load() {
    const [me, data] = await Promise.all([GET('/api/me'), GET(`/api/day?date=${dateOf()}`)]);
    S.me = me; S.data = data;
    if (S.tab === 'progress') [S.history, S.photos, S.measures] = await Promise.all([GET('/api/history'), GET('/api/photos'), GET('/api/measurements')]);
    if (S.tab === 'coach') [S.notes, S.reports] = await Promise.all([GET('/api/notifications'), GET('/api/reports')]);
    draw();
  }

  /* ---------- Today ---------- */
  const today = () => {
    const { me, data } = S, g = me.goal, ed = data.editable;
    const left = g ? g.calories - data.kcal : null;
    const macro = (label, v, t, color) => h`<div><div class="macro"><span>${label}</span><b>${fmtN(v)}${t ? ` / ${t} g` : ' g'}</b></div><div class="bar"><i style="width:${t ? Math.min(100, (v / t) * 100) : 0}%;background:${color}"></i></div></div>`;
    const banner = () => {
      const c = me.checkin;
      if (c?.open && c.missing.length) return h`<button class="banner" data-act="checkin"><span class="ico">📏</span><div><b>Monthly check-in is open</b><span>Your coach needs: ${c.missing.map((k) => ctx.meta.params[k].label).join(', ')}</span></div></button>`;
      if (me.photo.due) return h`<button class="banner blue" data-act="checkin"><span class="ico">📸</span><div><b>${me.photo.last ? "It's been 30 days — time for a new photo" : 'Add your first progress photo'}</b><span>See how far you've come and celebrate it</span></div></button>`;
      return '';
    };
    return h`<h1 class="large">${S.day === 'today' ? 'Today' : 'Yesterday'}</h1><p class="sub">${fmtDate(dateOf(), { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      <div class="seg"><button data-act="day" data-d="yesterday" class="${S.day === 'yesterday' ? 'on' : ''}">Yesterday</button><button data-act="day" data-d="today" class="${S.day === 'today' ? 'on' : ''}">Today</button></div>
      <div class="lock">🔒 <span>${S.day === 'yesterday' ? 'Yesterday closes at midnight — entries earn half points.' : 'You can add or edit today and yesterday. Older days are locked.'}</span></div>
      ${banner()}
      <div class="stats"><div class="stat"><b>🔥 ${me.points.streak}</b><span>day streak</span></div><div class="stat"><b>${me.points.today}</b><span>points today</span></div><div class="stat"><b>${fmtN(me.points.total)}</b><span>${me.points.level}</span></div></div>
      <div class="card"><div class="ring-wrap"><div class="ring">${ring(data.kcal, g?.calories)}<div class="c"><b>${g ? fmtN(Math.abs(left)) : fmtN(data.kcal)}</b><span>${g ? (left >= 0 ? 'kcal left' : 'kcal over') : 'kcal eaten'}</span></div></div>
        <div class="macros">${macro('Protein', data.protein, g?.protein_g, 'var(--pink)')}${macro('Carbs', data.carbs, g?.carbs_g, 'var(--orange)')}${macro('Fat', data.fat, g?.fat_g, 'var(--blue)')}</div></div></div>
      ${MEALS.map((m) => { const items = data.meals.filter((x) => x.meal_type === m); return items.length ? h`<div class="caption">${cap(m)} · ${fmtN(items.reduce((s, x) => s + x.kcal, 0))} kcal</div><div class="list">${items.map((x) => h`<div class="row"><div class="grow"><div class="t">${x.name}</div><div class="s">P ${fmtN(x.protein)} · C ${fmtN(x.carbs)} · F ${fmtN(x.fat)}</div></div><span class="v">${fmtN(x.kcal)}</span>${ed && h`<button class="link" aria-label="Delete" data-act="delmeal" data-id="${x.id}">✕</button>`}</div>`)}</div>` : ''; })}
      ${!data.meals.length && h`<div class="card empty"><span class="ico">🍽️</span>Nothing logged yet. Tap + to search, scan or type what you ate.</div>`}
      <div class="caption">Training</div>
      <div class="list">${data.workouts.map((w) => h`<div class="row"><div class="grow"><div class="t">${w.type}</div><div class="s">${w.minutes} min${w.kcal_burned ? ` · ${w.kcal_burned} kcal` : ''}</div></div>${ed && h`<button class="link" aria-label="Delete" data-act="delwork" data-id="${w.id}">✕</button>`}</div>`)}
        <button class="row chev" data-act="addwork"><span class="grow t" style="color:var(--blue)">Add workout</span></button></div>
      <button class="fab" data-act="addfood" aria-label="Add food">+</button>`;
  };

  /* ---------- Progress ---------- */
  const progress = () => {
    const { me } = S, p = me.points, pr = me.progress;
    const series = S.measures.filter((m) => m.weight != null).map((m) => ({ date: m.date, v: m.weight }));
    const maxK = Math.max(1, me.goal?.calories || 0, ...S.history.map((x) => x.kcal));
    const days = Array.from({ length: 14 }, (_, i) => addDays(me.today, i - 13)).map((d) => ({ d, k: S.history.find((x) => x.date === d)?.kcal || 0 }));
    return h`<h1 class="large">Progress</h1>
      <div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:20px">${p.level}</b><span class="v">${fmtN(p.total)} pts${p.next_level_at ? ` · next at ${p.next_level_at}` : ''}</span></div>
        <div class="bar" style="height:8px;margin:10px 0"><i style="width:${p.next_level_at ? Math.min(100, ((p.total % 250) / 250) * 100) : 100}%;background:var(--orange)"></i></div>
        <div class="s" style="color:var(--mute);font-size:13px">Meals +5 · workouts +10 · hit your calories +25 · check-ins +15 · photo +50. Logging yesterday earns half.</div></div>
      <div class="card"><div style="display:flex;justify-content:space-between"><b>Weight</b><span class="v">${pr.current != null ? `${pr.current} kg` : ''}${pr.percent_to_goal != null ? ` · ${pr.percent_to_goal}% to goal` : ''}</span></div>${lineChart(series, me.goal?.target_weight)}
        <button class="btn secondary" style="margin-top:12px" data-act="checkin">Add check-in</button></div>
      <div class="card"><b>Calories · last 14 days</b><svg class="chart" viewBox="0 0 280 90" style="margin-top:8px" role="img" aria-label="Calories per day">
        ${me.goal ? `<line x1="0" x2="280" y1="${80 - (me.goal.calories / maxK) * 70}" y2="${80 - (me.goal.calories / maxK) * 70}" stroke="var(--green)" stroke-dasharray="3 4"/>` : ''}
        ${days.map((x, i) => `<rect x="${i * 20 + 3}" y="${80 - (x.k / maxK) * 70}" width="14" height="${(x.k / maxK) * 70}" rx="4" fill="${me.goal && x.k > me.goal.calories * 1.1 ? 'var(--orange)' : 'var(--blue)'}" opacity="${x.k ? 1 : .15}"/>`).join('')}</svg></div>
      <h2>Photos</h2>
      ${S.photos.length ? h`<div class="grid">${S.photos.map((x) => h`<button data-act="photo" data-id="${x.id}" aria-label="Photo from ${x.date}"><img data-photo="${x.id}" alt=""><span class="tag">${fmtDate(x.date)} ${x.mood === 'celebrate' ? '🎉' : '💛'}</span></button>`)}</div>` : h`<div class="card empty"><span class="ico">📸</span>Your progress photos will live here.</div>`}
      <div style="height:12px"></div><button class="btn secondary" data-act="addphoto">Add a photo</button>`;
  };

  /* ---------- Coach ---------- */
  const coach = () => {
    const { me } = S, t = me.trainer, g = me.goal, c = me.checkin;
    if (!t) return h`<h1 class="large">Coach</h1><p class="sub">Connect your trainer so they can set targets and follow your progress.</p>
      <div class="field"><label><span>Coach code</span><input id="code" placeholder="ABC123" maxlength="6" autocapitalize="characters" style="text-transform:uppercase;letter-spacing:3px"></label></div><div class="err" id="err"></div><button class="btn" data-act="link">Connect</button>`;
    return h`<h1 class="large">Coach</h1><p class="sub">Your coach sees your daily summary and receives a monthly PDF report.</p>
      <div class="list"><div class="row"><span style="font-size:30px">📋</span><div class="grow"><div class="t">${t.name}</div><div class="s">Your coach · since ${fmtDate(t.linked_at.slice(0, 10))}</div></div><span class="pill coach">Coach</span></div></div>
      <div class="caption">Plan ${g?.set_by === 'trainer' ? '· set by your coach' : '· set by you'}</div>
      ${g ? h`<div class="list"><div class="row"><span class="grow">Goal</span><span class="v">${{ lose: 'Lose', gain: 'Gain', maintain: 'Maintain' }[g.type]}${g.target_weight && g.type !== 'maintain' ? ` to ${g.target_weight} kg` : ''}</span></div>
        <div class="row"><span class="grow">Daily calories</span><span class="v">${fmtN(g.calories)}</span></div><div class="row"><span class="grow">Protein / carbs / fat</span><span class="v">${g.protein_g ?? '—'} / ${g.carbs_g ?? '—'} / ${g.fat_g ?? '—'} g</span></div>
        <div class="row"><span class="grow">Workouts per week</span><span class="v">${g.workouts_per_week}</span></div></div>` : h`<div class="card empty">No plan yet.</div>`}
      <div class="caption">Monthly check-in</div>
      <div class="list">${t.required_params.map((k) => h`<div class="row"><span class="grow">${ctx.meta.params[k].label}</span>${c?.open ? (c.missing.includes(k) ? h`<span class="pill warn">Needed</span>` : h`<span class="pill good">Done</span>`) : h`<span class="pill">Required</span>`}</div>`)}</div>
      <p class="foot">${c?.open ? (c.missing.length ? 'Add the missing items and your report is sent to your coach automatically.' : 'All set — your report was sent.') : `Check-in opens in ${c?.days_left ?? '—'} days. Your report is created as soon as every item above is in.`}</p>
      ${c?.open && c.missing.length ? h`<div style="height:12px"></div><button class="btn" data-act="checkin">Complete check-in</button>` : ''}
      ${S.reports.length ? h`<div class="caption">Reports</div><div class="list">${S.reports.map((r) => h`<button class="row chev" data-act="pdf" data-id="${r.id}"><span style="font-size:24px">📄</span><div class="grow"><div class="t">${fmtDate(r.period_start)} – ${fmtDate(r.period_end)}</div><div class="s">PDF health report</div></div></button>`)}</div>` : ''}
      ${S.notes.length ? h`<div class="caption">Updates</div><div class="list">${S.notes.slice(0, 8).map((n) => h`<div class="row"><div class="grow"><div class="t">${n.title}</div><div class="s">${n.body}</div></div></div>`)}</div>` : ''}
      <div style="height:18px"></div><button class="btn danger" data-act="unlink">Disconnect from coach</button>`;
  };

  /* ---------- Me ---------- */
  const meTab = () => {
    const { me } = S, u = me.user, locked = me.goal?.set_by === 'trainer' && me.trainer;
    return h`<h1 class="large">${u.name}</h1><p class="sub">${u.email}</p>
      <div class="caption">Profile</div><div class="list"><div class="row"><span class="grow">Nationality</span><span class="v">${u.nationality || '—'}</span></div>
        <div class="row"><span class="grow">Height</span><span class="v">${u.height_cm || '—'} cm</span></div>
        <button class="row chev" data-act="cuisines"><span class="grow">Cuisines I eat</span><span class="v">${me.cuisines.length}</span></button>
        <button class="row chev" data-act="goal"><span class="grow">My goal</span>${locked ? h`<span class="pill coach">Set by coach</span>` : ''}</button></div>
      <div class="caption">Role</div><div class="list"><div class="row"><span class="grow">You're signed in as</span><span class="pill me">Member</span></div></div>
      <p class="foot">Tip: on iPhone, open this page in Safari → Share → Add to Home Screen for the full app experience.</p>
      <div style="height:22px"></div><button class="btn danger" data-act="out">Sign out</button>`;
  };

  const TABS = [['today', 'Today', icons.today], ['progress', 'Progress', icons.chart], ['coach', 'Coach', icons.coach], ['me', 'Me', icons.me]];
  function draw() {
    const body = { today, progress, coach, me: meTab }[S.tab]();
    render(view, h`<div class="screen">${body}</div><nav class="tabbar" aria-label="Main"><div>${TABS.map(([k, l, i]) => h`<button data-act="tab" data-t="${k}" class="${S.tab === k ? 'on' : ''}" aria-label="${l}">${raw(i)}${l}</button>`)}</div></nav>`);
    $$('img[data-photo]', view).forEach(async (img) => { try { img.src = await blobUrl(`/api/photos/${img.dataset.photo}/file`); } catch { /* ignore */ } });
  }

  /* ---------- sheets ---------- */
  const act = async (fn, okMsg) => { try { await fn(); if (okMsg) toast(okMsg); } catch (e) { toast(e.message); } };

  const SRC = { saved: ['★ Mine', 'me'], coach: ['Coach', 'coach'], community: ['Friends', ''], usda: ['USDA', ''], openfoodfacts: ['Packaged', ''], ai: ['Estimate', ''] };
  const srcPill = (f) => (SRC[f.source] ? h` <span class="pill ${SRC[f.source][1]}">${SRC[f.source][0]}</span>` : '');
  const foodRow = (f, i) => h`<button class="row" data-act="pick" data-i="${i}"><div class="grow"><div class="t">${f.name}${srcPill(f)}</div><div class="s">${f.serving || ''}${f.region ? ` · ${f.region}` : ''}${f.cuisine ? ` · ${f.cuisine}` : ''}</div></div><span class="v">${fmtN(f.kcal)}</span></button>`;

  function addFood() {
    const st = { mode: 'search', meal: mealNow(), picked: null, mult: 1, stream: null, timer: null, results: [], shelves: null, est: null, descText: '' };
    const stopCam = () => { clearInterval(st.timer); st.stream?.getTracks().forEach((t) => t.stop()); st.stream = null; };
    const el = sheet(h`<div id="fs"></div>`, { onClose: stopCam });
    const body = $('#fs', el);
    const mealSeg = () => h`<div class="seg">${MEALS.map((m) => h`<button data-act="meal" data-m="${m}" class="${st.meal === m ? 'on' : ''}">${cap(m)}</button>`)}</div>`;
    const draw = () => {
      stopCam();
      if (st.picked) {
        const f = st.picked, k = st.mult, r = (n) => Math.round((n || 0) * k * 10) / 10;
        return render(body, h`<h3>${f.name}</h3><div class="card" style="text-align:center"><div style="font-size:40px;font-weight:700">${fmtN(f.kcal * k)}<small style="font-size:16px;color:var(--mute)"> kcal</small></div><div class="s" style="color:var(--mute)">${f.serving || '1 serving'} × ${k} · P ${r(f.protein)} · C ${r(f.carbs)} · F ${r(f.fat)}</div>
          ${f.source === 'builtin' || f.source === 'ai' ? h`<div class="s" style="color:var(--mute);font-size:12px;margin-top:6px">Typical values — adjust the portion to fit what you ate.</div>` : ''}</div>
          <div class="seg">${[0.5, 1, 1.5, 2].map((m) => h`<button data-act="mult" data-k="${m}" class="${k === m ? 'on' : ''}">${m}×</button>`)}</div>${mealSeg()}
          <button class="btn" data-act="saveFood">Add to ${st.meal}${S.day === 'yesterday' ? ' (yesterday)' : ''}</button>
          ${f.source !== 'saved' ? h`<button class="btn secondary" style="margin-top:10px" data-act="starFood">☆ Save to my foods</button>` : ''}
          <button class="link" style="width:100%" data-act="back">Back</button>`);
      }
      render(body, h`<h3>Add food</h3><div class="seg">${[['search', 'Search'], ['describe', 'Describe'], ['scan', 'Scan'], ['type', 'Type']].map(([k, l]) => h`<button data-act="mode" data-m="${k}" class="${st.mode === k ? 'on' : ''}">${l}</button>`)}</div>${mealSeg()}
        ${st.mode === 'search' ? h`<input class="search" id="fq" placeholder="Try “dosa”, “chapati”, “paneer” or “pasta”" autocomplete="off"><div class="scroll-list" id="res" style="margin-top:12px"></div>` : ''}
        ${st.mode === 'describe' ? h`<div class="field"><label style="display:block;padding:12px 16px"><textarea id="dt" rows="3" maxlength="500" placeholder="Describe your meal in your own words, e.g. “2 rotis, dal tadka and a small bowl of rice”" style="width:100%;border:0;background:none;outline:none;resize:none">${st.descText}</textarea></label></div>
          <button class="btn" data-act="estimate">Estimate calories</button><div id="est" style="margin-top:14px"></div>` : ''}
        ${st.mode === 'scan' ? h`<div class="scanbox"><video id="vid" playsinline muted></video></div><p class="foot" id="scanmsg" style="margin:0 0 10px">Point the camera at a barcode.</p>
          <div class="field"><label><span>Barcode</span><input id="bc" inputmode="numeric" placeholder="Or type the number"></label></div><button class="btn secondary" data-act="lookup">Look up</button>` : ''}
        ${st.mode === 'type' ? h`<div class="field"><label><span>Food</span><input id="n" placeholder="e.g. Homemade khichdi"></label><label><span>Calories</span><input id="k" inputmode="decimal" placeholder="kcal"></label>
          <label><span>Protein (g)</span><input id="p" inputmode="decimal" placeholder="optional"></label><label><span>Carbs (g)</span><input id="c" inputmode="decimal" placeholder="optional"></label><label><span>Fat (g)</span><input id="f" inputmode="decimal" placeholder="optional"></label>
          <label><span>Save to my foods</span><input type="checkbox" id="sv" class="switch" style="flex:none"></label>
          <label><span>Let friends find it</span><input type="checkbox" id="sh" class="switch" style="flex:none"></label></div>
          <button class="btn" data-act="saveTyped">Add</button>` : ''}`);
      if (st.mode === 'search') { showShelves(); $('#fq', body).focus(); }
      if (st.mode === 'scan') startScan();
    };
    // Empty search box: quick-add shelves (recent, frequent, saved, from your coach), then popular picks from their cuisines.
    const section = (title, list) => (list.length ? h`<div class="caption" style="margin:14px 4px 6px">${title}</div><div class="list">${list.map((f) => { const i = st.results.push(f) - 1; return foodRow(f, i); })}</div>` : '');
    async function showShelves() {
      const my = ++seq; st.results = [];
      try {
        const [shelf, popular] = await Promise.all([st.shelves ? Promise.resolve(st.shelves) : GET('/api/foods/mine'), GET('/api/foods/search?q=')]);
        if (my !== seq) return;
        st.shelves = shelf; st.results = [];
        render($('#res', body), h`${section('Recent', shelf.recent)}${section('Eat often', shelf.frequent)}${section('My foods', shelf.saved)}${section('From your coach', shelf.coach)}${section('Popular in your cuisines', popular)}`);
      } catch (e) { toast(e.message); }
    }
    let seq = 0, deb;
    const runSearch = async (q) => {
      const my = ++seq;
      try {
        const res = await GET(`/api/foods/search?q=${encodeURIComponent(q)}`);
        if (my !== seq) return;
        st.results = res;
        render($('#res', body), res.length ? h`<div class="list">${res.map(foodRow)}</div>` : h`<div class="empty">No matches. Try <b>Describe</b> to have it estimated, or <b>Type</b> to add it yourself.</div>`);
      } catch (e) { toast(e.message); }
    };
    body.addEventListener('input', (e) => {
      if (e.target.id === 'fq') { clearTimeout(deb); const q = e.target.value.trim(); deb = setTimeout(() => (q ? runSearch(q) : showShelves()), 250); }
      if (e.target.id === 'dt') st.descText = e.target.value;
    });
    const lookup = async (code) => {
      try { st.picked = await GET(`/api/foods/barcode/${code}`); st.mult = 1; draw(); } catch (e) { const m = $('#scanmsg', body); if (m) m.textContent = e.message; }
    };
    async function startScan() {
      const msg = $('#scanmsg', body);
      if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) { msg.textContent = 'Live scanning isn’t supported in this browser — type the barcode number instead.'; $('.scanbox', body).hidden = true; return; }
      try {
        st.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const v = $('#vid', body); v.srcObject = st.stream; await v.play();
        const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        st.timer = setInterval(async () => { try { const f = await det.detect(v); if (f[0]) { clearInterval(st.timer); lookup(f[0].rawValue); } } catch { /* frame not ready */ } }, 350);
      } catch { msg.textContent = 'Camera access was denied — type the barcode number instead.'; $('.scanbox', body).hidden = true; }
    }
    const post = (f, mult = 1) => POST('/api/meals', { date: dateOf(), meal_type: st.meal, name: f.name, kcal: Math.round(f.kcal * mult), protein: Math.round((f.protein || 0) * mult * 10) / 10, carbs: Math.round((f.carbs || 0) * mult * 10) / 10, fat: Math.round((f.fat || 0) * mult * 10) / 10, source: f.source === 'openfoodfacts' ? 'scan' : f.source || 'typed' });
    const save = (f, mult = 1) => act(async () => {
      const res = await post(f, mult);
      closeSheet(); await load(); toast(res.late ? 'Added · +2 pts (yesterday)' : 'Added · +5 pts');
    });
    // The estimate list: every line is editable before it is logged.
    const drawEst = () => {
      const box = $('#est', body); if (!box) return;
      if (!st.est) return render(box, h``);
      const total = st.est.items.reduce((a, x) => a + (x.kcal || 0), 0);
      render(box, st.est.items.length ? h`<div class="list">${st.est.items.map((x, i) => h`<div class="row"><div class="grow"><div class="t">${x.name} <span class="pill ${x.confidence === 'high' ? 'good' : x.confidence === 'low' ? 'warn' : ''}">${x.confidence}</span></div><div class="s">${x.serving} · P ${fmtN(x.protein)} · C ${fmtN(x.carbs)} · F ${fmtN(x.fat)}</div></div>
          <input data-i="${i}" class="estk" inputmode="numeric" value="${x.kcal}" aria-label="Calories for ${x.name}" style="width:64px;text-align:right;border:0;border-radius:8px;background:var(--fill);padding:6px 8px;color:var(--blue)"><button class="link" aria-label="Remove" data-act="rmest" data-i="${i}">✕</button></div>`)}</div>
        ${st.est.note ? h`<p class="foot">${st.est.note}</p>` : ''}<p class="foot">Estimates, not measurements — edit any number before adding.</p>
        <button class="btn" data-act="addest" style="margin-top:12px">Add ${st.est.items.length} item${st.est.items.length > 1 ? 's' : ''} · ${fmtN(total)} kcal</button>` : h`<div class="empty">${st.est.note || 'Nothing to estimate. Try listing the foods you ate.'}</div>`);
    };
    el.addEventListener('input', (e) => {
      if (e.target.classList.contains('estk')) { st.est.items[+e.target.dataset.i].kcal = Number(e.target.value) || 0; const b = $('[data-act=addest]', body); if (b) b.textContent = `Add ${st.est.items.length} item${st.est.items.length > 1 ? 's' : ''} · ${fmtN(st.est.items.reduce((a, x) => a + x.kcal, 0))} kcal`; }
    });
    bind(el, {
      mode: (b) => { st.mode = b.dataset.m; st.est = null; draw(); }, meal: (b) => { st.meal = b.dataset.m; draw(); },
      pick: (b) => { st.picked = st.results[+b.dataset.i]; st.mult = 1; draw(); }, mult: (b) => { st.mult = +b.dataset.k; draw(); },
      back: () => { st.picked = null; draw(); }, saveFood: () => save(st.picked, st.mult),
      starFood: () => act(async () => { const f = st.picked, k = st.mult; await POST('/api/foods/saved', { name: f.name, kcal: Math.round(f.kcal * k), protein: f.protein * k, carbs: f.carbs * k, fat: f.fat * k, serving: k === 1 ? f.serving : `${f.serving || '1 serving'} × ${k}` }); st.shelves = null; toast('Saved to My foods'); }),
      lookup: () => lookup($('#bc', body).value.trim()),
      estimate: (b) => act(async () => {
        const text = $('#dt', body).value.trim(); st.descText = text;
        b.disabled = true; b.textContent = 'Estimating…';
        try { st.est = await POST('/api/foods/describe', { text }); drawEst(); } finally { b.disabled = false; b.textContent = 'Estimate calories'; }
      }),
      rmest: (b) => { st.est.items.splice(+b.dataset.i, 1); drawEst(); },
      addest: () => act(async () => {
        for (const x of st.est.items) await post(x);
        closeSheet(); await load(); toast(`Added ${st.est.items.length} items`);
      }),
      saveTyped: () => act(async () => {
        const f = { name: $('#n', body).value, kcal: Number($('#k', body).value), protein: Number($('#p', body).value), carbs: Number($('#c', body).value), fat: Number($('#f', body).value), source: 'typed' };
        if (($('#sv', body).checked || $('#sh', body).checked) && f.name.trim()) await POST('/api/foods/saved', { ...f, shared: $('#sh', body).checked });
        await save(f);
      })
    });
    draw();
  }

  function addWork() {
    let type = 'Run';
    const el = sheet(h`<div id="ws"></div>`);
    const draw = () => render($('#ws', el), h`<h3>Add workout</h3><div class="chips" style="margin-bottom:14px">${Object.keys(WORKOUTS).map((w) => h`<button class="chip ${type === w ? 'usually' : ''}" style="min-width:calc(25% - 8px);text-align:center;padding:10px 4px" data-act="wt" data-w="${w}"><b>${w}</b></button>`)}</div>
      <div class="field"><label><span>Minutes</span><input id="wm" inputmode="numeric" placeholder="30"></label><label><span>Calories burned</span><input id="wk" inputmode="numeric" placeholder="Estimated if empty"></label></div>
      <button class="btn" data-act="save">Add${S.day === 'yesterday' ? ' (yesterday)' : ''}</button>`);
    draw();
    bind(el, {
      wt: (b) => { const m = $('#wm', el).value, k = $('#wk', el).value; type = b.dataset.w; draw(); $('#wm', el).value = m; $('#wk', el).value = k; },
      save: () => act(async () => {
        const minutes = Number($('#wm', el).value), w = S.me.latest?.weight || 70;
        const kcal = Number($('#wk', el).value) || Math.round(WORKOUTS[type] * (w / 70) * minutes * 0.9);
        await POST('/api/workouts', { date: dateOf(), type, minutes, kcal_burned: kcal });
        closeSheet(); await load(); toast('Workout added · +10 pts');
      })
    });
  }

  function checkin() {
    const required = S.me.trainer?.required_params || [];
    const open = S.me.checkin?.open;
    const need = (k) => open && S.me.checkin.missing.includes(k);
    const keys = Object.keys(ctx.meta.params).filter((k) => k !== 'photo');
    const el = sheet(h`<h3>Check-in</h3>${S.me.trainer && h`<p class="sub" style="text-align:center">${S.me.checkin?.open ? 'Fill in what your coach asked for. ' : ''}Items marked <span class="pill coach">Coach</span> are required for your monthly report.</p>`}
      <div class="field">${keys.map((k) => h`<label><span>${ctx.meta.params[k].label}${required.includes(k) && h` <span class="pill coach">Coach</span>`}</span><input data-k="${k}" inputmode="decimal" placeholder="${need(k) ? 'Needed' : ctx.meta.params[k].unit}"></label>`)}</div>
      ${h`<label class="btn secondary" style="margin-bottom:10px">${required.includes('photo') ? 'Add progress photo (Coach needs this)' : 'Add progress photo'}<input id="ph" type="file" accept="image/*" hidden></label><div class="foot" id="phname" style="text-align:center;margin:-4px 0 10px"></div>`}
      <button class="btn" data-act="save">Save check-in</button>`);
    el.addEventListener('change', (e) => { if (e.target.id === 'ph') $('#phname', el).textContent = `📷 ${e.target.files[0]?.name || ''}`; });
    bind(el, { save: () => act(async () => {
      const vals = Object.fromEntries($$('input[data-k]', el).filter((i) => i.value).map((i) => [i.dataset.k, i.value]));
      const file = $('#ph', el).files[0];
      if (!Object.keys(vals).length && !file) throw new Error('Enter at least one value or add a photo.');
      let reportId = null, photo = null;
      if (Object.keys(vals).length) reportId = (await POST('/api/measurements', vals)).report_id;
      if (file) photo = await POST('/api/photos', { image: await photoToDataUrl(file) });
      reportId = photo?.report_id || reportId;
      closeSheet(); await load();
      toast(reportId ? 'Check-in complete — report sent to your coach 📄' : 'Saved · +15 pts');
      if (photo) openPhoto(photo.id);
    }) });
  }

  async function openPhoto(id) {
    const el = sheet(h`<h3>Loading…</h3>`);
    try {
      const meta = (await GET('/api/photos')).find((p) => p.id === +id);
      const url = await blobUrl(`/api/photos/${id}/file`);
      const blob = await drawCard(url, { mood: meta.mood, delta: meta.delta_kg, name: S.me.user.name.split(' ')[0], date: fmtDate(meta.date, { month: 'long', day: 'numeric', year: 'numeric' }), id: +id });
      const preview = URL.createObjectURL(blob);
      render(el, h`<h3>${meta.mood === 'celebrate' ? 'Look how far you’ve come! 🎉' : 'You’re still showing up 💛'}</h3><img class="preview" src="${preview}" alt="Shareable progress card">
        <div class="stack"><button class="btn" data-act="share">Share…</button><button class="btn secondary" data-act="savecard">Save to my library</button><button class="btn danger" data-act="del">Delete photo</button></div>
        <p class="foot" style="text-align:center">Photos stay private. Only you and your coach can see them — sharing is always your choice.</p>`);
      bind(el, {
        share: async () => { const r = await shareOrSave(blob, `yourcalories-${meta.date}.png`, 'My progress with YourCalories'); if (r === 'saved') toast('Saved to your downloads'); },
        savecard: async () => { await shareOrSave(new Blob([blob], { type: 'image/png' }), `yourcalories-${meta.date}.png`).catch(() => {}); toast('Saved'); },
        del: () => act(async () => { await DEL(`/api/photos/${id}`); closeSheet(); await load(); }, 'Photo deleted')
      });
    } catch (e) { closeSheet(); toast(e.message); }
  }

  function goalSheet() {
    const g = S.me.goal || { type: 'lose', calories: 2000, workouts_per_week: 3 };
    const locked = g.set_by === 'trainer' && S.me.trainer;
    const el = sheet(h`<h3>My goal</h3>${locked && h`<div class="card"><span class="pill coach">Set by your coach</span><p class="sub" style="margin:8px 0 0">Your coach assigned this plan because everybody's body is different. Ask them if something should change.</p></div>`}
      <div class="seg" ${locked ? 'style="pointer-events:none;opacity:.5"' : ''}>${[['lose', 'Lose'], ['maintain', 'Maintain'], ['gain', 'Gain']].map(([v, l]) => h`<button data-act="gt" data-t="${v}" class="${g.type === v ? 'on' : ''}">${l}</button>`)}</div>
      <div class="field">${[['target_weight', 'Target (kg)', g.target_weight], ['calories', 'Calories', g.calories], ['protein_g', 'Protein (g)', g.protein_g], ['carbs_g', 'Carbs (g)', g.carbs_g], ['fat_g', 'Fat (g)', g.fat_g], ['workouts_per_week', 'Workouts / week', g.workouts_per_week]].map(([k, l, v]) => h`<label><span>${l}</span><input data-k="${k}" inputmode="decimal" value="${v ?? ''}" ${locked ? 'disabled' : ''}></label>`)}</div>
      ${!locked && h`<button class="btn secondary" data-act="suggest" style="margin-bottom:10px">Suggest from my latest weight</button><button class="btn" data-act="save">Save</button>`}`);
    let type = g.type;
    const val = (k) => $(`[data-k=${k}]`, el).value;
    bind(el, {
      gt: (b) => { type = b.dataset.t; $$('[data-act=gt]', el).forEach((x) => x.classList.toggle('on', x === b)); },
      suggest: () => act(async () => {
        const r = await POST('/api/plan/suggest', { weight: S.me.latest?.weight, type, target_weight: val('target_weight') });
        for (const k of ['calories', 'protein_g', 'carbs_g', 'fat_g']) $(`[data-k=${k}]`, el).value = r[k];
      }),
      save: () => act(async () => {
        await PUT('/api/goal', { type, ...Object.fromEntries($$('[data-k]', el).map((i) => [i.dataset.k, i.value])) });
        closeSheet(); await load();
      }, 'Goal saved')
    });
  }

  function cuisinesSheet() {
    const cur = new Map(S.me.cuisines.map((c) => [c.cuisine, c.freq]));
    const el = sheet(h`<div id="cs"></div>`);
    const draw = () => render($('#cs', el), h`<h3>Cuisines I eat</h3><div class="chips">${ctx.meta.cuisines.map((c) => { const f = cur.get(c); return h`<button class="chip ${f || ''}" data-act="c" data-c="${c}"><b>${c}</b><small>${f === 'usually' ? 'Usually' : f === 'sometimes' ? 'Sometimes' : 'Not selected'}</small></button>`; })}</div><div style="height:14px"></div><button class="btn" data-act="save">Save</button>`);
    draw();
    bind(el, {
      c: (b) => { const f = cur.get(b.dataset.c); if (!f) cur.set(b.dataset.c, 'usually'); else if (f === 'usually') cur.set(b.dataset.c, 'sometimes'); else cur.delete(b.dataset.c); draw(); },
      save: () => act(async () => { await PUT('/api/me/cuisines', { cuisines: [...cur].map(([cuisine, freq]) => ({ cuisine, freq })) }); closeSheet(); await load(); }, 'Saved')
    });
  }

  bind(view, {
    tab: async (b) => { S.tab = b.dataset.t; await load(); window.scrollTo(0, 0); },
    day: async (b) => { S.day = b.dataset.d; await load(); },
    addfood: addFood, addwork: addWork, checkin,
    delmeal: (b) => act(async () => { await DEL(`/api/meals/${b.dataset.id}`); await load(); }),
    delwork: (b) => act(async () => { await DEL(`/api/workouts/${b.dataset.id}`); await load(); }),
    photo: (b) => openPhoto(b.dataset.id),
    addphoto: checkin,
    goal: goalSheet, cuisines: cuisinesSheet,
    pdf: (b) => act(async () => { const a = Object.assign(document.createElement('a'), { href: await blobUrl(`/api/reports/${b.dataset.id}/pdf`), target: '_blank', download: 'health-report.pdf' }); a.click(); }),
    link: () => act(async () => { await POST('/api/link', { code: $('#code', view).value }); await load(); }, 'Connected to your coach'),
    unlink: () => { if (confirm('Disconnect from your coach? They will stop receiving your updates.')) act(async () => { await DEL('/api/link'); await load(); }); },
    out: signOut
  });
  load().catch((e) => toast(e.message));
}
