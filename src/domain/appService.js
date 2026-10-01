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
import { isNewPR, isTiePR, buildPR, estimate1RM, bestPRFromSets, scoreSet, normalizeTracking, prScore } from './personalRecord.js';
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

  /**
   * Tipo de medición de un ejercicio por su id (D16). Si el ejercicio no existe
   * o no declara `tracking` (instalación anterior a D16), devuelve el default
   * 'weight_reps', de modo que todo el histórico previo se comporta igual.
   */
  async function trackingOf(exerciseId) {
    const ex = await repo.getExercise?.(exerciseId);
    return normalizeTracking(ex?.tracking);
  }

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
        // Backfill del tipo de medición (D16): propaga el tracking del catálogo
        // a instalaciones previas y pone 'weight_reps' a los ejercicios propios.
        await this.reconcileExerciseTracking();
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
     * Backfill del tipo de medición de los ejercicios (D16). Migración no
     * destructiva para instalaciones anteriores a D16:
     *  - Ejercicios semilla: toman el `tracking` declarado en el catálogo
     *    (emparejados por seedKey, con respaldo por nombre). Los que el catálogo
     *    no declara se asumen 'weight_reps'.
     *  - Ejercicios propios (isCustom) sin tracking: 'weight_reps' por defecto.
     * Idempotente: solo escribe cuando falta el campo o difiere del catálogo.
     */
    async reconcileExerciseTracking() {
      const existing = await repo.listExercises(userId);
      const bySeedKey = Object.fromEntries(SEED_EXERCISES.map((s) => [seedKeyOf(s), s]));
      const byName = Object.fromEntries(SEED_EXERCISES.map((s) => [s.name, s]));
      const toUpdate = [];
      // Ejercicios cuyo tipo CAMBIA de verdad (no solo backfill de null): su PR,
      // si lo hay, debe recomputarse porque el score se mide ahora distinto
      // (peer review D16 #1). Protege ante backups con datos cruzados.
      const changedType = [];
      for (const ex of existing) {
        if (ex.isCustom) {
          if (ex.tracking == null) toUpdate.push({ ...ex, tracking: 'weight_reps' });
          continue;
        }
        const seed = (ex.seedKey && bySeedKey[ex.seedKey]) || byName[ex.name];
        const desired = (seed && seed.tracking) || 'weight_reps';
        if (ex.tracking !== desired) {
          toUpdate.push({ ...ex, tracking: desired });
          // Solo es un cambio real de tipo si antes había un valor distinto
          // (no un simple backfill desde null/undefined de peso+reps).
          if (ex.tracking != null && ex.tracking !== 'weight_reps') changedType.push(ex.id);
          else if (ex.tracking != null && desired !== 'weight_reps') changedType.push(ex.id);
        }
      }
      if (toUpdate.length) await repo.bulkAddExercises(toUpdate);
      // Recomputar el PR de los que cambiaron de tipo y tengan récord guardado.
      for (const exId of changedType) {
        const pr = await repo.getPR(exId, userId);
        if (pr) await this.recomputePR(exId);
      }
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
     * Resetea la app a su estado inicial (como recién instalada): borra TODOS
     * los datos del usuario y vuelve a sembrar el catálogo de ejercicios y los
     * ajustes por defecto. Operación DESTRUCTIVA; la UI exige doble confirmación
     * y ofrece exportar una copia antes.
     *
     * Reutiliza `wipeAll` (borrado transaccional) + `bootstrap` (resiembra el
     * catálogo si la tabla queda vacía y recrea los ajustes por defecto).
     */
    async resetToInitial() {
      await repo.wipeAll();
      await this.bootstrap();
    },

    /**
     * Registra una serie y evalúa PR (RF-21, RF-26, RF-27).
     * @returns {{set:object, isPR:boolean, pr:object|null}}
     */
    async logSet({ sessionId, exercise, setNumber, weight, reps, durationSeconds = null, restTakenSeconds = null, isWarmup = false, rir = null }) {
      const currentPR = await repo.getPR(exercise.id, userId);
      // Tipo de medición del ejercicio (D16): decide cómo se puntúa la serie.
      const tracking = normalizeTracking(exercise.tracking);
      const setForCheck = { weight, reps, durationSeconds };
      // Las series de calentamiento (B9) NO compiten por el récord: no cuentan
      // como PR ni refrescan su fecha, aunque la marca fuese alta.
      const newPR = !isWarmup && isNewPR(setForCheck, currentPR, tracking);
      const tiePR = !isWarmup && !newPR && isTiePR(setForCheck, currentPR, tracking);

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
        // Peso/reps/duración: null explícito cuando el tipo de medición no los
        // usa, para datos homogéneos (peer review D16 #4).
        weight: Number.isFinite(weight) ? weight : null,
        reps: Number.isFinite(reps) ? reps : null,
        // Duración en segundos para ejercicios de tiempo (D16); null si no aplica.
        durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
        restTakenSeconds: realRest,
        isWarmup: !!isWarmup,
        // RIR (reps en reserva) opcional (B10): metadato de esfuerzo percibido.
        // No afecta PR ni volumen; null si el usuario no lo indica.
        rir: Number.isFinite(rir) ? rir : null,
        isPR: newPR,
      });

      let pr = currentPR;
      if (newPR) {
        pr = await repo.savePR(buildPR({ exerciseId: exercise.id, weight, reps, durationSeconds, loggedAt: set.loggedAt }, userId, tracking));
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
      const tracking = await trackingOf(exerciseId);
      const best = bestPRFromSets(sets, exerciseId, userId, tracking);
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
    async editSet(setId, { weight, reps, durationSeconds, isWarmup, rir } = {}) {
      const existing = await repo.getSet(setId);
      if (!existing) return { set: null, pr: null, isPR: false };
      const tracking = await trackingOf(existing.exerciseId);
      // Score del récord ANTES de editar, para saber si la edición bate PR.
      const prBefore = await repo.getPR(existing.exerciseId, userId);
      const scoreBefore = prScore(prBefore);

      const patch = {};
      if (weight != null) patch.weight = weight;
      if (reps != null) patch.reps = reps;
      if (durationSeconds != null) patch.durationSeconds = durationSeconds; // ejercicios de tiempo (D16)
      if (isWarmup != null) patch.isWarmup = !!isWarmup; // marcar/desmarcar calentamiento (B9)
      if (rir !== undefined) patch.rir = Number.isFinite(rir) ? rir : null; // RIR opcional (B10)
      const set = await repo.updateLoggedSet(setId, patch);
      const pr = await this.recomputePR(existing.exerciseId);
      // El flag isPR de cada serie se mantiene coherente con el PR recomputado.
      await this.reconcileSetPRFlags(existing.exerciseId, pr);
      // ¿La edición de ESTA serie estableció un récord nuevo? (para celebrar en UI)
      // Una serie de calentamiento nunca cuenta como récord. Se compara por el
      // score genérico (1RM / reps / segundos según el tipo de medición).
      const prScoreNow = prScore(pr);
      const setScore = scoreSet(set, tracking);
      const isPR = !set.isWarmup && !!pr && setScore >= prScoreNow && prScoreNow > scoreBefore + 1e-6;
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
      const tracking = await trackingOf(exerciseId);
      const prScoreVal = prScore(pr);
      // Candidatas: las que casan score + fecha con el PR. Puede haber más de una
      // si comparten score y timestamp (p.ej. backup restaurado). Marcamos UNA
      // sola (la de menor id, determinista) para no pintar dos trofeos (#4).
      const matches = pr
        ? sets.filter((s) =>
            !s.isWarmup &&
            Math.abs(scoreSet(s, tracking) - prScoreVal) < 1e-6 &&
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

    /**
     * Días del plan ya registrados en la SEMANA EFECTIVA EN CURSO (F1). Se usa
     * para avisar (no bloquear) si el usuario va a repetir un día ya hecho esta
     * semana. La semana en curso = las últimas `sessionsDone % dpw` sesiones
     * válidas del plan, en orden cronológico por fecha real.
     * @returns {Promise<Set<string>>} conjunto de planDayId ya hechos esta semana
     */
    async currentWeekPlanDayIds(plan) {
      const dpw = Math.max(1, plan.daysPerWeek);
      const sessionsDone = await repo.countSessions(plan.id);
      const inWeek = sessionsDone % dpw; // sesiones de la semana en curso (0..dpw-1)
      if (inWeek === 0) return new Set(); // semana recién empezada: nada hecho aún
      const valid = (await repo.listValidSessions(userId))
        .filter((s) => s.planId === plan.id)
        // Orden cronológico con desempate estable por id: evita que sesiones con
        // el mismo startedAt (p.ej. restauradas de un backup) elijan mal la
        // ventana de "semana en curso" (peer review F1 #1).
        .sort((a, b) => (new Date(a.startedAt) - new Date(b.startedAt)) || String(a.id).localeCompare(String(b.id)));
      // Las últimas `inWeek` sesiones son las de la semana en curso.
      const current = valid.slice(valid.length - inWeek);
      return new Set(current.map((s) => s.planDayId).filter(Boolean));
    },

    /** El día del plan SUGERIDO para hoy (siguiente de la secuencia). F1. */
    async suggestedDay(plan) {
      const days = (await repo.listPlanDays(plan.id)).sort((a, b) => a.order - b.order);
      if (days.length === 0) return null;
      const { dayInWeek } = await this.currentPosition(plan);
      return days[(dayInWeek - 1) % days.length];
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
      const tracking = await trackingOf(exerciseId);
      // Las series de calentamiento no cuentan para la evolución ni para el
      // total de series "de trabajo" (B9): coherente con PR/volumen.
      const all = raw.filter((s) => !s.isWarmup);
      // Agrupar por sesión.
      const bySession = new Map();
      for (const s of all) {
        if (!bySession.has(s.sessionId)) bySession.set(s.sessionId, []);
        bySession.get(s.sessionId).push(s);
      }
      const points = [];
      for (const [, sets] of bySession) {
        // Mejor serie de la sesión por score (según tipo); fecha = la más
        // temprana de la sesión.
        let best = sets[0];
        for (const s of sets) {
          if (scoreSet(s, tracking) > scoreSet(best, tracking)) best = s;
        }
        const date = sets
          .map((s) => s.loggedAt)
          .sort((a, b) => new Date(a) - new Date(b))[0];
        points.push({
          date,
          // `bestScore` es el valor comparable a graficar (1RM, reps o segundos
          // según el tipo). `best1RM` se mantiene para compatibilidad y solo
          // tiene sentido en weight_reps.
          bestScore: Math.round(scoreSet(best, tracking) * 10) / 10,
          best1RM: Math.round(estimate1RM(best.weight, best.reps) * 10) / 10,
          bestWeight: best.weight,
          bestReps: best.reps,
          bestDurationSeconds: best.durationSeconds ?? 0,
          sets: sets.length,
        });
      }
      points.sort((a, b) => new Date(a.date) - new Date(b.date));
      const pr = await repo.getPR(exerciseId, userId);
      return { points, pr, totalSets: all.length, tracking };
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

      // Tipo de medición por ejercicio (D16) para puntuar cada serie con su
      // métrica (1RM / reps / segundos) en lugar de asumir peso+reps.
      const exercises = await repo.listExercises(userId);
      const trackingById = Object.fromEntries(exercises.map((e) => [e.id, normalizeTracking(e.tracking)]));
      const scoreOf = (s) => scoreSet(s, trackingById[s.exerciseId]);

      // Mejor score histórico ANTERIOR a la semana, por ejercicio.
      const prByExercise = {};
      for (const s of priorSets) {
        const sc = scoreOf(s);
        const prev = prByExercise[s.exerciseId];
        if (!prev || sc > prev.estimated1RM) {
          prByExercise[s.exerciseId] = { estimated1RM: sc, achievedAt: s.loggedAt };
        }
      }

      const { findPlateaus } = await import('./plateau.js');
      // Cada serie aporta su `score` ya calculado según el tipo de medición (D16).
      const plateaus = findPlateaus(
        weekSets.map((s) => ({ exerciseId: s.exerciseId, exerciseName: s.exerciseName, score: scoreOf(s) })),
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
      const tracking = await trackingOf(exerciseId);
      // Ignora calentamientos: el autorrelleno/sugerencia parte de series reales (B9).
      const prior = all.filter((s) => s.sessionId !== excludeSessionId && !s.isWarmup);
      if (prior.length === 0) return null;
      // Sesión previa más reciente.
      const latestId = prior.sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt))[0].sessionId;
      const sets = prior.filter((s) => s.sessionId === latestId).sort((a, b) => a.setNumber - b.setNumber);
      // Mejor serie de esa sesión por score (1RM / reps / segundos).
      let best = sets[0];
      for (const s of sets) if (scoreSet(s, tracking) > scoreSet(best, tracking)) best = s;
      return { weight: best.weight, reps: best.reps, durationSeconds: best.durationSeconds ?? 0, sets };
    },

    /**
     * Sugerencia de progresión para un ejercicio (#1). Combina la última
     * actuación con el objetivo del plan y el tipo de equipo.
     */
    async suggestionFor(exercise, planExercise, excludeSessionId = null) {
      const last = await this.lastPerformance(exercise.id, excludeSessionId);
      const tracking = normalizeTracking(exercise.tracking);
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
        lastBest: last
          ? { weight: last.weight, reps: last.reps, durationSeconds: last.durationSeconds }
          : null,
        target: {
          targetReps: planExercise?.targetReps,
          targetWeight: planExercise?.targetWeight,
          targetDurationSeconds: planExercise?.targetDurationSeconds,
        },
        repRange,
        equipment: exercise.equipment,
        unit: settings.unit === 'lb' ? 'lb' : 'kg',
        tracking,
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
     * Aviso de copia de seguridad externa (C15, RF-46). El backup diario interno
     * (tabla `backups`) protege ante errores de la app, pero NO si el usuario
     * pierde o cambia de móvil: para eso hay que exportar el fichero .json. Este
     * método decide si mostrar un recordatorio en Ajustes.
     *
     * Avisa cuando hay datos que merezca la pena proteger (al menos una sesión
     * válida) Y nunca se exportó o la última exportación fue hace más de
     * STALE_DAYS. Umbral fijo (no configurable, decisión de producto).
     * @returns {Promise<{shouldWarn:boolean, daysSince:number|null}>}
     */
    async backupReminder() {
      const STALE_DAYS = 14;
      const sessions = await repo.countAllSessions(userId);
      if (sessions < 1) return { shouldWarn: false, daysSince: null };
      const settings = await repo.getSettings(userId);
      const last = settings.lastExportAt ? new Date(settings.lastExportAt) : null;
      if (!last || Number.isNaN(last.getTime())) {
        return { shouldWarn: true, daysSince: null };
      }
      const daysSince = Math.floor((Date.now() - last.getTime()) / 86400000);
      return { shouldWarn: daysSince > STALE_DAYS, daysSince };
    },

    /**
     * Resumen de cierre de una sesión (C12 + adherencia): series de trabajo,
     * volumen total movido (Σ peso×reps en kg), nº de récords y ADHERENCIA al
     * plan del día (cuántos de los ejercicios planificados se tocaron y cuáles
     * quedaron sin hacer). Las series de calentamiento NO cuentan para series ni
     * volumen (B9), pero un ejercicio con SOLO calentamiento SÍ cuenta como
     * "hecho" para adherencia (fuiste y lo tocaste; asistencia ≠ productividad).
     *
     * La adherencia no penaliza nada (semana efectiva, racha y validez de la
     * sesión siguen dependiendo solo de setCount>0): es puramente informativa.
     * @returns {Promise<{sets:number, totalVolumeKg:number, prs:number,
     *   plannedCount:number, doneCount:number, skipped:Array<{id:string,name:string}>}>}
     */
    async sessionSummary(sessionId) {
      const all = await repo.listSetsForSession(sessionId);
      const working = all.filter((s) => !s.isWarmup);
      const totalVolumeKg = working.reduce((acc, s) => acc + (s.weight || 0) * (s.reps || 0), 0);
      const prs = all.filter((s) => s.isPR).length;

      // Adherencia: cruza los ejercicios PLANIFICADOS del día (vía session.planDayId)
      // con los que tienen al menos UNA serie registrada en esta sesión.
      const adherence = await this.sessionAdherence(sessionId);

      return {
        sets: working.length,
        totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
        prs,
        ...adherence,
      };
    },

    /**
     * Adherencia al plan de una sesión: compara los ejercicios planificados del
     * día (session.planDayId) con los que efectivamente se registraron (≥1
     * serie). Devuelve el conteo y la lista de los que quedaron sin hacer.
     *
     * Nota: la sesión guarda `planDayId` pero NO congela los planExercises; si el
     * plan se editó tras entrenar, esto refleja el plan ACTUAL del día. Es una
     * limitación conocida y aceptable (no hay histórico del plan). Si el día ya
     * no existe o no tiene ejercicios, la adherencia es vacía (plannedCount=0).
     * @returns {Promise<{plannedCount:number, doneCount:number, skipped:Array<{id,name}>}>}
     */
    async sessionAdherence(sessionId) {
      const session = await repo.getSession(sessionId);
      if (!session || !session.planDayId) return { plannedCount: 0, doneCount: 0, skipped: [] };
      const planned = await repo.listPlanExercises(session.planDayId);
      if (planned.length === 0) return { plannedCount: 0, doneCount: 0, skipped: [] };

      const sets = await repo.listSetsForSession(sessionId);
      const doneIds = new Set(sets.map((s) => s.exerciseId));
      const exercises = await repo.listExercises(userId);
      const nameById = Object.fromEntries(exercises.map((e) => [e.id, e.name]));

      // Se cuenta por EJERCICIO ÚNICO, no por fila (peer review adherencia #1):
      // si el mismo ejercicio aparece dos veces en el día no debe contar doble
      // ni duplicarse en la lista de "faltó". En una superserie/circuito (D17)
      // los miembros tienen exerciseId distintos, así que siguen contando aparte.
      const plannedIds = [...new Set(planned.map((pe) => pe.exerciseId))];
      const skipped = plannedIds
        .filter((id) => !doneIds.has(id))
        .map((id) => ({ id, name: nameById[id] ?? '—' }));
      return {
        plannedCount: plannedIds.length,
        doneCount: plannedIds.length - skipped.length,
        skipped,
      };
    },

    /**
     * Estimación de duración y viabilidad de un día del plan (punto 2). Combina
     * los planExercises del día con el tiempo estimado por serie (ajuste global)
     * y el tiempo disponible, y devuelve si cabe + sugerencias de recorte.
     *
     * El tiempo disponible se toma, por orden: el `overrideMinutes` (lo que el
     * usuario declara al empezar hoy), si no el `targetDurationMin` guardado en
     * el día, si no 0 (sin objetivo → siempre "cabe").
     * @param {string} planDayId
     * @param {number|null} [overrideMinutes] tiempo disponible declarado ahora
     * @returns {Promise<{estimatedMinutes, availableMinutes, fits, overByMinutes, suggestions:Array}>}
     */
    async dayDurationEstimate(planDayId, overrideMinutes = null) {
      const { estimateDaySeconds, assessFit, suggestCuts } = await import('./duration.js');
      const planExercises = await repo.listPlanExercises(planDayId);
      const day = await repo.getPlanDay?.(planDayId);
      const settings = await repo.getSettings(userId);
      const exercises = await repo.listExercises(userId);
      const trackingById = Object.fromEntries(exercises.map((e) => [e.id, normalizeTracking(e.tracking)]));

      const availableMinutes = Number.isFinite(overrideMinutes) && overrideMinutes != null
        ? overrideMinutes
        : (day?.targetDurationMin ?? 0);

      const est = estimateDaySeconds(planExercises, trackingById, settings);
      const fit = assessFit(est.totalSeconds, availableMinutes);
      const suggestions = availableMinutes > 0 && !fit.fits
        ? suggestCuts({ planExercises, trackingById, settings, availableMinutes })
        : [];
      return { ...fit, suggestions };
    },

    /**
     * Cierra una sesión: marca su fin y PERSISTE la adherencia (ids de los
     * ejercicios planificados que quedaron sin hacer, más plannedCount/doneCount)
     * como SNAPSHOT del momento de cierre. No penaliza nada: es informativa.
     *
     * Fuente de verdad (peer review adherencia #2): el overlay de cierre usa el
     * RECÁLCULO en vivo (sessionAdherence sobre el plan actual), que coincide con
     * el snapshot justo al cerrar. El snapshot persistido se guarda a propósito
     * para un futuro historial de adherencia (y lo aprovechará el punto 2,
     * duración/viabilidad), donde sí interesa la foto congelada del día aunque
     * luego se edite el plan. Hoy ninguna pantalla lo lee todavía.
     *
     * Debe llamarse en vez de repo.finishSession (que queda solo para tests de
     * bajo nivel). Las sesiones fantasma se descartan ANTES, así que aquí la
     * sesión siempre es válida.
     * @returns {Promise<void>}
     */
    async finishSession(sessionId) {
      const { skipped, plannedCount, doneCount } = await this.sessionAdherence(sessionId);
      await repo.updateSession(sessionId, {
        finishedAt: new Date().toISOString(),
        skippedExerciseIds: skipped.map((s) => s.id),
        plannedCount,
        doneCount,
      });
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
