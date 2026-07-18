// ════════════════════════════════════════════════════════════════
//  APP — punto de entrada. Orquesta sidebar, sectores, reloj,
//  estación en vivo, pronóstico y calculadora.
// ════════════════════════════════════════════════════════════════

import { CONFIG, SECTORES, GRUPO_LABELS, ENLACES_GLACIOLOGICOS } from "./config.js?v=20260718074252";
import { getModelRunInfo, esc } from "./utils.js?v=20260718074252";
import { actualizarEstacion } from "./estacion.js?v=20260718074252";
import { setSectorActivo } from "./pronostico.js?v=20260718074252";
import { cerrarModal } from "./graficos.js?v=20260718074252";
import { initCalculadora } from "./calculadora.js?v=20260718074252";
import { cargarMeteotabla } from "./meteotabla.js?v=20260718074252";

// ── Enlaces del sidebar (fuentes externas oficiales) ─────────────
function initEnlacesSidebar() {
  const nav = document.getElementById("sidebar-links");
  nav.innerHTML = ENLACES_GLACIOLOGICOS
    .map((l) => `<a href="${l.url}" target="_blank" rel="noopener" class="external-link">${esc(l.txt)}</a>`)
    .join("");
  nav.querySelectorAll(".external-link").forEach((a) => a.addEventListener("click", cerrarSidebar));
}

// ── Tabs de sectores con separadores por grupo ───────────────────
function initSectorTabs() {
  const cont = document.getElementById("sector-tabs");
  cont.innerHTML = "";
  let grupoActual = null;

  SECTORES.forEach((s, i) => {
    if (s.grupo !== grupoActual) {
      if (grupoActual !== null) {
        const sep = document.createElement("div");
        sep.className = "sector-group-sep";
        cont.appendChild(sep);
      }
      const lbl = document.createElement("span");
      lbl.className = "sector-group-label";
      lbl.textContent = GRUPO_LABELS[s.grupo] || s.grupo;
      cont.appendChild(lbl);
      grupoActual = s.grupo;
    }

    const btn = document.createElement("button");
    btn.className = "sector-tab" + (i === 0 ? " active" : "");
    btn.textContent = s.label || s.nombre;
    btn.addEventListener("click", () => seleccionarSector(s, btn));
    cont.appendChild(btn);
  });
}

function seleccionarSector(sector, btn) {
  if (btn.classList.contains("active")) return;
  document.querySelectorAll(".sector-tab").forEach((t) => t.classList.remove("active"));
  btn.classList.add("active");

  document.getElementById("location-title").textContent = sector.nombre;
  document.getElementById("location-subtitle").innerHTML = esc(sector.subtitulo || "");

  const badge = document.getElementById("badge-oceanico");
  badge.style.display = sector.oceanico ? "inline-flex" : "none";
  badge.textContent = sector.oceanico ? "🌊 Área oceánica" : "";

  const bg = document.getElementById("header-bg-img");
  if (sector.imagen) bg.style.backgroundImage = `url('${sector.imagen}')`;

  setSectorActivo(sector);
  cargarMeteotabla(sector);
  cerrarSidebar();
}

// ── Reloj y fecha ────────────────────────────────────────────────
function actualizarReloj() {
  const now = new Date();
  const opts = { timeZone: "America/Punta_Arenas" };
  document.getElementById("clock").textContent =
    now.toLocaleTimeString("es-CL", { ...opts, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) + " (UTC -3)";
  document.getElementById("current-date").textContent =
    now.toLocaleDateString("es-CL", { ...opts, day: "2-digit", month: "2-digit", year: "numeric" });
  const r = getModelRunInfo();
  document.getElementById("last-run").textContent = `${r.runHoraUTC} UTC | ${r.runModelo}`;
}

// ── Sidebar móvil ────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebar-overlay").classList.toggle("active");
}
function cerrarSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("active");
}
function verVersionEscritorio() {
  if (window.innerWidth < 1025) {
    document.querySelector('meta[name="viewport"]')
      .setAttribute("content", "width=1280,initial-scale=0.45,minimum-scale=0.3");
  }
  document.querySelector(".btn-ver-web")?.style.setProperty("display", "none");
  document.querySelector(".hamburger-btn")?.style.setProperty("display", "none");
}

// ── Arranque ─────────────────────────────────────────────────────
function init() {
  initEnlacesSidebar();
  initSectorTabs();
  initCalculadora();

  // Eventos globales de UI. Se usa ?. para que la ausencia de un
  // elemento no detenga el resto del arranque.
  document.getElementById("hamburger-btn")?.addEventListener("click", toggleSidebar);
  document.getElementById("sidebar-overlay")?.addEventListener("click", cerrarSidebar);
  document.querySelector(".btn-ver-web")?.addEventListener("click", verVersionEscritorio);
  document.getElementById("modal-close")?.addEventListener("click", cerrarModal);

  // Sector inicial.
  setSectorActivo(SECTORES[0]);
  cargarMeteotabla(SECTORES[0]);

  // Datos en vivo + reloj.
  actualizarReloj();
  actualizarEstacion();
  setInterval(actualizarReloj, 1000);
  setInterval(actualizarEstacion, CONFIG.intervaloActualizacion);
}

document.addEventListener("DOMContentLoaded", init);
