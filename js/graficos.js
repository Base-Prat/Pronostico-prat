// ════════════════════════════════════════════════════════════════
//  GRÁFICOS — modal de detalle horario con Chart.js
// ════════════════════════════════════════════════════════════════

import { CONFIG } from "./config.js?v=20260718080056";
import { fetchConTimeout } from "./utils.js?v=20260718080056";

let charts = {};

const HOURLY_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${CONFIG.estacion.lat}` +
  `&longitude=${CONFIG.estacion.lon}` +
  `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,` +
  `wind_speed_10m,wind_gusts_10m,cloud_cover,pressure_msl` +
  `&wind_speed_unit=kn&timezone=America%2FPunta_Arenas`;

// Amplía un gráfico al hacer clic (modal de pantalla completa reutilizable).
function ampliarGrafico(id, chart) {
  let modal = document.getElementById("chart-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "chart-modal";
    modal.className = "chart-modal";
    modal.innerHTML = `
      <div class="chart-modal-inner">
        <span class="chart-modal-close" aria-label="Cerrar">&times;</span>
        <div class="chart-modal-canvas-wrap"><canvas id="chart-modal-canvas"></canvas></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal) cerrar(); });
    modal.querySelector(".chart-modal-close").addEventListener("click", cerrar);
  }
  function cerrar() {
    modal.classList.remove("open");
    if (charts.modalBig) { charts.modalBig.destroy(); charts.modalBig = null; }
  }
  modal.classList.add("open");
  const ctx = document.getElementById("chart-modal-canvas").getContext("2d");
  if (charts.modalBig) charts.modalBig.destroy();
  charts.modalBig = new Chart(ctx, {
    type: chart.config.type,
    data: chart.config.data,
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { size: 16, weight: "bold" } } } },
      scales: { x: { ticks: { font: { size: 14 } } }, y: { ticks: { font: { size: 14 } } } },
    },
  });
}

function crearGrafico(id, labels, cfg) {
  if (charts[id]) charts[id].destroy();
  const ds = [{
    label: cfg.label, data: cfg.data, borderColor: cfg.color,
    backgroundColor: cfg.color + "22", fill: cfg.tipo !== "bar", tension: 0.3,
  }];
  if (cfg.data2) {
    ds.push({
      label: cfg.label2, data: cfg.data2, borderColor: cfg.color2,
      borderDash: [5, 5], fill: false, tension: 0.3,
    });
  }
  const canvas = document.getElementById(id);
  canvas.style.cursor = "zoom-in";
  charts[id] = new Chart(canvas, {
    type: cfg.tipo || "line",
    data: { labels, datasets: ds },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: () => ampliarGrafico(id, charts[id]),
      onHover: (e, a) => { e.native.target.style.cursor = a.length ? "pointer" : "zoom-in"; },
    },
  });
}

export async function abrirDetalleHorario(idxDia, dia) {
  const modal = document.getElementById("modalDetalle");
  document.getElementById("modalTitle").textContent = `Pronóstico horario: ${dia}`;
  modal.classList.add("open");

  const body = document.getElementById("modalBody");
  body.innerHTML = `<tr><td colspan="7" style="padding:30px"><div class="spinner"></div>Cargando datos horarios…</td></tr>`;

  try {
    const res = await fetchConTimeout(HOURLY_URL);
    const data = await res.json();
    const h = data.hourly;

    const serie = { l: [], v: [], r: [], t: [], st: [], hum: [], p: [], cld: [], pres: [] };
    let filas = "";

    for (let i = idxDia * 24; i < idxDia * 24 + 24; i++) {
      if (!h.time[i]) break;
      const hora = h.time[i].split("T")[1].substring(0, 5);
      serie.l.push(hora);
      serie.v.push(h.wind_speed_10m[i]);
      serie.r.push(h.wind_gusts_10m[i]);
      serie.t.push(h.temperature_2m[i]);
      serie.st.push(h.apparent_temperature[i]);
      serie.p.push(h.precipitation[i]);
      serie.hum.push(h.relative_humidity_2m[i]);
      serie.cld.push(h.cloud_cover[i]);
      serie.pres.push(h.pressure_msl[i]);

      filas += `<tr>
        <td>${hora}</td>
        <td>${Math.round(h.wind_speed_10m[i])}/${Math.round(h.wind_gusts_10m[i])}</td>
        <td><span class="t-aire">${h.temperature_2m[i]}°</span>/<span class="t-sens">${h.apparent_temperature[i]}°</span></td>
        <td>${h.precipitation[i]}</td>
        <td>${h.relative_humidity_2m[i]}%</td>
        <td>${h.cloud_cover[i]}%</td>
        <td>${Math.round(h.pressure_msl[i])}</td>
      </tr>`;
    }

    body.innerHTML = filas;
    crearGrafico("chartViento", serie.l, { label: "Viento (kts)", data: serie.v, color: "#3498db", label2: "Rachas", data2: serie.r, color2: "#e74c3c" });
    crearGrafico("chartTemp", serie.l, { label: "T° Aire (°C)", data: serie.t, color: "#0000ff", label2: "Sensación", data2: serie.st, color2: "#ff0000" });
    crearGrafico("chartPrec", serie.l, { label: "Prec. (mm)", data: serie.p, color: "#27ae60", tipo: "bar" });
    crearGrafico("chartHum", serie.l, { label: "Humedad (%)", data: serie.hum, color: "#16a085" });
    crearGrafico("chartCloud", serie.l, { label: "Nubosidad (%)", data: serie.cld, color: "#7f8c8d" });
    crearGrafico("chartPresion", serie.l, { label: "Presión (hPa)", data: serie.pres, color: "#8e44ad" });
  } catch (e) {
    console.error("Error al cargar detalle horario:", e);
    body.innerHTML = `<tr><td colspan="7" style="padding:30px;color:#b00">⚠️ No se pudieron cargar los datos horarios. Reintenta en unos momentos.</td></tr>`;
  }
}

export function cerrarModal() {
  document.getElementById("modalDetalle").classList.remove("open");
}
