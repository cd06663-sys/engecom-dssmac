const CACHE = 'dssmac-v1';

const PRECACHE = [
  '/css/team.css',
  '/js/team.js',
  '/img/logo.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Skip non-GET
  if (req.method !== 'GET') return;

  // Skip same-origin API calls — always network
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // Cache-first with network fallback and dynamic caching
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;

      return fetch(req).then(res => {
        if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
          caches.open(CACHE).then(c => c.put(req, res.clone()));
        }
        return res;
      }).catch(() => {
        // Offline fallback for navigation
        if (req.mode === 'navigate') {
          return caches.match('/equipe/').then(fb =>
            fb || new Response(
              '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DSSMAC — Offline</title><style>body{font-family:sans-serif;text-align:center;padding:60px 24px;background:#f1f3f6;color:#1a2a45}h2{color:#1a3a6b}p{color:#555}</style></head><body><h2>&#128268; Sem Conexão</h2><p>Abra o app novamente quando tiver internet para carregar os dados da equipe.</p></body></html>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            )
          );
        }
      });
    })
  );
});
