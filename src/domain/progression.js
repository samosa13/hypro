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
 * Deriva un rango de reps [min, max] a partir de un objetivo puntual (targetReps).
 * Se usa al migrar planes antiguos (que solo tenían un nº de reps objetivo) y
 * como sugerencia por defecto al crear un ejercicio. Rango centrado de ±2, con
 * mínimo acotado a 1. Ej: 6 → {min:4, max:8}; 10 → {min:8, max:12}.
 * @param {number} targetReps
 * @returns {{min:number, max:number}}
 */
export function deriveRepRange(targetReps) {
  const n = Number(targetReps);
  if (!(n > 0)) return { min: 8, max: 12 };
  return { min: Math.max(1, Math.round(n) - 2), max: Math.round(n) + 2 };
}

/**
 * Normaliza un rango de reps garantizando min>=1 y max>=min. Sirve para saldar
 * entradas de usuario incoherentes (p.ej. min mayor que max) sin romper nada.
 * @param {number} min
 * @param {number} max
 * @returns {{min:number, max:number}}
 */
export function normalizeRepRange(min, max) {
  let lo = Math.max(1, Math.round(Number(min) || 0));
  let hi = Math.max(1, Math.round(Number(max) || 0));
  if (!(lo > 0)) lo = 1;
  if (!(hi > 0)) hi = lo;
  if (hi < lo) [lo, hi] = [hi, lo];
  return { min: lo, max: hi };
}

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
function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

export function suggestNext({ lastBest, target = {}, repRange = { min: 8, max: 12 }, equipment = '' } = {}) {
  const max = repRange.max ?? 12;
  const min = repRange.min ?? 8;

  // Sin historial: proponer el objetivo del plan, pero ACOTADO al rango. Si el
  // plan traía un targetReps fuera del rango (dato antiguo sin curar, p.ej. 12
  // con rango 6-8), no empujamos ahí: lo clampeamos para respetar el rango.
  if (!lastBest || !(lastBest.weight > 0) || !(lastBest.reps > 0)) {
    const w = target.targetWeight ?? 0;
    const r = clamp(target.targetReps ?? min, min, max);
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
