// ════════════════════════════════════════════════════════════════
//  CARTA SINÓPTICA ANIMADA — Base Prat
//  · Fondo de COLOR por bandas oficiales de 5 kt
//  · BARBAS de viento adaptativas al zoom
//  · PARTÍCULAS animadas
//  · ISOBARAS de presión (marching squares)
//  · LÍNEA DE TIEMPO: días 1-3 cada 1 h, días 4-10 cada 3 h
//    con controles de hora, día y play automático
//  · Auto-refresco del pronóstico
//
//  Una sola descarga trae toda la serie; la línea de tiempo solo
//  re-renderiza la hora visible (rápido).
//  Datos: Open-Meteo (GFS): viento 10 m + presión, serie horaria.
// ════════════════════════════════════════════════════════════════

import { SECTORES } from "./config.js?v=20260721010000";
import { setSectorActivo } from "./pronostico.js?v=20260721010000";
import { cargarMeteotabla } from "./meteotabla.js?v=20260721010000";

const BBOX = { latN: -53.0, latS: -70.0, lonW: -75.0, lonE: -53.0 };
const PASO = 0.75;
const FORECAST_DAYS = 10;
const REFRESCO_MS = 2 * 60 * 60 * 1000;    // auto-refresco cada 2 h (amable con la API)
const MS_A_KT = 1.943844;
const PLAY_MS = 700;                        // ms por paso en la animación

let mapa = null;
let capaColor = null, capaViento = null, capaBarbas = null, capaIsobaras = null, capaMarcadores = null;
let controlCapas = null;

// Estado de la serie temporal.
let SERIE = null;      // { nx, ny, lats, lons, tiempos, velKt[][], dir[][], pres[][] }
let PASOS = [];        // índices horarios seleccionados
let pasoActual = 0;    // posición en PASOS
let playTimer = null;

// ════════════════════════════════════════════════════════════════
//  ESCALA DE COLOR OFICIAL (bandas de 5 kt).
// ════════════════════════════════════════════════════════════════
const BANDAS = [
  [0, "#ffffff"], [5, "#cdeef5"], [10, "#8fd7e8"], [15, "#4fb8dd"],
  [20, "#9fdca0"], [25, "#4fbf5f"], [30, "#f2f24f"], [35, "#f2c040"],
  [40, "#f29040"], [45, "#e6402f"], [50, "#c02020"], [55, "#8f1515"],
  [60, "#b040d0"],
];
const hexARGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BANDAS_RGB = BANDAS.map(([u, h]) => [u, hexARGB(h)]);
function colorBandaRGB(kt) {
  let c = BANDAS_RGB[0][1];
  for (const [u, rgb] of BANDAS_RGB) if (kt >= u) c = rgb;
  return c;
}

// ════════════════════════════════════════════════════════════════
//  GRILLA.
// ════════════════════════════════════════════════════════════════
function construirGrilla() {
  const nx = Math.round((BBOX.lonE - BBOX.lonW) / PASO) + 1;
  const ny = Math.round((BBOX.latN - BBOX.latS) / PASO) + 1;
  const lats = [], lons = [];
  for (let j = 0; j < ny; j++) {
    const lat = BBOX.latN - j * PASO;
    for (let i = 0; i < nx; i++) {
      lats.push(+lat.toFixed(4));
      lons.push(+(BBOX.lonW + i * PASO).toFixed(4));
    }
  }
  return { nx, ny, lats, lons };
}

// ════════════════════════════════════════════════════════════════
//  DESCARGA de la serie horaria completa (POST).
// ════════════════════════════════════════════════════════════════
// Espera n milisegundos.
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Descarga con reintento: ante un 429 (límite de la API) espera y
// reintenta con espera creciente, en vez de fallar de inmediato.
async function descargarSerie(lats, lons, intentos = 3) {
  for (let i = 0; i < intentos; i++) {
    const res = await fetch("https://api.open-meteo.com/v1/forecast", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        latitude: lats.join(","),
        longitude: lons.join(","),
        hourly: "wind_speed_10m,wind_direction_10m,pressure_msl",
        wind_speed_unit: "ms",
        forecast_days: String(FORECAST_DAYS),
        timezone: "UTC",
      }),
    });
    if (res.ok) {
      const json = await res.json();
      return Array.isArray(json) ? json : [json];
    }
    if (res.status === 429 && i < intentos - 1) {
      // Límite de peticiones: espera creciente (5 s, 15 s) y reintenta.
      await esperar(5000 * (i * 2 + 1));
      continue;
    }
    throw new Error(`HTTP ${res.status}`);
  }
}

