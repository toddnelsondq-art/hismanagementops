importScripts('/version.js');

const CACHE_NAME = `his-ops-v${self.DQ_OPS_VERSION}-${self.DQ_OPS_BUILD}`;
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/temperature.css',
  '/his-theme.css',
  '/subscription.css',
  '/auth.js',
  '/financial-reports.js',
  '/version.js',
  '/app.js',
  '/food-safety-questions.js',
  '/food-safety-manager-expanded.js',
  '/food-safety-quiz.js',
  '/manifest.webmanifest',
  '/assets/his-management.png',
  '/assets/pwa-icon-192.png',
  '/assets/pwa-icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const open = windows.find(client => new URL(client.url).origin === self.location.origin);
    return open ? open.focus() : clients.openWindow(event.notification.data?.url || '/');
  }));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/functions/')) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match('/index.html')))
  );
});
