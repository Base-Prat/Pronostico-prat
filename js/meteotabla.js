// ════════════════════════════════════════════════════════════════
//  METEOTABLA — matriz de pronóstico: variables en filas, pasos de
//  2 h en columnas, celdas coloreadas por intensidad.
//  Fuentes: Open-Meteo (atmósfera) + Open-Meteo Marine (oleaje).
//  Paso temporal: cada 2 h (se toma una de cada dos horas; sin
//  interpolación, son valores del modelo tal cual).
// ════════════════════════════════════════════════════════════════

import { CONFIG, CATABATICO, CRITERIO_MAR } from "./config.js?v=20260718081359";
import { fetchConTimeout, gradosARumbo } from "./utils.js?v=20260718081359";

// ── Corrección catabática ────────────────────────────────────────
// Devuelve true si en el paso i se cumplen las tres condiciones:
// dirección canalizante, intensidad sobre el piso y gradiente
// barométrico activo (proxy de forzamiento sinóptico o frontal).
function aplicaCatabatico(sectorKey, dir, viento, presiones, i) {
  if (!CATABATICO.activo) return false;
  if (!CATABATICO.sectores.includes(sectorKey)) return false;
  if (dir == null || viento == null) return false;
  if (dir < CATABATICO.dirMin || dir > CATABATICO.dirMax) return false;
  if (viento < CATABATICO.vientoMinimo) return false;

  // Tendencia de presión en ±ventana horas como proxy de gradiente.
  const w = CATABATICO.ventanaGradiente;
  const a = presiones?.[Math.max(0, i - w)];
  const b = presiones?.[Math.min(presiones.length - 1, i + w)];
  if (a == null || b == null) return false;

  return Math.abs(b - a) >= CATABATICO.gradienteMinimo;
}

// Factor catabático escalado según la intensidad modelada.
// Interpola linealmente entre los anclajes definidos en config y
// acota fuera del rango, de modo que nunca supera el extremo flojo
// ni baja del extremo fuerte.
function factorCatabatico(vientoModelado, tipo) {
  const c = CATABATICO.curva;
  const fBajo = tipo === "racha" ? c.rachaFactorBajo : c.vientoFactorBajo;
  const fAlto = tipo === "racha" ? c.rachaFactorAlto : c.vientoFactorAlto;

  if (vientoModelado == null) return fBajo;
  if (vientoModelado <= c.vBajo) return fBajo;
  if (vientoModelado >= c.vAlto) return fAlto;

  const t = (vientoModelado - c.vBajo) / (c.vAlto - c.vBajo);
  return fBajo + t * (fAlto - fBajo);
}

// ── Techo de nubes (altura de la base, en pies) ──────────────────
// Derivado por la fórmula de Espy: la base de la nube convectiva se
// estima a partir del spread temperatura / punto de rocío.
// Solo tiene sentido si hay nubosidad baja significativa; con cielo
// despejado no hay techo que informar.
function techoPies(temp, rocio, nubBaja) {
  if (temp == null || rocio == null) return null;
  if (nubBaja == null || nubBaja < 40) return null;   // sin capa definida
  const spread = temp - rocio;
  if (spread < 0) return 0;
  // Espy: ~125 m por °C de spread → en pies, ~410 ft por °C.
  const ft = spread * 410;
  return Math.max(0, Math.round(ft / 100) * 100);
}

// Color del techo según mínimos aeronáuticos habituales.
function colorTecho(ft) {
  if (ft == null) return "";
  if (ft < 200)  return "#c0006f";   // bajo mínimos
  if (ft < 500)  return "#e60000";
  if (ft < 1000) return "#ff6600";
  if (ft < 2000) return "#ffe600";
  if (ft < 3000) return "#c8f0a0";
  return "#d9f2f7";
}

// Color de visibilidad (km) según impacto operacional.
function colorVis(km) {
  if (km == null) return "";
  if (km < 0.4) return "#c0006f";
  if (km < 1)   return "#e60000";
  if (km < 3)   return "#ff6600";
  if (km < 5)   return "#ffaa00";
  if (km < 10)  return "#ffe600";
  return "#d9f2f7";
}

