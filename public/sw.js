// Service worker del sistema DGDC: deja la aplicación guardada en el equipo para abrirla sin señal (libro de obra
// en terreno). Los datos NO pasan por aquí: los maneja la copia local de Firebase. Solo se guarda el código.
const CACHE = 'dgdc-app-v1';
const BASE = new URL('./', self.location).pathname;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.add(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  // Páginas: primero la red (siempre la versión nueva); sin señal, la última guardada.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(resp => {
          if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then(c => c.put(BASE, copia)); }
          return resp;
        })
        .catch(() => caches.match(BASE))
    );
    return;
  }

  // Código e imágenes con nombre versionado (/assets/...): se guardan la primera vez que se usan.
  if (url.pathname.startsWith(`${BASE}assets/`) || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(guardado => guardado || fetch(req).then(resp => {
        if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
        return resp;
      }))
    );
  }
});
