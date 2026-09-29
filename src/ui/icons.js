/**
 * UI · Iconos SVG por patrón de movimiento / equipo.
 * Set propio, libre de derechos. Cada icono es una función que devuelve
 * un string SVG. Se usan currentColor para heredar el color del tema.
 *
 * La idea (RF-02): reconocer el ejercicio de un vistazo, no solo por el nombre.
 * Agrupamos por "familia visual": empuje horizontal, empuje vertical, tirón,
 * pierna/sentadilla, bisagra de cadera, curl, extensión, core, cardio...
 */

const wrap = (inner) =>
  `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">${inner}</svg>`;

const stroke = 'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS = {
  // Barra (barbell)
  barbell: () => wrap(`
    <line x1="8" y1="24" x2="40" y2="24" ${stroke}/>
    <rect x="4" y="18" width="5" height="12" rx="1.5" ${stroke}/>
    <rect x="39" y="18" width="5" height="12" rx="1.5" ${stroke}/>
    <rect x="10" y="20" width="4" height="8" rx="1" ${stroke}/>
    <rect x="34" y="20" width="4" height="8" rx="1" ${stroke}/>`),

  // Mancuerna (dumbbell)
  dumbbell: () => wrap(`
    <line x1="16" y1="24" x2="32" y2="24" ${stroke}/>
    <rect x="8" y="17" width="7" height="14" rx="2" ${stroke}/>
    <rect x="33" y="17" width="7" height="14" rx="2" ${stroke}/>`),

  // Máquina (bloque de placas)
  machine: () => wrap(`
    <rect x="10" y="8" width="16" height="32" rx="2" ${stroke}/>
    <line x1="14" y1="16" x2="22" y2="16" ${stroke}/>
    <line x1="14" y1="22" x2="22" y2="22" ${stroke}/>
    <line x1="14" y1="28" x2="22" y2="28" ${stroke}/>
    <path d="M30 12 v24" ${stroke}/>
    <circle cx="30" cy="12" r="3" ${stroke}/>`),

  // Polea (cable)
  cable: () => wrap(`
    <circle cx="24" cy="10" r="4" ${stroke}/>
    <path d="M24 14 v14" ${stroke}/>
    <path d="M18 30 h12 v6 h-12 z" ${stroke}/>
    <path d="M20 30 v-2 M28 30 v-2" ${stroke}/>`),

  // Empuje horizontal (press banca)
  pushHorizontal: () => wrap(`
    <path d="M6 30 h36" ${stroke}/>
    <circle cx="16" cy="22" r="4" ${stroke}/>
    <path d="M16 26 v6 M12 34 h8" ${stroke}/>
    <line x1="24" y1="16" x2="24" y2="24" ${stroke}/>
    <rect x="20" y="12" width="8" height="4" rx="1" ${stroke}/>`),

  // Empuje vertical (press militar)
  pushVertical: () => wrap(`
    <circle cx="24" cy="14" r="4" ${stroke}/>
    <path d="M24 18 v10 M18 40 l6-12 6 12" ${stroke}/>
    <line x1="12" y1="10" x2="36" y2="10" ${stroke}/>
    <rect x="10" y="6" width="4" height="8" rx="1" ${stroke}/>
    <rect x="34" y="6" width="4" height="8" rx="1" ${stroke}/>`),

  // Tirón (remo / jalón)
  pull: () => wrap(`
    <circle cx="24" cy="12" r="4" ${stroke}/>
    <path d="M24 16 v12 M16 22 l8 -4 8 4 M18 40 l6-12 6 12" ${stroke}/>`),

  // Sentadilla / pierna
  squat: () => wrap(`
    <circle cx="24" cy="10" r="4" ${stroke}/>
    <path d="M24 14 v8 M16 40 v-8 l8-10 8 10 v8" ${stroke}/>
    <line x1="12" y1="18" x2="36" y2="18" ${stroke}/>
    <rect x="10" y="14" width="4" height="8" rx="1" ${stroke}/>
    <rect x="34" y="14" width="4" height="8" rx="1" ${stroke}/>`),

  // Bisagra de cadera (peso muerto)
  hinge: () => wrap(`
    <circle cx="16" cy="14" r="4" ${stroke}/>
    <path d="M16 18 l4 10 M20 28 h14 M20 28 l-4 12" ${stroke}/>
    <line x1="30" y1="22" x2="30" y2="34" ${stroke}/>
    <rect x="27" y="20" width="6" height="3" rx="1" ${stroke}/>
    <rect x="27" y="33" width="6" height="3" rx="1" ${stroke}/>`),

  // Curl (bíceps)
  curl: () => wrap(`
    <circle cx="20" cy="12" r="4" ${stroke}/>
    <path d="M20 16 v10 M20 20 q8 2 8 -6" ${stroke}/>
    <rect x="26" y="4" width="6" height="4" rx="1" ${stroke}/>`),

  // Extensión (tríceps)
  extension: () => wrap(`
    <circle cx="24" cy="12" r="4" ${stroke}/>
    <path d="M24 16 v12 M24 20 l6 -4 M30 12 v8" ${stroke}/>
    <rect x="27" y="8" width="6" height="4" rx="1" ${stroke}/>`),

  // Core / abdominales
  core: () => wrap(`
    <path d="M10 34 q14 -10 28 0" ${stroke}/>
    <circle cx="16" cy="20" r="4" ${stroke}/>
    <path d="M16 24 l10 6" ${stroke}/>`),

  // Cardio / peso corporal
  bodyweight: () => wrap(`
    <circle cx="24" cy="10" r="4" ${stroke}/>
    <path d="M24 14 v12 M14 20 l10 -2 10 2 M18 40 l6-14 6 14" ${stroke}/>`),
};

/**
 * Devuelve el SVG de un icono por clave. Fallback a bodyweight.
 * @param {string} key
 * @returns {string} SVG
 */
export function icon(key) {
  const fn = ICONS[key] ?? ICONS.bodyweight;
  return fn();
}

export const ICON_KEYS = Object.keys(ICONS);
