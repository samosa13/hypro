/**
 * DOMINIO · Estimación de la duración de un día de entrenamiento (punto 2).
 * Funciones puras. No tocan UI ni base de datos.
 *
 * Modelo de estimación (deliberadamente simple, "suficientemente bueno"):
 *  - El tiempo de EJECUCIÓN de una serie:
 *      · tracking 'time'  → su `targetDurationSeconds` (lo que se aguanta).
 *      · resto            → `secondsPerSet` (ajuste global; ~40 s por defecto).
 *  - El DESCANSO cuenta entre series, no después de la última serie del día
 *    (al acabar no descansas). Se modela como: suma de descansos de todas las
 *    series menos UN descanso final (el de la última serie de la sesión).
 *  - SUPERSERIES / CIRCUITOS (D17): los ejercicios de un grupo se entrenan en
 *    rotación y el descanso solo se toma al CERRAR la vuelta (no entre miembros
 *    dentro de la vuelta). Por eso un grupo de M ejercicios y N vueltas aporta
 *    N × Σ(ejecución de cada miembro) + N descansos (del último miembro).
 *
 * No pretende ser exacto (no sabe cuánto tardas de verdad), sino avisar cuando
 * un día claramente no cabe en el tiempo disponible y proponer recortes.
 */

const DEFAULT_SECONDS_PER_SET = 40;

/** Tiempo de ejecución (seg) de UNA serie de un ejercicio, según su tipo. */
function execSecondsPerSet(pe, tracking, secondsPerSet) {
  if (tracking === 'time') return Math.max(1, Number(pe.targetDurationSeconds) || 30);
  return secondsPerSet;
}

/**
 * Agrupa una lista de planExercises (ordenados) en "unidades" de entrenamiento:
 * un ejercicio suelto es una unidad; un grupo (mismo groupId) es una unidad con
 * varios miembros. Idéntico criterio al de trainScreen al pintar.
 * @returns {Array<{members: Array}>}
 */
function toUnits(planExercises) {
  const units = [];
  let i = 0;
  const list = [...planExercises].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  while (i < list.length) {
    const pe = list[i];
    if (pe.groupId) {
      const members = [];
      while (i < list.length && list[i].groupId === pe.groupId) { members.push(list[i]); i++; }
      units.push({ members });
    } else {
      units.push({ members: [pe] }); i++;
    }
  }
  return units;
}

/**
 * Estima la duración de un día en SEGUNDOS a partir de sus planExercises.
 * @param {Array} planExercises filas del día (con targetSets, restSeconds,
 *   targetDurationSeconds, groupId/groupType, exerciseId, order)
 * @param {Object<string,string>} trackingById mapa exerciseId → tracking
 * @param {{secondsPerSet?:number}} [settings]
 * @returns {{totalSeconds:number, workSeconds:number, restSeconds:number, units:number}}
 */
export function estimateDaySeconds(planExercises, trackingById = {}, settings = {}) {
  const secondsPerSet = Math.max(1, Number(settings.secondsPerSet) || DEFAULT_SECONDS_PER_SET);
  const units = toUnits(planExercises);
  let workSeconds = 0;
  let restSeconds = 0;
  let restEvents = 0; // nº de descansos contados (para restar el último)
  let lastRest = 0;   // descanso de la última unidad (para descontar el final)

  for (const unit of units) {
    const members = unit.members;
    const isGroup = members.length > 1;
    if (isGroup) {
      // Vueltas = targetSets del grupo (normalizado al agrupar, D17 #3). Ejecución
      // de una vuelta = suma de la ejecución de cada miembro. El descanso solo al
      // cerrar la vuelta, con el restSeconds del ÚLTIMO miembro.
      const rounds = Math.max(1, Number(members[0].targetSets) || 1);
      const perRoundWork = members.reduce((acc, pe) => {
        const tk = trackingById[pe.exerciseId];
        return acc + execSecondsPerSet(pe, tk, secondsPerSet);
      }, 0);
      const groupRest = Math.max(0, Number(members[members.length - 1].restSeconds) || 0);
      workSeconds += rounds * perRoundWork;
      restSeconds += rounds * groupRest;
      restEvents += rounds;
      lastRest = groupRest;
    } else {
      const pe = members[0];
      const sets = Math.max(1, Number(pe.targetSets) || 1);
      const tk = trackingById[pe.exerciseId];
      const rest = Math.max(0, Number(pe.restSeconds) || 0);
      workSeconds += sets * execSecondsPerSet(pe, tk, secondsPerSet);
      restSeconds += sets * rest;
      restEvents += sets;
      lastRest = rest;
    }
  }

  // No se descansa tras la última serie de la sesión: se descuenta ese descanso.
  if (restEvents > 0) restSeconds = Math.max(0, restSeconds - lastRest);

  return {
    totalSeconds: workSeconds + restSeconds,
    workSeconds,
    restSeconds,
    units: units.length,
  };
}

