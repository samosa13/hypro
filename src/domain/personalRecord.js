/**
 * DOMINIO · Récord personal (PR)
 * Funciones puras. No tocan UI ni base de datos.
 *
 * Regla RB-2: para ejercicios de peso+reps el PR se compara por 1RM estimado
 * (fórmula de Epley), para comparar objetivamente series con distinto peso y
 * reps. Pero no todos los ejercicios se miden igual (D16):
 *
 *  - 'weight_reps' (por defecto): mejor = mayor 1RM estimado (peso×reps).
 *  - 'reps_only'  : no hay peso (p.ej. dominadas, elevación de piernas). El
 *                   récord es hacer MÁS repeticiones.
 *  - 'time'       : la serie se mide en segundos (p.ej. plancha). El récord es
 *                   aguantar MÁS tiempo.
 *
 * Para unificar la lógica de "mejor serie", cada tipo define un ÚNICO número
 * comparable (`scoreSet`): a mayor score, mejor serie. Así `isNewPR`,
 * `isTiePR` y `bestPRFromSets` funcionan igual para los tres tipos.
 *
 * POLÍTICA DE EMPATE (peer review #11): superar el score (>) es un NUEVO récord
 * y dispara celebración. Igualar exactamente el score NO es récord nuevo (no
 * celebra), pero SÍ refresca la fecha (isTiePR). En empate dentro del
 * recálculo histórico se conserva la fecha más antigua (primer logro).
 */

/** Tipo de medición por defecto cuando un ejercicio no lo declara. */
export const DEFAULT_TRACKING = 'weight_reps';

/** Normaliza el tipo de medición a uno de los tres válidos. */
export function normalizeTracking(tracking) {
  return tracking === 'reps_only' || tracking === 'time' ? tracking : DEFAULT_TRACKING;
}

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
 * Número comparable de una serie según el tipo de medición del ejercicio.
 * A mayor valor, mejor serie. Devuelve 0 (serie no puntuable) cuando faltan
 * los datos propios del tipo. Las series de calentamiento se filtran fuera,
 * no aquí.
 * @param {{weight?:number, reps?:number, durationSeconds?:number}} set
 * @param {'weight_reps'|'reps_only'|'time'} tracking
 * @returns {number}
 */
export function scoreSet(set, tracking = DEFAULT_TRACKING) {
  const tk = normalizeTracking(tracking);
  if (tk === 'reps_only') {
    const r = Number(set.reps) || 0;
    return r > 0 ? r : 0;
  }
  if (tk === 'time') {
    const d = Number(set.durationSeconds) || 0;
    return d > 0 ? d : 0;
  }
  return estimate1RM(Number(set.weight) || 0, Number(set.reps) || 0);
}

/**
 * ¿La serie nueva bate el récord vigente?
 * @param {object} set serie registrada
 * @param {{score?:number, estimated1RM?:number}|null} currentPR récord vigente
 * @param {string} tracking tipo de medición del ejercicio
 * @returns {boolean}
 */
export function isNewPR(set, currentPR, tracking = DEFAULT_TRACKING) {
  const s = scoreSet(set, tracking);
  if (s <= 0) return false;
  if (!currentPR) return true; // primer registro del ejercicio
  return s > prScore(currentPR);
}

/**
 * ¿La serie IGUALA el récord vigente (mismo score, sin superarlo)?
 * Se usa para refrescar la fecha del PR sin celebrar récord nuevo.
 * @param {object} set
 * @param {{score?:number, estimated1RM?:number}|null} currentPR
 * @param {string} tracking
 * @returns {boolean}
 */
export function isTiePR(set, currentPR, tracking = DEFAULT_TRACKING) {
  if (!currentPR) return false;
  const s = scoreSet(set, tracking);
  if (s <= 0) return false;
  // Empate con tolerancia mínima por redondeo de coma flotante.
  return Math.abs(s - prScore(currentPR)) < 1e-6;
}

/**
 * Score de un PR ya guardado. Compatibilidad: los PR antiguos (anteriores a
 * D16) solo tienen `estimated1RM`; se usa como score para 'weight_reps'. Es la
 * ÚNICA fuente de verdad del fallback: todos los consumidores (dominio y UI)
 * deben usar esta función en lugar de replicar `pr.score ?? pr.estimated1RM`.
 * @param {{score?:number, estimated1RM?:number}|null} pr
 * @returns {number}
 */
export function prScore(pr) {
  if (!pr) return 0;
  if (typeof pr.score === 'number') return pr.score;
  return pr.estimated1RM ?? 0;
}

/**
 * Construye el objeto de récord a partir de una serie que ha batido PR.
 * Mantiene los campos históricos (bestWeight, repsAtBest, estimated1RM) para
 * compatibilidad con PR antiguos y añade los genéricos de D16: `tracking`,
 * `score` (número comparable) y, para 'time', `bestDurationSeconds`.
 * @param {object} set {exerciseId, weight?, reps?, durationSeconds?, loggedAt}
 * @param {string} userId
 * @param {string} tracking
 * @returns {object} registro para la tabla personalRecords
 */
export function buildPR(set, userId, tracking = DEFAULT_TRACKING) {
  const tk = normalizeTracking(tracking);
  const weight = Number(set.weight) || 0;
  const reps = Number(set.reps) || 0;
  const durationSeconds = Number(set.durationSeconds) || 0;
  return {
    userId,
    exerciseId: set.exerciseId,
    tracking: tk,
    // Métrica comparable del récord (a mayor, mejor).
    score: scoreSet({ weight, reps, durationSeconds }, tk),
    // Campos específicos (los no aplicables quedan en 0, inofensivos).
    bestWeight: weight,
    repsAtBest: reps,
    bestDurationSeconds: durationSeconds,
    // Compatibilidad hacia atrás: 1RM solo tiene sentido en weight_reps.
    estimated1RM: tk === 'weight_reps' ? estimate1RM(weight, reps) : 0,
    achievedAt: set.loggedAt,
  };
}

/**
 * Recalcula el MEJOR récord de un ejercicio a partir de TODO su historial de
 * series (RB-2). Se usa al editar o borrar una serie ya registrada: si la serie
 * tocada era la que marcaba el PR, el récord debe recomputarse desde cero sobre
 * lo que quede, no quedarse "congelado" en una marca que ya no existe.
 *
 * El mejor PR es el de mayor `score` (según el tipo de medición). En caso de
 * empate de score, se queda con el logrado ANTES (fecha más antigua). Las
 * series de calentamiento (isWarmup) no cuentan.
 *
 * @param {Array<object>} sets series del ejercicio (con weight/reps/durationSeconds, loggedAt, isWarmup?)
 * @param {string} exerciseId
 * @param {string} userId
 * @param {string} tracking tipo de medición del ejercicio
 * @returns {object|null} registro de PR (como buildPR) o null si no queda ninguna serie válida
 */
export function bestPRFromSets(sets, exerciseId, userId, tracking = DEFAULT_TRACKING) {
  const tk = normalizeTracking(tracking);
  let best = null;
  for (const s of sets) {
    if (s.isWarmup) continue;
    const sc = scoreSet(s, tk);
    if (sc <= 0) continue;
    if (
      !best ||
      sc > best.score ||
      (Math.abs(sc - best.score) < 1e-6 && new Date(s.loggedAt) < new Date(best.achievedAt))
    ) {
      best = buildPR(
        { exerciseId, weight: s.weight, reps: s.reps, durationSeconds: s.durationSeconds, loggedAt: s.loggedAt },
        userId,
        tk
      );
    }
  }
  return best;
}
