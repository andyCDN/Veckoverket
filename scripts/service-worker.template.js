// Generated at export time. Only the public app shell and listed static files
// enter this cache. Account data and Google requests use their existing storage.
const CONFIG = JSON.parse("__PWA_CONFIG_JSON__");
const CACHE = CONFIG.cachePrefix + CONFIG.version;
const ASSETS = new Set(CONFIG.assets);
const ROOT = new URL(CONFIG.scope, self.location.origin).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        await cache.addAll(
          CONFIG.assets.map(
            (path) =>
              new Request(new URL(path, self.location.origin), {
                cache: "reload",
                credentials: "omit",
              }),
          ),
        );
      } catch (error) {
        await caches.delete(CACHE);
        throw error;
      }
    })(),
  );
  // Updates wait for existing windows to close, preserving open editing forms.
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith(CONFIG.cachePrefix) && name !== CACHE)
          await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});
async function cached(path) {
  const cache = await caches.open(CACHE);
  return cache.match(new URL(path, self.location.origin).href);
}
async function navigation(request) {
  try {
    const response = await fetch(request);
    if (response.status < 500) return response;
  } catch {
    // Reopen the public shell. Workspace storage restores the user's own plan.
  }
  return (await cached(CONFIG.scope)) || Response.error();
}
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    request.headers.has("authorization") ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(CONFIG.scope)
  )
    return;

  // Never store navigation URLs, query strings or authentication callback codes.
  if (url.pathname === new URL(ROOT).pathname) {
    if (request.mode === "navigate") event.respondWith(navigation(request));
    return;
  }
  if (!ASSETS.has(url.pathname)) return;
  if (url.pathname.endsWith(".webmanifest")) {
    event.respondWith(
      fetch(request).catch(
        async () => (await cached(url.pathname)) || Response.error(),
      ),
    );
    return;
  }
  event.respondWith(
    (async () => (await cached(url.pathname)) || fetch(request))(),
  );
});
