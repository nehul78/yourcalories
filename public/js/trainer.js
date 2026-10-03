import { GET, POST, PUT, DEL, blobUrl, ctx } from './api.js';
import { h, raw, render, bind, mount, $, $$, toast, sheet, closeSheet, fmtN, fmtDate, lineChart, icons } from './ui.js';

const STATUS = { 'on-track': 'On track', 'off-track': 'Off target', quiet: 'Not logged', logged: 'Logged' };

export function trainerApp(root, initial, { signOut }) {
  const S = { me: initial, tab: 'clients', detail: null, clients: [], notes: [], unread: 0 };
  const view = mount(root);
  const act = async (fn, ok) => { try { await fn(); if (ok) toast(ok); } catch (e) { toast(e.message); } };

  async function load() {
    S.me = await GET('/api/me');
    if (S.detail) S.d = await GET(`/api/trainer/members/${S.detail}`);
    else if (S.tab === 'clients') S.clients = await GET('/api/trainer/members');
    S.notes = await GET('/api/notifications');
    S.unread = S.notes.filter((n) => !n.read).length;
    draw();
  }

  const invite = () => h`<div class="card"><div class="sub" style="text-align:center;margin:0">Your coach code</div><div class="big-code">${S.me.user.invite_code}</div>
    <p class="foot" style="text-align:center">Clients enter this when they join. You'll then set their goals and what to track.</p>
    <div style="display:flex;gap:10px;justify-content:center"><button class="btn small" data-act="share">Share code</button></div></div>`;

  const clients = () => h`<h1 class="large">Clients</h1><p class="sub">Today's snapshot. You'll get one digest at ${S.me.user.notify_time}.</p>
    ${S.clients.length ? h`<div class="list">${S.clients.map((c) => h`<button class="row chev" data-act="open" data-id="${c.id}"><span class="dot ${c.status}"></span><div class="grow"><div class="t">${c.name}</div><div class="s">${c.lines[0]}</div></div>${c.checkin?.open && c.checkin.missing.length ? h`<span class="pill warn">Check-in</span>` : h`<span class="pill">${STATUS[c.status]}</span>`}</button>`)}</div>` : h`<div class="card empty"><span class="ico">👋</span>No clients yet. Share your code to get started.</div>`}
    <div class="caption">Add a client</div>${invite()}`;

  const detail = () => {
    const { d } = S, g = d.goal, u = d.user, c = d.checkin;
    const series = d.measurements.filter((m) => m.weight != null).map((m) => ({ date: m.date, v: m.weight }));
    const req = new Set(d.required_params);
    const latest = d.measurements.at(-1);
    return h`<button class="back" data-act="back">‹ Clients</button>
      <div style="display:flex;align-items:center;gap:10px"><h1 class="large" style="margin:6px 0">${u.name}</h1><span class="pill me">Client</span></div>
      <p class="sub">${[u.nationality, d.cuisines.filter((x) => x.freq === 'usually').map((x) => x.cuisine).join(', ')].filter(Boolean).join(' · ')} · ${d.points.streak}-day streak · ${d.points.total} pts</p>
      <div class="caption">Last 7 days</div>
      <div class="list">${[...d.days].reverse().map((x) => h`<details class="row" style="display:block;padding:0"><summary class="row chev" style="list-style:none"><div class="grow"><div class="t">${fmtDate(x.date, { weekday: 'short', month: 'short', day: 'numeric' })}</div><div class="s">${x.meals.length} meals · ${x.workouts.length ? x.workouts.map((w) => `${w.type} ${w.minutes}m`).join(', ') : 'no workout'}</div></div><span class="v" style="color:${g && x.kcal > g.calories * 1.1 ? 'var(--orange)' : 'var(--ink)'}">${fmtN(x.kcal)}${g ? ` / ${fmtN(g.calories)}` : ''}</span></summary>
        <div style="padding:0 16px 12px;font-size:14px;color:var(--mute)">${x.meals.length ? x.meals.map((m) => h`<div>${m.meal_type} · ${m.name} · ${fmtN(m.kcal)}${m.late ? ' (logged next day)' : ''}</div>`) : 'Nothing logged'}<div>P ${x.protein}g · C ${x.carbs}g · F ${x.fat}g</div></div></details>`)}</div>
      <div class="caption">Plan for ${u.name.split(' ')[0]}</div>
      <div class="seg">${[['lose', 'Lose'], ['maintain', 'Maintain'], ['gain', 'Gain']].map(([v, l]) => h`<button data-act="gt" data-t="${v}" class="${(g?.type || 'lose') === v ? 'on' : ''}">${l}</button>`)}</div>
      <div class="field" id="plan">${[['target_weight', 'Target (kg)', g?.target_weight], ['calories', 'Calories', g?.calories], ['protein_g', 'Protein (g)', g?.protein_g], ['carbs_g', 'Carbs (g)', g?.carbs_g], ['fat_g', 'Fat (g)', g?.fat_g], ['workouts_per_week', 'Workouts / week', g?.workouts_per_week ?? 3]].map(([k, l, v]) => h`<label><span>${l}</span><input data-k="${k}" inputmode="decimal" value="${v ?? ''}"></label>`)}
        <label><span>Target date</span><input data-k="target_date" type="date" value="${g?.target_date || ''}"></label></div>
      <button class="btn secondary" data-act="suggest" style="margin-bottom:10px">Suggest from ${u.name.split(' ')[0]}'s body data</button>
      <div class="caption">Mandatory monthly parameters</div>
      <div class="list">${Object.entries(ctx.meta.params).map(([k, p]) => h`<label class="row"><span class="grow">${p.label}</span><input type="checkbox" class="switch" data-p="${k}" ${req.has(k) ? 'checked' : ''}></label>`)}</div>
      <p class="foot">The PDF report is created automatically once ${u.name.split(' ')[0]} has entered every item switched on here. ${c ? (c.open ? (c.missing.length ? `Still missing: ${c.missing.map((k) => ctx.meta.params[k].label).join(', ')}.` : 'All received.') : `Their check-in opens in ${c.days_left} days.`) : ''}</p>
      <div style="height:12px"></div><button class="btn" data-act="saveplan">Save plan</button>
      <div class="caption">Body</div>
      <div class="card">${lineChart(series, g?.target_weight)}${latest ? h`<table><tr><th>Latest ${fmtDate(latest.date)}</th><th></th></tr>${Object.entries(ctx.meta.params).filter(([k]) => latest[k] != null).map(([k, p]) => h`<tr><td>${p.label}</td><td>${latest[k]} ${p.unit}</td></tr>`)}</table>` : ''}</div>
      <div class="caption">Photos</div>
      ${d.photos.length ? h`<div class="grid">${d.photos.map((x) => h`<button data-act="photo" data-id="${x.id}"><img data-photo="${x.id}" alt="Progress photo ${x.date}"><span class="tag">${fmtDate(x.date)}</span></button>`)}</div>` : h`<div class="card empty">No photos yet.</div>`}
      <div class="caption">Monthly reports</div>
      ${d.reports.length ? h`<div class="list">${d.reports.map((r) => h`<button class="row chev" data-act="pdf" data-id="${r.id}"><span style="font-size:24px">📄</span><div class="grow"><div class="t">${fmtDate(r.period_start)} – ${fmtDate(r.period_end)}</div><div class="s">PDF health report</div></div></button>`)}</div>` : h`<div class="card empty">The first report appears once all mandatory parameters are in.</div>`}
      <div style="height:22px"></div><button class="btn danger" data-act="remove">Remove client</button>`;
  };

  const inbox = () => h`<h1 class="large">Inbox</h1><p class="sub">Daily digests and monthly reports.</p>
    ${S.notes.length ? S.notes.map((n) => h`<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><b>${n.title}</b><span class="s" style="color:var(--mute);font-size:13px;white-space:nowrap">${fmtDate(n.created_at.slice(0, 10))}</span></div><div class="sub" style="margin:2px 0 6px">${n.body}</div>
      ${n.kind === 'digest' ? n.payload.rows.map((r) => h`<div class="digest-row"><div style="display:flex;align-items:center;gap:8px"><span class="dot ${r.status}"></span><b>${r.name}</b></div>${r.lines.map((l) => h`<div class="s" style="color:var(--mute);font-size:14px;margin-left:18px">${l}</div>`)}</div>`) : ''}
      ${n.kind === 'report' ? h`<button class="btn small secondary" data-act="pdf" data-id="${n.payload.report_id}">Open PDF</button>` : ''}
      ${n.kind === 'link' ? '' : ''}</div>`) : h`<div class="card empty"><span class="ico">🔔</span>Nothing yet. Your first digest arrives at ${S.me.user.notify_time}.</div>`}`;

  const meTab = () => h`<h1 class="large">${S.me.user.name}</h1><p class="sub">${S.me.user.email}</p>
    <div class="caption">Daily digest</div>
    <div class="list"><label class="row"><span class="grow">Send me the digest at</span><input type="time" id="nt" value="${S.me.user.notify_time}" style="border:0;background:var(--fill);border-radius:8px;padding:6px 10px;color:var(--blue)"></label>
      <label class="row"><span class="grow">Push notifications<div class="s">Phone alerts for digests & reports</div></span><input type="checkbox" class="switch" id="push" ${S.me.user.push ? 'checked' : ''}></label></div>
    <p class="foot">One summary a day, at the time you choose, so your clients' activity never interrupts your day. A morning time covers yesterday; afternoon or evening covers today.</p>
    <div class="caption">Role</div><div class="list"><div class="row"><span class="grow">You're signed in as</span><span class="pill coach">Coach</span></div></div>
    <div class="caption">Your code</div>${invite()}
    <div style="height:18px"></div><button class="btn danger" data-act="out">Sign out</button>`;

  const TABS = [['clients', 'Clients', icons.people], ['inbox', 'Inbox', icons.bell], ['me', 'Me', icons.me]];
  function draw() {
    const body = S.detail ? detail() : { clients, inbox, me: meTab }[S.tab]();
    render(view, h`<div class="screen">${body}</div><nav class="tabbar" aria-label="Main"><div>${TABS.map(([k, l, i]) => h`<button data-act="tab" data-t="${k}" class="${!S.detail && S.tab === k ? 'on' : ''}" aria-label="${l}">${raw(i)}${l}${k === 'inbox' && S.unread ? h`<span class="badge">${S.unread}</span>` : ''}</button>`)}</div></nav>`);
    $$('img[data-photo]', view).forEach(async (img) => { try { img.src = await blobUrl(`/api/photos/${img.dataset.photo}/file`); } catch { /* ignore */ } });
  }

  let gtype = 'lose';
  const readPlan = () => ({ type: gtype, ...Object.fromEntries($$('#plan [data-k]', view).map((i) => [i.dataset.k, i.value])) });

  bind(view, {
    tab: async (b) => { S.detail = null; S.tab = b.dataset.t; await load(); if (S.tab === 'inbox') { await POST('/api/notifications/read'); S.unread = 0; draw(); } },
    open: async (b) => { S.detail = Number(b.dataset.id); await load(); gtype = S.d.goal?.type || 'lose'; window.scrollTo(0, 0); },
    back: async () => { S.detail = null; await load(); },
    gt: (b) => { gtype = b.dataset.t; $$('[data-act=gt]', view).forEach((x) => x.classList.toggle('on', x === b)); },
    suggest: () => act(async () => {
      const w = [...S.d.measurements].reverse().find((m) => m.weight)?.weight;
      const r = await POST('/api/plan/suggest', { member_id: S.d.user.id, weight: w, type: gtype, target_weight: readPlan().target_weight, target_date: readPlan().target_date || undefined });
      for (const k of ['calories', 'protein_g', 'carbs_g', 'fat_g']) $(`#plan [data-k=${k}]`, view).value = r[k];
      toast(`Suggested ${r.calories} kcal (maintenance ≈ ${r.tdee})`);
    }),
    saveplan: () => act(async () => {
      const goal = readPlan();
      if (!goal.calories) throw new Error('Set daily calories first.');
      await PUT(`/api/trainer/members/${S.detail}/plan`, { goal, required_params: $$('[data-p]:checked', view).map((i) => i.dataset.p) });
      await load();
    }, 'Plan saved — your client was notified'),
    photo: (b) => act(async () => {
      const url = await blobUrl(`/api/photos/${b.dataset.id}/file`);
      sheet(h`<img class="preview" src="${url}" alt="Client photo">`);
    }),
    pdf: (b) => act(async () => { const a = Object.assign(document.createElement('a'), { href: await blobUrl(`/api/reports/${b.dataset.id}/pdf`), target: '_blank', download: 'health-report.pdf' }); a.click(); }),
    remove: () => { if (confirm('Remove this client? You will stop receiving their updates.')) act(async () => { await DEL(`/api/trainer/members/${S.detail}`); S.detail = null; await load(); }); },
    share: async () => {
      const text = `Join me on YourCalories — my coach code is ${S.me.user.invite_code}. ${location.origin}`;
      if (navigator.share) { try { await navigator.share({ text }); } catch { /* cancelled */ } } else { await navigator.clipboard?.writeText(text); toast('Invite copied'); }
    },
    out: signOut
  });

  view.addEventListener('change', (e) => {
    if (e.target.id === 'nt') act(async () => { await PUT('/api/me/settings', { notify_time: e.target.value }); toast(`Digest set for ${e.target.value}`); await load(); });
    if (e.target.id === 'push') act(() => setPush(e.target.checked).catch((err) => { e.target.checked = !e.target.checked; throw err; }));
  });

  async function setPush(on) {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg || !('PushManager' in window)) throw new Error('Push needs this app added to your Home Screen (iOS 16.4+) or a modern browser.');
    if (!on) { await (await reg.pushManager.getSubscription())?.unsubscribe(); await POST('/api/push', { subscription: null }); return; }
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked in settings.');
    const key = Uint8Array.from(atob(ctx.meta.vapid.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (ctx.meta.vapid.length % 4)) % 4)), (c) => c.charCodeAt(0));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await POST('/api/push', { subscription: sub.toJSON() });
    toast('Notifications on');
  }
  load().catch((e) => toast(e.message));
}