// ── Caché de la serie en el navegador ────────────────────────────
// Guarda la última serie descargada para no volver a pedirla en cada
// recarga (evita gastar el cupo de la API mientras se desarrolla y
// permite ver el mapa aunque la API esté temporalmente saturada).
const CACHE_KEY = "mv_serie_cache";
const CACHE_VIGENCIA_MS = 60 * 60 * 1000;   // 1 h

function guardarCache(puntos) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), puntos }));
  } catch (e) { /* almacenamiento lleno o no disponible: se ignora */ }
}

function leerCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, puntos } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_VIGENCIA_MS) return null;   // caducada
    return puntos;
  } catch (e) { return null; }
}

// ════════════════════════════════════════════════════════════════
//  PROCESO de la serie: matrices [paso][punto].
// ════════════════════════════════════════════════════════════════
function construirPasos(totalHoras) {
  const pasos = [];
  for (let h = 0; h < totalHoras; h++) {
    const dia = Math.floor(h / 24) + 1;
    if (dia <= 3) pasos.push(h);
    else if (h % 3 === 0) pasos.push(h);
  }
  return pasos;
}

function procesarSerie(puntos, nx, ny) {
  const npts = puntos.length;
  const horas0 = puntos[0].hourly;
  const totalHoras = horas0.time.length;
  const tiempos = horas0.time;   // array de strings ISO (UTC)

  PASOS = construirPasos(totalHoras);

  // Para cada paso, arrays por punto de velKt, dir, pres.
  const velKt = [], dir = [], pres = [];
  for (const h of PASOS) {
    const vRow = new Float32Array(npts);
    const dRow = new Float32Array(npts);
    const pRow = new Float32Array(npts);
    for (let k = 0; k < npts; k++) {
      const hr = puntos[k].hourly;
      const v = hr.wind_speed_10m[h];
      vRow[k] = v != null ? v * MS_A_KT : 0;
      dRow[k] = hr.wind_direction_10m[h] ?? 0;
      pRow[k] = hr.pressure_msl[h] ?? NaN;
    }
    velKt.push(vRow); dir.push(dRow); pres.push(pRow);
  }

  const { lats, lons } = construirGrilla();
  return { nx, ny, lats, lons, tiempos, velKt, dir, pres };
}

// ════════════════════════════════════════════════════════════════
//  U/V para partículas de un paso dado.
// ════════════════════════════════════════════════════════════════
function velocityDataDe(paso) {
  const { nx, ny, velKt, dir } = SERIE;
  const vel = velKt[paso], dr = dir[paso];
  const npts = vel.length;
  const uData = new Array(npts), vData = new Array(npts);
  for (let k = 0; k < npts; k++) {
    const ms = vel[k] / MS_A_KT;
    const rad = (dr[k] * Math.PI) / 180;
    uData[k] = -ms * Math.sin(rad);
    vData[k] = -ms * Math.cos(rad);
  }
  const headerBase = {
    nx, ny, dx: PASO, dy: PASO,
    la1: BBOX.latN, la2: BBOX.latS, lo1: BBOX.lonW, lo2: BBOX.lonE,
    parameterCategory: 2, parameterUnit: "m.s-1", refTime: new Date().toISOString(),
  };
  return [
    { header: { ...headerBase, parameterNumber: 2, parameterNumberName: "eastward_wind" }, data: uData },
    { header: { ...headerBase, parameterNumber: 3, parameterNumberName: "northward_wind" }, data: vData },
  ];
}

// ════════════════════════════════════════════════════════════════
//  FONDO DE COLOR por bandas.
// ════════════════════════════════════════════════════════════════
function bilineal(grid, nx, ny, fx, fy) {
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, nx - 1), y1 = Math.min(y0 + 1, ny - 1);
  const dx = fx - x0, dy = fy - y0;
  const v00 = grid[y0 * nx + x0], v10 = grid[y0 * nx + x1];
  const v01 = grid[y1 * nx + x0], v11 = grid[y1 * nx + x1];
  return (v00 * (1 - dx) + v10 * dx) * (1 - dy) + (v01 * (1 - dx) + v11 * dx) * dy;
}

