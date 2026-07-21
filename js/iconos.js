// ════════════════════════════════════════════════════════════════
//  ÍCONOS SVG — cielo, precipitación y flecha de viento.
//  Ligeros, sin dependencias, coloreables por CSS currentColor.
// ════════════════════════════════════════════════════════════════

const SUN = `<circle cx="20" cy="20" r="9" fill="#f6c445"/>
  <g stroke="#f6c445" stroke-width="2.5" stroke-linecap="round">
    <line x1="20" y1="2" x2="20" y2="7"/><line x1="20" y1="33" x2="20" y2="38"/>
    <line x1="2" y1="20" x2="7" y2="20"/><line x1="33" y1="20" x2="38" y2="20"/>
    <line x1="7" y1="7" x2="10.5" y2="10.5"/><line x1="29.5" y1="29.5" x2="33" y2="33"/>
    <line x1="33" y1="7" x2="29.5" y2="10.5"/><line x1="10.5" y1="29.5" x2="7" y2="33"/>
  </g>`;

// Sol pequeño, arriba-izquierda, para combinar con nube (parcial).
const SUN_SM = `<circle cx="14" cy="13" r="6.5" fill="#f6c445"/>
  <g stroke="#f6c445" stroke-width="2" stroke-linecap="round">
    <line x1="14" y1="1" x2="14" y2="4.5"/><line x1="3" y1="13" x2="6.5" y2="13"/>
    <line x1="6" y1="5" x2="8.3" y2="7.3"/><line x1="22" y1="5" x2="19.7" y2="7.3"/>
  </g>`;

