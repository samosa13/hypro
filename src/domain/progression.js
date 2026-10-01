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
import { kgToDisplay, formatDuration } from './units.js';
import { normalizeTracking } from './personalRecord.js';

/** Incremento de segundos sugerido para ejercicios de tiempo (D16). */
export const TIME_STEP_SECONDS = 5;
/** Incremento de repeticiones para ejercicios reps_only cuando ya hay historial. */
export const REPS_ONLY_STEP = 1;

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

export function suggestNext({ lastBest, target = {}, repRange = { min: 8, max: 12 }, equipment = '', unit = 'kg', tracking = 'weight_reps' } = {}) {
  const tk = normalizeTracking(tracking);
  if (tk === 'reps_only') return suggestRepsOnly({ lastBest, target });
  if (tk === 'time') return suggestTime({ lastBest, target });
  return suggestWeightReps({ lastBest, target, repRange, equipment, unit });
}

/**
 * Progresión para ejercicios de solo-repeticiones (D16): no hay peso, la mejora
 * es hacer una repetición más que la última vez. Sin historial, propone el
 * objetivo del plan (targetReps) o un arranque sensato.
 */
function suggestRepsOnly({ lastBest, target = {} }) {
  if (!lastBest || !(lastBest.reps > 0)) {
    const r = Math.max(1, Math.round(target.targetReps ?? 8));
    return { weight: 0, reps: r, kind: 'plan', text: `Objetivo: ${r} reps` };
  }
  const reps = lastBest.reps + REPS_ONLY_STEP;
  return { weight: 0, reps, kind: 'reps', text: `Hoy intenta ${reps} reps` };
}

/**
 * Progresión para ejercicios de tiempo (D16): la mejora es aguantar unos
 * segundos más que la última vez. Sin historial, propone el objetivo del plan
 * (targetDurationSeconds) o un arranque sensato.
 */
function suggestTime({ lastBest, target = {} }) {
  if (!lastBest || !(lastBest.durationSeconds > 0)) {
    const d = Math.max(1, Math.round(target.targetDurationSeconds ?? 30));
    return { durationSeconds: d, kind: 'plan', text: `Objetivo: ${formatDuration(d)}` };
  }
  const durationSeconds = lastBest.durationSeconds + TIME_STEP_SECONDS;
  return { durationSeconds, kind: 'time', text: `Hoy aguanta ${formatDuration(durationSeconds)}` };
}

/** Progresión clásica de peso+reps (doble progresión). */
function suggestWeightReps({ lastBest, target = {}, repRange = { min: 8, max: 12 }, equipment = '', unit = 'kg' }) {
  const max = repRange.max ?? 12;
  const min = repRange.min ?? 8;
  // Peso en texto, en la unidad del usuario (B11). El cálculo sigue en kg; solo
  // el texto mostrado se convierte. `weight` devuelto se mantiene en kg.
  const u = unit === 'lb' ? 'lb' : 'kg';
  const wTxt = (kg) => `${kgToDisplay(kg, u)} ${u}`;

  // Sin historial: proponer el objetivo del plan, pero ACOTADO al rango. Si el
  // plan traía un targetReps fuera del rango (dato antiguo sin curar, p.ej. 12
  // con rango 6-8), no empujamos ahí: lo clampeamos para respetar el rango.
  if (!lastBest || !(lastBest.weight > 0) || !(lastBest.reps > 0)) {
    const w = target.targetWeight ?? 0;
    const r = clamp(target.targetReps ?? min, min, max);
    return { weight: w, reps: r, kind: 'plan', text: `Objetivo: ${r} reps × ${wTxt(w)}` };
  }

  // Con historial: doble progresión.
  if (lastBest.reps < max) {
    const reps = lastBest.reps + 1;
    return {
      weight: lastBest.weight,
      reps,
      kind: 'reps',
      text: `Hoy intenta ${reps} reps × ${wTxt(lastBest.weight)}`,
    };
  }
  // Tope de reps alcanzado -> subir peso y reiniciar reps al mínimo.
  const weight = Math.round((lastBest.weight + weightStep(lastBest.weight, equipment)) * 100) / 100;
  return {
    weight,
    reps: min,
    kind: 'weight',
    text: `¡Sube peso! Prueba ${min} reps × ${wTxt(weight)}`,
  };
}