function generarColorURL(velKt, nx, ny) {
  const escala = 10;
  const W = (nx - 1) * escala, H = (ny - 1) * escala;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(W, H);
  for (let py = 0; py < H; py++) {
    const fy = (py / H) * (ny - 1);
    for (let px = 0; px < W; px++) {
      const fx = (px / W) * (nx - 1);
      const kt = bilineal(velKt, nx, ny, fx, fy);
      const [r, g, b] = colorBandaRGB(kt);
      const idx = (py * W + px) * 4;
      img.data[idx] = r; img.data[idx + 1] = g; img.data[idx + 2] = b;
      img.data[idx + 3] = kt < 5 ? 90 : 205;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL();
}

// ════════════════════════════════════════════════════════════════
//  BARBAS (adaptativas al zoom).
// ════════════════════════════════════════════════════════════════
function barbaSVG(kt) {
  let v = Math.round(kt / 5) * 5;
  const banderines = Math.floor(v / 50); v -= banderines * 50;
  const plumasL = Math.floor(v / 10); v -= plumasL * 10;
  const plumasC = Math.floor(v / 5);
  const L = 26;
  if (kt < 2.5) return `<circle cx="0" cy="0" r="3" fill="none" stroke="#3a3a3a" stroke-width="1.2"/>`;
  let e = `<line x1="0" y1="0" x2="0" y2="${L}" stroke="#3a3a3a" stroke-width="1.4"/>`;
  let pos = L;
  for (let i = 0; i < banderines; i++) { e += `<polygon points="0,${pos} 0,${pos - 6} 9,${pos - 3}" fill="#3a3a3a"/>`; pos -= 7; }
  for (let i = 0; i < plumasL; i++) { e += `<line x1="0" y1="${pos}" x2="10" y2="${pos - 4}" stroke="#3a3a3a" stroke-width="1.4"/>`; pos -= 4; }
  for (let i = 0; i < plumasC; i++) { e += `<line x1="0" y1="${pos}" x2="5" y2="${pos - 2}" stroke="#3a3a3a" stroke-width="1.4"/>`; pos -= 4; }
  return e;
}

// Paso de muestreo de barbas según el zoom actual.
function pasoBarbasPorZoom() {
  const z = mapa ? mapa.getZoom() : 5;
  if (z <= 4) return 3;
  if (z <= 5) return 2;
  return 1;
}

function crearCapaBarbas(paso) {
  const { nx, ny, lats, lons, velKt, dir } = SERIE;
  const vel = velKt[paso], dr = dir[paso];
  const capa = L.layerGroup();
  const step = pasoBarbasPorZoom();
  for (let j = 0; j < ny; j += step) {
    for (let i = 0; i < nx; i += step) {
      const idx = j * nx + i;
      const kt = vel[idx], d = dr[idx];
      const icon = L.divIcon({
        className: "mv-barba",
        html: `<svg width="30" height="34" viewBox="-12 -4 30 34" style="transform:rotate(${d}deg)">${barbaSVG(kt)}</svg>`,
        iconSize: [30, 34], iconAnchor: [15, 15],
      });
      L.marker([lats[idx], lons[idx]], { icon, interactive: false, keyboard: false }).addTo(capa);
    }
  }
  return capa;
}

// ════════════════════════════════════════════════════════════════
//  ISOBARAS.
// ════════════════════════════════════════════════════════════════
function crearCapaIsobaras(paso) {
  const { nx, ny, pres } = SERIE;
  const presData = pres[paso];
  const capa = L.layerGroup();
  const vals = [];
  for (const v of presData) if (!isNaN(v)) vals.push(v);
  if (!vals.length) return capa;
  const pmin = Math.min(...vals), pmax = Math.max(...vals);
  const intervalo = 4;
  const geoX = (fx) => BBOX.lonW + (fx / (nx - 1)) * (BBOX.lonE - BBOX.lonW);
  const geoY = (fy) => BBOX.latN - (fy / (ny - 1)) * (BBOX.latN - BBOX.latS);

  for (let nivel = Math.ceil(pmin / intervalo) * intervalo; nivel <= pmax; nivel += intervalo) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const v00 = presData[j * nx + i], v10 = presData[j * nx + i + 1];
        const v01 = presData[(j + 1) * nx + i], v11 = presData[(j + 1) * nx + i + 1];
        if ([v00, v10, v01, v11].some(isNaN)) continue;
        const cr = [];
        const it = (a, b) => (nivel - a) / (b - a);
        if ((v00 < nivel) !== (v10 < nivel)) cr.push([i + it(v00, v10), j]);
        if ((v10 < nivel) !== (v11 < nivel)) cr.push([i + 1, j + it(v10, v11)]);
        if ((v01 < nivel) !== (v11 < nivel)) cr.push([i + it(v01, v11), j + 1]);
        if ((v00 < nivel) !== (v01 < nivel)) cr.push([i, j + it(v00, v01)]);
        if (cr.length >= 2) {
          L.polyline(
            [[geoY(cr[0][1]), geoX(cr[0][0])], [geoY(cr[1][1]), geoX(cr[1][0])]],
            { color: "#d02020", weight: 1, opacity: 0.75, interactive: false }
          ).addTo(capa);
        }
      }
    }
  }
  return capa;
}

