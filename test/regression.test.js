/**
 * SUITE DE REGRESIÓN — flujos completos de Hypro end-to-end a nivel de datos y
 * servicio, con IndexedDB real simulado (fake-indexeddb). Se ejecuta SIEMPRE
 * (protocolo de calidad) para garantizar que ningún cambio rompe los flujos
 * fundamentales de la app.
 *
 * Cubre: crear plan, entrenar, PR, semana efectiva, sesión válida/fantasma,
 * editar plan sin perder historial, export/import round-trip seguro, volumen
 * semanal y sugerencia de progresión — todo encadenado como lo haría el usuario.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createAppService } from '../src/domain/appService.js';

const { db } = await import('../src/data/database.js');
const { default: repository } = await import('../src/data/repository.js');

const U = 'me';
const app = createAppService(repository, U);

async function wipe() {
  await db.open();
  await Promise.all([
    db.exercises.clear(), db.plans.clear(), db.planDays.clear(), db.planExercises.clear(),
    db.sessions.clear(), db.loggedSets.clear(), db.personalRecords.clear(),
    db.settings.clear(), db.backups.clear(),
  ]);
}

/** Crea un plan de N días con un ejercicio conocido en cada día. */
async function setupPlan(daysPerWeek = 1) {
  await app.bootstrap(); // siembra ejercicios + settings
  const plan = await repository.savePlan({ name: 'Reg', daysPerWeek, isActive: true }, U);
  await repository.setActivePlan(plan.id, U);
  const exercises = await repository.listExercises(U);
  const press = exercises.find((e) => e.name === 'Press banca con barra');
  const days = [];
  for (let i = 1; i <= daysPerWeek; i++) {
    const day = await repository.savePlanDay({ planId: plan.id, name: `Día ${i}`, order: i });
    await repository.savePlanExercise({
      planDayId: day.id, exerciseId: press.id, order: 1,
      targetSets: 3, targetReps: 10, targetWeight: 40, restSeconds: 90,
    });
    days.push(day);
  }
  return { plan, press, days };
}

describe('REGRESIÓN · flujo completo de entrenamiento', () => {
  beforeEach(wipe);

  it('crear plan → entrenar → PR → semana efectiva avanza', async () => {
    const { plan, press, days } = await setupPlan(3);

    // Posición inicial
    let pos = await app.currentPosition(plan);
    expect(pos).toMatchObject({ week: 1, dayInWeek: 1 });

    // Entrenar día 1 con una serie
    const s = await app.startSession(plan, days[0]);
    const r = await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 40, reps: 10 });
    expect(r.isPR).toBe(true); // primer registro es PR
    await repository.finishSession(s.id);

    // La semana efectiva avanzó a día 2
    pos = await app.currentPosition(plan);
    expect(pos.dayInWeek).toBe(2);

    // Contadores coherentes (solo sesiones válidas)
    const summary = await app.progressSummary();
    expect(summary.sessions).toBe(1);
    expect(summary.prs).toBe(1);
  });

  it('sesión fantasma (sin series) NO avanza el plan', async () => {
    const { plan, days } = await setupPlan(3);
    const ghost = await app.startSession(plan, days[0]);
    await repository.discardSessionIfEmpty(ghost.id);
    const pos = await app.currentPosition(plan);
    expect(pos.dayInWeek).toBe(1); // sigue en el día 1
    expect(await app.progressSummary().then((x) => x.sessions)).toBe(0);
  });

  it('editar el plan NO altera el historial ya registrado', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 50, reps: 8 });
    await repository.finishSession(s.id);

    // Cambiar el objetivo del ejercicio en el plan
    const [pe] = await repository.listPlanExercises(days[0].id);
    await repository.savePlanExercise({ ...pe, targetWeight: 999 });

    // El histórico de la serie sigue intacto
    const sets = await repository.listSetsForSession(s.id);
    expect(sets[0].weight).toBe(50);
    expect(sets[0].reps).toBe(8);
    // Y el PR también
    const pr = await repository.getPR(press.id, U);
    expect(pr.bestWeight).toBe(50);
  });

  it('export → import restaura un estado idéntico (round-trip seguro)', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 42.5, reps: 9 });
    await repository.finishSession(s.id);

    const backup = await repository.exportAll(U);
    const setsBefore = await repository.countAllSets(U);

    // Borrar todo e importar
    await wipe();
    const res = await repository.importAll(backup, U);
    expect(res.ok).toBe(true);
    expect(await repository.countAllSets(U)).toBe(setsBefore);
    const pr = await repository.getPR(press.id, U);
    expect(pr.bestWeight).toBe(42.5);
  });

  it('import de backup inválido NO destruye los datos', async () => {
    const { press } = await setupPlan(1);
    const before = await repository.countExercises(U);
    const res = await repository.importAll({ no: 'es un backup' }, U);
    expect(res.ok).toBe(false);
    expect(await repository.countExercises(U)).toBe(before); // intacto
  });

  it('volumen semanal cuenta las series por grupo muscular', async () => {
    const { plan, press, days } = await setupPlan(3);
    const s = await app.startSession(plan, days[0]);
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 40, reps: 10 });
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 2, weight: 40, reps: 10 });
    await repository.finishSession(s.id);

    const { ranking } = await app.weeklyVolume();
    const pecho = ranking.find((r) => r.muscle === 'pecho');
    expect(pecho.sets).toBe(2);
  });

  it('sugerencia de progresión propone +1 rep tras la última serie', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 40, reps: 10 });
    await repository.finishSession(s.id);

    const [pe] = await repository.listPlanExercises(days[0].id);
    const suggestion = await app.suggestionFor(press, pe);
    expect(suggestion.kind).toBe('reps');
    expect(suggestion.reps).toBe(11);
    expect(suggestion.weight).toBe(40);
  });
});
