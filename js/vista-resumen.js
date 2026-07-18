// ════════════════════════════════════════════════════════════════
//  VISTA RESUMEN — dibuja la tira de días y los bloques de 6 h.
// ════════════════════════════════════════════════════════════════

import { esc, getModelRunInfo } from "./utils.js?v=20260718080056";
import { agruparPorDia, resumenDia, tramos3h } from "./resumen.js?v=20260718080056";
import { iconoTiempo, flechaViento } from "./iconos.js?v=20260718080056";

const PRECIP_LABEL = { nieve: "Nieve", lluvia: "Lluvia", niebla: "Niebla", neblina: "Neblina" };

// Capitaliza la primera letra ("nieve débil" → "Nieve débil").
function cap(txt) {
  if (!txt) return "";
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function tempPar(min, max) {
  const f = (v) => (v == null ? "--" : `${v}°`);
  return `<span class="t-max">${f(max)}</span><span class="t-min">${f(min)}</span>`;
}

function vientoTxt(v) {
  if (!v || v.max == null) return "--";
  const rango = v.min != null && v.min !== v.max ? `${v.min}/${v.max}` : `${v.max}`;
  return `${rango} kt${v.rachas ? ` <small>(R ${v.rachas})</small>` : ""}`;
}

// ── Tira de resumen diario (una columna por día) ─────────────────
function tarjetaDia(dia, resumen, activo, idx) {
  const partes = dia.split(" ");
  const nombre = partes[0] || dia;
  const fecha = partes.slice(1).join(" ");
  // Muestra el texto real del fenómeno ("Nieve débil"); si no hay, el label genérico.
  const textoPrecip = resumen.fenomeno ? cap(resumen.fenomeno) : (resumen.precip ? PRECIP_LABEL[resumen.precip] : "");
  const precipBadge = textoPrecip ? `<div class="rd-precip">${esc(textoPrecip)}</div>` : "";
  const claseRiesgo = RIESGO_CLASE[resumen.riesgoViento] || "";

  return `
    <button class="resumen-dia ${claseRiesgo} ${activo ? "active" : ""}" data-idx="${idx}" data-dia="${esc(dia)}">
      <div class="rd-nombre">${esc(nombre)}</div>
      <div class="rd-fecha">${esc(fecha)}</div>
      <div class="rd-icono">${iconoTiempo(resumen.cielo, resumen.precip, resumen.intensidad)}</div>
      <div class="rd-temps">${tempPar(resumen.tempMin, resumen.tempMax)}</div>
      ${precipBadge}
      <div class="rd-viento">
        <span class="rd-flecha">${flechaViento(resumen.viento.dir)}</span>
        <span class="rd-viento-val">${vientoTxt(resumen.viento)}</span>
      </div>
      <div class="rd-dir">${esc(resumen.viento.dir || "")}</div>
    </button>`;
}

// Mapa de riesgo → clase de color de fondo (semáforo del sitio).
const RIESGO_CLASE = {
  bajo: "riesgo-bajo",
  mod: "riesgo-mod",
  alto: "riesgo-alto",
  peligro: "riesgo-peligro",
};

// ── Fila del detalle cada 3 h — columnas crudas + color por viento ─
function filaBloque(b) {
  const claseRiesgo = RIESGO_CLASE[b.riesgoViento] || "";
  return `
    <div class="b6-fila ${claseRiesgo}">
      <div class="b6-hora">${esc(b.etiqueta)}</div>
      <div class="b6-icono">${iconoTiempo(b.cielo, b.precip, b.intensidad)}</div>
      <div class="b6-col">${esc(b.nubesRaw) || "—"}</div>
      <div class="b6-col">${esc(b.visibilidadRaw) || "—"}</div>
      <div class="b6-col b6-viento-col">
        <span class="rd-flecha">${flechaViento(vientoDir(b.vientoRaw))}</span>
        ${esc(b.vientoRaw) || "—"}
      </div>
      <div class="b6-col t-aire">${esc(b.tempRaw) || "—"}</div>
      <div class="b6-col t-sens">${esc(b.sensacionRaw) || "—"}</div>
    </div>`;
}

// Extrae solo la dirección textual del viento crudo para la flecha.
function vientoDir(raw) {
  return (String(raw || "").match(/^[A-Za-zÑ/]+/) || [""])[0].trim();
}

// ── Render completo de un sector ─────────────────────────────────
// Devuelve el HTML; el llamador engancha los eventos.
export function construirResumen(filas, diaSeleccionado) {
  const dias = agruparPorDia(filas);
  if (!dias.length) return { html: "", dias: [] };

  const idxSel = Math.max(0, dias.findIndex((d) => d.dia === diaSeleccionado));
  const activo = dias[idxSel] || dias[0];

  // Tira de días.
  const tira = dias
    .map((d, i) => tarjetaDia(d.dia, resumenDia(d.tramos), i === idxSel, i))
    .join("");

  // Tramos de 3 h del día activo.
  const bloques = tramos3h(activo.tramos).map(filaBloque).join("");

  const html = `
    <div class="resumen-wrap">
      <div class="resumen-tira-cont">
        <button class="tira-nav tira-nav-izq" id="tira-izq" aria-label="Días anteriores">‹</button>
        <div class="resumen-tira" id="resumen-tira">${tira}</div>
        <button class="tira-nav tira-nav-der" id="tira-der" aria-label="Días siguientes">›</button>
      </div>

      <div class="b6-panel">
        <div class="b6-titulo">
          <span>Detalle cada 3 horas — <b>${esc(activo.dia)}</b></span>
          <button class="b6-link" id="btn-horario" data-idx="${idxSel}" data-dia="${esc(activo.dia)}">
            📊 Ver detalle por hora
          </button>
        </div>
        <div class="b6-header">
          <div>Horario</div><div></div><div>Nubes</div><div>Visibilidad</div><div>Viento</div><div>Temp</div><div>Sensación</div>
        </div>
        ${bloques}
        <div class="b6-modelos">
          Elaboración propia sobre modelos <b>${esc(getModelRunInfo().runModelo)}</b>
          · corrida ${esc(getModelRunInfo().runHoraUTC)} UTC
        </div>
      </div>
    </div>`;

  return { html, dias, idxSel };
}
