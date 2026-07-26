// ════════════════════════════════════════════════════════════════
//  MAPA DE VIENTO — Leaflet + partículas animadas (leaflet-velocity)
//  · Mapa base con costa antártica real
//  · Marcadores de los 16 sectores (clic → selecciona el sector)
//  · Capa de partículas alimentada por Open-Meteo en grilla propia
//
//  Depende de Leaflet y leaflet-velocity, cargados por CDN en el HTML.
//  Precisión operacional: el campo U/V se arma desde datos de modelo
//  (Open-Meteo/GFS), no es una animación decorativa.
// ════════════════════════════════════════════════════════════════

import { SECTORES } from "./config.js?v=20260721010000";
import { setSectorActivo } from "./pronostico.js?v=20260721010000";
import { cargarMeteotabla } from "./meteotabla.js?v=20260721010000";

// ── Recuadro geográfico: mismo que el mapa SVG (mapa.js) ─────────
const BBOX = { latN: -55.0, latS: -68.5, lonW: -70.0, lonE: -56.0 };

// Paso de grilla en grados. 0.5° → 29×28 = 812 puntos (< límite de
// 1000 de Open-Meteo → cabe en UNA sola request). Bajar a 0.25°
// cuadruplica los puntos: más fino pero más lento en móvil.
const PASO = 0.5;

// Refresco del campo de viento (ms). El modelo se actualiza cada 6 h;
// con 30 min basta y se es amable con la API pública.
const REFRESCO_MS = 30 * 60 * 1000;

let mapa = null;
let capaViento = null;
let capaMarcadores = null;

// ────────────────────────────────────────────────────────────────
//  1) Construcción de la grilla de coordenadas
//  Generada por ÍNDICE entero (no acumulando floats) para que
//  nx·ny coincida exactamente con la longitud del array de datos.
//  Orden que exige leaflet-velocity: filas de N→S, columnas de W→E.
//  data[0] = esquina NW, data[último] = esquina SE.
// ────────────────────────────────────────────────────────────────
function construirGrilla() {
  const nx = Math.round((BBOX.lonE - BBOX.lonW) / PASO) + 1;
  const ny = Math.round((BBOX.latN - BBOX.latS) / PASO) + 1;
  const lats = [];
  const lons = [];
  for (let j = 0; j < ny; j++) {
    const lat = BBOX.latN - j * PASO;           // norte → sur
    for (let i = 0; i < nx; i++) {
      const lon = BBOX.lonW + i * PASO;         // oeste → este
      lats.push(+lat.toFixed(4));
      lons.push(+lon.toFixed(4));
    }
  }
  return { nx, ny, lats, lons };
}

