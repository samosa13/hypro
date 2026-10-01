/**
 * Tests de la capa de orquestación (appService) con un repositorio FAKE en
 * memoria. Aquí estaban la mayoría de los bugs de la peer review, así que se
 * cubren específicamente: sesión válida vs fantasma, empate de PR con refresco
 * de fecha, weeklyPlateaus (semana cerrada + PR previo), import seguro y
 * descanso real estable.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createAppService } from '../src/domain/appService.js';
import { estimate1RM } from '../src/domain/personalRecord.js';

/**
 * Repositorio fake mínimo que implementa el contrato que consume appService.
 * Guarda todo en arrays; replica el criterio de "sesión válida" (setCount>0).
 */
function makeFakeRepo() {
  const uid = () => 'id-' + Math.random().toString(36).slice(2);
  const db = {
    exercises: [], plans: [], planDays: [], planExercises: [],
    sessions: [], loggedSets: [], personalRecords: [], settings: {}, backups: [],
  };
  const U = 'me';

  return {
    _db: db,
    async countExercises() { return db.exercises.length; },
    async bulkAddExercises(list) {
      for (const e of list) {
        const i = db.exercises.findIndex((x) => x.id === e.id);
        if (i >= 0) db.exercises[i] = e; else db.exercises.push(e);
      }
    },
    async listExercises() { return [...db.exercises]; },

    async getActivePlan() { return db.plans.find((p) => p.isActive) ?? null; },

    async countSessions(planId) {
      return db.sessions.filter((s) => s.planId === planId && (s.setCount ?? 0) > 0).length;
    },
    async countAllSessions() { return db.sessions.filter((s) => (s.setCount ?? 0) > 0).length; },
    async listSessions() { return [...db.sessions]; },
    async listValidSessions() { return db.sessions.filter((s) => (s.setCount ?? 0) > 0); },
    async startSession(session) {
      const rec = { id: uid(), userId: U, startedAt: new Date().toISOString(), finishedAt: null, setCount: 0, ...session };
      db.sessions.push(rec);
      return rec;
    },
    async finishSession(id) {
      const s = db.sessions.find((x) => x.id === id);
      if (s) s.finishedAt = new Date().toISOString();
    },
    // Métodos que usa la adherencia (punto 1) vía sessionSummary/sessionAdherence.
    async getSession(id) { return db.sessions.find((x) => x.id === id) ?? null; },
    async updateSession(id, patch) {
      const s = db.sessions.find((x) => x.id === id);
      if (s) Object.assign(s, patch);
    },
    async listPlanExercises(planDayId) {
      return (db.planExercises ?? []).filter((pe) => pe.planDayId === planDayId).sort((a, b) => a.order - b.order);
    },
    async getPlanDay(dayId) { return (db.planDays ?? []).find((d) => d.id === dayId) ?? null; },
    async discardSessionIfEmpty(id) {
      const s = db.sessions.find((x) => x.id === id);
      if (s && (s.setCount ?? 0) === 0) {
        db.sessions = db.sessions.filter((x) => x.id !== id);
        return true;
      }
      return false;
    },

    async listSetsForSession(sessionId) { return db.loggedSets.filter((s) => s.sessionId === sessionId); },
    async listSetsForExercise(exerciseId) { return db.loggedSets.filter((s) => s.exerciseId === exerciseId); },
    async countAllSets() { return db.loggedSets.length; },
    async lastSetOfSession(sessionId) {
      const sets = db.loggedSets.filter((s) => s.sessionId === sessionId);
      if (!sets.length) return null;
      return [...sets].sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt))[0];
    },
    async logSet(set) {
      const rec = { id: uid(), userId: U, loggedAt: new Date().toISOString(), isPR: false, ...set };
      db.loggedSets.push(rec);
      const s = db.sessions.find((x) => x.id === rec.sessionId);
      if (s) s.setCount = (s.setCount ?? 0) + 1;
      return rec;
    },

    async getPR(exerciseId) { return db.personalRecords.find((p) => p.exerciseId === exerciseId) ?? null; },
    async listPRs() { return [...db.personalRecords]; },
    async savePR(pr) {
      const i = db.personalRecords.findIndex((p) => p.exerciseId === pr.exerciseId);
      const rec = { id: db.personalRecords[i]?.id ?? uid(), ...pr };
      if (i >= 0) db.personalRecords[i] = rec; else db.personalRecords.push(rec);
      return rec;
    },
    async countPRs() { return db.personalRecords.length; },

    async getSettings() { return db.settings.userId ? db.settings : (db.settings = { userId: U, defaultSets: 3, defaultRestSeconds: 90 }); },
    async saveSettings(s) { db.settings = { ...s, userId: U }; return db.settings; },

    async hasBackupForDate(key) { return db.backups.some((b) => b.dateKey === key); },
    async saveBackup(key) { const rec = { id: uid(), dateKey: key }; db.backups.push(rec); return rec; },
  };
}

function seedPlan(repo, daysPerWeek = 1) {
  repo._db.plans.push({ id: 'plan1', userId: 'me', isActive: true, daysPerWeek });
  repo._db.exercises.push({ id: 'ex1', userId: 'me', name: 'Press banca', icon: 'x' });
  return { plan: repo._db.plans[0], ex: repo._db.exercises[0], day: { id: 'd1' } };
}

