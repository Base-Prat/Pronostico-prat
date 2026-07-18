// ════════════════════════════════════════════════════════════════
//  PRONÓSTICO por sectores — lee CSV de Google Sheets, renderiza
//  tarjetas por día y abre el detalle horario (Open-Meteo).
// ════════════════════════════════════════════════════════════════

import { CONFIG, getCSVUrl } from "./config.js?v=20260718075552";
import { esc } from "./utils.js?v=20260718075552";
import { abrirDetalleHorario } from "./graficos.js?v=20260718075552";
import { construirResumen } from "./vista-resumen.js?v=20260718075552";

let sectorActivo = null;
let filasPronostico = [];

const grid = () => document.getElementById("grid-pronostico");
const navDias = () => document.getElementById("days-nav");

// ── Estados visibles ─────────────────────────────────────────────
function mostrarCargando() {
  grid().innerHTML = `
    <div class="state-box">
      <div class="spinner" role="status" aria-label="Cargando"></div>
      <div class="state-title">Cargando pronóstico…</div>
      <div class="state-msg">Obteniendo datos del sector ${esc(sectorActivo?.nombre || "")}.</div>
    </div>`;
  navDias().innerHTML = "";
}

function mostrarError(mensaje) {
  grid().innerHTML = `
    <div class="state-box">
      <div class="state-icon">📡</div>
      <div class="state-title">No se pudo cargar el pronóstico</div>
      <div class="state-msg">${esc(mensaje)}</div>
      <button class="btn-retry" id="btn-retry">Reintentar</button>
    </div>`;
  navDias().innerHTML = "";
  document.getElementById("btn-retry")?.addEventListener("click", cargarSector);
}

// ── Clasificación de riesgo por viento ───────────────────────────
// ── Render del resumen (tira de días + bloques 6h) ───────────────
function renderResumen(diaSeleccionado) {
  const { html } = construirResumen(filasPronostico, diaSeleccionado);
  if (!html) {
    mostrarError("No se pudo interpretar el pronóstico de este sector.");
    return;
  }
  grid().innerHTML = html;
  navDias().innerHTML = "";

  // Clic en un día de la tira → recalcula los bloques de 6 h de ese día.
  grid().querySelectorAll(".resumen-dia").forEach((btn) => {
    btn.addEventListener("click", () => renderResumen(btn.dataset.dia));
  });

  // Enlace al detalle por hora (modal con gráficos, Open-Meteo).
  grid().querySelector("#btn-horario")?.addEventListener("click", (ev) => {
    const { idx, dia } = ev.currentTarget.dataset;
    abrirDetalleHorario(parseInt(idx), dia);
  });
}

// ── Carga del sector activo desde Google Sheets ──────────────────
export function cargarSector() {
  if (!sectorActivo) return;
  mostrarCargando();

  Papa.parse(getCSVUrl(sectorActivo.gid), {
    download: true,
    header: false,
    skipEmptyLines: true,
    complete(results) {
      const limpio = results.data.filter(
        (r) => r[0] && r[0] !== "Día" && r[0] !== "a" && r[1] !== ""
      );
      if (!limpio.length) {
        mostrarError("La hoja no devolvió datos. Puede que el sector aún no tenga pronóstico publicado.");
        return;
      }
      filasPronostico = limpio;
      const dias = [...new Set(limpio.map((r) => r[0]))];
      renderResumen(dias[0]);
    },
    error(err) {
      mostrarError("No hay conexión con el servidor de datos. Revisa tu red y reintenta.");
      console.error("Papa.parse error:", err);
    },
  });
}

export function setSectorActivo(sector) {
  sectorActivo = sector;
  cargarSector();
}

export function getSectorActivo() {
  return sectorActivo;
}
