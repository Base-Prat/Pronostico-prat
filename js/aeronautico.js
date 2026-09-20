// ════════════════════════════════════════════════════════════════
//  AERONÁUTICO — lee "taf_base_prat" (TAF con clave internacional)
//  y "aero_base_prat" (detalle METAR pronosticado por tramo) desde
//  Google Sheets, y renderiza ambos. Solo se muestra para el sector
//  Base Prat (key: "prat").
//
//  Columnas esperadas en aero_base_prat (CSV), en este orden:
//    Día, Tramo, Viento, Categoria_Vuelo, Techo_Nubes_m,
//    Visibilidad, Punto_Rocio, Temp, METAR
//
//  Columnas esperadas en taf_base_prat: TAF, Generado_UTC
// ════════════════════════════════════════════════════════════════

import { getCSVUrl } from "./config.js?v=20260721010000";
import { esc } from "./utils.js?v=20260721010000";

// GIDs de las hojas. Se obtienen abriendo cada pestaña en Google
// Sheets y copiando el parámetro gid= de la URL del navegador.
const GID_AERO_PRAT = "2094326646";
const GID_TAF_PRAT = "REEMPLAZAR_GID_TAF_PRAT";

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

// ── Bloque TAF (texto monoespaciado, clave internacional) ────────
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

// ── Tabla METAR pronosticado por tramo ────────────────────────────
function renderTablaAero(filas) {
  // filas: [Día, Tramo, Viento, Categoria_Vuelo, Techo_Nubes_m, Visibilidad, Punto_Rocio, Temp, METAR]
  const dias = [...new Set(filas.map((r) => r[0]))];

  const tabsHtml = dias
    .map((d, i) => `<button class="aero-dia-tab${i === 0 ? " active" : ""}" data-dia="${esc(d)}">${esc(d)}</button>`)
    .join("");

  const tablaHtmlPorDia = (dia) => {
    const filasDia = filas.filter((r) => r[0] === dia);
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

    return `
      <table class="aero-table">
        <thead>
          <tr>
            <th>Tramo</th><th>Categoría</th><th>Viento</th><th>Techo</th>
            <th>Visibilidad</th><th>P. Rocío</th><th>Temp</th><th>METAR (referencial)</th>
          </tr>
        </thead>
        <tbody>${filasHtml}</tbody>
      </table>`;
  };

  if (!contTabla()) return;
  contTabla().innerHTML = `
    <div class="aero-dias-tabs">${tabsHtml}</div>
    <div class="aero-tabla-wrap" id="aero-tabla-wrap">${tablaHtmlPorDia(dias[0])}</div>
    <p class="aero-nota">Categoría de vuelo (VFR/MVFR/IFR/LIFR) y METAR pronosticado por tramo
    son estimaciones operativas propias derivadas de los modelos, no observaciones reales.</p>`;

  contTabla().querySelectorAll(".aero-dia-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      contTabla().querySelectorAll(".aero-dia-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("aero-tabla-wrap").innerHTML = tablaHtmlPorDia(btn.dataset.dia);
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

// Muestra u oculta la sección aeronáutica según el sector activo.
export function actualizarVisibilidadAero(sector) {
  const s = secc();
  if (!s) return;
  const esPrat = sector?.key === "prat";
  s.style.display = esPrat ? "" : "none";
  if (esPrat) cargarAeronautico();
}
