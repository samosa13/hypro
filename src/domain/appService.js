/**
 * DOMINIO/APLICACIÓN · Servicio que orquesta dominio + repositorio.
 *
 * Es la única puerta que usa la UI para operaciones con estado. Mantiene la UI
 * ignorante de la persistencia y del cálculo. Recibe el repositorio por
 * inyección, así que en test se le puede pasar uno falso.
 */

import repository from '../data/repository.js';
import { SEED_EXERCISES } from '../data/seedExercises.js';
import { APP, DEFAULT_SETTINGS } from '../config/app.config.js';
import { isNewPR, isTiePR, buildPR, estimate1RM, bestPRFromSets } from './personalRecord.js';
import { positionForNewSession, currentPosition } from './effectiveWeek.js';
import { dateKey } from './dateKey.js';

/**
 * Clave estable de un ejercicio semilla, derivada de su nombre de catálogo.
 * Inmutable: aunque el usuario renombre el ejercicio, el seedKey no cambia
 * porque se calcula del nombre en SEED_EXERCISES, no del nombre en la BD.
 */
function seedKeyOf(seed) {
  return seed.name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // sin acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function createAppService(repo = repository, userId = APP.defaultUserId) {
  const uid = () =>
    (crypto?.randomUUID?.() ?? 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));

  return {
    /** Arranque: siembra ejercicios, asegura ajustes y hace backup diario. */
    async bootstrap() {
      const count = await repo.countExercises(userId);
      if (count === 0) {
        const seeded = SEED_EXERCISES.map((e) => ({
          id: uid(), userId, isCustom: false, createdAt: new Date().toISOString(),
          // seedKey estable e inmutable (peer review #14): identifica al ejercicio
          // semilla aunque el usuario renombre el ejercicio en el futuro.
          seedKey: seedKeyOf(e), ...e,
        }));
        await repo.bulkAddExercises(seeded);
      } else {
        // Siembra incremental (B7): añade los ejercicios semilla NUEVOS que aún
        // no estén en la BD (empareja por seedKey). Así, cuando el catálogo
        // crece, los usuarios ya instalados reciben los nuevos sin perder nada.
        await this.reconcileSeedExercises();
        // Migración de iconos: si el catálogo cambió las claves de icono, se
        // reconcilian por nombre para los ejercicios semilla (no custom). Así el
        // usuario ve los pictogramas nuevos sin borrar sus datos.
        await this.reconcileSeedIcons();
      }
      // Migración de rangos de reps: los planes antiguos solo tenían un nº de
      // reps objetivo (targetReps). Se les deriva un rango [repMin, repMax] para
      // que la progresión respete a quien entrena fuera del 8-12. No destructivo.
      await this.reconcilePlanExerciseRanges();
      const settings = await repo.getSettings(userId);
      // Fija fechas de inicio la primera vez.
      const patch = {};
      if (!settings.gymStartDate) patch.gymStartDate = new Date().toISOString();
      if (!settings.planStartDate) patch.planStartDate = new Date().toISOString();
      if (Object.keys(patch).length) await repo.saveSettings({ ...settings, ...patch }, userId);
      await this.ensureDailyBackup();
      return repo.getSettings(userId);
    },

    /**
     * Siembra incremental de ejercicios semilla (B7). Inserta los ejercicios de
     * SEED_EXERCISES cuyo `seedKey` no exista todavía en la BD del usuario, sin
     * duplicar los que ya están ni tocar los ejercicios propios (isCustom). Así
     * ampliar el catálogo llega también a instalaciones existentes.
     *
     * El emparejamiento con lo existente se hace por `seedKey` y, como respaldo
     * para instalaciones antiguas sin seedKey, también por nombre, para no
     * reinsertar un ejercicio semilla que el usuario ya tiene.
     */
    async reconcileSeedExercises() {
      const existing = await repo.listExercises(userId);
      const haveSeedKeys = new Set(existing.map((e) => e.seedKey).filter(Boolean));
      const haveNames = new Set(existing.map((e) => e.name));
      const toAdd = [];
      for (const seed of SEED_EXERCISES) {
        const key = seedKeyOf(seed);
        if (haveSeedKeys.has(key) || haveNames.has(seed.name)) continue; // ya está
        toAdd.push({
          id: uid(), userId, isCustom: false, createdAt: new Date().toISOString(),
          seedKey: key, ...seed,
        });
      }
      if (toAdd.length) await repo.bulkAddExercises(toAdd);
    },

    /**
     * Reconcilia los iconos de los ejercicios semilla (no custom) con el
     * catálogo actual (peer review #14). Empareja por `seedKey` estable; para
     * ejercicios sembrados antes de existir seedKey, cae a emparejar por nombre
     * y de paso les asigna el seedKey. Nunca toca ejercicios del usuario.
     */
    async reconcileSeedIcons() {
      const existing = await repo.listExercises(userId);
      const bySeedKey = Object.fromEntries(SEED_EXERCISES.map((s) => [seedKeyOf(s), s]));
      const byName = Object.fromEntries(SEED_EXERCISES.map((s) => [s.name, s]));
      const toUpdate = [];
      for (const ex of existing) {
        if (ex.isCustom) continue;
        const seed = (ex.seedKey && bySeedKey[ex.seedKey]) || byName[ex.name];
        if (!seed) continue;
        const patch = {};
        if (!ex.seedKey) patch.seedKey = seedKeyOf(seed); // backfill
        if (seed.icon && seed.icon !== ex.icon) patch.icon = seed.icon;
        if (Object.keys(patch).length) toUpdate.push({ ...ex, ...patch });
      }
      if (toUpdate.length) await repo.bulkAddExercises(toUpdate);
    },

    /**
     * Rellena repMin/repMax en los planExercises que aún no los tengan,
     * derivándolos de su targetReps (rango centrado ±2). Migración no destructiva:
     * no toca los que ya tengan rango ni ningún otro campo. Idempotente.
     */
    async reconcilePlanExerciseRanges() {
      // Short-circuit barato: sin planes no hay nada que migrar (evita cargar
      // planDays/planExercises en cada arranque una vez el usuario aún no tiene plan).
      const plans = await repo.listPlans(userId);
      if (plans.length === 0) return;
      const { deriveRepRange } = await import('./progression.js');
      const all = await repo.listAllPlanExercises(userId);
      const toUpdate = [];
      for (const pe of all) {
        if (pe.repMin > 0 && pe.repMax > 0) continue; // ya migrado
        const { min, max } = deriveRepRange(pe.targetReps);
        toUpdate.push({ ...pe, repMin: min, repMax: max });
      }
      if (toUpdate.length) await repo.bulkPutPlanExercises(toUpdate);
    },

    /** Backup diario: si hoy no hay backup, lo crea (RF-50). */
    async ensureDailyBackup() {
      const key = dateKey();
      const exists = await repo.hasBackupForDate(key, userId);
      if (!exists) await repo.saveBackup(key, userId);
    },

    /**
     * Registra una serie y evalúa PR (RF-21, RF-26, RF-27).
     * @returns {{set:object, isPR:boolean, pr:object|null}}
     */
    async logSet({ sessionId, exercise, setNumber, weight, reps, restTakenSeconds = null, isWarmup = false, rir = null }) {
      const currentPR = await repo.getPR(exercise.id, userId);
      const setForCheck = { weight, reps };
      // Las series de calentamiento (B9) NO compiten por el récord: no cuentan
      // como PR ni refrescan su fecha, aunque el 1RM fuese alto.
      const newPR = !isWarmup && isNewPR(setForCheck, currentPR);
      const tiePR = !isWarmup && !newPR && isTiePR(setForCheck, currentPR);

      // Descanso real estable (peer review #10): medido desde el loggedAt de la
      // última serie ya registrada de la sesión, no desde memoria de la vista.
      let realRest = restTakenSeconds;
      if (realRest == null) {
        const prevSet = await repo.lastSetOfSession(sessionId);
        if (prevSet) {
          realRest = Math.max(0, Math.round((Date.now() - new Date(prevSet.loggedAt)) / 1000));
        }
      }

      const set = await repo.logSet({
        sessionId,
        userId,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        setNumber,
        weight,
        reps,
        restTakenSeconds: realRest,
        isWarmup: !!isWarmup,
        // RIR (reps en reserva) opcional (B10): metadato de esfuerzo percibido.
        // No afecta PR ni volumen; null si el usuario no lo indica.
        rir: Number.isFinite(rir) ? rir : null,
        isPR: newPR,
      });

      let pr = currentPR;
      if (newPR) {
        pr = await repo.savePR(buildPR({ exerciseId: exercise.id, weight, reps, loggedAt: set.loggedAt }, userId));
      } else if (tiePR) {
        // Empate: NO se celebra ni se mueve la fecha. El PR conserva la fecha en
        // que se logró POR PRIMERA VEZ (la más antigua). Política unificada con
        // bestPRFromSets (A1 peer review #1): así, al editar/borrar cualquier
        // serie, recomputePR no "salta" la fecha del récord hacia atrás.
        pr = currentPR;
      }
      return { set, isPR: newPR, pr };
    },

    /**
     * Recalcula y persiste el PR de un ejercicio desde TODO su historial (A1).
     * Si no queda ninguna serie válida, borra el PR. Devuelve el PR resultante
     * (o null). Es la red de seguridad tras editar/borrar una serie: el récord
     * nunca queda "congelado" en una marca que ya no existe.
     */
    async recomputePR(exerciseId) {
      const sets = await repo.listSetsForExercise(exerciseId);
      const best = bestPRFromSets(sets, exerciseId, userId);
      if (!best) {
        await repo.deletePR(exerciseId, userId);
        return null;
      }
      return repo.savePR(best);
    },

    /**
     * Edita una serie ya registrada (A1): cambia peso/reps (y opcionalmente
     * isWarmup) y recomputa el PR del ejercicio por si la serie tocada era la
     * que lo marcaba (o deja de serlo / pasa a serlo). No cambia setCount: sigue
     * existiendo una serie.
     * @returns {Promise<{set:object, pr:object|null}>}
     */
    async editSet(setId, { weight, reps, isWarmup, rir } = {}) {
      const existing = await repo.getSet(setId);
      if (!existing) return { set: null, pr: null, isPR: false };
      // 1RM del récord ANTES de editar, para saber si la edición bate PR.
      const prBefore = await repo.getPR(existing.exerciseId, userId);
      const rmBefore = prBefore?.estimated1RM ?? 0;

      const patch = {};
      if (weight != null) patch.weight = weight;
      if (reps != null) patch.reps = reps;
      if (isWarmup != null) patch.isWarmup = !!isWarmup; // marcar/desmarcar calentamiento (B9)
      if (rir !== undefined) patch.rir = Number.isFinite(rir) ? rir : null; // RIR opcional (B10)
      const set = await repo.updateLoggedSet(setId, patch);
      const pr = await this.recomputePR(existing.exerciseId);
      // El flag isPR de cada serie se mantiene coherente con el PR recomputado.
      await this.reconcileSetPRFlags(existing.exerciseId, pr);
      // ¿La edición de ESTA serie estableció un récord nuevo? (para celebrar en UI)
      // Una serie de calentamiento nunca cuenta como récord.
      const isPR = !set.isWarmup && !!pr && estimate1RM(set.weight, set.reps) >= pr.estimated1RM
        && pr.estimated1RM > rmBefore + 1e-6;
      return { set, pr, isPR };
    },

    /**
     * Borra una serie ya registrada (A1): la elimina, ajusta el setCount de la
     * sesión (lo hace el repo) y recomputa el PR del ejercicio. Si la sesión se
     * queda sin series, deja de ser válida automáticamente (setCount=0).
     * @returns {Promise<{pr:object|null, sessionEmptied:boolean}>}
     */
    async removeSet(setId) {
      const existing = await repo.getSet(setId);
      if (!existing) return { pr: null, sessionEmptied: false };
      await repo.deleteLoggedSet(setId);
      const pr = await this.recomputePR(existing.exerciseId);
      await this.reconcileSetPRFlags(existing.exerciseId, pr);
      // Si al borrar la sesión se quedó sin series, se descarta aquí mismo para
      // no dejar sesiones fantasma colgando (A1 peer review #5): el barrido ya
      // no depende de que el usuario pulse Terminar/Salir.
      const session = await repo.getSession(existing.sessionId);
      const sessionEmptied = session ? (session.setCount ?? 0) === 0 : false;
      if (sessionEmptied) await repo.discardSessionIfEmpty(existing.sessionId);
      return { pr, sessionEmptied };
    },

    /**
     * Marca con isPR=true solo la serie que corresponde al PR vigente del
     * ejercicio y a false el resto, tras recomputar. Mantiene coherente el flag
     * que usa la UI para pintar la serie-récord.
     */
    async reconcileSetPRFlags(exerciseId, pr) {
      const sets = await repo.listSetsForExercise(exerciseId);
      // Candidatas: las que casan 1RM + fecha con el PR. Puede haber más de una
      // si comparten 1RM y timestamp (p.ej. backup restaurado). Marcamos UNA
      // sola (la de menor id, determinista) para no pintar dos trofeos (#4).
      const matches = pr
        ? sets.filter((s) =>
            !s.isWarmup &&
            Math.abs(estimate1RM(s.weight, s.reps) - pr.estimated1RM) < 1e-6 &&
            new Date(s.loggedAt).getTime() === new Date(pr.achievedAt).getTime())
        : [];
      const chosenId = matches.length
        ? matches.map((s) => s.id).sort()[0]
        : null;
      for (const s of sets) {
        const isThePR = s.id === chosenId;
        if (!!s.isPR !== isThePR) await repo.updateLoggedSet(s.id, { isPR: isThePR });
      }
    },

    /** Inicia una sesión calculando su semana/día efectivos (RB-1). */
    async startSession(plan, planDay) {
      const settings = await repo.getSettings(userId);
      const sessionsDone = await repo.countSessions(plan.id);
      const { effectiveWeek, dayNumber } = positionForNewSession(sessionsDone, plan.daysPerWeek);
      return repo.startSession(
        { planId: plan.id, planDayId: planDay.id, effectiveWeek, dayNumber },
        userId
      );
    },

    /** Posición actual (para la cabecera "Semana XX · Día N de M"). */
    async currentPosition(plan) {
      const sessionsDone = await repo.countSessions(plan.id);
      return currentPosition(sessionsDone, plan.daysPerWeek);
    },

    /** Resumen para la pantalla de progreso. */
    async progressSummary() {
      const settings = await repo.getSettings(userId);
      const [sessions, sets, prs] = await Promise.all([
        repo.countAllSessions(userId),
        repo.countAllSets(userId),
        repo.countPRs(userId),
      ]);
      return { settings, sessions, sets, prs };
    },

    /**
     * Historial de un ejercicio para su pantalla de evolución (A2).
     * Agrupa todas las series registradas por sesión y, por cada sesión en que
     * se hizo el ejercicio, calcula la MEJOR serie (por 1RM estimado) y el
     * volumen (nº de series). Devuelve los puntos en orden cronológico, listos
     * para graficar la progresión de 1RM/peso, más el PR vigente.
     * @returns {Promise<{points:Array<{date,best1RM,bestWeight,bestReps,sets}>, pr:object|null, totalSets:number}>}
     */
    async exerciseHistory(exerciseId) {
      const raw = await repo.listSetsForExercise(exerciseId);
      // Las series de calentamiento no cuentan para la evolución de 1RM ni para
      // el total de series "de trabajo" (B9): coherente con PR/volumen.
      const all = raw.filter((s) => !s.isWarmup);
      // Agrupar por sesión.
      const bySession = new Map();
      for (const s of all) {
        if (!bySession.has(s.sessionId)) bySession.set(s.sessionId, []);
        bySession.get(s.sessionId).push(s);
      }
      const points = [];
      for (const [, sets] of bySession) {
        // Mejor serie de la sesión por 1RM; fecha = la más temprana de la sesión.
        let best = sets[0];
        for (const s of sets) {
          if (estimate1RM(s.weight, s.reps) > estimate1RM(best.weight, best.reps)) best = s;
        }
        const date = sets
          .map((s) => s.loggedAt)
          .sort((a, b) => new Date(a) - new Date(b))[0];
        points.push({
          date,
          best1RM: Math.round(estimate1RM(best.weight, best.reps) * 10) / 10,
          bestWeight: best.weight,
          bestReps: best.reps,
          sets: sets.length,
        });
      }
      points.sort((a, b) => new Date(a.date) - new Date(b.date));
      const pr = await repo.getPR(exerciseId, userId);
      return { points, pr, totalSets: all.length };
    },

    /**
     * Aviso de estancamiento de la última semana efectiva COMPLETADA (RB-4).
     *
     * Correcciones de la peer review (#2, #3):
     *  - Evalúa la última semana CERRADA (todos sus días hechos), no la semana
     *    en curso: no tiene sentido avisar de estancamiento a media semana.
     *  - Compara el mejor 1RM de la semana con el mejor 1RM HISTÓRICO ANTERIOR
     *    a esa semana (reconstruido desde las series previas), no con el PR
     *    vigente (que ya incluye lo batido durante la propia semana).
     * @returns {{week:number, plateaus:Array}}
     */
    async weeklyPlateaus() {
      const plan = await repo.getActivePlan(userId);
      if (!plan) return { week: 0, plateaus: [] };

      const dpw = Math.max(1, plan.daysPerWeek);
      const sessionsDone = await repo.countSessions(plan.id);
      // Nº de semanas completas cerradas. Si no hay ninguna, no evaluamos.
      const completedWeeks = Math.floor(sessionsDone / dpw);
      if (completedWeeks === 0) return { week: 0, plateaus: [] };
      const week = completedWeeks; // la última semana completa

      // Sesiones válidas del plan, ordenadas cronológicamente, con sus series.
      const valid = (await repo.listValidSessions(userId))
        .filter((s) => s.planId === plan.id)
        .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));

      // Índices de sesión que pertenecen a la semana evaluada (1-based).
      const startIdx = (week - 1) * dpw;
      const endIdx = week * dpw; // exclusivo
      const weekSessions = valid.slice(startIdx, endIdx);
      const priorSessions = valid.slice(0, startIdx);
      if (weekSessions.length === 0) return { week, plateaus: [] };

      const setsOf = async (sessionList) => {
        const out = [];
        for (const s of sessionList) out.push(...(await repo.listSetsForSession(s.id)));
        // Las series de calentamiento no cuentan para el 1RM ni el estancamiento (B9).
        return out.filter((s) => !s.isWarmup);
      };
      const weekSets = await setsOf(weekSessions);
      const priorSets = await setsOf(priorSessions);

      // Mejor 1RM histórico ANTERIOR a la semana, por ejercicio.
      const prByExercise = {};
      for (const s of priorSets) {
        const rm = estimate1RM(s.weight, s.reps);
        const prev = prByExercise[s.exerciseId];
        if (!prev || rm > prev.estimated1RM) {
          prByExercise[s.exerciseId] = { estimated1RM: rm, achievedAt: s.loggedAt };
        }
      }

      const { findPlateaus } = await import('./plateau.js');
      const plateaus = findPlateaus(
        weekSets.map((s) => ({ exerciseId: s.exerciseId, exerciseName: s.exerciseName, weight: s.weight, reps: s.reps })),
        prByExercise
      );
      return { week, plateaus };
    },

    /**
     * Mejor serie (por 1RM) de la última SESIÓN previa en que se hizo el
     * ejercicio. Sirve para autorrelleno y sugerencia de progresión (#1, #2).
     * @returns {Promise<{weight:number, reps:number, sets:Array}|null>}
     */
    async lastPerformance(exerciseId, excludeSessionId = null) {
      const all = await repo.listSetsForExercise(exerciseId);
      // Ignora calentamientos: el autorrelleno/sugerencia parte de series reales (B9).
      const prior = all.filter((s) => s.sessionId !== excludeSessionId && !s.isWarmup);
      if (prior.length === 0) return null;
      // Sesión previa más reciente.
      const latestId = prior.sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt))[0].sessionId;
      const sets = prior.filter((s) => s.sessionId === latestId).sort((a, b) => a.setNumber - b.setNumber);
      // Mejor serie de esa sesión por 1RM estimado.
      let best = sets[0];
      for (const s of sets) if (estimate1RM(s.weight, s.reps) > estimate1RM(best.weight, best.reps)) best = s;
      return { weight: best.weight, reps: best.reps, sets };
    },

    /**
     * Sugerencia de progresión para un ejercicio (#1). Combina la última
     * actuación con el objetivo del plan y el tipo de equipo.
     */
    async suggestionFor(exercise, planExercise, excludeSessionId = null) {
      const last = await this.lastPerformance(exercise.id, excludeSessionId);
      const { suggestNext, deriveRepRange } = await import('./progression.js');
      // Rango objetivo del ejercicio. Si el plan es antiguo y aún no tiene rango
      // (migración no aplicada todavía), se deriva al vuelo del targetReps.
      const repRange =
        planExercise?.repMin > 0 && planExercise?.repMax > 0
          ? { min: planExercise.repMin, max: planExercise.repMax }
          : deriveRepRange(planExercise?.targetReps);
      // Unidad de presentación del usuario (B11): el texto del coach se muestra en ella.
      const settings = await repo.getSettings(userId);
      return suggestNext({
        lastBest: last ? { weight: last.weight, reps: last.reps } : null,
        target: { targetReps: planExercise?.targetReps, targetWeight: planExercise?.targetWeight },
        repRange,
        equipment: exercise.equipment,
        unit: settings.unit === 'lb' ? 'lb' : 'kg',
      });
    },

    /**
     * Volumen por grupo muscular (#4). Devuelve el volumen de la semana en
     * curso; si esta acaba de empezar (0 series aún, justo tras cerrar una
     * semana) devuelve el de la última semana completa marcándolo con
     * `isCompletedWeek=true` para que la UI lo etiquete correctamente.
     * @returns {Promise<{ranking:Array<{muscle,sets}>, isCompletedWeek:boolean}>}
     */
    async weeklyVolume() {
      const plan = await repo.getActivePlan(userId);
      if (!plan) return { ranking: [], isCompletedWeek: false };
      const dpw = Math.max(1, plan.daysPerWeek);
      const valid = (await repo.listValidSessions(userId))
        .filter((s) => s.planId === plan.id)
        .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));

      const doneWeeks = Math.floor(valid.length / dpw);
      const weekSessions = valid.slice(doneWeeks * dpw); // resto = semana en curso
      // Si la semana en curso aún no tiene series, mostramos la última completa.
      const isCompletedWeek = weekSessions.length === 0 && valid.length > 0;
      const target = weekSessions.length ? weekSessions : valid.slice(-dpw);

      const exercises = await repo.listExercises(userId);
      const muscleById = Object.fromEntries(exercises.map((e) => [e.id, e.muscleGroup]));
      const sets = [];
      for (const s of target) {
        const ss = await repo.listSetsForSession(s.id);
        // Las series de calentamiento no suman volumen efectivo (B9).
        for (const st of ss) if (!st.isWarmup) sets.push({ muscleGroup: muscleById[st.exerciseId] });
      }
      const { volumeByMuscle, volumeRanking, volumeStatus } = await import('./volume.js');
      // Objetivo de series/semana por músculo (C13) y semáforo contra él. Si el
      // ajuste no existe (instalación anterior a C13), se usa el default; un 0
      // explícito del usuario desactiva el semáforo.
      const settings = await repo.getSettings(userId);
      const rawTarget = settings.weeklyVolumeTarget ?? DEFAULT_SETTINGS.weeklyVolumeTarget;
      const volTarget = Number(rawTarget) || 0;
      const ranking = volumeRanking(volumeByMuscle(sets)).map((r) => ({
        ...r,
        target: volTarget,
        status: volumeStatus(r.sets, volTarget),
      }));
      return { ranking, isCompletedWeek, target: volTarget };
    },

    /** Guarda una nota de texto libre en una sesión (#5). */
    async setSessionNote(sessionId, note) {
      return repo.updateSessionNote(sessionId, note);
    },

    /** Guarda la nota de un ejercicio concreto dentro de la sesión (B8). */
    async setExerciseNote(sessionId, exerciseId, note) {
      return repo.updateSessionExerciseNote(sessionId, exerciseId, note);
    },

    /**
     * Resumen de cierre de una sesión (C12): series de trabajo, volumen total
     * movido (Σ peso×reps en kg) y nº de récords logrados. Las series de
     * calentamiento NO cuentan para series ni volumen (coherente con B9); el
     * volumen se devuelve en kg (la UI lo convierte a la unidad del usuario).
     * @returns {Promise<{sets:number, totalVolumeKg:number, prs:number}>}
     */
    async sessionSummary(sessionId) {
      const all = await repo.listSetsForSession(sessionId);
      const working = all.filter((s) => !s.isWarmup);
      const totalVolumeKg = working.reduce((acc, s) => acc + (s.weight || 0) * (s.reps || 0), 0);
      const prs = all.filter((s) => s.isPR).length;
      return { sets: working.length, totalVolumeKg: Math.round(totalVolumeKg * 10) / 10, prs };
    },

    /**
     * Estadísticas de descansos reales y duración de sesiones (RF-28, RF-34).
     * @returns {{avgRest:number, restSamples:number[], sessionDurations:Array}}
     */
    async restAndDurationStats() {
      const sessions = await repo.listSessions(userId);
      const restSamples = [];
      const sessionDurations = [];
      for (const s of sessions) {
        const sets = await repo.listSetsForSession(s.id);
        for (const st of sets) {
          // Los descansos de calentamiento (cortos) no entran en la media (B9).
          if (!st.isWarmup && typeof st.restTakenSeconds === 'number' && st.restTakenSeconds > 0) {
            restSamples.push(st.restTakenSeconds);
          }
        }
        if (s.startedAt && s.finishedAt) {
          const mins = Math.round((new Date(s.finishedAt) - new Date(s.startedAt)) / 60000);
          if (mins >= 0) sessionDurations.push({ date: s.startedAt, minutes: mins });
        }
      }
      const avgRest = restSamples.length
        ? Math.round(restSamples.reduce((a, b) => a + b, 0) / restSamples.length)
        : 0;
      return { avgRest, restSamples, sessionDurations };
    },

    // Passthrough útiles para la UI (mantiene una sola puerta de entrada)
    repo,
    userId,
  };
}

export default createAppService;
