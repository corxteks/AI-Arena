/* Service worker ringan: jaringan dulu, cadangan dari cache bila offline. Tidak menyentuh panggilan ke server (API). */
const CACHE = 'ai-arena-shell-v2';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(r, { cache: 'no-cache' }).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(ch => ch.put(r, c)); } return res; }).catch(() => caches.match(r).then(m => m || caches.match('./'))));
});