// ════════════════════════════════════════════════════════════════
//  RENDER de un paso (re-dibuja las 4 capas de datos).
// ════════════════════════════════════════════════════════════════
function renderPaso(paso) {
  if (!SERIE) return;
  const { nx, ny, velKt } = SERIE;

  [capaColor, capaViento, capaBarbas, capaIsobaras].forEach((c) => c && c.remove());
  if (controlCapas) controlCapas.remove();

  const url = generarColorURL(velKt[paso], nx, ny);
  const bounds = [[BBOX.latN, BBOX.lonW], [BBOX.latS, BBOX.lonE]];
  capaColor = L.imageOverlay(url, bounds, { opacity: 0.8, interactive: false }).addTo(mapa);
  capaIsobaras = crearCapaIsobaras(paso).addTo(mapa);
  capaBarbas = crearCapaBarbas(paso).addTo(mapa);
  capaViento = L.velocityLayer({
    displayValues: true,
    displayOptions: {
      velocityType: "Viento 10 m", position: "bottomleft", emptyString: "Sin datos",
      angleConvention: "bearingCW", speedUnit: "kt", directionString: "Dirección", speedString: "Velocidad",
    },
    data: velocityDataDe(paso), minVelocity: 0, maxVelocity: 30,
    velocityScale: 0.008, particleAge: 60, particleMultiplier: 1 / 350,
    lineWidth: 1, colorScale: ["rgba(60,60,60,0.55)"], opacity: 0.8,
  }).addTo(mapa);

  controlCapas = agregarControlCapas();
  actualizarEtiquetaTiempo(paso);
}

// ════════════════════════════════════════════════════════════════
//  LÍNEA DE TIEMPO (slider + botones + play).
// ════════════════════════════════════════════════════════════════
function etiquetaTiempo(paso) {
  const iso = SERIE.tiempos[PASOS[paso]];         // "2026-07-26T15:00"
  const d = new Date(iso + "Z");
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const dia = dias[d.getUTCDay()];
  const fecha = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const hora = `${String(d.getUTCHours()).padStart(2, "0")}:00`;
  return `${dia} ${fecha} · ${hora} UTC`;
}

function actualizarEtiquetaTiempo(paso) {
  const el = document.getElementById("mv-tiempo-label");
  if (el) el.textContent = etiquetaTiempo(paso);
  const sld = document.getElementById("mv-slider");
  if (sld) sld.value = paso;
}

function irAPaso(paso) {
  pasoActual = Math.max(0, Math.min(PASOS.length - 1, paso));
  renderPaso(pasoActual);
}

const SVG_PLAY = '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M8 5 L18 12 L8 19 Z" fill="currentColor"/></svg>';
const SVG_PAUSA = '<svg viewBox="0 0 24 24" width="15" height="15"><rect x="7" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg>';

function play() {
  if (playTimer) return;
  const btn = document.getElementById("mv-play");
  if (btn) btn.innerHTML = SVG_PAUSA;
  playTimer = setInterval(() => {
    let sig = pasoActual + 1;
    if (sig >= PASOS.length) sig = 0;
    irAPaso(sig);
  }, PLAY_MS);
}
function pausa() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  const btn = document.getElementById("mv-play");
  if (btn) btn.innerHTML = SVG_PLAY;
}
function togglePlay() { playTimer ? pausa() : play(); }

