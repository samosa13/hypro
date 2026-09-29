/**
 * CAPA DATOS · Repositorio local (IndexedDB)
 *
 * CONTRATO: la UI y el dominio solo conocen los métodos públicos de este objeto.
 * El día que exista backend, se crea un `cloudRepository.js` con EXACTAMENTE los
 * mismos métodos y se cambia qué repositorio se exporta (ver factoría abajo).
 * Ni UI ni dominio se enteran del cambio.
 *
 * Todos los métodos operan sobre un `userId` (multitenant-ready).
 */

import { db } from './database.js';
import { APP, DEFAULT_SETTINGS } from '../config/app.config.js';

const uid = () =>
  (crypto?.randomUUID?.() ??
    'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));

export const repository = {
  // ---------- Ejercicios ----------
  async listExercises(userId = APP.defaultUserId) {
    return db.exercises.where('userId').equals(userId).toArray();
  },
  async addExercise(exercise, userId = APP.defaultUserId) {
    const record = { id: uid(), userId, isCustom: true, createdAt: new Date().toISOString(), ...exercise };
    await db.exercises.put(record);
    return record;
  },
  async bulkAddExercises(exercises) {
    await db.exercises.bulkPut(exercises);
  },
  async countExercises(userId = APP.defaultUserId) {
    return db.exercises.where('userId').equals(userId).count();
  },

  // ---------- Planes ----------
  async getActivePlan(userId = APP.defaultUserId) {
    const plans = await db.plans.where('userId').equals(userId).toArray();
    return plans.find((p) => p.isActive) ?? null;
  },
  async listPlans(userId = APP.defaultUserId) {
    return db.plans.where('userId').equals(userId).toArray();
  },
  async savePlan(plan, userId = APP.defaultUserId) {
    const record = { id: plan.id ?? uid(), userId, createdAt: plan.createdAt ?? new Date().toISOString(), ...plan };
    await db.plans.put(record);
    return record;
  },
  async setActivePlan(planId, userId = APP.defaultUserId) {
    const plans = await db.plans.where('userId').equals(userId).toArray();
    await db.transaction('rw', db.plans, async () => {
      for (const p of plans) {
        await db.plans.update(p.id, { isActive: p.id === planId });
      }
    });
  },

  // ---------- Días del plan ----------
  async listPlanDays(planId) {
    const days = await db.planDays.where('planId').equals(planId).toArray();
    return days.sort((a, b) => a.order - b.order);
  },
  async savePlanDay(day) {
    const record = { id: day.id ?? uid(), ...day };
    await db.planDays.put(record);
    return record;
  },
  async deletePlanDay(dayId) {
    await db.transaction('rw', db.planDays, db.planExercises, async () => {
      await db.planExercises.where('planDayId').equals(dayId).delete();
      await db.planDays.delete(dayId);
    });
  },

  // ---------- Ejercicios de un día ----------
  async listPlanExercises(planDayId) {
    const items = await db.planExercises.where('planDayId').equals(planDayId).toArray();
    return items.sort((a, b) => a.order - b.order);
  },
  async savePlanExercise(pe) {
    const record = { id: pe.id ?? uid(), ...pe };
    await db.planExercises.put(record);
    return record;
  },
  async deletePlanExercise(id) {
    await db.planExercises.delete(id);
  },

  // ---------- Sesiones ----------
  async countSessions(planId) {
    return db.sessions.where('planId').equals(planId).count();
  },
  async countAllSessions(userId = APP.defaultUserId) {
    return db.sessions.where('userId').equals(userId).count();
  },
  async listSessions(userId = APP.defaultUserId) {
    return db.sessions.where('userId').equals(userId).toArray();
  },
  async startSession(session, userId = APP.defaultUserId) {
    const record = { id: uid(), userId, startedAt: new Date().toISOString(), finishedAt: null, ...session };
    await db.sessions.put(record);
    return record;
  },
  async finishSession(sessionId) {
    await db.sessions.update(sessionId, { finishedAt: new Date().toISOString() });
  },

  // ---------- Series registradas ----------
  async listSetsForSession(sessionId) {
    return db.loggedSets.where('sessionId').equals(sessionId).toArray();
  },
  async listSetsForExercise(exerciseId) {
    return db.loggedSets.where('exerciseId').equals(exerciseId).toArray();
  },
  async countAllSets(userId = APP.defaultUserId) {
    // loggedSets no lleva userId directo; contamos por sesiones del usuario.
    const sessions = await db.sessions.where('userId').equals(userId).toArray();
    const ids = new Set(sessions.map((s) => s.id));
    const all = await db.loggedSets.toArray();
    return all.filter((s) => ids.has(s.sessionId)).length;
  },
  async logSet(set) {
    const record = { id: uid(), loggedAt: new Date().toISOString(), isPR: false, ...set };
    await db.loggedSets.put(record);
    return record;
  },

  // ---------- Récords personales ----------
  async getPR(exerciseId, userId = APP.defaultUserId) {
    const prs = await db.personalRecords.where('exerciseId').equals(exerciseId).toArray();
    return prs.find((p) => p.userId === userId) ?? null;
  },
  async listPRs(userId = APP.defaultUserId) {
    return db.personalRecords.where('userId').equals(userId).toArray();
  },
  async savePR(pr) {
    // Un PR por (userId, exerciseId): buscamos el existente para reutilizar id.
    const existing = await this.getPR(pr.exerciseId, pr.userId);
    const record = { id: existing?.id ?? uid(), ...pr };
    await db.personalRecords.put(record);
    return record;
  },
  async countPRs(userId = APP.defaultUserId) {
    return db.personalRecords.where('userId').equals(userId).count();
  },

  // ---------- Ajustes ----------
  async getSettings(userId = APP.defaultUserId) {
    let s = await db.settings.get(userId);
    if (!s) {
      s = { userId, ...DEFAULT_SETTINGS };
      await db.settings.put(s);
    }
    return s;
  },
  async saveSettings(settings, userId = APP.defaultUserId) {
    const record = { ...settings, userId };
    await db.settings.put(record);
    return record;
  },

  // ---------- Backup / export / import ----------
  async hasBackupForDate(dateKey, userId = APP.defaultUserId) {
    const all = await db.backups.where('dateKey').equals(dateKey).toArray();
    return all.some((b) => b.userId === userId);
  },
  async exportAll(userId = APP.defaultUserId) {
    // Volcado completo (round-trip con importAll).
    return {
      meta: { app: APP.name, dataVersion: APP.dataVersion, exportedAt: new Date().toISOString(), userId },
      exercises: await db.exercises.toArray(),
      plans: await db.plans.toArray(),
      planDays: await db.planDays.toArray(),
      planExercises: await db.planExercises.toArray(),
      sessions: await db.sessions.toArray(),
      loggedSets: await db.loggedSets.toArray(),
      personalRecords: await db.personalRecords.toArray(),
      settings: await db.settings.toArray(),
    };
  },
  async saveBackup(dateKey, userId = APP.defaultUserId) {
    const payload = await this.exportAll(userId);
    const record = { id: uid(), userId, dateKey, createdAt: new Date().toISOString(), payload };
    await db.backups.put(record);
    return record;
  },
  async importAll(data) {
    await db.transaction(
      'rw',
      [db.exercises, db.plans, db.planDays, db.planExercises, db.sessions, db.loggedSets, db.personalRecords, db.settings],
      async () => {
        await Promise.all([
          db.exercises.clear(), db.plans.clear(), db.planDays.clear(), db.planExercises.clear(),
          db.sessions.clear(), db.loggedSets.clear(), db.personalRecords.clear(), db.settings.clear(),
        ]);
        if (data.exercises) await db.exercises.bulkPut(data.exercises);
        if (data.plans) await db.plans.bulkPut(data.plans);
        if (data.planDays) await db.planDays.bulkPut(data.planDays);
        if (data.planExercises) await db.planExercises.bulkPut(data.planExercises);
        if (data.sessions) await db.sessions.bulkPut(data.sessions);
        if (data.loggedSets) await db.loggedSets.bulkPut(data.loggedSets);
        if (data.personalRecords) await db.personalRecords.bulkPut(data.personalRecords);
        if (data.settings) await db.settings.bulkPut(data.settings);
      }
    );
  },
};

export default repository;
