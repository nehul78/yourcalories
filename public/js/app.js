import { GET, POST, PUT, DEL, getToken, setToken, whenAuthLost, ctx } from './api.js';
import { h, raw, render, bind, mount, $, $$, toast, fmtN, photoToDataUrl } from './ui.js';
import { memberApp } from './member.js';
import { trainerApp } from './trainer.js';

const root = $('#app');

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

async function boot() {
  ctx.meta = await GET('/api/meta');
  whenAuthLost(() => welcome());
  if (!getToken()) return welcome();
  try {
    const me = await GET('/api/me');
    return start(me);
  } catch { return welcome(); }
}

export function start(me) {
  if (me.user.role === 'trainer') return trainerApp(root, me, { signOut });
  if (!me.user.onboarded) return onboarding(me);
  return memberApp(root, me, { signOut, reload: async () => start(await GET('/api/me')) });
}

export async function signOut() {
  try { await POST('/api/logout'); } catch { /* already out */ }
  setToken(null);
  welcome();
}

/* ---------------- welcome / auth ---------------- */
export function welcome() {
  let mode = 'up', role = 'member';
  const view = mount(root);
  const draw = () => render(view, h`<div class="screen plain">
      <div class="hero"><img class="logo" src="/icons/icon.svg" alt=""><h1>YourCalories</h1><p>Eat well. Train smart. Together.</p></div>
      <div class="seg"><button data-act="mode" data-m="up" class="${mode === 'up' ? 'on' : ''}">Create account</button><button data-act="mode" data-m="in" class="${mode === 'in' ? 'on' : ''}">Sign in</button></div>
      ${mode === 'up' && h`
        <button class="role ${role === 'member' ? 'on' : ''}" data-act="role" data-r="member"><span class="ico">🎯</span><div><b>I'm working on my goal</b><span>Track meals, workouts and progress</span></div></button>
        <button class="role ${role === 'trainer' ? 'on' : ''}" data-act="role" data-r="trainer"><span class="ico">📋</span><div><b>I'm a coach</b><span>Guide clients and get daily digests</span></div></button>`}
      <form id="auth" class="field" style="margin-top:14px">
        ${mode === 'up' && h`<label><span>Name</span><input name="name" autocomplete="name" placeholder="Your name" required></label>`}
        <label><span>Email</span><input name="email" type="email" autocomplete="email" placeholder="you@example.com" required></label>
        <label><span>Password</span><input name="password" type="password" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}" placeholder="8+ characters" minlength="8" required></label>
      </form>
      <div class="err" id="err"></div>
      <button class="btn" data-act="go">${mode === 'up' ? 'Continue' : 'Sign in'}</button>
    </div>`);
  draw();
  bind(view, {
    mode: (el) => { mode = el.dataset.m; draw(); },
    role: (el) => { role = el.dataset.r; draw(); },
    go: async (el) => {
      const form = $('#auth', view);
      if (!form.reportValidity()) return;
      el.disabled = true;
      try {
        const r = await POST(mode === 'up' ? '/api/signup' : '/api/login', { ...Object.fromEntries(new FormData(form)), role });
        setToken(r.token);
        start(await GET('/api/me'));
      } catch (e) { $('#err', view).textContent = e.message; el.disabled = false; }
    }
  });
}

/* ---------------- member onboarding ---------------- */
const STEPS = ['nationality', 'cuisines', 'body', 'goal', 'photo', 'coach'];
function onboarding(me) {
  const st = { step: 0, nationality: me.user.nationality || '', suggested: [], cuisines: new Map(), q: '',
    sex: 'female', birth_year: '', height_cm: '', weight: '', waist: '', activity: 'light',
    type: 'lose', target_weight: '', target_date: '', plan: null, photo: null };
  const view = mount(root);
  const dots = () => raw(`<div class="steps">${STEPS.map((_, i) => `<i class="${i === st.step ? 'on' : ''}"></i>`).join('')}</div>`);
  const nav = (next, label = 'Continue', ok = true) => h`<div class="err" id="err"></div><button class="btn" data-act="${next}" ${ok ? '' : 'disabled'}>${label}</button>${st.step > 0 && h`<button class="link" style="width:100%" data-act="prev">Back</button>`}`;
  const num = (name) => Number($(`[name=${name}]`, view)?.value) || '';
  const read = () => { for (const k of ['birth_year', 'height_cm', 'weight', 'waist', 'target_weight']) if ($(`[name=${k}]`, view)) st[k] = $(`[name=${k}]`, view).value; if ($('[name=activity]', view)) st.activity = $('[name=activity]', view).value; if ($('[name=target_date]', view)) st.target_date = $('[name=target_date]', view).value; if ($('[name=calories]', view)) st.plan = { ...st.plan, calories: num('calories'), protein_g: num('protein_g'), carbs_g: num('carbs_g'), fat_g: num('fat_g') }; };

  const screens = {
    nationality: () => {
      const q = st.q.toLowerCase();
      const list = ctx.meta.nationalities.filter((n) => n.toLowerCase().includes(q));
      return h`<h1 class="large">Where are you from?</h1><p class="sub">We'll tailor food suggestions to the cuisines you grew up with.</p>
        <input class="search" id="q" placeholder="Search countries" value="${st.q}" autocomplete="off">
        <div class="list scroll-list" style="margin-top:12px">${list.map((n) => h`<button class="row" data-act="nat" data-n="${n}"><span class="grow t">${n}</span>${st.nationality === n && h`<span class="check">✓</span>`}</button>`)}</div>
        ${nav('next', 'Continue', !!st.nationality)}`;
    },
    cuisines: () => h`<h1 class="large">What do you eat?</h1><p class="sub">Tap once for <b style="color:var(--green)">usually</b>, twice for <b style="color:var(--orange)">sometimes</b>, again to clear.</p>
        <div class="chips">${st.suggested.map((c) => { const f = st.cuisines.get(c); return h`<button class="chip ${f || ''}" data-act="cuisine" data-c="${c}"><b>${c}</b><small>${f === 'usually' ? 'Usually' : f === 'sometimes' ? 'Sometimes' : 'Not selected'}</small></button>`; })}</div>
        <div style="height:16px"></div>${nav('next', 'Continue', st.cuisines.size > 0)}`,
    body: () => h`<h1 class="large">About you</h1><p class="sub">Your starting point — we use it to suggest a realistic plan.</p>
        <div class="seg">${['female', 'male', 'other'].map((s) => h`<button data-act="sex" data-s="${s}" class="${st.sex === s ? 'on' : ''}">${s[0].toUpperCase() + s.slice(1)}</button>`)}</div>
        <div class="field">
          <label><span>Birth year</span><input name="birth_year" inputmode="numeric" placeholder="1994" value="${st.birth_year}"></label>
          <label><span>Height (cm)</span><input name="height_cm" inputmode="decimal" placeholder="170" value="${st.height_cm}"></label>
          <label><span>Weight (kg)</span><input name="weight" inputmode="decimal" placeholder="72" value="${st.weight}"></label>
          <label><span>Waist (cm)</span><input name="waist" inputmode="decimal" placeholder="Optional" value="${st.waist}"></label>
          <label><span>Activity</span><select name="activity">${[['sedentary', 'Mostly sitting'], ['light', 'Light (1–3 days)'], ['moderate', 'Moderate (3–5 days)'], ['active', 'Very active']].map(([v, l]) => h`<option value="${v}" ${st.activity === v ? 'selected' : ''}>${l}</option>`)}</select></label>
        </div>${nav('toGoal', 'Continue')}`,
    goal: () => h`<h1 class="large">Your goal</h1><p class="sub">${me.trainer ? '' : 'You can change this any time. If you add a coach, they can fine-tune it.'}</p>
        <div class="seg">${[['lose', 'Lose'], ['maintain', 'Maintain'], ['gain', 'Gain']].map(([v, l]) => h`<button data-act="gtype" data-t="${v}" class="${st.type === v ? 'on' : ''}">${l}</button>`)}</div>
        ${st.type !== 'maintain' && h`<div class="field"><label><span>Target (kg)</span><input name="target_weight" inputmode="decimal" placeholder="${Number(st.weight) - (st.type === 'lose' ? 5 : -4) || ''}" value="${st.target_weight}"></label>
          <label><span>By (optional)</span><input name="target_date" type="date" value="${st.target_date}"></label></div>`}
        <div class="card"><div class="sub" style="margin:0 0 8px">Suggested daily plan</div>
          <div class="field" style="margin:0"><label><span>Calories</span><input name="calories" inputmode="numeric" value="${st.plan?.calories ?? ''}"></label>
          <label><span>Protein (g)</span><input name="protein_g" inputmode="numeric" value="${st.plan?.protein_g ?? ''}"></label>
          <label><span>Carbs (g)</span><input name="carbs_g" inputmode="numeric" value="${st.plan?.carbs_g ?? ''}"></label>
          <label><span>Fat (g)</span><input name="fat_g" inputmode="numeric" value="${st.plan?.fat_g ?? ''}"></label></div>
          <button class="link" data-act="recalc">Recalculate suggestion</button></div>
        ${nav('saveGoal', 'Save goal')}`,
    photo: () => h`<h1 class="large">Your starting photo</h1><p class="sub">Private by default. We'll gently remind you every ${ctx.meta.cycle_days} days so you can see how far you've come — and celebrate it.</p>
        ${st.photo ? h`<img class="preview" src="${st.photo}" alt="Your photo">` : h`<div class="card empty"><span class="ico">📸</span>No photo yet</div>`}
        <label class="btn secondary" style="margin-bottom:10px">${st.photo ? 'Retake photo' : 'Take or choose a photo'}<input id="file" type="file" accept="image/*" hidden></label>
        ${nav('savePhoto', st.photo ? 'Continue' : 'Skip for now')}`,
    coach: () => h`<h1 class="large">Training with a coach?</h1><p class="sub">Ask your coach for their 6-letter code. They'll set your targets and see your daily summary — you stay in control of everything else.</p>
        <div class="field"><label><span>Coach code</span><input name="code" placeholder="ABC123" autocapitalize="characters" maxlength="6" style="text-transform:uppercase;letter-spacing:3px"></label></div>
        <div class="err" id="err"></div><button class="btn" data-act="link">Connect to my coach</button>
        <button class="btn secondary" style="margin-top:10px" data-act="finish">I'll do this later</button>`
  };
  const draw = () => { render(view, h`<div class="screen plain">${dots()}${screens[STEPS[st.step]]()}</div>`); };
  const err = (m) => { $('#err', view).textContent = m; };
  const go = (n) => { st.step = n; draw(); window.scrollTo(0, 0); };

  const recalc = async () => {
    read();
    const r = await POST('/api/plan/suggest', { weight: st.weight, type: st.type, target_weight: st.target_weight, target_date: st.target_date || undefined });
    st.plan = r;
  };
  draw();
  view.addEventListener('input', (e) => { if (e.target.id === 'q') { st.q = e.target.value; const pos = e.target.selectionStart; draw(); const q = $('#q', view); q.focus(); q.setSelectionRange(pos, pos); } });
  view.addEventListener('change', async (e) => {
    if (e.target.id !== 'file' || !e.target.files[0]) return;
    st.photo = await photoToDataUrl(e.target.files[0]); draw();
  });
  bind(view, {
    prev: () => { read(); go(st.step - 1); },
    nat: async (el) => { st.nationality = el.dataset.n; st.suggested = await GET(`/api/cuisines/suggest?nationality=${encodeURIComponent(st.nationality)}`); draw(); },
    next: () => go(st.step + 1),
    cuisine: (el) => { const c = el.dataset.c, f = st.cuisines.get(c); if (!f) st.cuisines.set(c, 'usually'); else if (f === 'usually') st.cuisines.set(c, 'sometimes'); else st.cuisines.delete(c); draw(); },
    sex: (el) => { read(); st.sex = el.dataset.s; draw(); },
    toGoal: async () => {
      read();
      if (!(Number(st.height_cm) >= 100 && Number(st.weight) > 20 && Number(st.birth_year) > 1920)) return err('Add your birth year, height and weight.');
      try { await PUT('/api/me/profile', { nationality: st.nationality, sex: st.sex, birth_year: st.birth_year, height_cm: st.height_cm, activity: st.activity });
        await PUT('/api/me/cuisines', { cuisines: [...st.cuisines].map(([cuisine, freq]) => ({ cuisine, freq })) });
        await recalc(); go(3); } catch (e) { err(e.message); }
    },
    gtype: async (el) => { read(); st.type = el.dataset.t; await recalc(); draw(); },
    recalc: async () => { await recalc(); draw(); },
    saveGoal: async () => {
      read();
      try {
        if (st.type !== 'maintain' && !Number(st.target_weight)) return err('Enter your target weight.');
        await POST('/api/measurements', { weight: st.weight, waist: st.waist });
        await PUT('/api/goal', { type: st.type, start_weight: st.weight, target_weight: st.target_weight, target_date: st.target_date, ...st.plan, workouts_per_week: 3 });
        go(4);
      } catch (e) { err(e.message); }
    },
    savePhoto: async () => { try { if (st.photo) await POST('/api/photos', { image: st.photo }); go(5); } catch (e) { err(e.message); } },
    link: async () => { try { await POST('/api/link', { code: $('[name=code]', view).value }); await PUT('/api/me/finish-onboarding'); start(await GET('/api/me')); } catch (e) { err(e.message); } },
    finish: async () => { await PUT('/api/me/finish-onboarding'); start(await GET('/api/me')); }
  });
}

boot();