// ── Ventisca (blowing snow) ──────────────────────────────────────
// Con nieve disponible y viento suficiente, el snow se levanta y la
// visibilidad colapsa aunque no esté precipitando. Se estima a
// partir de la nieve acumulada reciente y el viento del paso.
function nivelVentisca(nieveReciente, viento) {
  if (viento == null) return null;
  if (!nieveReciente || nieveReciente <= 0) return null;
  if (viento >= 35) return "ALTA";
  if (viento >= 25) return "MOD";
  if (viento >= 15) return "BAJA";
  return null;
}

function colorVentisca(n) {
  if (n === "ALTA") return "#e60000";
  if (n === "MOD")  return "#ff6600";
  if (n === "BAJA") return "#ffe600";
  return "";
}

// ── Suavizado asimétrico del oleaje ──────────────────────────────
// Filtro exponencial causal con dos constantes de tiempo: rápida al
// subir (el mar se levanta pronto con el viento) y lenta al bajar
// (el mar residual persiste tras amainar). A diferencia de una media
// móvil, no adelanta información futura ni recorta los máximos: el
// valor sigue al objetivo hasta alcanzarlo si el forzamiento se
// mantiene.
function suavizarSerie(arr) {
  if (!Array.isArray(arr) || !arr.length) return arr;

  const alfaSube = 1 - Math.exp(-PASO / MAR_SUBIDA);
  const alfaBaja = 1 - Math.exp(-PASO / MAR_BAJADA);

  const out = new Array(arr.length);
  let estado = null;

  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v == null) { out[i] = null; continue; }

    if (estado == null) {
      estado = v;                       // arranque: sin historia previa
    } else {
      const alfa = v > estado ? alfaSube : alfaBaja;
      estado = estado + alfa * (v - estado);
    }
    out[i] = Math.round(estado * 100) / 100;
  }
  return out;
}

// Aplica el suavizado a todos los campos de altura de ola del
// bloque marino, dejando intactos período y dirección.
function suavizarOleaje(mar) {
  if (!mar?.hourly) return mar;
  for (const campo of ["wave_height", "swell_wave_height", "wind_wave_height"]) {
    if (Array.isArray(mar.hourly[campo])) {
      mar.hourly[campo] = suavizarSerie(mar.hourly[campo]);
    }
  }
  return mar;
}

// ── Mar de viento mínimo esperable ───────────────────────────────
// Aun en bahías abrigadas, un viento sostenido genera oleaje local.
// Si el modelo devuelve cero o un valor implausiblemente bajo (celda
// mal resuelta, hielo o fetch no representado), se aplica un piso
// derivado del viento y del fetch disponible.
// Relación empírica simplificada para fetch corto (~5-10 km):
//   Hs ≈ 0.0015 · U²  con U en nudos, acotado.
function pisoMarDeViento(vientoKt) {
  if (vientoKt == null || vientoKt < 8) return 0;
  const hs = 0.0015 * vientoKt * vientoKt;
  return Math.round(Math.min(hs, 1.5) * 100) / 100;
}

// ── Selección de altura de ola según el criterio del sector ──────
// Sectores abiertos: mar de fondo, se toma la mayor entre swell y
// total. Bahías: mar de viento, acotado al tope de marejada.
function alturaOla(sectorKey, h, i, vientoKt) {
  const total = h?.wave_height?.[i];
  const swell = h?.swell_wave_height?.[i];
  const viento = h?.wind_wave_height?.[i];

  if (CRITERIO_MAR.abiertos.includes(sectorKey)) {
    const vals = [total, swell].filter((v) => v != null);
    if (!vals.length) return { v: null, tipo: "" };
    return { v: Math.max(...vals), tipo: "fondo" };
  }

  // Bahía: mar de viento con tope, y piso derivado del viento local
  // para no informar mar nulo con viento significativo.
  const base = viento ?? total;
  const piso = pisoMarDeViento(vientoKt);

  if (base == null && piso === 0) return { v: null, tipo: "" };

  const efectivo = Math.max(base ?? 0, piso);
  const acotado = Math.min(efectivo, CRITERIO_MAR.topeBahia);
  return {
    v: acotado,
    tipo: "viento",
    topado: efectivo > CRITERIO_MAR.topeBahia,
    estimado: (base ?? 0) < piso,
  };
}