// ────────────────────────────────────────────────────────────────
//  2) Descarga del campo de viento (una sola request multipunto)
// ────────────────────────────────────────────────────────────────
async function descargarViento(lats, lons) {
  // Con 812 coordenadas, meterlas en la URL supera los ~8000
  // caracteres que aceptan los servidores (da "Failed to fetch").
  // Open-Meteo permite enviar los parámetros por POST en el cuerpo,
  // justamente para evitar ese límite de longitud.
  const res = await fetch("https://api.open-meteo.com/v1/forecast", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      latitude: lats.join(","),
      longitude: lons.join(","),
      current: "wind_speed_10m,wind_direction_10m",
      wind_speed_unit: "ms",
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();

  // Con múltiples coordenadas Open-Meteo responde un ARRAY; con una
  // sola, un objeto. Se normaliza siempre a array.
  return Array.isArray(json) ? json : [json];
}

// ────────────────────────────────────────────────────────────────
//  3) Conversión a formato leaflet-velocity (dos objetos U y V)
//  El viento reportado es de PROCEDENCIA (de dónde viene). Las
//  componentes apuntan hacia DÓNDE SOPLA:
//    U (eastward)  = -velocidad · sin(dirección)
//    V (northward) = -velocidad · cos(dirección)
//  Verificado: viento del W → U>0 (hacia E); del N → V<0 (hacia S).
// ────────────────────────────────────────────────────────────────
function aFormatoVelocity(puntos, nx, ny) {
  const uData = [];
  const vData = [];
  for (const p of puntos) {
    const c = p.current || {};
    const vel = c.wind_speed_10m;
    const dir = c.wind_direction_10m;
    if (vel == null || dir == null) {
      uData.push(0);
      vData.push(0);
      continue;
    }
    const rad = (dir * Math.PI) / 180;
    uData.push(-vel * Math.sin(rad));
    vData.push(-vel * Math.cos(rad));
  }

  const headerBase = {
    nx,
    ny,
    dx: PASO,
    dy: PASO,
    la1: BBOX.latN,   // primera fila = norte
    la2: BBOX.latS,
    lo1: BBOX.lonW,
    lo2: BBOX.lonE,
    parameterCategory: 2,
    parameterUnit: "m.s-1",
    refTime: new Date().toISOString(),
  };

  return [
    {
      header: { ...headerBase, parameterNumber: 2, parameterNumberName: "eastward_wind" },
      data: uData,
    },
    {
      header: { ...headerBase, parameterNumber: 3, parameterNumberName: "northward_wind" },
      data: vData,
    },
  ];
}

// ────────────────────────────────────────────────────────────────
//  4) Marcadores de sectores (usa las coords de config.js)
// ────────────────────────────────────────────────────────────────
function pintarMarcadores() {
  if (capaMarcadores) capaMarcadores.remove();
  capaMarcadores = L.layerGroup().addTo(mapa);

  SECTORES.forEach((s) => {
    if (!s.coords) return;
    const icono = L.divIcon({
      className: "mv-marker",
      html: `<span class="mv-dot mv-grupo-${(s.grupo || "").toLowerCase()}"></span>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    const m = L.marker([s.coords.lat, s.coords.lon], { icon: icono, title: s.nombre });
    m.bindTooltip(s.label || s.nombre, { direction: "top", offset: [0, -6] });
    m.on("click", () => {
      // Reutiliza la lógica existente del proyecto.
      setSectorActivo(s);
      cargarMeteotabla(s);
      // Sincroniza el encabezado como hace app.js.
      const t = document.getElementById("location-title");
      const st = document.getElementById("location-subtitle");
      if (t) t.textContent = s.nombre;
      if (st) st.textContent = s.subtitulo || "";
    });
    m.addTo(capaMarcadores);
  });
}

// ────────────────────────────────────────────────────────────────
//  5) Escala de color (nudos) — coherente con la leyenda del sitio
//  Verde → amarillo → naranja → rojo → violeta, tipo Windy.
// ────────────────────────────────────────────────────────────────
const ESCALA_COLOR = [
  "rgb(36,104,180)",  "rgb(60,157,194)",  "rgb(128,205,193)",
  "rgb(151,218,168)", "rgb(198,231,181)", "rgb(238,247,217)",
  "rgb(255,238,159)", "rgb(252,171,99)",  "rgb(237,116,81)",
  "rgb(211,66,66)",   "rgb(163,42,45)",   "rgb(120,20,60)",
];

// ────────────────────────────────────────────────────────────────
//  6) Actualización del campo de viento
// ────────────────────────────────────────────────────────────────
async function actualizarCampoViento() {
  const { nx, ny, lats, lons } = construirGrilla();
  try {
    const puntos = await descargarViento(lats, lons);
    if (puntos.length !== nx * ny) {
      console.warn(`Grilla: esperados ${nx * ny}, recibidos ${puntos.length}`);
    }
    const datos = aFormatoVelocity(puntos, nx, ny);

    if (capaViento) capaViento.remove();
    capaViento = L.velocityLayer({
      displayValues: true,
      displayOptions: {
        velocityType: "Viento 10 m",
        position: "bottomleft",
        emptyString: "Sin datos de viento",
        angleConvention: "bearingCW",
        speedUnit: "kt",       // muestra en nudos al pasar el cursor
        directionString: "Dirección",
        speedString: "Velocidad",
      },
      data: datos,
      minVelocity: 0,
      maxVelocity: 30,          // m/s ≈ 58 kt: tope de la escala de color
      velocityScale: 0.012,     // largo/velocidad de las partículas
      particleAge: 90,
      lineWidth: 1.2,
      colorScale: ESCALA_COLOR,
      opacity: 0.92,
    }).addTo(mapa);
  } catch (e) {
    console.error("No se pudo cargar el campo de viento:", e);
  }
}

// ────────────────────────────────────────────────────────────────
//  7) Arranque del mapa
// ────────────────────────────────────────────────────────────────
export function initMapaViento(idContenedor = "mapa-viento") {
  const cont = document.getElementById(idContenedor);
  if (!cont) return;
  if (typeof L === "undefined" || typeof L.velocityLayer === "undefined") {
    console.error("Leaflet o leaflet-velocity no están cargados.");
    cont.innerHTML =
      '<p style="padding:1rem;color:#fff">No se pudieron cargar las librerías del mapa.</p>';
    return;
  }

  mapa = L.map(idContenedor, {
    center: [-62.0, -62.0],
    zoom: 5,
    minZoom: 3,
    maxZoom: 9,
    zoomControl: true,
    attributionControl: true,
  });

  // Fondo oscuro (CARTO Dark) → las partículas resaltan como en Windy.
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
      attribution:
        '&copy; <a href="https://openstreetmap.org">OSM</a> &copy; ' +
        '<a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }
  ).addTo(mapa);

  pintarMarcadores();
  actualizarCampoViento();
  setInterval(actualizarCampoViento, REFRESCO_MS);

  return mapa;
}