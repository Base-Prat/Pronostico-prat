// ════════════════════════════════════════════════════════════════
//  UTILIDADES compartidas
// ════════════════════════════════════════════════════════════════

const DIRECCIONES = [
  "NORTE", "N/NE", "NE", "E/NE", "ESTE", "E/SE", "SE", "S/SE",
  "SUR", "S/SW", "SW", "SW/W", "OESTE", "W/NW", "NW", "NW/N",
];

// Texto de rumbo a partir de grados (0-360).
export function gradosARumbo(grados) {
  return DIRECCIONES[Math.round(grados / 22.5) % 16];
}

// Sensación térmica por enfriamiento de viento (fórmula estándar NWS).
// temp en °C, viento en km/h. Devuelve °C.
export function windChill(tempC, vientoKmh) {
  if (tempC <= 10 && vientoKmh > 4.8) {
    return (
      13.12 +
      0.6215 * tempC -
      11.37 * Math.pow(vientoKmh, 0.16) +
      0.3965 * tempC * Math.pow(vientoKmh, 0.16)
    );
  }
  return tempC;
}

// Color según índice UV.
export function colorUV(uv) {
  if (uv >= 11) return "#8e44ad";
  if (uv >= 8) return "#e74c3c";
  if (uv >= 6) return "#e67e22";
  if (uv >= 3) return "#f1c40f";
  return "#27ae60";
}

// Info de la corrida de modelo más reciente según la hora local.
export function getModelRunInfo() {
  const h = new Date().getHours();
  let runHoraUTC;
  if (h >= 6 && h < 14) runHoraUTC = "06:00";
  else if (h >= 14 && h < 20) runHoraUTC = "12:00";
  else if (h >= 20 && h < 24) runHoraUTC = "18:00";
  else runHoraUTC = "00:00";
  return { runHoraUTC, runModelo: "GFS / AMPS" };
}

// fetch con timeout, para no dejar la UI colgada si la red es lenta.
export async function fetchConTimeout(url, opciones = {}, ms = 15000) {
  const controlador = new AbortController();
  const id = setTimeout(() => controlador.abort(), ms);
  try {
    const res = await fetch(url, { ...opciones, signal: controlador.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(id);
  }
}

// Escapa texto para inyección segura en HTML.
export function esc(txt) {
  const d = document.createElement("div");
  d.textContent = txt == null ? "" : String(txt);
  return d.innerHTML;
}
