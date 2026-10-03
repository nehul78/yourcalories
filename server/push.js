import webpush from 'web-push';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR, get, run } from './db.js';

const keyFile = path.join(DATA_DIR, 'vapid.json');
if (!existsSync(keyFile)) writeFileSync(keyFile, JSON.stringify(webpush.generateVAPIDKeys()));
const keys = JSON.parse(readFileSync(keyFile, 'utf8'));
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@yourcalories.local', keys.publicKey, keys.privateKey);
export const publicKey = keys.publicKey;

/** Stores an in-app notification and, if the user enabled it, a web push. */
export async function notify(userId, { kind, title, body, payload }) {
  run('INSERT INTO notifications (user_id, kind, title, body, payload) VALUES (?,?,?,?,?)', userId, kind, title, body, payload ? JSON.stringify(payload) : null);
  const sub = get('SELECT push_sub FROM users WHERE id = ?', userId)?.push_sub;
  if (!sub) return;
  try {
    await webpush.sendNotification(JSON.parse(sub), JSON.stringify({ title, body, tag: kind }));
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) run('UPDATE users SET push_sub = NULL WHERE id = ?', userId);
  }
}