// Período y dirección coherentes con el criterio elegido.
function datosOla(sectorKey, h, i) {
  const abierto = CRITERIO_MAR.abiertos.includes(sectorKey);
  const per = abierto
    ? (h?.swell_wave_period?.[i] ?? h?.wave_period?.[i])
    : (h?.wind_wave_period?.[i] ?? h?.wave_period?.[i]);
  const dir = abierto
    ? (h?.swell_wave_direction?.[i] ?? h?.wave_direction?.[i])
    : (h?.wind_wave_direction?.[i] ?? h?.wave_direction?.[i]);
  return { per, dir };
}

// ── Rompiente en bahías expuestas ────────────────────────────────
// Con viento del cuadrante expuesto, la bahía desarrolla rompiente
// en la playa. Se marca como condición, no como altura.
function hayRompiente(sectorKey, dirViento, viento) {
  const cfg = CRITERIO_MAR.rompiente?.[sectorKey];
  if (!cfg || dirViento == null || viento == null) return false;
  if (viento < CATABATICO.vientoMinimo) return false;
  return dirViento >= cfg.dirMin && dirViento <= cfg.dirMax;
}

const DIAS_SEM = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const PASO = 1;      // horas entre columnas (resolución nativa del modelo)
const DIAS = 7;      // días de pronóstico

// Modelo numérico solicitado explícitamente a la API.
// ECMWF IFS: modelo global del Centro Europeo, buen desempeño en
// latitudes altas y sobre océano.
const MODELO = "ecmwf_ifs025";
const MODELO_NOMBRE = "ECMWF IFS";

// Inercia del oleaje (horas). El mar responde de forma asimétrica:
// se desarrolla con relativa rapidez cuando arrecia el viento, pero
// decae lentamente porque el mar residual persiste tras amainar.
const MAR_SUBIDA = 2;   // constante de tiempo al aumentar
const MAR_BAJADA = 6;   // constante de tiempo al disminuir

// ── URLs de datos ────────────────────────────────────────────────
function urlAtmosfera(lat, lon) {
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,apparent_temperature,dew_point_2m,precipitation,snowfall,cloud_cover,` +
    `cloud_cover_low,cloud_cover_mid,cloud_cover_high,pressure_msl,` +
    `wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
    `&wind_speed_unit=kn&timezone=America%2FPunta_Arenas&forecast_days=${DIAS}` +
    `&models=${MODELO}`;
}

