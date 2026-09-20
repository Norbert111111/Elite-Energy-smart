const CACHE_NAME = 'elite-energy-pwa-v8';
const urlsToCache = ['./', './index.html', './index1.html', './index2.html', './device-labels.js', './live-features.js', './provisioning.js', './style.css', './style1.css', './style2.css', './manifest.json', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('elite') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request)));
});
self.addEventListener('push', event => {
  let payload = { title: 'ELITE ENERGY', body: 'Nouvelle information disponible.', url: './index2.html' };
  try { payload = { ...payload, ...event.data.json() }; } catch (_) {}
  event.waitUntil(self.registration.showNotification(payload.title, { body: payload.body, icon: './icon-192.png', badge: './icon-192.png', tag: payload.tag || 'elite-energy', renotify: true, vibrate: [200, 100, 200], data: { url: payload.url || './index2.html' } }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const target = new URL(event.notification.data.url, self.location.origin).href;
    for (const client of windows) { if ('focus' in client) { client.navigate(target); return client.focus(); } }
    return clients.openWindow(target);
  }));
});
