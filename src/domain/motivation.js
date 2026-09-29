/**
 * DOMINIO · Frases motivadoras (RF-40, RF-41)
 * Puro, sin efectos. La UI decide cuándo mostrarlas.
 */

const DAILY = [
  '¡Hoy es tu día y lo vas a reventar!',
  'El progreso se forja una serie a la vez.',
  'La versión de ti de dentro de 6 meses te está mirando. No la falles.',
  'No tiene que ser fácil, tiene que valer la pena.',
  'Cada repetición cuenta. Cada sesión suma.',
  'Los récords no se rompen solos. Ve a por ellos.',
  'Disciplina hoy, resultados mañana.',
  'Nadie ha construido nada grande sin presentarse.',
  'Levanta, respira, repite. Estás construyendo algo.',
  'El hierro no miente. Dale.',
];

const COMEBACK = [
  '¡Venga, tío! Hoy sí que sí. ¡A por ello!',
  'Han pasado unos días. Hoy toca volver más fuerte.',
  'La racha se retoma con una sola sesión. ¡Vamos!',
  'Tu mejor versión te espera en el gym. Hoy es el día.',
  'No pasa nada por parar. Lo que cuenta es volver. ¡Ahora!',
];

/**
 * Frase diaria determinista (misma frase durante todo el día).
 * @param {Date} now
 * @returns {string}
 */
export function dailyQuote(now = new Date()) {
  // Día del año normalizado con Date.UTC sobre componentes locales, para que no
  // salte/repita en la frontera del día ni con el cambio de horario (#12).
  const startOfYear = Date.UTC(now.getFullYear(), 0, 0);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfYear = Math.floor((today - startOfYear) / (1000 * 60 * 60 * 24));
  return DAILY[dayOfYear % DAILY.length];
}

/**
 * Frase de "vuelve al gym" para inactividad.
 * @param {number} daysInactive
 * @returns {string}
 */
export function comebackQuote(daysInactive = 0) {
  const idx = Math.min(COMEBACK.length - 1, Math.floor(daysInactive / 2));
  return COMEBACK[idx];
}

/**
 * ¿Estamos en franja de mañana? (para mostrar la frase si entrena de noche)
 * @param {Date} now
 * @returns {boolean}
 */
export function isMorning(now = new Date()) {
  const h = now.getHours();
  return h >= 5 && h < 12;
}
