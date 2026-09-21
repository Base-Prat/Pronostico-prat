// ------------------------------------------------------------
//  AERONAUTICO - lee "taf_base_prat" (TAF con clave internacional)
//  y "aero_base_prat" (detalle METAR pronosticado por tramo) desde
//  Google Sheets, y renderiza ambos. Solo se muestra para el sector
//  Base Prat (key: "prat").
//
//  Columnas esperadas en aero_base_prat (CSV), en este orden:
//    Dia, Tramo, Viento, Categoria_Vuelo, Techo_Nubes_m,
//    Visibilidad, Punto_Rocio, Temp, METAR
//
//  Columnas esperadas en taf_base_prat: TAF, Generado_UTC
// ------------------------------------------------------------

import { getCSVUrl } from "./config.js?v=20260721010000";
import { esc } from "./utils.js?v=20260721010000";

// GIDs de las hojas. Se obtienen abriendo cada pestana en Google
// Sheets y copiando el parametro gid= de la URL del navegador.
const GID_AERO_PRAT = "2094326646";
const GID_TAF_PRAT = "867101644";

const COLORES_CATEGORIA = {
  VFR:  { color: "#1a9850", label: "VFR — Visual" },
  MVFR: { color: "#3288bd", label: "MVFR — Visual marginal" },
  IFR:  { color: "#f46d43", label: "IFR — Instrumental" },
  LIFR: { color: "#d73027", label: "LIFR — Instrumental bajo" },
};

const secc = () => document.getElementById("aero-section");
const contTaf = () => document.getElementById("aero-taf-content");
const contTabla = () => document.getElementById("aero-content");

function bloqueCargando(msg) {
  return `
    <div class="state-box">
      <div class="spinner" role="status" aria-label="Cargando"></div>
      <div class="state-title">${esc(msg)}</div>
    </div>`;
}

function bloqueError(mensaje) {
  return `
    <div class="state-box">
      <div class="state-icon">✈️</div>
      <div class="state-title">No se pudo cargar</div>
      <div class="state-msg">${esc(mensaje)}</div>
    </div>`;
}

function chipCategoria(cat) {
  const info = COLORES_CATEGORIA[cat] || { color: "#888", label: cat || "—" };
  return `<span class="aero-chip" style="background:${info.color}">${esc(info.label)}</span>`;
}

// -- Parsers de los campos formateados (para meteograma/airgram) --
function parseVientoKt(vientoStr) {
  // "SE 20/25 KT rachas 35 KT" -> { max: 25, gust: 35 }
  const nums = (vientoStr || "").match(/\d+/g)?.map(Number) || [];
  // El primer par de numeros es min/max sostenido; si hay "rachas N" al final, es la rafaga.
  const rachaMatch = (vientoStr || "").match(/rachas\s+(\d+)/i);
  const max = nums.length >= 2 ? nums[1] : (nums[0] || 0);
  const gust = rachaMatch ? Number(rachaMatch[1]) : null;
  return { max, gust };
}

function parseTechoM(techoStr) {
  if (!techoStr || techoStr === "Sin techo") return null;
  const n = parseInt(techoStr, 10);
  return Number.isFinite(n) ? n : null;
}

