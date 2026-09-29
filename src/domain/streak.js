/**
 * DOMINIO · Racha inteligente
 * Funciones puras.
 *
 * Regla RB-3: la racha mide constancia respetando los días de descanso
 * planificados. Descansar los días previstos NO rompe la racha. Se rompe
 * cuando el hueco entre sesiones supera el descanso esperado + margen.
 *
 * Descanso esperado entre sesiones (en días) ≈ 7 / daysPerWeek.
 * Ej.: 3 días/semana -> ~2,33 días entre sesiones; con margen 1 -> hasta ~3-4.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dayDiff(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  // Normalizar a medianoche para contar días de calendario
  const na = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const nb = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((nb - na) / MS_PER_DAY);
}

/**
 * Máximo hueco permitido (en días) entre dos sesiones sin romper la racha.
 * @param {number} daysPerWeek
 * @param {number} toleranceDays margen extra (por defecto 1)
 * @returns {number}
 */
export function maxGapDays(daysPerWeek, toleranceDays = 1) {
  const dpw = Math.max(1, daysPerWeek);
  const expectedGap = Math.ceil(7 / dpw);
  return expectedGap + toleranceDays;
}

/**
 * Calcula la racha actual (nº de sesiones consecutivas dentro de tolerancia)
 * a partir de las fechas de sesión, de más antigua a más reciente.
 * @param {string[]} sessionDates fechas ISO de sesiones (cualquier orden)
 * @param {number} daysPerWeek
 * @param {object} opts { toleranceDays, now }
 * @returns {number} longitud de la racha vigente
 */
export function currentStreak(sessionDates, daysPerWeek, opts = {}) {
  const { toleranceDays = 1, now = new Date() } = opts;
  if (!sessionDates || sessionDates.length === 0) return 0;

  const gap = maxGapDays(daysPerWeek, toleranceDays);
  const sorted = [...sessionDates].map((d) => new Date(d)).sort((a, b) => a - b);

  // Si ya se superó el hueco desde la última sesión hasta hoy, la racha está rota.
  const last = sorted[sorted.length - 1];
  if (dayDiff(last, now) > gap) return 0;

  // Contar hacia atrás mientras los huecos entre sesiones no superen el máximo.
  let streak = 1;
  for (let i = sorted.length - 1; i > 0; i--) {
    const diff = dayDiff(sorted[i - 1], sorted[i]);
    if (diff <= gap) streak++;
    else break;
  }
  return streak;
}

/**
 * ¿Está la racha activa ahora mismo?
 * @returns {boolean}
 */
export function isStreakAlive(sessionDates, daysPerWeek, opts = {}) {
  return currentStreak(sessionDates, daysPerWeek, opts) > 0;
}
