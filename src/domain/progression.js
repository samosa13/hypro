/**
 * DOMINIO · Sugerencia de progresión (el "coach ligero").
 * Funciones puras.
 *
 * Regla de hipertrofia (doble progresión, simple y estándar):
 *  - Trabajas en un rango de repeticiones [repMin, repMax] para un peso dado.
 *  - Mientras no llegues al tope de reps del rango, la progresión es SUMAR una
 *    repetición al mismo peso.
 *  - Cuando alcanzas (o superas) el tope de reps, subes el peso al siguiente
 *    incremento realista de gimnasio y bajas las reps al mínimo del rango.
 *
 * No mangonea: es una SUGERENCIA basada en lo que hiciste la última vez. El
 * usuario decide. Si no hay historial, sugiere el objetivo del plan.
 */

/**
 * Incremento de peso realista según el peso actual y el equipo.
 * Mancuernas suelen subir de 2 en 2 kg (par), barras/máquinas de 2,5 en 2,5.
 * @param {number} weight
 * @param {string} equipment
 * @returns {number} incremento en kg
 */
export function weightStep(weight, equipment = '') {
  // Pesos pequeños suben más fino, independientemente del equipo.
  if (weight < 20) return 1.25;
  if (equipment === 'mancuerna') return 2; // salto típico de mancuernas
  return 2.5; // barra / máquina
}

/**
 * Sugerencia de progresión para el próximo entrenamiento de un ejercicio.
 *
 * @param {object} params
 *  - lastBest: {weight, reps} mejor serie de la última sesión (o null)
 *  - target: {targetReps, targetWeight} objetivo del plan
 *  - repRange: {min, max} rango de reps objetivo (por defecto 8-12)
 *  - equipment: tipo de equipo (para el incremento de peso)
 * @returns {{weight:number, reps:number, text:string, kind:'reps'|'weight'|'plan'}}
 */
export function suggestNext({ lastBest, target = {}, repRange = { min: 8, max: 12 }, equipment = '' } = {}) {
  const max = repRange.max ?? 12;
  const min = repRange.min ?? 8;

  // Sin historial: proponer el objetivo del plan.
  if (!lastBest || !(lastBest.weight > 0) || !(lastBest.reps > 0)) {
    const w = target.targetWeight ?? 0;
    const r = target.targetReps ?? min;
    return { weight: w, reps: r, kind: 'plan', text: `Objetivo: ${r} reps × ${w} kg` };
  }

  // Con historial: doble progresión.
  if (lastBest.reps < max) {
    const reps = lastBest.reps + 1;
    return {
      weight: lastBest.weight,
      reps,
      kind: 'reps',
      text: `Hoy intenta ${reps} reps × ${lastBest.weight} kg`,
    };
  }
  // Tope de reps alcanzado -> subir peso y reiniciar reps al mínimo.
  const weight = Math.round((lastBest.weight + weightStep(lastBest.weight, equipment)) * 100) / 100;
  return {
    weight,
    reps: min,
    kind: 'weight',
    text: `¡Sube peso! Prueba ${min} reps × ${weight} kg`,
  };
}