function parseTempProm(tempStr) {
  // "-10°C / -9°C" -> promedio
  const nums = (tempStr || "").match(/-?\d+/g)?.map(Number) || [];
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

let chartMeteograma = null;

function renderMeteograma(filasDia) {
  const cont = document.getElementById("aero-tabla-wrap");
  if (!cont) return;
  cont.innerHTML = `<div class="meteograma-wrap"><canvas id="chart-meteograma"></canvas></div>`;

  const labels = filasDia.map((r) => r[1]); // Tramo
  const vientos = filasDia.map((r) => parseVientoKt(r[2]));
  const techos = filasDia.map((r) => parseTechoM(r[4]));
  const temps = filasDia.map((r) => parseTempProm(r[7]));

  const ctx = document.getElementById("chart-meteograma");
  if (chartMeteograma) chartMeteograma.destroy();
  chartMeteograma = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Viento sostenido (kt)",
          data: vientos.map((v) => v.max),
          borderColor: "#3288bd",
          backgroundColor: "transparent",
          yAxisID: "y",
          tension: 0.25,
        },
        {
          label: "Ráfaga (kt)",
          data: vientos.map((v) => v.gust),
          borderColor: "#d73027",
          borderDash: [4, 3],
          backgroundColor: "transparent",
          yAxisID: "y",
          tension: 0.25,
          spanGaps: true,
        },
        {
          label: "Techo de nubes (m)",
          data: techos,
          borderColor: "#1a9850",
          backgroundColor: "transparent",
          yAxisID: "y1",
          tension: 0.25,
          spanGaps: true,
        },
        {
          label: "Temp. media (°C)",
          data: temps,
          borderColor: "#f4a442",
          backgroundColor: "transparent",
          yAxisID: "y2",
          tension: 0.25,
          hidden: true,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { color: "#cfe0f0" } } },
      scales: {
        x: { ticks: { color: "#9fc0dd" }, grid: { color: "rgba(255,255,255,0.06)" } },
        y: { position: "left", title: { display: true, text: "kt", color: "#9fc0dd" }, ticks: { color: "#9fc0dd" } },
        y1: { position: "right", title: { display: true, text: "m", color: "#9fc0dd" }, ticks: { color: "#9fc0dd" }, grid: { drawOnChartArea: false } },
        y2: { display: false },
      },
    },
  });
}

function renderAirgram(filasDia) {
  const cont = document.getElementById("aero-tabla-wrap");
  if (!cont) return;
  const bloques = filasDia
    .map((r) => {
      const [, tramo, viento, categoria, techo, visibilidad] = r;
      const info = COLORES_CATEGORIA[categoria] || { color: "#888", label: categoria || "—" };
      return `
        <div class="airgram-bloque" style="border-top-color:${info.color}">
          <div class="airgram-tramo">${esc(tramo)}</div>
          <div class="airgram-cat" style="color:${info.color}">${esc(categoria || "—")}</div>
          <div class="airgram-dato">${esc(viento || "")}</div>
          <div class="airgram-dato">${esc(techo || "")}${techo && techo !== "Sin techo" ? " m" : ""}</div>
          <div class="airgram-dato">${esc(visibilidad || "")}</div>
        </div>`;
    })
    .join("");
  cont.innerHTML = `<div class="airgram-wrap">${bloques}</div>`;
}

function renderVistaSegunModo(filasDia) {
  if (vistaActual === "meteograma") renderMeteograma(filasDia);
  else if (vistaActual === "airgram") renderAirgram(filasDia);
  else renderTablaDia(filasDia);
}

// -- Bloque TAF (texto monoespaciado, clave internacional) --
function renderTaf(filas) {
  if (!contTaf()) return;
  const lineasTaf = filas.map((r) => r[0]).filter(Boolean);
  const generado = filas[0]?.[1] || "";

  contTaf().innerHTML = `
    <pre class="taf-block">${lineasTaf.map(esc).join("\n")}</pre>
    ${generado ? `<p class="aero-nota">Generado ${esc(generado)} UTC</p>` : ""}
    <p class="aero-nota">Codificación TAF con nomenclatura internacional (grupo de viento,
    visibilidad, fenómenos, nubes y BECMG) generada operativamente a partir de los modelos;
    no es un TAF OACI oficial emitido por autoridad aeronáutica certificada.</p>`;
}

function cargarTaf() {
  if (!contTaf()) return;
  contTaf().innerHTML = bloqueCargando("Cargando TAF…");

  if (GID_TAF_PRAT === "REEMPLAZAR_GID_TAF_PRAT") {
    contTaf().innerHTML = bloqueError("Falta configurar el GID de la hoja taf_base_prat en aeronautico.js.");
    return;
  }

  Papa.parse(getCSVUrl(GID_TAF_PRAT), {
    download: true,
    header: false,
    skipEmptyLines: true,
    complete(results) {
      const limpio = results.data.filter((r) => r[0] && r[0] !== "TAF");
      if (!limpio.length) {
        contTaf().innerHTML = bloqueError("La hoja TAF aún no tiene datos publicados.");
        return;
      }
      renderTaf(limpio);
    },
    error(err) {
      contTaf().innerHTML = bloqueError("No hay conexión con el servidor de datos (TAF).");
      console.error("Papa.parse (taf) error:", err);
    },
  });
}

// -- Tabla METAR pronosticado por tramo (+ meteograma/airgram) --
let vistaActual = "tabla";
let filasAeroGlobal = [];

