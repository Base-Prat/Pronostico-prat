// ════════════════════════════════════════════════════════════════
//  CALCULADORA de enfriamiento por viento
//  Interpola sobre la tabla oficial (data/windchill.json).
// ════════════════════════════════════════════════════════════════

let TABLA = null;

const lerp = (x, x0, x1, y0, y1) => y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);

// Interpolación bilineal sobre la tabla oficial.
function calcularSensacion(t, v) {
  if (!TABLA || isNaN(t) || isNaN(v)) return null;
  const { velocidades: va, temperaturas: ta, tabla: tb } = TABLA;

  if (v < 5) return t;
  if (v > 40) v = 40;
  if (t > 10) return t;
  if (t < -50) t = -50;

  let iv = va.findIndex((x) => x >= v);
  if (iv < 0) iv = va.length - 1;
  if (iv === 0) iv = 1;

  let it = ta.findIndex((x) => x <= t);
  if (it < 0) it = ta.length - 1;
  if (it === 0) it = ta.length - 1;

  const t0 = ta[it - 1] ?? ta[it];
  const t1 = ta[it] ?? ta[it - 1];
  const q11 = tb[iv - 1]?.[it - 1] ?? t;
  const q12 = tb[iv - 1]?.[it] ?? t;
  const q21 = tb[iv]?.[it - 1] ?? t;
  const q22 = tb[iv]?.[it] ?? t;

  const r = lerp(v, va[iv - 1], va[iv], lerp(t, t0, t1, q11, q12), lerp(t, t0, t1, q21, q22));
  return Math.round(r * 10) / 10;
}

function pintarResultado(st, box, val, desc) {
  box.className = "wc-result";
  if (st <= -57.5) { desc.textContent = "EXTREMADAMENTE PELIGROSO (congelamiento 30 s)"; box.classList.add("risk-ext-peligro"); }
  else if (st <= -30) { desc.textContent = "MUY PELIGROSO (congelamiento 1 min)"; box.classList.add("risk-muy-peligro"); }
  else desc.textContent = "PELIGRO (usar vestimenta adecuada)";
  val.textContent = st + "°C";
}

export async function initCalculadora() {
  // Carga la tabla oficial desde el archivo de datos.
  try {
    const res = await fetch("data/windchill.json");
    TABLA = await res.json();
  } catch (e) {
    console.error("No se pudo cargar la tabla de enfriamiento:", e);
  }

  const inpT = document.getElementById("inp-t");
  const inpV = document.getElementById("inp-v");
  const btnCalc = document.getElementById("btn-calc");
  const btnSync = document.getElementById("btn-sync");
  const box = document.getElementById("prat-result-box");
  const val = document.getElementById("res-val");
  const desc = document.getElementById("res-desc");

  btnCalc?.addEventListener("click", () => {
    const t = parseFloat(inpT.value);
    const v = parseFloat(inpV.value);
    if (isNaN(t) || isNaN(v)) { val.textContent = "—"; desc.textContent = "Ingrese temperatura y viento"; return; }
    const st = calcularSensacion(t, v);
    if (st === null) { val.textContent = "—"; desc.textContent = "Error de cálculo"; return; }
    pintarResultado(st, box, val, desc);
  });

  // Sincroniza los valores desde las métricas en vivo del encabezado.
  btnSync?.addEventListener("click", () => {
    const txt = document.getElementById("header-metrics").textContent || "";
    const tm = txt.match(/(-?\d+)\s*°C/);
    const vm = txt.match(/(\d+)\s?kts/);
    if (tm) inpT.value = tm[1];
    if (vm) inpV.value = vm[1];
    btnCalc.click();
  });

  // ── Minimizar / restaurar / cerrar / reabrir el widget ──
  const widget  = document.getElementById("prat-wc");
  const toggle  = document.getElementById("prat-toggle");
  const btnClose = document.getElementById("prat-close");
  const btnReopen = document.getElementById("prat-reopen");
  const body = widget?.querySelector(".wc-body");

  // Minimizar / restaurar: oculta el cuerpo, deja la barra de título.
  toggle?.addEventListener("click", (e) => {
    e.stopPropagation();
    const oculto = body.style.display === "none";
    body.style.display = oculto ? "" : "none";
    toggle.textContent = oculto ? "—" : "+";
  });

  // Cerrar (✕): oculta todo el widget y muestra el botón flotante para reabrir.
  btnClose?.addEventListener("click", (e) => {
    e.stopPropagation();
    widget.style.display = "none";
    if (btnReopen) btnReopen.style.display = "flex";
  });

  // Reabrir: vuelve a mostrar la calculadora expandida.
  btnReopen?.addEventListener("click", (e) => {
    e.stopPropagation();
    widget.style.display = "";
    body.style.display = "";
    if (toggle) toggle.textContent = "—";
    btnReopen.style.display = "none";
  });
}
