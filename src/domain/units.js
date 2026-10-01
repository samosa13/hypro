/**
 * DOMINIO · Unidades de peso (B11). Funciones puras.
 *
 * REGLA DE ORO: los pesos se ALMACENAN SIEMPRE en kilogramos (unidad canónica).
 * La unidad del usuario (kg|lb) es solo de PRESENTACIÓN: se convierte al mostrar
 * y al leer la entrada del usuario, nunca se guarda en libras. Así el 1RM, el
 * volumen y los récords se calculan sobre una base única y cambiar de unidad no
 * introduce "drift" por redondeos sucesivos.
 */

export const KG_PER_LB = 0.45359237;        // 1 lb = 0.45359237 kg (exacto)
export const LB_PER_KG = 1 / KG_PER_LB;      // ≈ 2.2046226218

/** Etiqueta corta de la unidad para la UI. */
export function unitLabel(unit) {
  return unit === 'lb' ? 'lb' : 'kg';
}

/**
 * Redondea a un incremento realista de gimnasio: 0.5 (discos/mancuernas suelen
 * ir de medio en medio). Evita decimales feos tras convertir.
 */
function roundToHalf(n) {
  return Math.round(n * 2) / 2;
}

/**
 * Convierte un peso canónico (kg) al valor que se MUESTRA en la unidad elegida.
 * @param {number} kg peso en kilogramos (canónico)
 * @param {string} unit 'kg' | 'lb'
 * @returns {number} valor para mostrar/prefijar en inputs
 */
export function kgToDisplay(kg, unit) {
  const v = Number(kg) || 0;
  if (unit === 'lb') return roundToHalf(v * LB_PER_KG);
  return roundToHalf(v);
}

/**
 * Convierte un valor introducido por el usuario (en su unidad) a kg canónicos
 * para almacenar. No se redondea a 0.5 aquí: guardamos el kg exacto resultante
 * para no perder precisión (el redondeo es solo de presentación).
 * @param {number} value valor tal cual lo escribió el usuario
 * @param {string} unit 'kg' | 'lb'
 * @returns {number} kilogramos canónicos
 */
export function displayToKg(value, unit) {
  const v = Number(value) || 0;
  if (unit === 'lb') return Math.round(v * KG_PER_LB * 100) / 100; // 2 decimales de kg
  return v;
}

/** Formatea un peso canónico (kg) con su unidad para texto: "60 kg" / "132.5 lb". */
export function formatWeight(kg, unit) {
  return `${kgToDisplay(kg, unit)} ${unitLabel(unit)}`;
}

/**
 * Formatea una duración en segundos para la UI (D16, ejercicios de tiempo).
 * Menos de 60 s → "45s"; a partir de un minuto → "1:30" (m:ss con relleno).
 * No depende de la unidad de peso; vive aquí por ser formateo de dominio puro.
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, '0')}`;
}
