// ════════════════════════════════════════════════════════════════
//  ESTACIÓN EN VIVO — métricas actuales + semáforo operacional
//  Fuente: Open-Meteo (datos abiertos).
// ════════════════════════════════════════════════════════════════

import { CONFIG } from "./config.js?v=20260718075552";
import {
  gradosARumbo, windChill, colorUV, fetchConTimeout,
} from "./utils.js?v=20260718075552";

const OPEN_METEO_CURRENT =
  `https://api.open-meteo.com/v1/forecast?latitude=${CONFIG.estacion.lat}` +
  `&longitude=${CONFIG.estacion.lon}` +
  `&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,` +
  `wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,uv_index,visibility` +
  `&wind_speed_unit=kn`;

// Pinta un punto del semáforo con la clase de color correspondiente.
function setLight(id, clase) {
  const el = document.getElementById(id);
  if (!el) return;
  const dot = el.querySelector(".dot");
  dot.classList.remove("bajo", "mod", "peligro");
  dot.classList.add(clase);
}

// Reglas del semáforo operacional (referencia orientativa, no oficial).
function actualizarSemaforo({ wind, gusts, chill, uv, visKm }) {
  // BOTES: prioriza visibilidad, luego viento/rachas.
  if (visKm != null && visKm < 1) setLight("light-botes", "peligro");
  else if (visKm != null && visKm <= 4) setLight("light-botes", "mod");
  else if (wind >= 25 || gusts >= 30) setLight("light-botes", "peligro");
  else if (wind >= 20 || gusts >= 25) setLight("light-botes", "mod");
  else setLight("light-botes", "bajo");

  // VUELO: sensible a visibilidad y rachas.
  if (visKm != null && visKm < 2) setLight("light-vuelo", "peligro");
  else if (gusts >= 30) setLight("light-vuelo", "peligro");
  else if (gusts >= 25) setLight("light-vuelo", "mod");
  else setLight("light-vuelo", "bajo");

  // EXTERIOR: sensación térmica y UV.
  if (chill <= -15 || uv >= 11) setLight("light-exterior", "peligro");
  else if (uv >= 8) setLight("light-exterior", "mod");
  else setLight("light-exterior", "bajo");
}

function plantillaMetricas(c) {
  const temp = c.temperature_2m;
  const windKts = c.wind_speed_10m;
  const windKmh = windKts * 1.852;
  const uv = c.uv_index ?? 0;
  const rh = c.relative_humidity_2m;
  const wc = windChill(temp, windKmh);
  // Flecha de flujo: apunta hacia donde VA el viento. El glifo "↑"
  // apunta al Norte (0°) y la dirección es de procedencia, por lo
  // que se rota 180° para invertir el sentido.
  const rot = (c.wind_direction_10m + 180) % 360;

  return `
    <div class="metric-item">
      <div class="metric-val">
        <div class="wind-arrow"><span style="transform:rotate(${rot}deg)">↑</span></div>
        ${Math.round(windKts)} kts <small>(R ${Math.round(c.wind_gusts_10m)})</small>
      </div>
      <div class="metric-label">Viento (${gradosARumbo(c.wind_direction_10m)})</div>
    </div>
    <div class="sep">|</div>
    <div class="metric-item"><div class="metric-val temp-aire">${Math.round(temp)}°C</div><div class="metric-label">T° Aire</div></div>
    <div class="sep">|</div>
    <div class="metric-item"><div class="metric-val temp-sens">${Math.round(wc)}°C</div><div class="metric-label">Sensación Térmica (E.V)</div></div>
    <div class="sep">|</div>
    <div class="metric-item"><div class="metric-val">${Math.round(c.surface_pressure)} hPa</div><div class="metric-label">Presión</div></div>
    ${rh != null ? `<div class="sep">|</div><div class="metric-item"><div class="metric-val">${Math.round(rh)}%</div><div class="metric-label">Humedad Rel.</div></div>` : ""}
    <div class="sep">|</div>
    <div class="metric-item"><div class="metric-val fuente">Estación Base Prat</div><div class="metric-label small">FUENTE</div></div>`;
}

export async function actualizarEstacion() {
  const cont = document.getElementById("header-metrics");
  try {
    const res = await fetchConTimeout(OPEN_METEO_CURRENT);
    const data = await res.json();
    const c = data.current;
    cont.innerHTML = plantillaMetricas(c);
    actualizarSemaforo({
      wind: c.wind_speed_10m,
      gusts: c.wind_gusts_10m,
      chill: windChill(c.temperature_2m, c.wind_speed_10m * 1.852),
      uv: c.uv_index ?? 0,
      visKm: c.visibility != null ? c.visibility / 1000 : null,
    });
  } catch (e) {
    console.error("Error al sincronizar estación:", e);
    // Solo muestra el mensaje de error si no hay datos previos en pantalla.
    if (!cont.querySelector(".metric-item")) {
      cont.innerHTML = `<span class="metrics-error">⚠️ Sin conexión con la estación. Reintentando…</span>`;
    }
  }
}