function renderTablaDia(filasDia) {
  const cont = document.getElementById("aero-tabla-wrap");
  if (!cont) return;
  const filasHtml = filasDia
    .map((r) => {
      const [, tramo, viento, categoria, techo, visibilidad, rocio, temp, metar] = r;
      return `
        <tr>
          <td>${esc(tramo)}</td>
          <td>${chipCategoria(categoria)}</td>
          <td>${esc(viento || "")}</td>
          <td>${esc(techo || "")}${techo && techo !== "Sin techo" ? " m" : ""}</td>
          <td>${esc(visibilidad || "")}</td>
          <td>${esc(rocio || "")}${rocio ? "°C" : ""}</td>
          <td>${esc(temp || "")}</td>
          <td class="aero-metar">${esc(metar || "")}</td>
        </tr>`;
    })
    .join("");

  cont.innerHTML = `
    <table class="aero-table">
      <thead>
        <tr>
          <th>Tramo</th><th>Categoría</th><th>Viento</th><th>Techo</th>
          <th>Visibilidad</th><th>P. Rocío</th><th>Temp</th><th>METAR (referencial)</th>
        </tr>
      </thead>
      <tbody>${filasHtml}</tbody>
    </table>`;
}

function filasDelDia(dia) {
  return filasAeroGlobal.filter((r) => r[0] === dia);
}

function renderTablaAero(filas) {
  filasAeroGlobal = filas;
  const dias = [...new Set(filas.map((r) => r[0]))];

  const tabsHtml = dias
    .map((d, i) => `<button class="aero-dia-tab${i === 0 ? " active" : ""}" data-dia="${esc(d)}">${esc(d)}</button>`)
    .join("");

  const vistasHtml = [
    { id: "tabla", label: "📋 Tabla" },
    { id: "meteograma", label: "📈 Meteograma" },
    { id: "airgram", label: "🎞️ Airgram" },
  ]
    .map((v) => `<button class="aero-vista-tab${vistaActual === v.id ? " active" : ""}" data-vista="${v.id}">${v.label}</button>`)
    .join("");

  if (!contTabla()) return;
  contTabla().innerHTML = `
    <div class="aero-vistas-tabs">${vistasHtml}</div>
    <div class="aero-dias-tabs">${tabsHtml}</div>
    <div class="aero-tabla-wrap" id="aero-tabla-wrap"></div>
    <p class="aero-nota">Categoría de vuelo (VFR/MVFR/IFR/LIFR) y METAR pronosticado por tramo
    son estimaciones operativas propias derivadas de los modelos, no observaciones reales.</p>`;

  renderVistaSegunModo(filasDelDia(dias[0]));

  contTabla().querySelectorAll(".aero-dia-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      contTabla().querySelectorAll(".aero-dia-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderVistaSegunModo(filasDelDia(btn.dataset.dia));
    });
  });

  contTabla().querySelectorAll(".aero-vista-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      contTabla().querySelectorAll(".aero-vista-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      vistaActual = btn.dataset.vista;
      const diaActivo = contTabla().querySelector(".aero-dia-tab.active")?.dataset.dia || dias[0];
      renderVistaSegunModo(filasDelDia(diaActivo));
    });
  });
}

function cargarTablaAero() {
  if (!contTabla()) return;
  contTabla().innerHTML = bloqueCargando("Cargando detalle METAR por tramo…");

  Papa.parse(getCSVUrl(GID_AERO_PRAT), {
    download: true,
    header: false,
    skipEmptyLines: true,
    complete(results) {
      const limpio = results.data.filter((r) => r[0] && r[0] !== "Día");
      if (!limpio.length) {
        contTabla().innerHTML = bloqueError("La hoja aeronáutica aún no tiene datos publicados.");
        return;
      }
      renderTablaAero(limpio);
    },
    error(err) {
      contTabla().innerHTML = bloqueError("No hay conexión con el servidor de datos.");
      console.error("Papa.parse (aero) error:", err);
    },
  });
}

export function cargarAeronautico() {
  cargarTaf();
  cargarTablaAero();
}

// Muestra u oculta la seccion aeronautica segun el sector activo.
export function actualizarVisibilidadAero(sector) {
  const s = secc();
  if (!s) return;
  const esPrat = sector?.key === "prat";
  s.style.display = esPrat ? "" : "none";
  if (esPrat) cargarAeronautico();
}
