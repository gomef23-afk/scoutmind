// ScoutMind service worker — the installable app's offline shell (Day 6).
//
// What it caches, and what it never touches:
//   page loads (HTML)        network first, cached copy if offline, then
//                            /offline.html. A deploy shows on the next load.
//   shell files (below)      precached at install, then stale-while-revalidate
//   crests / player photos   cache first in a small image cache (300 entries)
//   Supabase, /api/          NEVER intercepted or cached: every read and
//                            write goes to the network as if this file did not
//                            exist. Account data never lands in a cache.
//
// VERSION is a hash of every PRECACHE file, written by
// `node scripts/bump-sw.mjs`. tests/sw-version.test.js fails when a shell file
// changed and VERSION did not (CLAUDE.md rule 24), so an old shell can never
// outlive a deploy: a new VERSION is a new cache, and activate drops the old.

const VERSION = 'sm-0c49d265eef9';
const SHELL = 'scoutmind-shell-' + VERSION;
const IMAGES = 'scoutmind-img-v1';
const IMAGE_MAX = 300;

// BEGIN PRECACHE (scripts/bump-sw.mjs reads this list; paths under public/)
const PRECACHE = [
  '/',
  '/about.html',
  '/community.html',
  '/auth.html',
  '/privacy.html',
  '/terms.html',
  '/offline.html',
  '/manifest.json',
  '/pwa.js',
  '/i18n.js',
  '/sm_auth.js',
  '/club_names.js',
  '/leagues_data.js',
  '/favicon.svg',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/vendor/supabase-js-2.119.0.js',
  '/vendor/fonts/fonts.css',
  '/vendor/fonts/bebas-neue-normal-400-latin.woff2',
  '/vendor/fonts/bebas-neue-normal-400-latin-ext.woff2',
  '/vendor/fonts/dm-mono-normal-400-latin.woff2',
  '/vendor/fonts/dm-mono-normal-400-latin-ext.woff2',
  '/vendor/fonts/dm-mono-normal-500-latin.woff2',
  '/vendor/fonts/dm-mono-normal-500-latin-ext.woff2',
  '/vendor/fonts/dm-sans-italic-300-latin.woff2',
  '/vendor/fonts/dm-sans-italic-300-latin-ext.woff2',
  '/vendor/fonts/dm-sans-normal-300-700-latin.woff2',
  '/vendor/fonts/dm-sans-normal-300-700-latin-ext.woff2',
];
// END PRECACHE

const IMAGE_HOSTS = ['media.api-sports.io'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      // cache: 'reload' so the precache never comes from a stale HTTP cache.
      .then((c) => c.addAll(PRECACHE.map((p) => new Request(p, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith('scoutmind-') && k !== SHELL && k !== IMAGES)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // writes: untouched
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    if (IMAGE_HOSTS.includes(url.hostname)) event.respondWith(imageCacheFirst(req));
    return;                                               // Supabase and everything else: untouched
  }
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/v1/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(pageNetworkFirst(req));
    return;
  }
  event.respondWith(shellStaleWhileRevalidate(req));
});

/** HTML: the network, so a deploy is live at once; offline, the last copy. */
async function pageNetworkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(new URL(req.url).pathname, res.clone());
    return res;
  } catch (e) {
    return (await cache.match(req, { ignoreSearch: true }))
      || (await cache.match(new URL(req.url).pathname === '/' ? '/' : new URL(req.url).pathname))
      || (await cache.match('/offline.html'))
      || Response.error();
  }
}

/** Shell files: answer from the cache, refresh it in the background. */
async function shellStaleWhileRevalidate(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req, { ignoreSearch: true });
  const fresh = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await fresh) || Response.error();
}

/** Crests and photos: rarely change; keep at most IMAGE_MAX, oldest out first. */
async function imageCacheFirst(req) {
  const cache = await caches.open(IMAGES);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    // Only real CORS responses. An opaque one (an <img> without crossorigin)
    // is padded to megabytes of quota per entry in Chrome; the crests and
    // photos are requested with crossorigin="anonymous" for this reason.
    if (res.ok && res.type !== 'opaque') {
      await cache.put(req, res.clone());
      const keys = await cache.keys();
      for (let i = 0; i < keys.length - IMAGE_MAX; i++) await cache.delete(keys[i]);
    }
    return res;
  } catch (e) {
    return Response.error();
  }
}