// La visibilidad no está disponible en ECMWF IFS, así que se pide
// por separado sin fijar modelo (Open-Meteo resuelve con el mejor
// disponible, típicamente ICON o GFS según la región).
function urlVisibilidad(lat, lon) {
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=visibility` +
    `&timezone=America%2FPunta_Arenas&forecast_days=${DIAS}`;
}

function urlMarina(lat, lon) {
  return `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&hourly=wave_height,wave_period,wave_direction,` +
    `swell_wave_height,swell_wave_period,swell_wave_direction,` +
    `wind_wave_height,wind_wave_period,wind_wave_direction` +
    `&timezone=America%2FPunta_Arenas&forecast_days=${DIAS}`;
}

// ── Escalas de color ─────────────────────────────────────────────
// Viento sostenido (kt) — sigue los umbrales operacionales del sitio.
function colorViento(v) {
  if (v == null) return "";
  if (v >= 40) return "#c0006f";
  if (v >= 30) return "#e60000";
  if (v >= 25) return "#ff6600";
  if (v >= 21) return "#ffaa00";
  if (v >= 16) return "#ffe600";
  if (v >= 11) return "#7ee081";
  if (v >= 6)  return "#3fd6c8";
  return "#d9f2f7";
}

// Rachas — misma familia, un punto más saturada.
function colorRacha(v) {
  if (v == null) return "";
  if (v >= 45) return "#ff00aa";
  if (v >= 35) return "#e60000";
  if (v >= 30) return "#ff6600";
  if (v >= 25) return "#ffaa00";
  if (v >= 20) return "#ffe600";
  if (v >= 14) return "#7ee081";
  if (v >= 8)  return "#3fd6c8";
  return "#e6f7fa";
}

// Altura de ola (m).
function colorOla(h) {
  if (h == null) return "";
  if (h >= 6)   return "#6a0dad";
  if (h >= 4.5) return "#8e44ad";
  if (h >= 3.5) return "#5b6fd6";
  if (h >= 2.5) return "#8f9fe8";
  if (h >= 1.5) return "#b9c4f0";
  return "#dfe6fa";
}

// Temperatura (°C) — frío azul, cero blanco, sobre cero cálido.
function colorTemp(t) {
  if (t == null) return "";
  if (t <= -20) return "#7b2fbe";
  if (t <= -12) return "#4a6fd4";
  if (t <= -6)  return "#7fa8e8";
  if (t <= -1)  return "#c5dcf5";
  if (t <= 3)   return "#fff8d6";
  if (t <= 8)   return "#ffe97a";
  return "#ffc44d";
}

// Precipitación (mm/h).
function colorPrecip(p) {
  if (p == null || p === 0) return "";
  if (p >= 3)   return "#3b3bb5";
  if (p >= 1.5) return "#5b6fd6";
  if (p >= 0.7) return "#8f9fe8";
  if (p >= 0.2) return "#c3cdf5";
  return "#e6ebfc";
}

// Nieve (cm/h) — escala fría, distinta de la lluvia.
function colorNieve(n) {
  if (n == null || n === 0) return "";
  if (n >= 2)   return "#1f6f8b";
  if (n >= 1)   return "#3f9ab5";
  if (n >= 0.5) return "#7cc3d6";
  if (n >= 0.1) return "#b8e0ea";
  return "#e4f4f8";
}

// Nubosidad (%) — gris progresivo.
function colorNube(n) {
  if (n == null) return "";
  if (n === 0) return "";
  const g = Math.round(235 - (n / 100) * 120);
  return `rgb(${g},${g},${g})`;
}

// Texto claro sobre fondos oscuros.
function textoSobre(hex) {
  if (!hex || !hex.startsWith("#")) return "";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 130 ? "color:#fff" : "";
}

// Flecha de dirección: apunta hacia donde se dirige el flujo.
// Flecha de viento: apunta hacia DONDE VA el viento (convención de
// flujo, como Windguru/Windy). El glifo base "↓" ya apunta al sur
// (180°), que equivale a viento del Norte en convención de flujo,
// por lo que la dirección de procedencia se rota sin desfase.
// Viento del Norte (0°) → la flecha apunta al Sur.
function flecha(grados) {
  if (grados == null) return "—";
  const rot = grados % 360;
  return `<span class="mt-flecha" style="transform:rotate(${rot}deg)" title="Viento del ${gradosARumbo(grados)}">↓</span>`;
}

// ── Construcción de columnas cada 2 h ────────────────────────────
function armarColumnas(atm, mar, sectorKey) {
  const cols = [];
  const t = atm.hourly.time;
  const presiones = atm.hourly.pressure_msl;

  for (let i = 0; i < t.length; i += PASO) {
    const fecha = new Date(t[i]);

    const dirV = atm.hourly.wind_direction_10m?.[i];
    let viento = atm.hourly.wind_speed_10m?.[i];
    let racha = atm.hourly.wind_gusts_10m?.[i];

    // Corrección catabática por efecto orográfico no resuelto.
    const corregido = aplicaCatabatico(sectorKey, dirV, viento, presiones, i);
    if (corregido) {
      // El factor se calcula sobre el viento SOSTENIDO modelado, que
      // es el indicador de cuánto forzamiento ya resolvió el modelo.
      const base = viento;
      viento = base * factorCatabatico(base, "viento");
      if (racha != null) racha = racha * factorCatabatico(base, "racha");

      // El drenaje puede elevar el sostenido por sobre la racha
      // modelada; la racha nunca debe quedar bajo el sostenido.
      if (racha != null && racha < viento) racha = viento;
    }

    const ola = alturaOla(sectorKey, mar?.hourly, i, viento);
    const od = datosOla(sectorKey, mar?.hourly, i);

    // Visibilidad en km (la API la entrega en metros).
    const visM = atm.hourly.visibility?.[i];
    const visKm = visM != null ? visM / 1000 : null;

    // Techo derivado del spread T/Td con nubosidad baja presente.
    const nubBaja = atm.hourly.cloud_cover_low?.[i];
    const techo = techoPies(
      atm.hourly.temperature_2m?.[i],
      atm.hourly.dew_point_2m?.[i],
      nubBaja
    );

    // Ventisca: nieve caída en las 6 h previas + viento actual.
    const nieveReciente = sumar(atm.hourly.snowfall, Math.max(0, i - 6), 6);
    const ventisca = nivelVentisca(nieveReciente, viento);

    const col = {
      iso: t[i],
      // Rótulo completo: "Viernes 18"
      dia: `${DIAS_SEM[fecha.getDay()]} ${fecha.getDate()}`,
      fechaNum: `${fecha.getDate()}.${fecha.getMonth() + 1}.`,
      mes: `${fecha.getMonth() + 1}.`,
      hora: String(fecha.getHours()).padStart(2, "0") + "h",
      nuevoDia: false,
      viento,
      racha,
      dirViento: dirV,
      corregido,
      temp: atm.hourly.temperature_2m?.[i],
      sens: atm.hourly.apparent_temperature?.[i],
      visKm,
      techo,
      ventisca,
      // Precipitación acumulada del paso.
      precip: sumar(atm.hourly.precipitation, i, PASO),
      // Nieve en cm acumulada del paso.
      nieve: sumar(atm.hourly.snowfall, i, PASO),
      nubAlta: atm.hourly.cloud_cover_high?.[i],
      nubMedia: atm.hourly.cloud_cover_mid?.[i],
      nubBaja,
      ola: ola.v,
      olaTipo: ola.tipo,
      olaTopada: !!ola.topado,
      olaEstimada: !!ola.estimado,
      periodo: od.per,
      dirOla: od.dir,
      rompiente: hayRompiente(sectorKey, dirV, viento),
    };

    cols.push(col);
  }

  // Marca el primer paso de cada día para dibujar separadores.
  let diaPrev = null;
  cols.forEach((c) => {
    const d = c.iso.split("T")[0];
    if (d !== diaPrev) { c.nuevoDia = true; diaPrev = d; }
  });

  return cols;
}

function sumar(arr, desde, n) {
  if (!arr) return null;
  let s = 0, hay = false;
  for (let k = desde; k < desde + n && k < arr.length; k++) {
    if (arr[k] != null) { s += arr[k]; hay = true; }
  }
  return hay ? Math.round(s * 10) / 10 : null;
}

// ── Render de una fila de la matriz ──────────────────────────────
function fila(etiqueta, cols, fn, clase = "") {
  const celdas = cols.map((c) => {
    const { txt, bg, title } = fn(c);
    const sep = c.nuevoDia ? " mt-sep" : "";
    const estilo = bg ? `background:${bg};${textoSobre(bg)}` : "";
    const tt = title ? ` title="${title}"` : "";
    return `<td class="mt-celda${sep}" style="${estilo}"${tt}>${txt}</td>`;
  }).join("");
  return `<tr class="${clase}"><th class="mt-etq">${etiqueta}</th>${celdas}</tr>`;
}

const n0 = (v) => (v == null ? "" : Math.round(v));
const n1 = (v) => (v == null ? "" : (Math.round(v * 10) / 10).toFixed(1));

// ── Render completo ──────────────────────────────────────────────
function render(cols, conMar, sectorKey) {
  // Cabecera: el nombre del día abarca todas las columnas de ese día
  // (colspan) para que quepa completo; la hora se rotula en todas.
  let thDia = "";
  let i = 0;
  while (i < cols.length) {
    let n = 1;
    while (i + n < cols.length && !cols[i + n].nuevoDia) n++;
    thDia += `<td class="mt-h-dia mt-sep" colspan="${n}">${cols[i].dia}</td>`;
    i += n;
  }

  const thHora = cols.map((c) =>
    `<td class="mt-h-hora${c.nuevoDia ? " mt-sep" : ""}">${c.hora}</td>`).join("");

  let filas = "";
  filas += fila("Velocidad viento (kt)", cols,
    (c) => ({ txt: n0(c.viento) + (c.corregido ? "<sup class='mt-corr'>▲</sup>" : ""), bg: colorViento(c.viento) }),
    "mt-destacada");
  filas += fila("Rachas (kt)", cols,
    (c) => ({ txt: n0(c.racha) + (c.corregido ? "<sup class='mt-corr'>▲</sup>" : ""), bg: colorRacha(c.racha) }));
  filas += fila("Dirección viento", cols, (c) => ({ txt: flecha(c.dirViento), bg: "" }), "mt-dir");

  // Bloque aeronáutico / de visibilidad.
  filas += fila("Visibilidad (km)", cols,
    (c) => ({ txt: c.visKm == null ? "" : (c.visKm >= 10 ? "10+" : n1(c.visKm)), bg: colorVis(c.visKm) }));
  filas += fila("Techo (ft)", cols,
    (c) => ({ txt: c.techo == null ? "—" : c.techo, bg: colorTecho(c.techo) }));
  filas += fila("Ventisca", cols,
    (c) => ({ txt: c.ventisca || "", bg: colorVentisca(c.ventisca) }), "mt-vent");

  if (conMar) {
    const abierto = CRITERIO_MAR.abiertos.includes(sectorKey);
    const etqOla = abierto ? "Ola mar de fondo (m)" : "Ola mar de viento (m)";
    const etqPer = abierto ? "Período fondo (s)" : "Período viento (s)";

    filas += fila(etqOla, cols,
      (c) => ({
        txt: n1(c.ola)
          + (c.olaTopada ? "<sup class='mt-tope'>*</sup>" : "")
          + (c.olaEstimada ? "<sup class='mt-est'>e</sup>" : ""),
        bg: colorOla(c.ola),
        title: c.olaEstimada ? "Estimado a partir del viento local" : "",
      }),
      "mt-destacada");
    filas += fila(etqPer, cols, (c) => ({ txt: n0(c.periodo), bg: "" }));
    filas += fila("Dirección olas", cols, (c) => ({ txt: flecha(c.dirOla), bg: "" }), "mt-dir");

    // Rompiente: solo en bahías configuradas como expuestas.
    if (CRITERIO_MAR.rompiente?.[sectorKey]) {
      filas += fila("Rompiente", cols,
        (c) => ({ txt: c.rompiente ? "SI" : "", bg: c.rompiente ? "#e67e22" : "" }),
        "mt-romp");
    }
  }

  filas += fila("Temperatura (°C)", cols, (c) => ({ txt: n0(c.temp), bg: colorTemp(c.temp) }));
  filas += fila("Sensación (°C)", cols, (c) => ({ txt: n0(c.sens), bg: colorTemp(c.sens) }));
  filas += fila("Nubosidad alta (%)", cols, (c) => ({ txt: n0(c.nubAlta), bg: colorNube(c.nubAlta) }), "mt-nube");
  filas += fila("Nubosidad media (%)", cols, (c) => ({ txt: n0(c.nubMedia), bg: colorNube(c.nubMedia) }), "mt-nube");
  filas += fila("Nubosidad baja (%)", cols, (c) => ({ txt: n0(c.nubBaja), bg: colorNube(c.nubBaja) }), "mt-nube");
  filas += fila("Precip. (mm/h)", cols, (c) => ({ txt: c.precip ? n1(c.precip) : "", bg: colorPrecip(c.precip) }));
  filas += fila("Nieve (cm/h)", cols, (c) => ({ txt: c.nieve ? n1(c.nieve) : "", bg: colorNieve(c.nieve) }));

  return `
    <div class="mt-scroll">
      <table class="mt-tabla">
        <thead>
          <tr><th class="mt-etq mt-esq" rowspan="2">Pronóstico<br/><small>cada 1 h</small></th>${thDia}</tr>
          <tr>${thHora}</tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
}