function crearControlTiempo() {
  const ctrl = L.control({ position: "bottomleft" });
  ctrl.onAdd = () => {
    const div = L.DomUtil.create("div", "mv-tiempo");
    div.innerHTML = `
      <div class="mv-tiempo-top">
        <button id="mv-prev" title="Anterior" aria-label="Anterior">
          <svg viewBox="0 0 24 24" width="15" height="15"><path d="M14 5 L7 12 L14 19 Z" fill="currentColor"/></svg>
        </button>
        <button id="mv-play" title="Reproducir" aria-label="Reproducir">
          <svg viewBox="0 0 24 24" width="15" height="15"><path d="M8 5 L18 12 L8 19 Z" fill="currentColor"/></svg>
        </button>
        <button id="mv-next" title="Siguiente" aria-label="Siguiente">
          <svg viewBox="0 0 24 24" width="15" height="15"><path d="M6 5 L12 12 L6 19 Z M13 5 L19 12 L13 19 Z" fill="currentColor"/></svg>
        </button>
        <span id="mv-tiempo-label" class="mv-tiempo-label">—</span>
      </div>
      <input type="range" id="mv-slider" min="0" max="${PASOS.length - 1}" value="0" step="1" />
      <div class="mv-tiempo-dias" id="mv-tiempo-dias"></div>`;
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    return div;
  };
  ctrl.addTo(mapa);

  // Botones rápidos por día (salta al inicio de cada día).
  // Muestran la fecha real en UTC: "Dom 26/07", "Lun 27/07", etc.
  const cont = document.getElementById("mv-tiempo-dias");
  const diasSem = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  for (let dia = 1; dia <= FORECAST_DAYS; dia++) {
    const hObjetivo = (dia - 1) * 24;
    const pasoIdx = PASOS.findIndex((h) => h >= hObjetivo);
    if (pasoIdx < 0) continue;
    const d = new Date(SERIE.tiempos[PASOS[pasoIdx]] + "Z");   // UTC
    const b = document.createElement("button");
    b.innerHTML = `<span class="mv-dia-sem">${diasSem[d.getUTCDay()]}</span>` +
      `<span class="mv-dia-fecha">${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}</span>`;
    b.title = `Ir al ${diasSem[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")} (00:00 UTC)`;
    b.addEventListener("click", () => { pausa(); irAPaso(pasoIdx); });
    cont.appendChild(b);
  }

  document.getElementById("mv-prev").addEventListener("click", () => { pausa(); irAPaso(pasoActual - 1); });
  document.getElementById("mv-next").addEventListener("click", () => { pausa(); irAPaso(pasoActual + 1); });
  document.getElementById("mv-play").addEventListener("click", togglePlay);
  document.getElementById("mv-slider").addEventListener("input", (e) => { pausa(); irAPaso(parseInt(e.target.value)); });
}

// ════════════════════════════════════════════════════════════════
//  MARCADORES, LEYENDA, CONTROL DE CAPAS.
// ════════════════════════════════════════════════════════════════
function pintarMarcadores() {
  if (capaMarcadores) capaMarcadores.remove();
  capaMarcadores = L.layerGroup().addTo(mapa);
  SECTORES.forEach((s) => {
    if (!s.coords) return;
    const icono = L.divIcon({
      className: "mv-marker",
      html: `<span class="mv-dot mv-grupo-${(s.grupo || "").toLowerCase()}"></span>`,
      iconSize: [16, 16], iconAnchor: [8, 8],
    });
    const m = L.marker([s.coords.lat, s.coords.lon], { icon: icono, title: s.nombre });
    m.bindTooltip(s.label || s.nombre, { direction: "top", offset: [0, -6] });
    m.on("click", () => {
      setSectorActivo(s); cargarMeteotabla(s);
      const t = document.getElementById("location-title");
      const st = document.getElementById("location-subtitle");
      if (t) t.textContent = s.nombre;
      if (st) st.textContent = s.subtitulo || "";
    });
    m.addTo(capaMarcadores);
  });
}

function agregarLeyenda() {
  const leyenda = L.control({ position: "bottomright" });
  leyenda.onAdd = () => {
    const div = L.DomUtil.create("div", "mv-leyenda");
    const celdas = BANDAS.map(([u, c], i) => {
      const sig = BANDAS[i + 1] ? BANDAS[i + 1][0] : "+";
      return `<div class="mv-ley-celda" style="background:${c}" title="${u}-${sig} kt"></div>`;
    }).join("");
    const nums = BANDAS.map(([u]) => `<span>${u}</span>`).join("");
    div.innerHTML = `
      <div class="mv-ley-titulo">Viento 10 m (kt)</div>
      <div class="mv-ley-barra-bandas">${celdas}</div>
      <div class="mv-ley-nums">${nums}</div>`;
    return div;
  };
  leyenda.addTo(mapa);
}

