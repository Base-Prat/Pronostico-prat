// ════════════════════════════════════════════════════════════════
//  VISTA RESUMEN — dibuja la tira de días y los bloques de 6 h.
// ════════════════════════════════════════════════════════════════

import { esc, getModelRunInfo } from "./utils.js?v=20260721010000";
import { agruparPorDia, resumenDia, tramos3h } from "./resumen.js?v=20260721010000";
import { iconoTiempo, flechaViento } from "./iconos.js?v=20260721010000";

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
    <td class="rd-celda"><button class="resumen-dia ${claseRiesgo} ${activo ? "active" : ""}" data-idx="${idx}" data-dia="${esc(dia)}">
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
    </button></td>`;
}

// Mapa de riesgo → clase de color de fondo (semáforo del sitio).
const RIESGO_CLASE = {
  bajo: "riesgo-bajo",
  mod: "riesgo-mod",
  alto: "riesgo-alto",
  peligro: "riesgo-peligro",
};

// ── Fila desplegable del detalle cada 3 h ────────────────────────
// Visible siempre: hora, ícono, temperatura/sensación y viento. El
// resto de las variables aparece al tocar la fila, de modo que el
// ancho nunca excede la pantalla.
function filaBloque(b, idx) {
  const claseRiesgo = RIESGO_CLASE[b.riesgoViento] || "";
  const dir = vientoDir(b.vientoRaw);
  const v = parseVientoDet(b.vientoRaw);

  // Cada campo lleva una clase opcional para colorear su valor.
  const detalles = [
    ["Nubosidad", b.nubesRaw],
    ["Visibilidad", visKm(b.visibilidadRaw)],
    ["Fenomeno", fenomenoTxt(b.visibilidadRaw)],
    ["Temperatura del aire", b.tempRaw, "b6-v-aire"],
    ["Sensacion termica", b.sensacionRaw, "b6-v-sens"],
    ["Viento sostenido", v.sostenido],
    ["Rachas maximas", v.rachas],
    ["Riesgo por viento", RIESGO_TXT[b.riesgoViento] || "--"],
  ]
    .filter(([, val]) => val && String(val).trim())
    .map(([k, val, clase]) => `
        <div class="b6-det-item">
          <span class="b6-det-k">${esc(k)}</span>
          <span class="b6-det-v ${clase || ""}">${esc(val)}</span>
        </div>`)
    .join("");

  return `
    <div class="b6-fila ${claseRiesgo}" data-fila="${idx}">
      <button class="b6-cab" aria-expanded="false" aria-controls="b6-det-${idx}">
        <span class="b6-hora">${esc(b.etiqueta)}</span>
        <span class="b6-icono">${iconoTiempo(b.cielo, b.precip, b.intensidad)}</span>
        <span class="b6-temp">
          <span class="b6-t-aire">${esc(valorTemp(b.tempRaw))}</span><span class="b6-t-sep">/</span><span class="b6-t-sens">${esc(valorTemp(b.sensacionRaw))}</span>
        </span>
        <span class="b6-viento-res">
          <span class="rd-flecha">${flechaViento(dir)}</span>
          <span class="b6-viento-txt">
            <b>${esc(dir || "--")}</b>
            <small>${esc(resumenViento(b.vientoRaw))}</small>
          </span>
        </span>
        <span class="b6-chev" aria-hidden="true">&#8964;</span>
      </button>
      <div class="b6-det" id="b6-det-${idx}" hidden>
        <div class="b6-det-grid">${detalles}</div>
      </div>
    </div>`;
}

// Etiquetas legibles del nivel de riesgo por viento sostenido.
const RIESGO_TXT = {
  bajo: "Bajo (hasta 15 kt)",
  mod: "Moderado (16-20 kt)",
  alto: "Alto (21-29 kt)",
  peligro: "Peligro (30 kt o mas)",
};

// Descompone el viento crudo en sus partes, para el desplegable.
function parseVientoDet(raw) {
  const t = String(raw || "");
  const dir = (t.match(/^[A-Za-z\u00d1/]+/) || [""])[0].trim().toUpperCase();
  const sost = t.split(/rachas?/i)[0].replace(/^[A-Za-z\u00d1/]+\s*/, "").trim();
  const r = t.match(/rachas?\s*(\d+)/i);
  // El viento sostenido se muestra con su direccion delante,
  // en el mismo formato que usa la hoja: "NW 6/12 KT".
  const sostConDir = sost ? (dir ? dir + " " + sost : sost) : "--";
  return {
    sostenido: sostConDir,
    // Cadena vacia cuando no hay rachas: el filtro omite el campo.
    rachas: r ? r[1] + " KT" : "",
  };
}

// Extrae solo la parte de visibilidad expresada en kilometros.
function visKm(raw) {
  const m = String(raw || "").match(/^\s*\d+(\s*\/\s*\d+)?\s*km/i);
  return m ? m[0].trim().toUpperCase() : "--";
}

// Extrae el fenomeno meteorologico, sin la parte numerica.
function fenomenoTxt(raw) {
  const t = String(raw || "").replace(/^\s*\d+(\s*\/\s*\d+)?\s*km\s*/i, "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Sin fenomeno";
}

// Reduce el viento crudo a su parte numerica ("W/NW 20/30 KT" -> "20/30 KT").
function resumenViento(raw) {
  const t = String(raw || "");
  const sost = t.split(/rachas?/i)[0].replace(/^[A-Za-z\u00d1/]+\s*/, "").trim();
  const r = t.match(/rachas?\s*(\d+)/i);
  const base = sost || "--";
  return r ? base + " (R " + r[1] + ")" : base;
}

// Reduce el texto crudo de temperatura a un solo valor.
// "-12 C / -6 C" -> "-6" con el simbolo de grado.
function valorTemp(raw) {
  const nums = String(raw || "").match(/-?\d+(?:[.,]\d+)?/g);
  if (!nums) return "--";
  const vals = nums.map((n) => parseFloat(n.replace(",", ".")));
  return Math.max(...vals) + "\u00b0";
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
  const bloques = tramos3h(activo.tramos).map((b, i) => filaBloque(b, i)).join("");

  const html = `
    <div class="resumen-wrap">
      <div class="resumen-tira-cont">
        <button class="tira-nav tira-nav-izq" id="tira-izq" aria-label="Días anteriores">‹</button>
        <div class="resumen-scroll" id="resumen-tira">
          <table class="resumen-tabla"><tbody><tr>${tira}</tr></tbody></table>
        </div>
        <button class="tira-nav tira-nav-der" id="tira-der" aria-label="Días siguientes">›</button>
      </div>

      <div class="b6-panel">
        <div class="b6-titulo">
          <span>Detalle cada 3 horas — <b>${esc(activo.dia)}</b></span>
          <button class="b6-link" id="btn-horario" data-idx="${idxSel}" data-dia="${esc(activo.dia)}">
            📊 Ver detalle por hora
          </button>
        </div>
        <div class="b6-lista">${bloques}</div>
        <div class="b6-modelos">
          Elaboración propia sobre modelos <b>${esc(getModelRunInfo().runModelo)}</b>
          · corrida ${esc(getModelRunInfo().runHoraUTC)} UTC
        </div>
      </div>
    </div>`;

  return { html, dias, idxSel };
}


// ── Acordeon del detalle de 3 h ──────────────────────────────────
// Una sola fila abierta a la vez, para mantener la vista corta.
export function initAcordeonB6() {
  const lista = document.querySelector(".b6-lista");
  if (!lista) return;

  lista.querySelectorAll(".b6-cab").forEach((cab) => {
    cab.addEventListener("click", () => {
      const fila = cab.closest(".b6-fila");
      const det = fila.querySelector(".b6-det");
      const abierta = fila.classList.contains("abierta");

      lista.querySelectorAll(".b6-fila.abierta").forEach((f) => {
        f.classList.remove("abierta");
        f.querySelector(".b6-det")?.setAttribute("hidden", "");
        f.querySelector(".b6-cab")?.setAttribute("aria-expanded", "false");
      });

      if (!abierta) {
        fila.classList.add("abierta");
        det.removeAttribute("hidden");
        cab.setAttribute("aria-expanded", "true");
      }
    });
  });
}
