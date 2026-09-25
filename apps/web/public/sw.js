/* NusaQuant — service worker "selalu segar, siap luring".
 * Halaman & API: jaringan dulu; jaringan mati → versi terakhir tersimpan.
 * Aset ber-hash: cache-first. Versi baru: skipWaiting + controllerchange → aktif otomatis.
 */
const VERSI = 'nq-v1';
const HALAMAN = [`${VERSI}-halaman`];
const ASET = [`${VERSI}-aset`];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(HALAMAN).then((cache) => cache.addAll(['/nominasi']).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const simpan = new Set([...HALAMAN, ...ASET]);
      for (const kunci of await caches.keys()) {
        if (!simpan.has(kunci)) await caches.delete(kunci);
      }
      await self.clients.claim();
    })(),
  );
});

function asetStatis(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icon-') || url.pathname === '/apple-icon.png' || url.pathname === '/manifest.webmanifest';
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (asetStatis(url)) {
    event.respondWith(
      caches.open(ASET).then(async (cache) => {
        const hit = await cache.match(request);
        const jaringan = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => hit);
        return hit || jaringan;
      }),
    );
    return;
  }

  if (request.mode === 'navigate' || (url.pathname.startsWith('/api/') && url.pathname !== '/api/harga')) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(HALAMAN);
          return (await cache.match(request)) || (await cache.match('/nominasi')) || Response.error();
        }
      })(),
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'pasang') {
    self.skipWaiting();
    return;
  }
  if (event.data === 'bersihkan') {
    event.waitUntil(
      (async () => {
        for (const kunci of await caches.keys()) await caches.delete(kunci);
      })(),
    );
  }
});
