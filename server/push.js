import webpush from 'web-push';
import { get, run } from './db.js';

// VAPID keys live in the database so push subscriptions survive restarts on hosts without a disk.
let keys = JSON.parse((await get("SELECT value FROM settings WHERE key = 'vapid'"))?.value || 'null');
if (!keys) {
  await run("INSERT OR IGNORE INTO settings (key, value) VALUES ('vapid', ?)", JSON.stringify(webpush.generateVAPIDKeys()));
  keys = JSON.parse((await get("SELECT value FROM settings WHERE key = 'vapid'")).value);
}
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@yourcalories.local', keys.publicKey, keys.privateKey);
export const publicKey = keys.publicKey;

/** Stores an in-app notification and, if the user enabled it, a web push. */
export async function notify(userId, { kind, title, body, payload }) {
  await run('INSERT INTO notifications (user_id, kind, title, body, payload) VALUES (?,?,?,?,?)', userId, kind, title, body, payload ? JSON.stringify(payload) : null);
  const sub = (await get('SELECT push_sub FROM users WHERE id = ?', userId))?.push_sub;
  if (!sub) return;
  try {
    await webpush.sendNotification(JSON.parse(sub), JSON.stringify({ title, body, tag: kind }));
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) await run('UPDATE users SET push_sub = NULL WHERE id = ?', userId);
  }
}
