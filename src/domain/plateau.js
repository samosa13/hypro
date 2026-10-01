/**
 * DOMINIO · Aviso de estancamiento
 * Funciones puras.
 *
 * Regla RB-4: al cerrar una semana efectiva, por cada ejercicio entrenado se
 * compara el mejor 1RM estimado de la semana con el PR vigente. Si no se
 * igualó ni superó, se marca "sin progreso esta semana" con la fecha del PR.
 */

import { estimate1RM } from './personalRecord.js';

/**
 * @param {Array<{exerciseId, exerciseName, weight?, reps?, score?}>} weekSets series de la semana
 *   Cada serie aporta un valor comparable: si trae `score` (D16, ya calculado
 *   según el tipo de medición) se usa tal cual; si no, se calcula el 1RM de
 *   peso+reps (comportamiento histórico).
 * @param {Object<string, {estimated1RM:number, achievedAt:string}>} prByExercise
 *   récord vigente por exerciseId (el que había ANTES de la semana)
 * @returns {Array<{exerciseId, exerciseName, prDate, bestThisWeek1RM, pr1RM}>}
 *   ejercicios sin progreso esta semana
 */
export function findPlateaus(weekSets, prByExercise) {
  const scoreOf = (s) => (typeof s.score === 'number' ? s.score : estimate1RM(s.weight, s.reps));
  // Mejor score de la semana por ejercicio
  const bestByExercise = {};
  for (const s of weekSets) {
    const rm = scoreOf(s);
    const prev = bestByExercise[s.exerciseId];
    if (!prev || rm > prev.rm) {
      bestByExercise[s.exerciseId] = { rm, name: s.exerciseName };
    }
  }

  const plateaus = [];
  for (const [exerciseId, best] of Object.entries(bestByExercise)) {
    const pr = prByExercise[exerciseId];
    // Si no había PR previo, cualquier serie es progreso -> no es estancamiento.
    if (!pr) continue;
    // Sin progreso si el mejor de la semana no supera el PR vigente.
    if (best.rm <= pr.estimated1RM) {
      plateaus.push({
        exerciseId,
        exerciseName: best.name,
        prDate: pr.achievedAt,
        bestThisWeek1RM: Math.round(best.rm * 10) / 10,
        pr1RM: Math.round(pr.estimated1RM * 10) / 10,
      });
    }
  }
  return plateaus;
}
