/**
 * DOMINIO · Antigüedad total en el gimnasio
 * Funciones puras.
 *
 * Regla RF-31: muestra tu historia global (tiempo, sesiones, series, PRs),
 * independiente del plan que sigas ahora. Da la visibilidad de
 * "llevo 3 semanas con este plan, pero 5 meses en el gym".
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Calcula meses y días completos entre dos fechas.
 * @param {string|Date} startDate inicio en el gym
 * @param {string|Date} now referencia (por defecto ahora)
 * @returns {{months:number, days:number, totalDays:number}}
 */
export function tenureSince(startDate, now = new Date()) {
  const start = new Date(startDate);
  const end = new Date(now);
  if (isNaN(start) || end < start) return { months: 0, days: 0, totalDays: 0 };

  const totalDays = Math.floor((end - start) / MS_PER_DAY);

  let months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  // Ajuste si aún no se ha cumplido el día del mes
  let days = end.getDate() - start.getDate();
  if (days < 0) {
    months -= 1;
    // días del mes anterior al de fin
    const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    days += prevMonth;
  }
  if (months < 0) months = 0;
  return { months, days, totalDays };
}

/**
 * Texto legible de antigüedad: "5 meses y 3 días".
 * @param {string|Date} startDate
 * @param {string|Date} now
 * @returns {string}
 */
export function tenureLabel(startDate, now = new Date()) {
  const { months, days } = tenureSince(startDate, now);
  const mPart = months === 1 ? '1 mes' : `${months} meses`;
  const dPart = days === 1 ? '1 día' : `${days} días`;
  if (months === 0) return dPart;
  return `${mPart} y ${dPart}`;
}

/**
 * Resumen global de actividad.
 * @param {object} stats { sessions, sets, prs }
 * @param {string|Date} gymStartDate
 * @returns {{tenure:string, sessions:number, sets:number, prs:number}}
 */
export function tenureSummary(stats, gymStartDate, now = new Date()) {
  return {
    tenure: tenureLabel(gymStartDate, now),
    sessions: stats.sessions ?? 0,
    sets: stats.sets ?? 0,
    prs: stats.prs ?? 0,
  };
}