/**
 * Evalúa la viabilidad de un día contra el tiempo disponible (en minutos).
 * @param {number} estimatedSeconds duración estimada (de estimateDaySeconds)
 * @param {number} availableMinutes tiempo disponible declarado por el usuario
 * @returns {{fits:boolean, estimatedMinutes:number, availableMinutes:number, overByMinutes:number}}
 */
export function assessFit(estimatedSeconds, availableMinutes) {
  const estimatedMinutes = Math.round(estimatedSeconds / 60);
  const avail = Math.max(0, Math.round(Number(availableMinutes) || 0));
  // Margen de tolerancia: 2 min. No avisamos por pasarnos un pelo.
  const fits = avail <= 0 || estimatedMinutes <= avail + 2;
  return {
    fits,
    estimatedMinutes,
    availableMinutes: avail,
    overByMinutes: Math.max(0, estimatedMinutes - avail),
  };
}

/**
 * Propone recortes para encajar un día en el tiempo disponible, SIN aplicarlos
 * (los muestra; el usuario decide). Devuelve una lista de sugerencias en orden
 * de impacto. No muta nada.
 * @param {object} params
 *  - planExercises, trackingById, settings: como en estimateDaySeconds
 *  - availableMinutes: tiempo disponible
 * @returns {Array<{kind:string, text:string}>}
 */
export function suggestCuts({ planExercises, trackingById = {}, settings = {}, availableMinutes }) {
  const base = estimateDaySeconds(planExercises, trackingById, settings);
  const fit = assessFit(base.totalSeconds, availableMinutes);
  if (fit.fits) return [];

  const suggestions = [];
  // Objetivo con el MISMO margen de tolerancia que assessFit (2 min), para que
  // "¿cabe?" y "¿cuánto recorto?" sean coherentes (peer review #5).
  const targetSeconds = (fit.availableMinutes + 2) * 60;
  // Una sugerencia solo se ofrece si DE VERDAD hace caber el día; si no, sería
  // una pista engañosa (peer review #3). Las demás se omiten.
  const makesItFit = (afterSeconds) => afterSeconds <= targetSeconds;

  // 1) Quitar una serie a cada ejercicio (si todos tienen ≥2).
  const canDropSet = planExercises.every((pe) => (Number(pe.targetSets) || 1) >= 2);
  if (canDropSet && planExercises.length) {
    const minusOne = planExercises.map((pe) => ({ ...pe, targetSets: (Number(pe.targetSets) || 1) - 1 }));
    const after = estimateDaySeconds(minusOne, trackingById, settings);
    const savedMin = Math.round((base.totalSeconds - after.totalSeconds) / 60);
    if (savedMin > 0 && makesItFit(after.totalSeconds)) {
      suggestions.push({ kind: 'dropSet', savedMin, afterMinutes: Math.round(after.totalSeconds / 60) });
    }
  }

  // 2) Recortar descansos largos a 60 s.
  const hasLongRest = planExercises.some((pe) => (Number(pe.restSeconds) || 0) > 60);
  if (hasLongRest) {
    const trimmed = planExercises.map((pe) => ({ ...pe, restSeconds: Math.min(Number(pe.restSeconds) || 0, 60) }));
    const after = estimateDaySeconds(trimmed, trackingById, settings);
    const savedMin = Math.round((base.totalSeconds - after.totalSeconds) / 60);
    if (savedMin > 0 && makesItFit(after.totalSeconds)) {
      suggestions.push({ kind: 'trimRest', savedMin, afterMinutes: Math.round(after.totalSeconds / 60) });
    }
  }

  // 3) Dejar fuera N UNIDADES de entrenamiento (ejercicio suelto o bloque de
  //    superserie entero, no filas sueltas: quitar medio bloque no es natural).
  //    Se usa el coste medio por unidad y el objetivo CON tolerancia (peer review #2/#5).
  const units = toUnits(planExercises);
  const avgPerUnit = units.length ? base.totalSeconds / units.length : 0;
  if (avgPerUnit > 0) {
    const overSeconds = base.totalSeconds - targetSeconds;
    const dropN = Math.ceil(overSeconds / avgPerUnit);
    if (dropN > 0 && dropN < units.length) {
      suggestions.push({ kind: 'dropExercises', count: dropN });
    }
  }

  return suggestions;
}
