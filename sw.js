/* ============================================================
   ScanRig Service Worker — v2.0
   Strategy:
     App shell (HTML, manifest, icons, fonts) → Cache-first
     Data shards (JSON from GitHub raw) → Network-first with cache fallback
   ============================================================ */
'use strict';

const CACHE_NAME = 'scanrig-v2';

/* Files that make up the app shell — cached on install */
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&display=swap'
];

/* ---- Install: pre-cache the app shell ---- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

/* ---- Activate: delete stale caches from previous versions ---- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---- Fetch: route requests to the right strategy ---- */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Network-first for shard data — always try to get fresh JSON,
     fall back to whatever is cached if the network is down.
     Covers both local /shards/ path and raw.githubusercontent.com. */
  const isShard =
    url.pathname.startsWith('/shards/') ||
    url.hostname === 'raw.githubusercontent.com';

  if (isShard) {
    event.respondWith(networkFirstShard(event.request));
    return;
  }

  /* Cache-first for app shell — respond instantly from cache,
     fall back to network for anything not yet cached. */
  event.respondWith(cacheFirst(event.request));
});

/* Network-first: fetch from network, update cache, fall back to cache */
async function networkFirstShard(request) {
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch {
    const cached = await caches.match(request);
    return cached || Response.error();
  }
}

/* Cache-first: serve from cache, fall back to network */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    return await fetch(request);
  } catch {
    return Response.error();
  }
}
