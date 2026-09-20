// ════════════════════════════════════════════════════════════════
//  AERONÁUTICO — lee la hoja "aero_base_prat" (Google Sheets) y
//  renderiza la tarjeta de categoría de vuelo + techo + TAF-like.
//  Solo se muestra para el sector Base Prat (key: "prat").
//  Columnas esperadas en el CSV, en este orden:
//    Día, Tramo, Viento, Categoria_Vuelo, Techo_Nubes_m,
//    Visibilidad, Punto_Rocio, Temp, TAF
// ════════════════════════════════════════════════════════════════

import { getCSVUrl } from "./config.js?v=20260721010000";
import { esc } from "./utils.js?v=20260721010000";

// GID de la hoja "aero_base_prat". Reemplazar por el valor real
// (se obtiene abriendo esa pestaña en Google Sheets y copiando el
// parámetro gid= de la URL del navegador).
const GID_AERO_PRAT = "2094326646";

const COLORES_CATEGORIA = {
  VFR:  { color: "#1a9850", label: "VFR — Visual" },
  MVFR: { color: "#3288bd", label: "MVFR — Visual marginal" },
  IFR:  { color: "#f46d43", label: "IFR — Instrumental" },
  LIFR: { color: "#d73027", label: "LIFR — Instrumental bajo" },
};

const secc = () => document.getElementById("aero-section");
const cont = () => document.getElementById("aero-content");

function mostrarCargandoAero() {
  if (!cont()) return;
  cont().innerHTML = `
    <div class="state-box">
      <div class="spinner" role="status" aria-label="Cargando"></div>
      <div class="state-title">Cargando pronóstico aeronáutico…</div>
    </div>`;
}

function mostrarErrorAero(mensaje) {
  if (!cont()) return;
  cont().innerHTML = `
    <div class="state-box">
      <div class="state-icon">✈️</div>
      <div class="state-title">No se pudo cargar el pronóstico aeronáutico</div>
      <div class="state-msg">${esc(mensaje)}</div>
    </div>`;
}

function chipCategoria(cat) {
  const info = COLORES_CATEGORIA[cat] || { color: "#888", label: cat || "—" };
  return `<span class="aero-chip" style="background:${info.color}">${esc(info.label)}</span>`;
}

function renderTablaAero(filas) {
  // filas: array de arrays [Día, Tramo, Viento, Categoria_Vuelo, Techo_Nubes_m, Visibilidad, Punto_Rocio, Temp, TAF]
  const dias = [...new Set(filas.map((r) => r[0]))];

  const tabsHtml = dias
    .map((d, i) => `<button class="aero-dia-tab${i === 0 ? " active" : ""}" data-dia="${esc(d)}">${esc(d)}</button>`)
    .join("");

  const tablaHtmlPorDia = (dia) => {
    const filasDia = filas.filter((r) => r[0] === dia);
    const filasHtml = filasDia
      .map((r) => {
        const [, tramo, viento, categoria, techo, visibilidad, rocio, temp, taf] = r;
        return `
          <tr>
            <td>${esc(tramo)}</td>
            <td>${chipCategoria(categoria)}</td>
            <td>${esc(viento || "")}</td>
            <td>${esc(techo || "")}${techo && techo !== "Sin techo" ? " m" : ""}</td>
            <td>${esc(visibilidad || "")}</td>
            <td>${esc(rocio || "")}${rocio ? "°C" : ""}</td>
            <td>${esc(temp || "")}</td>
            <td class="aero-taf">${esc(taf || "")}</td>
          </tr>`;
      })
      .join("");

    return `
      <table class="aero-table">
        <thead>
          <tr>
            <th>Tramo</th><th>Categoría</th><th>Viento</th><th>Techo</th>
            <th>Visibilidad</th><th>P. Rocío</th><th>Temp</th><th>TAF (referencial)</th>
          </tr>
        </thead>
        <tbody>${filasHtml}</tbody>
      </table>`;
  };

  if (!cont()) return;
  cont().innerHTML = `
    <div class="aero-dias-tabs">${tabsHtml}</div>
    <div class="aero-tabla-wrap" id="aero-tabla-wrap">${tablaHtmlPorDia(dias[0])}</div>
    <p class="aero-nota">Categoría de vuelo (VFR/MVFR/IFR/LIFR) y codificación TAF son estimaciones
    operativas propias derivadas de los modelos, no un TAF OACI oficial.</p>`;

  cont().querySelectorAll(".aero-dia-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      cont().querySelectorAll(".aero-dia-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("aero-tabla-wrap").innerHTML = tablaHtmlPorDia(btn.dataset.dia);
    });
  });
}

export function cargarAeronautico() {
  if (!secc()) return;
  mostrarCargandoAero();

  Papa.parse(getCSVUrl(GID_AERO_PRAT), {
    download: true,
    header: false,
    skipEmptyLines: true,
    complete(results) {
      const limpio = results.data.filter((r) => r[0] && r[0] !== "Día");
      if (!limpio.length) {
        mostrarErrorAero("La hoja aeronáutica aún no tiene datos publicados.");
        return;
      }
      renderTablaAero(limpio);
    },
    error(err) {
      mostrarErrorAero("No hay conexión con el servidor de datos.");
      console.error("Papa.parse (aero) error:", err);
    },
  });
}

// Muestra u oculta la sección aeronáutica según el sector activo.
export function actualizarVisibilidadAero(sector) {
  const s = secc();
  if (!s) return;
  const esPrat = sector?.key === "prat";
  s.style.display = esPrat ? "" : "none";
  if (esPrat) cargarAeronautico();
}