// ── Nota de autoría ──────────────────────────────────────────────
function notaFuentePropia(sectorKey, cols) {
  return `
    <div class="mt-fuente-propia">
      <div class="mt-fp-titulo">Fuente propia</div>
      <div class="mt-fp-pie">
        Modelo propio de elaboración local, desarrollado sobre la base del modelo numérico
        <b>${MODELO_NOMBRE}</b> (visibilidad y oleaje desde modelos complementarios),
        con ajuste al comportamiento observado en cada sector.
        Meteorología Base Naval Antártica Capitán Arturo Prat.
      </div>
    </div>`;
}

// ── API pública ──────────────────────────────────────────────────
export async function cargarMeteotabla(sector) {
  const cont = document.getElementById("meteotabla");
  if (!cont) return;

  const lat = sector?.coords?.lat ?? CONFIG.estacion.lat;
  const lon = sector?.coords?.lon ?? CONFIG.estacion.lon;
  const sectorKey = sector?.key || "";

  cont.innerHTML = `
    <div class="state-box">
      <div class="spinner" role="status" aria-label="Cargando"></div>
      <div class="state-title">Cargando meteotabla…</div>
    </div>`;

  try {
    // El oleaje puede no existir en puntos interiores y la
    // visibilidad no la sirve ECMWF: ambas se piden aparte y su
    // fallo no invalida el resto de la tabla.
    const [resAtm, resMar, resVis] = await Promise.allSettled([
      fetchConTimeout(urlAtmosfera(lat, lon)),
      fetchConTimeout(urlMarina(lat, lon)),
      fetchConTimeout(urlVisibilidad(lat, lon)),
    ]);

    if (resAtm.status !== "fulfilled") throw new Error("atmósfera no disponible");
    const atm = await resAtm.value.json();

    // Se incorpora la visibilidad al bloque horario principal,
    // alineada por índice (ambas series parten de las 00:00 local).
    if (resVis.status === "fulfilled") {
      try {
        const jv = await resVis.value.json();
        if (Array.isArray(jv?.hourly?.visibility)) {
          atm.hourly.visibility = jv.hourly.visibility;
        }
      } catch { /* sin visibilidad */ }
    }

    let mar = null;
    let marDesplazado = false;

    // Comprueba que la serie tenga valores realmente utilizables:
    // no basta con que exista, debe contener alguna altura > 0.
    const serieUtil = (j) => {
      const h = j?.hourly?.wave_height;
      if (!Array.isArray(h)) return false;
      return h.some((v) => v != null && v > 0);
    };

    if (resMar.status === "fulfilled") {
      try {
        const j = await resMar.value.json();
        if (serieUtil(j)) mar = suavizarOleaje(j);
      } catch { /* sin oleaje */ }
    }

    // Si el punto del sector no devolvió oleaje utilizable (celda en
    // tierra, bahía no resuelta o cobertura de hielo), se reintenta
    // en el punto de mar abierto definido para ese sector.
    const alt = CRITERIO_MAR.puntoMarino?.[sectorKey];
    if (!mar && alt) {
      try {
        const res2 = await fetchConTimeout(urlMarina(alt.lat, alt.lon));
        const j2 = await res2.json();
        if (serieUtil(j2)) {
          mar = suavizarOleaje(j2);
          marDesplazado = true;
        }
      } catch { /* sigue sin oleaje */ }
    }

    const cols = armarColumnas(atm, mar, sectorKey);
    cont.innerHTML = render(cols, !!mar, sectorKey);

    // Aviso si alguna serie complementaria no llegó.
    if (!atm.hourly.visibility) {
      cont.insertAdjacentHTML("beforeend",
        `<div class="mt-nota-mar">Sin datos de visibilidad disponibles en esta consulta.</div>`);
    }

    cont.insertAdjacentHTML("beforeend", notaFuentePropia(sectorKey, cols));

    if (!mar) {
      cont.insertAdjacentHTML("beforeend",
        `<div class="mt-nota-mar">Sin datos de oleaje para este punto (fuera de la malla marina del modelo).</div>`);
    } else if (marDesplazado) {
      cont.insertAdjacentHTML("beforeend",
        `<div class="mt-nota-mar">Oleaje consultado en punto de mar abierto próximo: la coordenada del sector no es resuelta por la malla del modelo marino.</div>`);
    }
  } catch (e) {
    console.error("Error al cargar la meteotabla:", e);
    cont.innerHTML = `
      <div class="state-box">
        <div class="state-icon">📡</div>
        <div class="state-title">No se pudo cargar la meteotabla</div>
        <div class="state-msg">Revisa la conexión y reintenta.</div>
        <button class="btn-retry" id="btn-retry-mt">Reintentar</button>
      </div>`;
    document.getElementById("btn-retry-mt")
      ?.addEventListener("click", () => cargarMeteotabla(sector));
  }
}
