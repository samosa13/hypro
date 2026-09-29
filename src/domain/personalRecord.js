/**
 * DOMINIO · Récord personal (PR)
 * Funciones puras. No tocan UI ni base de datos.
 *
 * Regla RB-2: el PR se compara por 1RM estimado (fórmula de Epley),
 * para comparar objetivamente series con distinto peso y reps.
 *
 * POLÍTICA DE EMPATE (peer review #11): superar el 1RM (>) es un NUEVO récord y
 * dispara celebración. Igualar exactamente el 1RM NO es un récord nuevo (no hay
 * celebración), pero SÍ refresca la fecha del récord (isTiePR), porque volver a
 * alcanzar tu mejor marca es señal de que la mantienes y su fecha debe ser
 * reciente. Una serie con más peso pero igual 1RM estimado se considera empate.
 */

/**
 * 1RM estimado (Epley): peso * (1 + reps/30).
 * Con reps=1 devuelve el propio peso.
 * @param {number} weight kg
 * @param {number} reps repeticiones
 * @returns {number} 1RM estimado
 */
export function estimate1RM(weight, reps) {
  if (weight <= 0 || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

/**
 * ¿La serie nueva bate el récord vigente?
 * @param {{weight:number, reps:number}} set serie registrada
 * @param {{estimated1RM:number}|null} currentPR récord vigente (o null si no hay)
 * @returns {boolean}
 */
export function isNewPR(set, currentPR) {
  const set1RM = estimate1RM(set.weight, set.reps);
  if (set1RM <= 0) return false;
  if (!currentPR) return true; // primer registro del ejercicio
  return set1RM > currentPR.estimated1RM;
}

/**
 * ¿La serie IGUALA el récord vigente (mismo 1RM, sin superarlo)?
 * Se usa para refrescar la fecha del PR sin celebrar récord nuevo.
 * @param {{weight:number, reps:number}} set
 * @param {{estimated1RM:number}|null} currentPR
 * @returns {boolean}
 */
export function isTiePR(set, currentPR) {
  if (!currentPR) return false;
  const set1RM = estimate1RM(set.weight, set.reps);
  if (set1RM <= 0) return false;
  // Empate con tolerancia mínima por redondeo de coma flotante.
  return Math.abs(set1RM - currentPR.estimated1RM) < 1e-6;
}

/**
 * Construye el objeto de récord a partir de una serie que ha batido PR.
 * @param {{exerciseId:string, weight:number, reps:number, loggedAt:string}} set
 * @param {string} userId
 * @returns {object} registro para la tabla personalRecords
 */
export function buildPR(set, userId) {
  return {
    userId,
    exerciseId: set.exerciseId,
    bestWeight: set.weight,
    repsAtBest: set.reps,
    estimated1RM: estimate1RM(set.weight, set.reps),
    achievedAt: set.loggedAt,
  };
}
