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
import { isNewPR, isTiePR, buildPR, estimate1RM } from './personalRecord.js';
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
        // Migración de iconos: si el catálogo cambió las claves de icono, se
        // reconcilian por nombre para los ejercicios semilla (no custom). Así el
        // usuario ve los pictogramas nuevos sin borrar sus datos.
        await this.reconcileSeedIcons();
      }
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
    async logSet({ sessionId, exercise, setNumber, weight, reps, restTakenSeconds = null }) {
      const currentPR = await repo.getPR(exercise.id, userId);
      const setForCheck = { weight, reps };
      const newPR = isNewPR(setForCheck, currentPR);
      const tiePR = !newPR && isTiePR(setForCheck, currentPR);

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
        isPR: newPR,
      });

      let pr = currentPR;
      if (newPR) {
        pr = await repo.savePR(buildPR({ exerciseId: exercise.id, weight, reps, loggedAt: set.loggedAt }, userId));
      } else if (tiePR) {
        // Empate: refresca la fecha del récord vigente, sin celebrar (peer review #11).
        pr = await repo.savePR({ ...currentPR, achievedAt: set.loggedAt });
      }
      return { set, isPR: newPR, pr };
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
        return out;
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
          if (typeof st.restTakenSeconds === 'number' && st.restTakenSeconds > 0) {
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
