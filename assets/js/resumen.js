// ════════════════════════════════════════════════════════════════
//  RESUMEN — interpreta las filas del Sheets y produce:
//   · resumen diario (una tarjeta por día, ícono del peor tramo)
//   · bloques de 6 h (agrupando los tramos de 3 h de a dos)
//  Columnas del CSV:
//   0 Día · 1 Tramo · 2 Nubes · 3 Visibilidad · 4 Viento
//   5 Mar · 6 Temp · 7 Sensación · 8 Riesgo
// ════════════════════════════════════════════════════════════════

// ── Severidad del cielo (mayor = peor, para elegir ícono del día) ──
const SEVERIDAD_CIELO = {
  despejado: 1, parcial: 2, nublado: 3, cubierto: 4,
};

// Detecta el estado de cielo "peor" mencionado en un texto combinado
// como "Despejado a Parcial" o "Nublado a Cubierto".
function peorCielo(texto) {
  const t = (texto || "").toLowerCase();
  let peor = null, sev = 0;
  for (const [clave, s] of Object.entries(SEVERIDAD_CIELO)) {
    if (t.includes(clave) && s > sev) { sev = s; peor = clave; }
  }
  return peor || "despejado";
}

// Detecta precipitación / hidrometeoro en la columna Visibilidad.
// Devuelve una de: nieve, lluvia, niebla, neblina, null (para el ícono).
function detectarPrecip(visibilidad) {
  const t = (visibilidad || "").toLowerCase();
  if (t.includes("nieve")) return "nieve";
  if (t.includes("llovizna")) return "lluvia";
  if (t.includes("lluvia") || t.includes("chubasco")) return "lluvia";
  if (t.includes("niebla")) return "niebla";
  if (t.includes("neblina")) return "neblina";
  return null;
}

// Detecta la intensidad: "débil" → débil (3 elementos); si no → fuerte (5).
function detectarIntensidad(visibilidad) {
  const t = (visibilidad || "").toLowerCase();
  return /d[ée]bil/.test(t) ? "debil" : "fuerte";
}

// Extrae el TEXTO del fenómeno tal cual, quitando la parte de km.
// "4/8 KM nieve débil" → "nieve débil" · "10 KM" → "" (sin fenómeno)
function textoFenomeno(visibilidad) {
  if (!visibilidad) return "";
  // Quita el patrón de visibilidad: "10 KM", "4/8 KM", "4/8 km", etc.
  const limpio = visibilidad
    .replace(/^\s*\d+(\s*\/\s*\d+)?\s*km\s*/i, "")
    .trim();
  return limpio;
}

// Prioridad de precipitación para el resumen del día.
const PRIORIDAD_PRECIP = { nieve: 4, lluvia: 3, niebla: 2, neblina: 1 };

// ── Riesgo por viento sostenido (mayor del rango, SIN rachas) ────
// Escala: ≤15 bajo · 16-20 moderado · 21-29 alto · ≥30 peligro.
export function riesgoPorViento(vientoObj) {
  const v = vientoObj?.max;
  if (v == null) return null;
  if (v >= 30) return "peligro";
  if (v >= 21) return "alto";
  if (v >= 16) return "mod";
  return "bajo";
}

// Extrae el viento sostenido máximo (sin rachas) de un texto crudo.
// "W/NW 20/30 KT rachas 40 KT" → 30. Ignora el número tras "rachas".
export function vientoSostenidoMax(textoCrudo) {
  const t = String(textoCrudo || "");
  // Corta antes de "rachas" para no contar ese número.
  const sostenido = t.split(/rachas?/i)[0];
  const nums = sostenido.match(/\d+/g);
  if (!nums) return null;
  return Math.max(...nums.map(Number));
}

