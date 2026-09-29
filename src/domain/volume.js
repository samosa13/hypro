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
