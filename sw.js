// ═══════════════════════════════════════════════════════════════
//  SCOUTS CACHE HUNT — Service Worker
//  Caches the app shell on install, then serves tiles from cache.
//  Tile fetches that miss cache fall through to network.
// ═══════════════════════════════════════════════════════════════

const APP_CACHE  = 'scout-app-v2';
const TILE_CACHE = 'scout-tiles-v2';

// App shell — everything needed to run offline
const APP_SHELL = [
  './',
  './scout-geocache.html',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  'https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700;800;900&display=swap',
];

// ── INSTALL: cache app shell ─────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE).then(cache => {
      // Cache what we can; don't fail install if a resource is unavailable
      return Promise.allSettled(
        APP_SHELL.map(url =>
          cache.add(url).catch(e => console.warn('[SW] Could not cache:', url, e.message))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clean up old caches ───────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== APP_CACHE && k !== TILE_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: serve from cache, fall back to network ───────────
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Map tiles — cache-first, store on miss
  if (isTile(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        } catch {
          // Offline and not cached — return a transparent 1×1 PNG
          return new Response(
            atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
            { headers: { 'Content-Type': 'image/png' } }
          );
        }
      })
    );
    return;
  }

  // Firebase / Google APIs — network only, don't cache
  if (isFirebase(url) || isGoogle(url)) {
    event.respondWith(fetch(event.request).catch(() =>
      new Response(JSON.stringify({error:'offline'}), {headers:{'Content-Type':'application/json'}})
    ));
    return;
  }

  // App shell — cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful responses for the app shell
        if (response.ok && event.request.method === 'GET') {
          caches.open(APP_CACHE).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      }).catch(() => {
        // For navigation requests return the app shell
        if (event.request.mode === 'navigate') {
          return caches.match('./scout-geocache.html');
        }
      });
    })
  );
});

// ── HELPERS ─────────────────────────────────────────────────
function isTile(url) {
  return url.includes('cartocdn.com') ||
         url.includes('tile.openstreetmap.org') ||
         url.includes('tiles.stadiamaps.com') ||
         url.includes('tile.tracestrack.com'); // handles both .webp and .png
}
function isFirebase(url) {
  return url.includes('firebaseio.com') ||
         url.includes('firebasedatabase.app') ||
         url.includes('googleapis.com') ||
         url.includes('gstatic.com');
}
function isGoogle(url) {
  return url.includes('fonts.googleapis.com') ||
         url.includes('fonts.gstatic.com');
}