// ── Parseo de temperatura "-12°C / -6°C" → { min:-12, max:-6 } ──
function parseTemp(texto) {
  const nums = (texto || "").match(/-?\d+/g);
  if (!nums || !nums.length) return { min: null, max: null };
  const vals = nums.map(Number);
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

// ── Parseo de viento "NW 12/18 KT rachas 30 KT" ──
// Devuelve { dir, min, max, rachas }.
function parseViento(texto) {
  const t = texto || "";
  const dir = (t.match(/^[A-Za-zÑ/]+/) || [""])[0].trim();
  const rango = t.match(/(\d+)\s*\/\s*(\d+)/);
  const simple = t.match(/(\d+)\s*(KT|kt|kts)/);
  const rachas = t.match(/rachas?\s*(\d+)/i);
  let min = null, max = null;
  if (rango) { min = +rango[1]; max = +rango[2]; }
  else if (simple) { min = max = +simple[1]; }
  return { dir, min, max, rachas: rachas ? +rachas[1] : null };
}

// Normaliza una fila cruda del CSV a un objeto manejable.
export function parseFila(r) {
  return {
    dia: r[0], tramo: r[1],
    cielo: peorCielo(r[2]), cieloRaw: r[2] || "",
    visibilidad: r[3] || "", precip: detectarPrecip(r[3]), fenomeno: textoFenomeno(r[3]),
    intensidad: detectarIntensidad(r[3]),
    viento: parseViento(r[4]), vientoRaw: r[4] || "",
    mar: r[5] || "",
    temp: parseTemp(r[6]), sensacion: parseTemp(r[7]),
    tempRaw: r[6] || "", sensacionRaw: r[7] || "",
    riesgo: (r[8] || "").toUpperCase().trim(),
  };
}

// ── Agrupa filas por día en orden de aparición ──
export function agruparPorDia(filas) {
  const mapa = new Map();
  for (const raw of filas) {
    const f = parseFila(raw);
    if (!f.dia) continue;
    if (!mapa.has(f.dia)) mapa.set(f.dia, []);
    mapa.get(f.dia).push(f);
  }
  return [...mapa.entries()].map(([dia, tramos]) => ({ dia, tramos }));
}

// ── Resumen de un día a partir de sus tramos ──
export function resumenDia(tramos) {
  let cielo = "despejado", sevC = 0;
  let precip = null, fenomeno = "", intensidad = "fuerte", sevP = 0;
  let min = Infinity, max = -Infinity;
  let vientoMax = { max: -Infinity, dir: "", rachas: null };

  for (const t of tramos) {
    const sc = SEVERIDAD_CIELO[t.cielo] || 0;
    if (sc > sevC) { sevC = sc; cielo = t.cielo; }

    if (t.precip) {
      const sp = PRIORIDAD_PRECIP[t.precip] || 0;
      if (sp > sevP) { sevP = sp; precip = t.precip; fenomeno = t.fenomeno; intensidad = t.intensidad; }
    }
    if (t.temp.min != null) min = Math.min(min, t.temp.min);
    if (t.temp.max != null) max = Math.max(max, t.temp.max);

    if (t.viento.max != null && t.viento.max > vientoMax.max) {
      vientoMax = { max: t.viento.max, min: t.viento.min, dir: t.viento.dir, rachas: t.viento.rachas };
    }
  }

  return {
    cielo, precip, fenomeno, intensidad,
    tempMin: min === Infinity ? null : min,
    tempMax: max === -Infinity ? null : max,
    viento: vientoMax,
    riesgoViento: riesgoPorViento(vientoMax),
  };
}

// ── Devuelve los tramos de 3 h con sus datos CRUDOS del Sheets ────
// Conserva el texto original de cada columna para mostrarlo tal cual,
// más el cielo/precip normalizados (para el ícono) y el riesgo (color).
export function tramos3h(tramos) {
  return tramos.map((t) => {
    const h0 = (t.tramo.match(/(\d+)\s*a/) || [])[1] ?? "";
    const h1 = (t.tramo.match(/a\s*(\d+)/) || [])[1] ?? "";
    const sostMax = vientoSostenidoMax(t.vientoRaw);
    return {
      etiqueta: h0 && h1 ? `${h0}-${h1} h` : t.tramo,
      cielo: t.cielo,          // normalizado (ícono)
      precip: t.precip,        // normalizado (ícono)
      intensidad: t.intensidad, // débil (3) o fuerte (5)
      // Datos crudos, tal cual la hoja:
      nubesRaw: t.cieloRaw,
      visibilidadRaw: t.visibilidad,
      vientoRaw: t.vientoRaw,
      tempRaw: t.tempRaw,
      sensacionRaw: t.sensacionRaw,
      // Riesgo por viento sostenido (para el color):
      riesgoViento: riesgoPorViento({ max: sostMax }),
    };
  });
}
