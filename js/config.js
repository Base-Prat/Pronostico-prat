// ════════════════════════════════════════════════════════════════
//  CONFIGURACIÓN — Sistema Meteorológico Base Prat
//  Todo lo que cambia con frecuencia (fuentes de datos, sectores,
//  coordenadas, umbrales) vive aquí, separado de la lógica.
// ════════════════════════════════════════════════════════════════

export const CONFIG = {
  // ID del documento de Google Sheets publicado (backend de pronóstico).
  // No es una credencial secreta: es una hoja publicada como CSV.
  sheetsDocId:
    "2PACX-1vQRxJhBvpk3JZu0MWpKPZ2PMi2DYfEjxhSTWMbX4i_EHHI6rh9frJuskRuaX-OXJqc_Akz6Dh5qLr72",

  // Coordenadas de la estación de referencia (Base Prat, WMO 89057).
  estacion: { lat: -62.478796, lon: -59.665912, elevacion: 6 },

  // Cada cuánto refrescar los datos en vivo (milisegundos).
  intervaloActualizacion: 120000,

  // Umbrales de viento sostenido (nudos) para clasificar riesgo.
  umbralesViento: { moderado: 16, alto: 21, peligro: 30 },
};

// ════════════════════════════════════════════════════════════════
//  CORRECCIÓN CATABÁTICA (post-proceso local)
//  Los modelos globales no resuelven la orografía de las islas y
//  subestiman el drenaje catabático canalizado del cuadrante E-SE.
//  Esta corrección aplica un factor observacional, condicionado a
//  que exista gradiente barométrico o actividad frontal.
//  AJUSTABLE: modificar aquí, no en la lógica.
// ════════════════════════════════════════════════════════════════
export const CATABATICO = {
  activo: true,

  // ── Factores escalados según intensidad ──────────────────────
  // El sesgo del modelo no es lineal: con viento flojo el modelo
  // apenas resuelve el drenaje canalizado (factor alto), y con
  // viento fuerte ya captura buena parte del forzamiento sinóptico
  // (factor bajo). Se interpola linealmente entre ambos anclajes.
  //   vBajo/vAlto  = viento modelado (kt) de los extremos
  //   factor*Bajo  = multiplicador en el extremo flojo
  //   factor*Alto  = multiplicador en el extremo fuerte
  // Fuera del rango se mantiene el valor del extremo más cercano.
  curva: {
    vBajo: 10,
    vAlto: 40,
    vientoFactorBajo: 2.0,
    vientoFactorAlto: 1.2,
    rachaFactorBajo: 1.5,
    rachaFactorAlto: 1.1,
  },

  // Sectores afectados (por key). Solo bases de la península.
  sectores: ["prat", "fildes", "paraiso", "ohiggins"],

  // Direcciones de procedencia que canalizan el drenaje (grados).
  // Cubre E, E/SE y SE con tolerancia.
  dirMin: 78,
  dirMax: 146,

  // Piso de intensidad: bajo este valor no se corrige, aunque la
  // dirección calce (drenaje débil sin forzamiento sinóptico).
  vientoMinimo: 10,

  // Proxy de gradiente barométrico / acción frontal:
  // variación absoluta de presión (hPa) en la ventana indicada.
  // Sin este gradiente, no se aplica corrección.
  gradienteMinimo: 1.0,   // hPa
  ventanaGradiente: 3,    // horas (±) para medir la tendencia
};

// ════════════════════════════════════════════════════════════════
//  CRITERIO DE OLEAJE POR SECTOR
//  Áreas abiertas: mar de fondo (swell), se toma la altura mayor.
//  Bahías abrigadas: mar de viento, con tope de marejada.
// ════════════════════════════════════════════════════════════════
export const CRITERIO_MAR = {
  // Sectores abiertos → mar de fondo, altura más alta.
  abiertos: ["bransfield", "nelson", "gerlache", "drake-norte",
             "drake-centro", "drake-sur", "cabo-hornos", "diego-ramirez"],

  // Tope de altura para bahías (m): marejada.
  topeBahia: 2.0,

  // Punto de consulta del oleaje para sectores cuya coordenada cae
  // en tierra o en bahía no resuelta por la malla del modelo marino
  // (resolución ~5-8 km). Se desplaza hacia mar abierto próximo,
  // manteniendo la exposición característica del sector.
  // Solo afecta al oleaje: viento y temperatura siguen usando la
  // coordenada real del sector.
  puntoMarino: {
    prat:     { lat: -62.450, lon: -59.700 },  // hacia Bahía Chile abierta
    fildes:   { lat: -62.180, lon: -58.900 },  // boca de Bahía Fildes
    paraiso:  { lat: -64.800, lon: -62.950 },  // hacia canal Gerlache
    ohiggins: { lat: -63.290, lon: -57.850 },  // frente a la costa
    yelcho:   { lat: -64.860, lon: -63.620 },  // canal Schollaert
    carvajal: { lat: -67.740, lon: -68.980 },  // Bahía Margarita abierta
    decepcion:{ lat: -62.980, lon: -60.650 },  // exterior de la isla
  },

  // Bahías con rompiente por exposición al cuadrante indicado.
  rompiente: {
    fildes: { dirMin: 68, dirMax: 202 },  // E, SE y S
  },
};

