import { all, get, run } from './db.js';
import { addDays, localDate, localMinutes, memberDigest } from './logic.js';
import { notify } from './push.js';
import { tryGenerateReport } from './report.js';

const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/**
 * Sends each trainer ONE digest per day at the time they chose, so they aren't pinged all day.
 * A morning digest (before noon) covers yesterday; an afternoon/evening digest covers today.
 */
export async function sendDigests(now = Date.now()) {
  for (const t of await all("SELECT * FROM users WHERE role = 'trainer'")) {
    const today = localDate(t.tz_offset, now);
    const mins = localMinutes(t.tz_offset, now);
    const at = toMin(t.notify_time || '20:00');
    if (t.last_digest_date === today || mins < at || mins - at > 180) continue;
    await run('UPDATE users SET last_digest_date = ? WHERE id = ?', today, t.id);
    const members = await all('SELECT u.* FROM links l JOIN users u ON u.id = l.member_id WHERE l.trainer_id = ? ORDER BY u.name', t.id);
    if (!members.length) continue;
    const date = at < 12 * 60 ? addDays(today, -1) : today;
    const rows = await Promise.all(members.map((m) => memberDigest(m, date)));
    const quiet = rows.filter((r) => r.status === 'quiet').length;
    const ok = rows.filter((r) => r.status === 'on-track').length;
    await notify(t.id, {
      kind: 'digest',
      title: `Daily digest · ${date === today ? 'today' : 'yesterday'}`,
      body: `${members.length} client${members.length > 1 ? 's' : ''}: ${ok} on track${quiet ? `, ${quiet} haven't logged` : ''}.`,
      payload: { date, rows }
    });
  }
}

export async function sweepReports(now = Date.now()) {
  for (const m of await all('SELECT u.id, u.tz_offset FROM links l JOIN users u ON u.id = l.member_id')) {
    await tryGenerateReport(m.id, localDate(m.tz_offset, now));
  }
}

export function startScheduler() {
  const tick = () => sendDigests().then(sweepReports).catch((e) => console.error('scheduler', e));
  const timer = setInterval(tick, 60_000);
  timer.unref();
  tick();
  return timer;
}
