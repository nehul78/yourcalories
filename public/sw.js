const CACHE = 'yc-v1';
const SHELL = ['/', '/css/app.css', '/js/app.js', '/js/api.js', '/js/ui.js', '/js/card.js', '/js/member.js', '/js/trainer.js', '/icons/icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
// App shell: network first (so updates land), cache as offline fallback. API calls are never cached.
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
self.addEventListener('push', (e) => {
  const d = e.data?.json() || { title: 'YourCalories', body: '' };
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, tag: d.tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('/'))));
});