function agregarControlCapas() {
  const overlays = {};
  if (capaColor) overlays["🎨 Color (velocidad)"] = capaColor;
  if (capaViento) overlays["💨 Partículas"] = capaViento;
  if (capaBarbas) overlays["🪶 Barbas de viento"] = capaBarbas;
  if (capaIsobaras) overlays["🔴 Isobaras (presión)"] = capaIsobaras;
  if (capaMarcadores) overlays["📍 Sectores"] = capaMarcadores;
  return L.control.layers(null, overlays, { collapsed: true, position: "topright" }).addTo(mapa);
}

// ════════════════════════════════════════════════════════════════
//  CARGA / REFRESCO de la serie.
// ════════════════════════════════════════════════════════════════
function mostrarAviso(texto) {
  let el = document.getElementById("mv-aviso");
  if (!el) {
    el = document.createElement("div");
    el.id = "mv-aviso";
    el.className = "mv-aviso";
    document.getElementById("mapa-viento").appendChild(el);
  }
  el.textContent = texto;
  el.style.display = texto ? "block" : "none";
}

async function cargarSerie(forzar = false) {
  const { nx, ny, lats, lons } = construirGrilla();

  // 1) Intentar desde la caché del navegador (salvo refresco forzado).
  let puntos = forzar ? null : leerCache();

  // 2) Si no hay caché válida, descargar.
  if (!puntos) {
    mostrarAviso("Cargando pronóstico… (puede tardar unos segundos)");
    try {
      puntos = await descargarSerie(lats, lons);
      guardarCache(puntos);
    } catch (e) {
      // Si falla la descarga pero hay una caché vieja, usarla igual.
      const respaldo = leerCache();
      if (respaldo) {
        puntos = respaldo;
        mostrarAviso("Mostrando último pronóstico guardado (la API no respondió).");
        setTimeout(() => mostrarAviso(""), 4000);
      } else {
        if (String(e.message).includes("429")) {
          mostrarAviso("La API de datos está saturada (límite temporal). Reintenta en unos minutos.");
        } else {
          mostrarAviso("No se pudo cargar el pronóstico. Revisa tu conexión.");
        }
        throw e;
      }
    }
  }

  SERIE = procesarSerie(puntos, nx, ny);
  mostrarAviso("");

  if (!document.getElementById("mv-slider")) crearControlTiempo();
  irAPaso(Math.min(pasoActual, PASOS.length - 1));
}

// Al cambiar el zoom, re-dibujar barbas con la densidad correcta.
function onZoom() {
  if (SERIE) {
    if (capaBarbas) capaBarbas.remove();
    capaBarbas = crearCapaBarbas(pasoActual).addTo(mapa);
  }
}

// ════════════════════════════════════════════════════════════════
//  ARRANQUE.
// ════════════════════════════════════════════════════════════════
export function initMapaViento(idContenedor = "mapa-viento") {
  const cont = document.getElementById(idContenedor);
  if (!cont) return;
  if (typeof L === "undefined" || typeof L.velocityLayer === "undefined") {
    console.error("Leaflet o leaflet-velocity no están cargados.");
    cont.innerHTML = '<p style="padding:1rem;color:#333">No se pudieron cargar las librerías del mapa.</p>';
    return;
  }
  const bounds = L.latLngBounds([BBOX.latN, BBOX.lonW], [BBOX.latS, BBOX.lonE]);
  mapa = L.map(idContenedor, {
    zoomControl: true, attributionControl: true,
    minZoom: 3, maxZoom: 9,
    maxBounds: bounds.pad(0.3), maxBoundsViscosity: 0.5,
  });
  mapa.fitBounds(bounds);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    { attribution: "&copy; OSM &copy; CARTO", subdomains: "abcd", maxZoom: 19 }).addTo(mapa);

  agregarLeyenda();
  pintarMarcadores();
  mapa.on("zoomend", onZoom);

  cargarSerie().catch((e) => console.error("No se pudo cargar la serie:", e));
  // El refresco periódico fuerza descarga nueva (salta la caché).
  setInterval(() => cargarSerie(true).catch((e) => console.error("Refresco falló:", e)), REFRESCO_MS);

  setTimeout(() => mapa.invalidateSize(), 200);
  return mapa;
}