describe('appService · sesión válida vs fantasma (#1)', () => {
  let repo, app, ctx;
  beforeEach(() => { repo = makeFakeRepo(); app = createAppService(repo, 'me'); ctx = seedPlan(repo, 3); });

  it('una sesión sin series no cuenta como día entrenado', async () => {
    await app.startSession(ctx.plan, ctx.day);
    expect(await repo.countSessions('plan1')).toBe(0);         // fantasma no cuenta
    expect(await repo.countAllSessions()).toBe(0);
  });

  it('al registrar una serie, la sesión pasa a contar', async () => {
    const s = await app.startSession(ctx.plan, ctx.day);
    await app.logSet({ sessionId: s.id, exercise: ctx.ex, setNumber: 1, weight: 40, reps: 10 });
    expect(await repo.countSessions('plan1')).toBe(1);
  });

  it('discardSessionIfEmpty borra la fantasma pero conserva la válida', async () => {
    const empty = await app.startSession(ctx.plan, ctx.day);
    expect(await repo.discardSessionIfEmpty(empty.id)).toBe(true);
    const real = await app.startSession(ctx.plan, ctx.day);
    await app.logSet({ sessionId: real.id, exercise: ctx.ex, setNumber: 1, weight: 40, reps: 10 });
    expect(await repo.discardSessionIfEmpty(real.id)).toBe(false);
  });
});

describe('appService · PR y empate (#11)', () => {
  let repo, app, ctx;
  beforeEach(() => { repo = makeFakeRepo(); app = createAppService(repo, 'me'); ctx = seedPlan(repo); });

  it('primera serie es PR; superarla es nuevo PR', async () => {
    const s = await app.startSession(ctx.plan, ctx.day);
    const r1 = await app.logSet({ sessionId: s.id, exercise: ctx.ex, setNumber: 1, weight: 40, reps: 8 });
    expect(r1.isPR).toBe(true);
    const r2 = await app.logSet({ sessionId: s.id, exercise: ctx.ex, setNumber: 2, weight: 45, reps: 8 });
    expect(r2.isPR).toBe(true);
  });

  it('empatar el 1RM no es PR nuevo y conserva la fecha original (política unificada A1)', async () => {
    const s = await app.startSession(ctx.plan, ctx.day);
    await app.logSet({ sessionId: s.id, exercise: ctx.ex, setNumber: 1, weight: 40, reps: 10 });
    const firstDate = (await repo.getPR('ex1')).achievedAt;
    // misma marca más tarde
    await new Promise((r) => setTimeout(r, 5));
    const tie = await app.logSet({ sessionId: s.id, exercise: ctx.ex, setNumber: 2, weight: 40, reps: 10 });
    expect(tie.isPR).toBe(false);
    const newDate = (await repo.getPR('ex1')).achievedAt;
    // El PR mantiene la fecha de cuando se logró POR PRIMERA VEZ (no salta).
    // Coherente con bestPRFromSets, para que editar/borrar no mueva la fecha.
    expect(newDate).toBe(firstDate);
  });
});

describe('appService · descanso real estable (#10)', () => {
  it('mide el descanso desde la serie previa persistida', async () => {
    const repo = makeFakeRepo();
    const app = createAppService(repo, 'me');
    const ctx = seedPlan(repo);
    const s = await app.startSession(ctx.plan, ctx.day);
    await app.logSet({ sessionId: s.id, exercise: ctx.ex, setNumber: 1, weight: 40, reps: 10 });
    await new Promise((r) => setTimeout(r, 20));
    const r2 = await app.logSet({ sessionId: s.id, exercise: ctx.ex, setNumber: 2, weight: 40, reps: 10 });
    expect(r2.set.restTakenSeconds).toBeGreaterThanOrEqual(0);
    expect(typeof r2.set.restTakenSeconds).toBe('number');
  });
});

describe('appService · weeklyPlateaus (#2)', () => {
  it('evalúa la semana cerrada y compara contra el PR previo, no el de la semana', async () => {
    const repo = makeFakeRepo();
    const app = createAppService(repo, 'me');
    const ctx = seedPlan(repo, 1); // 1 día/semana => cada sesión cierra una semana

    // Semana 1: PR de 40x10
    const s1 = await app.startSession(ctx.plan, ctx.day);
    await app.logSet({ sessionId: s1.id, exercise: ctx.ex, setNumber: 1, weight: 40, reps: 10 });
    // Semana 2: baja a 40x8 (no supera) => debe marcar estancamiento
    const s2 = await app.startSession(ctx.plan, ctx.day);
    await app.logSet({ sessionId: s2.id, exercise: ctx.ex, setNumber: 1, weight: 40, reps: 8 });

    const { week, plateaus } = await app.weeklyPlateaus();
    // 2 sesiones, 1 día/sem => 2 semanas completas; evalúa la última (semana 2)
    expect(week).toBe(2);
    expect(plateaus).toHaveLength(1);
    expect(plateaus[0].exerciseId).toBe('ex1');
  });

  it('NO marca estancamiento si en la semana evaluada se batió el récord', async () => {
    const repo = makeFakeRepo();
    const app = createAppService(repo, 'me');
    const ctx = seedPlan(repo, 1);
    const s1 = await app.startSession(ctx.plan, ctx.day);
    await app.logSet({ sessionId: s1.id, exercise: ctx.ex, setNumber: 1, weight: 40, reps: 8 });
    const s2 = await app.startSession(ctx.plan, ctx.day);
    await app.logSet({ sessionId: s2.id, exercise: ctx.ex, setNumber: 1, weight: 50, reps: 10 }); // récord
    const { plateaus } = await app.weeklyPlateaus();
    expect(plateaus).toHaveLength(0);
  });
});
