/* ============================================================
   CollectiveVoice Service Worker
   Strategy:
     - Cache-first for static assets (/css/, /js/, /images/)
     - Network-first for API calls (/api/)
     - Network-first for everything else (SPA shell)
   ============================================================ */

const CACHE_NAME    = "cv-static-v1";
const API_PREFIX    = "/api/";
const STATIC_EXTS   = [".css", ".js", ".png", ".svg", ".woff2", ".jpg", ".webp"];
const PRECACHE_URLS = [
  "/",
  "/css/index.css",
  "/js/app.js"
];

// ── Install: pre-cache the shell ─────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: route requests ─────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests entirely (POST /api/ etc.)
  if (request.method !== "GET") return;

  // ── API calls: network-first ──────────────────────────────
  if (url.pathname.startsWith(API_PREFIX)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // ── Static assets: cache-first ────────────────────────────
  const ext = url.pathname.slice(url.pathname.lastIndexOf("."));
  if (STATIC_EXTS.includes(ext) ||
      url.pathname.startsWith("/css/") ||
      url.pathname.startsWith("/js/") ||
      url.pathname.startsWith("/images/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ── SPA shell: network-first, fallback to cache ───────────
  event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()); // don't await — background update
    }
    return response;
  } catch {
    // Truly offline and not cached — return empty 503
    return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
  }
}
