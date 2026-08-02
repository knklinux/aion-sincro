/* ============================================================
   Aion Sincro — Service Worker (PWA instalable + offline)
   Cache-first para el núcleo estático, network-first para
   navegación con fallback offline. No intercepta los puentes
   (127.0.0.1:8765), el proxy ni Piper (127.0.0.1:8766): son
   peticiones a otros orígenes/puertos y quedan fuera de scope.
   ============================================================ */
const CACHE_NAME = "aion-sincro-v1";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/aion-192.png",
  "./icons/aion-512.png",
  "./icons/aion-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Solo tráfico de nuestro propio origen; los puentes/proxy/piper
  // viven en otros puertos y no deben ser cacheados jamás.
  if (url.origin !== self.location.origin) return;

  // Navegación: red primero, si falla → copia offline del índice.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          }
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Estáticos: cache-first con re-caché en segundo plano.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
    )
  );
});
