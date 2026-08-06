// ════════════════════════════════════════════════════════════════
//  SERVICE WORKER — Sistema Meteorológico Antártico
//  Estrategia:
//   · SHELL (HTML/CSS/JS/íconos) → cache-first: la app abre offline.
//   · DATOS (Open-Meteo, Google Sheets, mapas, tiles) → network-only:
//     nunca se sirve pronóstico viejo desde caché.
//  Al cambiar archivos del shell, sube el número de versión (v1→v2)
//  para forzar la actualización en los dispositivos ya instalados.
// ════════════════════════════════════════════════════════════════

const CACHE = "meteo-antartico-v1";

// Recursos propios que forman el "cascarón" de la app.
// Rutas relativas → funcionan en cualquier subcarpeta de GitHub Pages.
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./css/widget.css",
  "./css/mapa-viento.css",
  "./js/app.js",
  "./js/config.js",
  "./js/utils.js",
  "./js/estacion.js",
  "./js/pronostico.js",
  "./js/graficos.js",
  "./js/calculadora.js",
  "./js/meteotabla.js",
  "./js/mapa-viento.js",
  "./js/mapa.js",
  "./js/resumen.js",
  "./js/vista-resumen.js",
  "./js/iconos.js",
  "./data/windchill.json",
  "./assets/logo.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-512.png",
];

// Hosts cuyos recursos NUNCA se cachean (datos vivos y mapas).
const HOSTS_DATOS = [
  "api.open-meteo.com",
  "docs.google.com",
  "unpkg.com",           // leaflet / leaflet-velocity (tiles y libs pesadas)
  "tile.openstreetmap.org",
  "server.arcgisonline.com",
  "triton.directemar.cl",
  "web.directemar.cl",
  "meteoarmada.directemar.cl",
];

// ── Instalación: precachea el shell ──────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // addAll falla si un solo recurso 404ea; se cachea uno a uno
      // para que la instalación no se caiga por un archivo ausente.
      Promise.allSettled(SHELL.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

// ── Activación: limpia cachés antiguos ───────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // 1) Datos vivos y mapas → siempre a la red (sin caché).
  if (HOSTS_DATOS.some((h) => url.hostname.includes(h))) {
    event.respondWith(fetch(req).catch(() => new Response("", { status: 504 })));
    return;
  }

  // 2) Navegación (abrir la app) → red primero, si falla usa el cache.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // 3) Resto (shell) → cache primero; si no está, red y se guarda.
  event.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
        return res;
      }).catch(() => hit)
    )
  );
});
