/* kalma/frontend/public/sw.js
 *
 * Minimal, deliberately conservative service worker. Goal: an offline-shell
 * guardrail for the target user (intermittent rural connectivity) WITHOUT the
 * classic PWA failure mode where a cached HTML page pins users to a stale,
 * broken build they can't escape.
 *
 * Strategy:
 *   - Navigations (HTML): network-first. Only fall back to a tiny built-in
 *     offline page when the network truly fails. We never cache HTML, so a new
 *     deploy is always picked up on the next online load.
 *   - Immutable build assets (/_next/static, content-hashed): cache-first.
 *     Safe because the filename changes on every build.
 *   - Everything else (APIs, RPC proxy, dynamic data): pass straight through to
 *     the network — never cached.
 *   - skipWaiting + clients.claim so an updated SW takes over immediately, and
 *     old caches are purged on activate (CACHE_VERSION bump = full reset).
 *
 * Kill switch: bump CACHE_VERSION and the old caches are deleted on activate.
 * To fully disable, ship a sw.js whose install/activate just unregisters.
 */

const CACHE_VERSION = 'kalma-v1';
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline — Kalma</title>
<style>
  html,body{margin:0;height:100%;background:#0D1710;color:#E9E2D6;
    font-family:'DM Sans',system-ui,sans-serif}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;
    justify-content:center;text-align:center;padding:24px;box-sizing:border-box}
  .dot{width:14px;height:14px;border-radius:50%;background:#C8A84A;margin-bottom:20px}
  h1{font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:24px;margin:0 0 10px}
  p{color:#948B7D;font-size:15px;line-height:1.5;max-width:300px;margin:0 0 22px}
  button{font:inherit;font-weight:600;color:#0D1710;background:#5AAF72;border:0;
    border-radius:999px;padding:12px 22px;min-height:48px}
</style></head><body><div class="wrap">
  <div class="dot"></div>
  <h1>You're offline</h1>
  <p>Kalma needs a connection to read live weather signals. Your saved places and positions are safe.</p>
  <button onclick="location.reload()">Try again</button>
</div></body></html>`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  // Warm the offline page into the asset cache.
  event.waitUntil(
    caches.open(ASSET_CACHE).then((cache) =>
      cache.put(
        '/__offline',
        new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
      ),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin

  // Immutable, content-hashed build assets → cache-first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  // Navigations → network-first, offline page as last resort.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(ASSET_CACHE);
        return (await cache.match('/__offline')) ?? new Response('', { status: 504 });
      }),
    );
    return;
  }

  // Everything else (APIs, /api/Base Sepolia-rpc, data) → straight to network.
});