// Sol pequeño que asoma (para "nublado"), posición configurable.
const SUN_PEEK = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="5.5" fill="#f6c445"/>
  <g stroke="#f6c445" stroke-width="1.8" stroke-linecap="round">
    <line x1="${cx}" y1="${cy - 9}" x2="${cx}" y2="${cy - 6}"/>
    <line x1="${cx + 8}" y1="${cy - 5}" x2="${cx + 6}" y2="${cy - 3.5}"/>
    <line x1="${cx - 8}" y1="${cy - 5}" x2="${cx - 6}" y2="${cy - 3.5}"/>
    <line x1="${cx + 9}" y1="${cy}" x2="${cx + 6.5}" y2="${cy}"/>
  </g>`;

const CLOUD = (x = 8, y = 14, c = "#dde3ea") =>
  `<path d="M${x + 6} ${y + 16} a8 8 0 0 1 0-16 a10 10 0 0 1 19 -2 a7 7 0 0 1 2 18 Z" fill="${c}" stroke="#1a1a1a" stroke-width="1.3" stroke-linejoin="round"/>`;

const CLOUD_DARK = (x, y) => CLOUD(x, y, "#cad2db");

// Envuelve un conjunto de nubes en un grupo escalado, centrado en el
// viewBox 40x40, para que el ícono se vea completo sin recortes.
const fit = (contenido, escala = 0.92) => {
  const off = (40 - 40 * escala) / 2;
  return `<g transform="translate(${off} ${off}) scale(${escala})">${contenido}</g>`;
};

// Combinaciones de cielo → SVG.
// "despejado" = sol pleno; "parcial" = sol con nube (hay quiebres);
// "nublado" = dos nubes con un sol asomando entre ellas;
// "cubierto" = dos nubes densas, sin sol.
const CIELO_SVG = {
  despejado: `<svg viewBox="0 0 40 40">${SUN}</svg>`,
  parcial: `<svg viewBox="0 0 40 40">${fit(SUN_SM + CLOUD(11, 17, "#dde3ea"), 0.78)}</svg>`,
  nublado: `<svg viewBox="0 0 40 40">${fit(SUN_PEEK(24, 9) + CLOUD(2, 15, "#dde3ea") + CLOUD(11, 19, "#cad2db"), 0.76)}</svg>`,
  cubierto: `<svg viewBox="0 0 40 40">${fit(CLOUD(3, 12, "#cad2db") + CLOUD(11, 16, "#dde3ea"), 0.9)}</svg>`,
};

// Gotas de lluvia — n=3 (débil) o n=5 (normal/fuerte). Blancas con borde.
const gotasLluvia = (n = 5) => {
  const xs = n === 3 ? [14, 20, 26] : [11, 15.5, 20, 24.5, 29];
  const l = xs.map((x, i) => {
    const dy = i % 2 ? 1.5 : 0;
    return `<line x1="${x}" y1="${33 + dy}" x2="${x - 1.4}" y2="${36.5 + dy}"/>`;
  }).join("");
  return `<g stroke="#ffffff" stroke-width="2" stroke-linecap="round"
    filter="url(#dropsh)">${l}</g>`;
};

// Copos de nieve — n=3 o n=5. Blancos, más pequeños, con borde sutil.
const coposNieve = (n = 5) => {
  const xs = n === 3 ? [14, 20, 26] : [11, 15.5, 20, 24.5, 29];
  return xs.map((x, i) => {
    const y = 34 + (i % 2 ? 1.5 : 0);
    const r = 1.8;
    return `<g stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" filter="url(#dropsh)">
      <line x1="${x - r}" y1="${y}" x2="${x + r}" y2="${y}"/>
      <line x1="${x}" y1="${y - r}" x2="${x}" y2="${y + r}"/>
      <line x1="${x - r * 0.7}" y1="${y - r * 0.7}" x2="${x + r * 0.7}" y2="${y + r * 0.7}"/>
      <line x1="${x - r * 0.7}" y1="${y + r * 0.7}" x2="${x + r * 0.7}" y2="${y - r * 0.7}"/>
    </g>`;
  }).join("");
};

// Filtro de sombra sutil para que lo blanco se distinga sobre cualquier fondo.
const DROPSHADOW = `<defs><filter id="dropsh" x="-30%" y="-30%" width="160%" height="160%">
  <feDropShadow dx="0" dy="0" stdDeviation="0.6" flood-color="#5a7a9a" flood-opacity="0.9"/>
</filter></defs>`;

// Nube base para precipitación, centrada y con margen.
const nubePrecip = `<svg viewBox="0 0 40 40">${DROPSHADOW}${fit(CLOUD(6, 4, "#dde3ea"), 0.8)}`;

const PRECIP_SVG = {
  nieve: (n) => `${nubePrecip}${coposNieve(n)}</svg>`,
  lluvia: (n) => `${nubePrecip}${gotasLluvia(n)}</svg>`,
  niebla: () => `<svg viewBox="0 0 40 40"><g stroke="#a8b2bc" stroke-width="2.8" stroke-linecap="round">
    <line x1="6" y1="14" x2="34" y2="14"/><line x1="9" y1="20" x2="31" y2="20"/>
    <line x1="6" y1="26" x2="34" y2="26"/><line x1="10" y1="32" x2="28" y2="32"/></g></svg>`,
  neblina: () => `<svg viewBox="0 0 40 40"><g stroke="#bcc4cc" stroke-width="2.2" stroke-linecap="round" opacity="0.85">
    <line x1="7" y1="16" x2="33" y2="16"/><line x1="10" y1="22" x2="30" y2="22"/><line x1="7" y1="28" x2="33" y2="28"/></g></svg>`,
};

// Devuelve el SVG del estado. Si hay precipitación, prima sobre el cielo.
// intensidad: "debil" → 3 elementos · cualquier otra → 5.
export function iconoTiempo(cielo, precip, intensidad = "fuerte") {
  if (precip && PRECIP_SVG[precip]) {
    const n = intensidad === "debil" ? 3 : 5;
    return PRECIP_SVG[precip](n);
  }
  return CIELO_SVG[cielo] || CIELO_SVG.nublado;
}

// Flecha de viento: apunta hacia donde SOPLA (dir meteorológica + 180°).
// Recibe la dirección textual (SW, N/NW, Norte, Weste…) y devuelve SVG.
const RUMBO_GRADOS = {
  norte: 0, n: 0, "n/ne": 22.5, ne: 45, "e/ne": 67.5, este: 90, e: 90,
  "e/se": 112.5, se: 135, "s/se": 157.5, sur: 180, s: 180, "s/sw": 202.5,
  sw: 225, "sw/w": 247.5, weste: 270, w: 270, oeste: 270, "w/nw": 292.5,
  nw: 315, "nw/n": 337.5, "n/nw": 337.5, "w/sw": 247.5,
};

export function gradosDeRumbo(dir) {
  const k = (dir || "").toLowerCase().trim();
  return RUMBO_GRADOS[k] ?? null;
}

// Flecha de viento: apunta hacia DONDE VA el viento (convención de
// flujo, como Windguru/Windy). La dirección recibida es de
// procedencia, por lo que se rota 180° para invertir el sentido.
// El path del SVG tiene la punta hacia arriba (0° = Norte).
// Viento del W/NW (292.5°) → la flecha apunta al E/SE (112.5°).
export function flechaViento(dir) {
  const g = gradosDeRumbo(dir);
  if (g == null) return "";
  const rot = (g + 180) % 360;
  return `<svg viewBox="0 0 24 24" style="transform:rotate(${rot}deg)">
    <path d="M12 2 L17 20 L12 15 L7 20 Z" fill="currentColor"/></svg>`;
}
