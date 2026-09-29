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
import { isNewPR, buildPR } from './personalRecord.js';
import { positionForNewSession, currentPosition } from './effectiveWeek.js';
import { dateKey } from './dateKey.js';

export function createAppService(repo = repository, userId = APP.defaultUserId) {
  const uid = () =>
    (crypto?.randomUUID?.() ?? 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));

  return {
    /** Arranque: siembra ejercicios, asegura ajustes y hace backup diario. */
    async bootstrap() {
      const count = await repo.countExercises(userId);
      if (count === 0) {
        const seeded = SEED_EXERCISES.map((e) => ({
          id: uid(), userId, isCustom: false, createdAt: new Date().toISOString(), ...e,
        }));
        await repo.bulkAddExercises(seeded);
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

      const set = await repo.logSet({
        sessionId,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        setNumber,
        weight,
        reps,
        restTakenSeconds,
        isPR: newPR,
      });

      let pr = currentPR;
      if (newPR) {
        pr = await repo.savePR(buildPR({ exerciseId: exercise.id, weight, reps, loggedAt: set.loggedAt }, userId));
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
     * Aviso de estancamiento de la ÚLTIMA semana efectiva con actividad (RB-4).
     * Compara el mejor 1RM de cada ejercicio esa semana con el PR vigente.
     * @returns {{week:number, plateaus:Array}}
     */
    async weeklyPlateaus() {
      const plan = await repo.getActivePlan(userId);
      if (!plan) return { week: 0, plateaus: [] };
      const sessions = await repo.listSessions(userId);
      const planSessions = sessions.filter((s) => s.planId === plan.id && s.effectiveWeek);
      if (planSessions.length === 0) return { week: 0, plateaus: [] };

      // Semana efectiva más alta con sesiones
      const week = Math.max(...planSessions.map((s) => s.effectiveWeek));
      const weekSessionIds = new Set(
        planSessions.filter((s) => s.effectiveWeek === week).map((s) => s.id)
      );

      // Series de esa semana
      const allSets = [];
      for (const sid of weekSessionIds) {
        const sets = await repo.listSetsForSession(sid);
        allSets.push(...sets);
      }
      // PR vigente por ejercicio
      const prs = await repo.listPRs(userId);
      const prByExercise = Object.fromEntries(
        prs.map((p) => [p.exerciseId, { estimated1RM: p.estimated1RM, achievedAt: p.achievedAt }])
      );

      const { findPlateaus } = await import('./plateau.js');
      const plateaus = findPlateaus(
        allSets.map((s) => ({ exerciseId: s.exerciseId, exerciseName: s.exerciseName, weight: s.weight, reps: s.reps })),
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
