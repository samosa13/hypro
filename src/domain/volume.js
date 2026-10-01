/**
 * DOMINIO · Volumen de entrenamiento por grupo muscular.
 * Funciones puras.
 *
 * En hipertrofia, el "volumen" (nº de series efectivas por grupo muscular a la
 * semana) es la métrica que más correlaciona con el crecimiento. Aquí lo
 * calculamos como nº de series registradas por grupo muscular.
 */

/**
 * Cuenta series por grupo muscular a partir de una lista de series con su
 * grupo muscular resuelto.
 * @param {Array<{muscleGroup:string}>} sets series (cada una con muscleGroup)
 * @returns {Object<string, number>} { pecho: 12, espalda: 14, ... } ordenable
 */
export function volumeByMuscle(sets) {
  const out = {};
  for (const s of sets) {
    const g = s.muscleGroup || 'otros';
    out[g] = (out[g] ?? 0) + 1;
  }
  return out;
}

/**
 * Convierte el mapa de volumen en una lista ordenada de mayor a menor, útil
 * para pintar barras.
 * @param {Object<string, number>} volumeMap
 * @returns {Array<{muscle:string, sets:number}>}
 */
export function volumeRanking(volumeMap) {
  return Object.entries(volumeMap)
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets);
}

/**
 * Semáforo del volumen semanal frente a un objetivo de series (C13).
 *  - 'low'      : por debajo del 70% del objetivo (volumen insuficiente)
 *  - 'onTarget' : entre el 70% y el 130% del objetivo (en zona buena)
 *  - 'high'     : por encima del 130% del objetivo (quizá exceso)
 * Si no hay objetivo (<=0), devuelve 'onTarget' (sin semáforo).
 * @param {number} sets series hechas del músculo esta semana
 * @param {number} target objetivo de series/semana
 * @returns {'low'|'onTarget'|'high'}
 */
export function volumeStatus(sets, target) {
  if (!(target > 0)) return 'onTarget';
  if (sets < target * 0.7) return 'low';
  if (sets > target * 1.3) return 'high';
  return 'onTarget';
}
