// ════════════════════════════════════════════════════════════════
//  MAPA de referencia del sector — SVG estático, sin librerías.
//  Ubica el sector activo dentro del área Península Antártica / Drake
//  usando una proyección lineal simple (equirectangular). Suficiente
//  para orientación operacional; no es cartografía de navegación.
// ════════════════════════════════════════════════════════════════

// Límites del recuadro geográfico (encierra Drake + Península norte).
const BBOX = { latN: -55.0, latS: -68.5, lonW: -70.0, lonE: -56.0 };

// Tamaño del lienzo SVG.
const W = 260, H = 300;
const PAD = 6;

// Convierte lat/lon a coordenadas de píxel dentro del SVG.
function proj(lat, lon) {
  const x = PAD + ((lon - BBOX.lonW) / (BBOX.lonE - BBOX.lonW)) * (W - 2 * PAD);
  const y = PAD + ((BBOX.latN - lat) / (BBOX.latN - BBOX.latS)) * (H - 2 * PAD);
  return { x, y };
}

// Rejilla de referencia (meridianos/paralelos cada 5°/2°).
function rejilla() {
  let g = "";
  for (let lon = -70; lon <= -56; lon += 2) {
    const a = proj(BBOX.latN, lon), b = proj(BBOX.latS, lon);
    g += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" class="mp-grid"/>`;
  }
  for (let lat = -56; lat >= -68; lat -= 2) {
    const a = proj(lat, BBOX.lonW), b = proj(lat, BBOX.lonE);
    g += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" class="mp-grid"/>`;
    g += `<text x="${(a.x + 2).toFixed(1)}" y="${(a.y - 2).toFixed(1)}" class="mp-lbl">${Math.abs(lat)}°S</text>`;
  }
  return g;
}

// Contorno esquemático de la Península Antártica (Shetland del Sur al
// norte, península hacia el sur). Trazo aproximado con fines de
// orientación; NO es una línea de costa exacta.
function contorno() {
  // Puntos [lat, lon] que perfilan la costa NW de la península +
  // arco de las Shetland del Sur.
  const shetland = [
    [-61.9, -60.7], [-62.1, -59.0], [-62.2, -58.4],
    [-62.9, -57.6], [-63.4, -56.9],
  ];
  const peninsula = [
    [-63.4, -56.9], [-64.2, -57.5], [-64.8, -58.6], [-65.2, -59.9],
    [-66.0, -61.4], [-66.8, -63.2], [-67.5, -65.5], [-68.2, -67.6],
    [-68.4, -69.0],
  ];
  const toPath = (pts) =>
    pts.map((p, i) => {
      const { x, y } = proj(p[0], p[1]);
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
  return `
    <path d="${toPath(shetland)}" class="mp-coast"/>
    <path d="${toPath(peninsula)}" class="mp-coast"/>`;
}

// Genera el SVG del mapa con el sector marcado.
export function mapaSector(sector) {
  if (!sector?.coords) {
    return `<div class="mapa-vacio">Sin coordenadas de referencia para este sector.</div>`;
  }
  const { lat, lon } = sector.coords;
  const p = proj(lat, lon);
  const dentro = p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;
  const px = Math.max(PAD, Math.min(W - PAD, p.x));
  const py = Math.max(PAD, Math.min(H - PAD, p.y));

  const latTxt = `${Math.abs(lat).toFixed(2)}°S`;
  const lonTxt = `${Math.abs(lon).toFixed(2)}°W`;

  return `
    <svg viewBox="0 0 ${W} ${H}" class="mapa-svg" role="img"
         aria-label="Mapa de referencia del sector ${sector.label || sector.nombre}">
      <rect x="0" y="0" width="${W}" height="${H}" class="mp-sea"/>
      ${rejilla()}
      ${contorno()}
      <g class="mp-marker">
        <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="7" class="mp-pulse"/>
        <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" class="mp-dot"/>
      </g>
      <text x="${W / 2}" y="${H - 8}" text-anchor="middle" class="mp-coord">
        ${latTxt} · ${lonTxt}${dentro ? "" : "  (fuera de vista)"}
      </text>
    </svg>`;
}
