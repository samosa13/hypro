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

  // --- A1: editar / borrar una serie ya registrada ---

  it('editar a la baja la serie-récord recomputa el PR', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    const r1 = await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 60, reps: 5 }); // PR fuerte
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 2, weight: 40, reps: 8 });            // menor
    await repository.finishSession(s.id);

    expect((await repository.getPR(press.id, U)).bestWeight).toBe(60);

    // Corrijo la serie-récord: me había equivocado, eran 40×8 no 60×5.
    const { pr } = await app.editSet(r1.set.id, { weight: 40, reps: 8 });
    // El PR ya no puede ser 60; recomputa al mejor de lo que queda (40×8).
    expect(pr.bestWeight).toBe(40);
    expect(pr.repsAtBest).toBe(8);
    expect((await repository.getPR(press.id, U)).bestWeight).toBe(40);
  });

  it('borrar la serie-récord recalcula el PR al siguiente mejor', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    const r1 = await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 60, reps: 5 });
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 2, weight: 50, reps: 6 });
    await repository.finishSession(s.id);
    expect((await repository.getPR(press.id, U)).bestWeight).toBe(60);

    const { pr } = await app.removeSet(r1.set.id);
    expect(pr.bestWeight).toBe(50);
    expect(pr.repsAtBest).toBe(6);
    // La sesión sigue siendo válida (queda una serie).
    const sess = await repository.getSession(s.id);
    expect(sess.setCount).toBe(1);
  });

  it('borrar la única serie vacía la sesión y elimina el PR', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    const r1 = await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 55, reps: 7 });
    expect((await repository.getPR(press.id, U)).bestWeight).toBe(55);

    const { pr, sessionEmptied } = await app.removeSet(r1.set.id);
    expect(pr).toBe(null);                 // ya no queda ninguna serie → sin PR
    expect(sessionEmptied).toBe(true);     // sesión sin series (fantasma)
    expect(await repository.getPR(press.id, U)).toBe(null);
    // La sesión vacía se descarta en removeSet (peer review A1 #5): no queda fantasma.
    expect(await repository.getSession(s.id)).toBeUndefined();
  });

  it('editar al alza una serie crea/actualiza el PR hacia arriba y marca isPR', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    const r1 = await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 40, reps: 8 });
    await repository.finishSession(s.id);
    expect((await repository.getPR(press.id, U)).bestWeight).toBe(40);

    const { pr, isPR } = await app.editSet(r1.set.id, { weight: 70, reps: 5 });
    expect(pr.bestWeight).toBe(70);
    expect(pr.repsAtBest).toBe(5);
    expect(isPR).toBe(true); // la corrección batió récord → se celebra en UI
  });

  it('editar sin batir récord no marca isPR', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 80, reps: 5 }); // PR alto
    const r2 = await app.logSet({ sessionId: s.id, exercise: press, setNumber: 2, weight: 40, reps: 8 });
    await repository.finishSession(s.id);

    const { isPR } = await app.editSet(r2.set.id, { weight: 42, reps: 8 }); // sigue por debajo
    expect(isPR).toBe(false);
    expect((await repository.getPR(press.id, U)).bestWeight).toBe(80); // PR intacto
  });
});
