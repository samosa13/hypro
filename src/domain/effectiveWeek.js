/**
 * DOMINIO · Semana efectiva y posición en el plan
 * Funciones puras. El diferenciador central de FORJA.
 *
 * Regla RB-1: la semana NO avanza por calendario. Avanza cuando se completan
 * `daysPerWeek` sesiones. La inactividad no hace saltar semanas.
 */

/**
 * Dado el número total de sesiones realizadas del plan y cuántos días por
 * semana tiene el plan, calcula en qué semana efectiva y qué día toca.
 *
 * @param {number} sessionsDone total de sesiones ya registradas del plan
 * @param {number} daysPerWeek días por semana del plan (1..7)
 * @returns {{week:number, dayInWeek:number, daysPerWeek:number}}
 *   week: nº de semana efectiva (empieza en 1)
 *   dayInWeek: día que toca dentro de la semana (empieza en 1)
 */
export function currentPosition(sessionsDone, daysPerWeek) {
  const dpw = Math.max(1, daysPerWeek);
  const done = Math.max(0, sessionsDone);
  const week = Math.floor(done / dpw) + 1;
  const dayInWeek = (done % dpw) + 1;
  return { week, dayInWeek, daysPerWeek: dpw };
}

/**
 * Etiqueta para la cabecera de la pantalla de entrenar: "Semana 07 · Día 2 de 3".
 * @param {number} sessionsDone
 * @param {number} daysPerWeek
 * @returns {string}
 */
export function positionLabel(sessionsDone, daysPerWeek) {
  const { week, dayInWeek, daysPerWeek: dpw } = currentPosition(sessionsDone, daysPerWeek);
  const ww = String(week).padStart(2, '0');
  return `Semana ${ww} · Día ${dayInWeek} de ${dpw}`;
}

/**
 * Para una sesión que se está registrando ahora, calcula su effectiveWeek y
 * dayNumber (los valores que se guardan en la tabla `sessions`).
 * Es la posición ANTES de sumar esta sesión (la sesión "ocupa" ese hueco).
 * @param {number} sessionsDoneBefore sesiones previas a esta
 * @param {number} daysPerWeek
 * @returns {{effectiveWeek:number, dayNumber:number}}
 */
export function positionForNewSession(sessionsDoneBefore, daysPerWeek) {
  const { week, dayInWeek } = currentPosition(sessionsDoneBefore, daysPerWeek);
  return { effectiveWeek: week, dayNumber: dayInWeek };
}