// URL del CSV publicado para un GID de hoja dado.
export function getCSVUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/e/${CONFIG.sheetsDocId}/pub?gid=${gid}&single=true&output=csv`;
}

// ── SECTORES ────────────────────────────────────────────────────
// imagen: usa rutas locales en assets/ para no depender de terceros.
export const SECTORES = [
  // ── BASES ANTÁRTICAS ──────────────────────────────────────────
  {
    nombre: "Bahía Chile - Puerto Soberanía",
    subtitulo: "Base Naval Antártica Capitán Arturo Prat",
    gid: "939106272", key: "prat",
    imagen: "assets/sectores/prat.jpg",
    coords: { lat: -62.479, lon: -59.666 },
    grupo: "BASES", oceanico: false,
  },
  {
    nombre: "Bahía Fildes (Caleta Ardley)",
    subtitulo: "Gobernación Marítima de la Antártica Chilena",
    gid: "1678435349", key: "fildes",
    imagen: "assets/sectores/fildes.jpg",
    coords: { lat: -62.196, lon: -58.963 },
    grupo: "BASES", oceanico: false,
  },
  {
    nombre: "Base O'Higgins",
    subtitulo: "Base Militar Antártica General Bernardo O'Higgins Riquelme",
    gid: "1123581909", key: "ohiggins",
    imagen: "assets/sectores/ohiggins.jpg",
    coords: { lat: -63.321, lon: -57.899 },
    grupo: "BASES", oceanico: false,
  },
  {
    nombre: "Base Yelcho (INACH) - Bahía Sur",
    subtitulo: "Base Antártica Capitán Luis Óscar Yelcho — Isla Doumer",
    label: "Base Yelcho",
    gid: "1631597205", key: "yelcho",
    imagen: "assets/sectores/yelcho.jpg",
    coords: { lat: -64.876, lon: -63.581 },
    grupo: "BASES", oceanico: false,
  },
  {
    nombre: "Bahía Paraíso",
    subtitulo: "Base Antártica Presidente Gabriel González Videla",
    gid: "1517815039", key: "paraiso",
    imagen: "assets/sectores/paraiso.jpg",
    coords: { lat: -64.824, lon: -62.859 },
    grupo: "BASES", oceanico: false,
  },
  {
    nombre: "Isla Adelaida - Bahía Margarita",
    subtitulo: "Base Antártica Teniente Luis Carvajal Villarroel",
    label: "Base Carvajal",
    gid: "1183808960", key: "carvajal",
    imagen: "assets/sectores/carvajal.jpg",
    coords: { lat: -67.762, lon: -68.920 },
    grupo: "BASES", oceanico: false,
  },

  // ── PASOS Y ESTRECHOS ─────────────────────────────────────────
  {
    nombre: "Estrecho Nelson", subtitulo: "",
    gid: "942856754", key: "nelson",
    imagen: "assets/sectores/nelson.jpg",
    coords: { lat: -62.30, lon: -59.20 },
    grupo: "PASOS", oceanico: false,
  },
  {
    nombre: "Estrecho Bransfield", subtitulo: "",
    gid: "2098562938", key: "bransfield",
    imagen: "assets/sectores/bransfield.jpg",
    coords: { lat: -63.00, lon: -58.50 },
    grupo: "PASOS", oceanico: false,
  },
  {
    nombre: "Isla Decepción", subtitulo: "",
    gid: "1685199890", key: "decepcion",
    imagen: "assets/sectores/decepcion.jpg",
    coords: { lat: -62.940, lon: -60.615 },
    grupo: "PASOS", oceanico: false,
  },
  {
    nombre: "Estrecho de Gerlache", subtitulo: "",
    gid: "2049108687", key: "gerlache",
    imagen: "assets/sectores/gerlache.jpg",
    coords: { lat: -64.55, lon: -62.30 },
    grupo: "PASOS", oceanico: false,
  },

  // ── PASO DRAKE — ÁREAS OCEÁNICAS ─────────────────────────────
  {
    nombre: "Isla Cabo de Hornos",
    subtitulo: "Faro Cabo de Hornos",
    label: "Cabo de Hornos",
    gid: "1873837819", key: "cabo-hornos",
    imagen: "assets/sectores/cabo-hornos.jpg",
    coords: { lat: -55.983, lon: -67.271 },
    grupo: "DRAKE", oceanico: true,
  },
  {
    nombre: "Islas Diego Ramírez",
    subtitulo: "Faro Diego Ramírez",
    label: "Diego Ramírez",
    gid: "224284106", key: "diego-ramirez",
    imagen: "assets/sectores/diego-ramirez.jpg",
    coords: { lat: -56.492, lon: -68.716 },
    grupo: "DRAKE", oceanico: true,
  },
  {
    nombre: "Paso Drake",
    subtitulo: "Área Oceánica — 56°02'S / 64°11'W | Mar de Drake sector Norte",
    label: "Drake Norte",
    gid: "1990081185", key: "drake-norte",
    imagen: "assets/sectores/drake.jpg",
    coords: { lat: -56.033, lon: -64.183 },
    grupo: "DRAKE", oceanico: true,
  },
  {
    nombre: "Paso Drake",
    subtitulo: "Área Oceánica — 59°01'S / 62°13'W | Mar de Drake sector Centro",
    label: "Drake Centro",
    gid: "639614422", key: "drake-centro",
    imagen: "assets/sectores/drake.jpg",
    coords: { lat: -59.017, lon: -62.217 },
    grupo: "DRAKE", oceanico: true,
  },
  {
    nombre: "Paso Drake",
    subtitulo: "Área Oceánica — 61°05'S / 60°34'W | Mar de Drake sector Sur",
    label: "Drake Sur",
    gid: "960715002", key: "drake-sur",
    imagen: "assets/sectores/drake.jpg",
    coords: { lat: -61.083, lon: -60.567 },
    grupo: "DRAKE", oceanico: true,
  },
];

export const GRUPO_LABELS = {
  BASES: "Bases Antárticas",
  PASOS: "Pasos - Estrechos Antárticos",
  DRAKE: "Paso Drake (área oceánica)",
};

// Enlaces externos oficiales (fuentes que se consultan, no autoría propia).
export const ENLACES_GLACIOLOGICOS = [
  { txt: "Informe glaciológico", url: "https://meteoarmada.directemar.cl/meteo/monitoreo-de-hielos/reporte-base-antarticas" },
  { txt: "Meteograma Capitán Arturo Prat", url: "http://triton.directemar.cl/web/meteograma_A_BASEPRAT_Antartica_d02.png" },
  { txt: "Meteograma Bahía Fildes", url: "http://triton.directemar.cl/web/meteograma_A_FILDES_Antartica_d02.png" },
  { txt: "Meteograma Bahía Paraíso", url: "http://triton.directemar.cl/web/meteograma_A_BAHIAPARAISO_Antartica_d02.png" },
  { txt: "Carta de viento Antártica", url: "http://triton.directemar.cl/web/html/Vto-color-antar2.html" },
  { txt: "Imagen satelital", url: "https://web.directemar.cl/met/jturno/pub/GFS/animacion_foto.gif" },
  { txt: "Carta pronosticada", url: "https://meteoarmada.directemar.cl/meteo/modelos-numericos/cartas-de-superficie-pronosticadas" },
  { txt: "Carta de viento Paso Drake", url: "https://web.directemar.cl/met/jturno/pub/Cvtodrake.html" },
  { txt: "Carta de olas Paso Drake", url: "https://web.directemar.cl/met/jturno/pub/Oladrake.html" },
  { txt: "Tabla de mareas (SHOA)", url: "https://www.shoa.cl/php/mareas?idioma=es" },
];
