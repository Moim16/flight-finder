// =============================================================================
//  Service worker minimo: cachea el "cascaron" (HTML, manifest, iconos) para que
//  la app ABRA rapido. Las posiciones (/api/) y el mapa NUNCA se cachean aqui:
//  un avion de hace un minuto ya no esta donde estaba.
// =============================================================================

// Se sube la version cuando cambia algo del cascaron: si no, el service
// worker sigue sirviendo el archivo viejo del cache.
const CACHE = "radar-v1";
const SHELL = [
  "/", "/index.html", "/manifest.webmanifest",
  "/icon.svg", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero para el cascaron (asi se ve siempre la ultima version) y el
// cache solo como respaldo sin conexion.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && (SHELL.includes(url.pathname) || e.request.mode === "navigate")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request.mode === "navigate" ? "/" : e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request.mode === "navigate" ? "/" : e.request))
  );
});
