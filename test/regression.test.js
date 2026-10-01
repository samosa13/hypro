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

  // --- A2: historial por ejercicio ---

  it('exerciseHistory agrupa por sesión, toma la mejor serie y ordena cronológicamente', async () => {
    const { plan, press, days } = await setupPlan(3);

    // Sesión 1: dos series, mejor 40×10.
    const s1 = await app.startSession(plan, days[0]);
    await app.logSet({ sessionId: s1.id, exercise: press, setNumber: 1, weight: 40, reps: 8 });
    await app.logSet({ sessionId: s1.id, exercise: press, setNumber: 2, weight: 40, reps: 10 });
    await repository.finishSession(s1.id);

    await new Promise((r) => setTimeout(r, 5)); // garantizar orden temporal

    // Sesión 2: una serie 45×8 (mejor 1RM que la sesión 1).
    const s2 = await app.startSession(plan, days[1]);
    await app.logSet({ sessionId: s2.id, exercise: press, setNumber: 1, weight: 45, reps: 8 });
    await repository.finishSession(s2.id);

    const { points, pr, totalSets } = await app.exerciseHistory(press.id);
    expect(points).toHaveLength(2);           // una entrada por sesión
    expect(totalSets).toBe(3);                // 2 + 1 series
    // Orden cronológico: primero la sesión 1.
    expect(points[0].bestWeight).toBe(40);
    expect(points[0].bestReps).toBe(10);      // la mejor serie de la sesión 1
    expect(points[0].sets).toBe(2);
    expect(points[1].bestWeight).toBe(45);
    // El 1RM del segundo punto es mayor (progresión).
    expect(points[1].best1RM).toBeGreaterThan(points[0].best1RM);
    expect(pr.bestWeight).toBe(45);
  });

  it('exerciseHistory de un ejercicio sin series devuelve vacío', async () => {
    const { press } = await setupPlan(1);
    const { points, pr, totalSets } = await app.exerciseHistory(press.id);
    expect(points).toEqual([]);
    expect(totalSets).toBe(0);
    expect(pr).toBe(null);
  });

  // --- A5: reordenar ejercicios de un día ---

  it('movePlanExercise reordena y renumera contiguo, y persiste', async () => {
    const { plan, days } = await setupPlan(1);
    const day = days[0];
    const exercises = await repository.listExercises(U);
    // El setupPlan ya puso 1 ejercicio (order 1). Añadimos 2 más.
    const sentadilla = exercises.find((e) => e.name === 'Sentadilla con barra');
    const curl = exercises.find((e) => e.name === 'Curl con barra');
    await repository.savePlanExercise({ planDayId: day.id, exerciseId: sentadilla.id, order: 2, targetSets: 3, targetReps: 10, targetWeight: 60, restSeconds: 90 });
    await repository.savePlanExercise({ planDayId: day.id, exerciseId: curl.id, order: 3, targetSets: 3, targetReps: 10, targetWeight: 20, restSeconds: 90 });

    let items = await repository.listPlanExercises(day.id);
    expect(items.map((pe) => pe.exerciseId)).toEqual([items[0].exerciseId, sentadilla.id, curl.id]);

    // Mover el 3º (curl) una posición arriba → queda en medio.
    const changed = await repository.movePlanExercise(day.id, items[2].id, -1);
    expect(changed).toBe(true);
    items = await repository.listPlanExercises(day.id);
    expect(items.map((pe) => pe.exerciseId)).toEqual([items[0].exerciseId, curl.id, sentadilla.id]);
    // Orders contiguos 1..3.
    expect(items.map((pe) => pe.order)).toEqual([1, 2, 3]);
  });

  it('movePlanExercise en los límites es no-op', async () => {
    const { days } = await setupPlan(1);
    const day = days[0];
    const items = await repository.listPlanExercises(day.id);
    // Subir el primero: fuera de límites → sin cambio.
    const changed = await repository.movePlanExercise(day.id, items[0].id, -1);
    expect(changed).toBe(false);
  });

  // --- A6: duplicar un día del plan ---

  it('duplicatePlanDay copia nombre y ejercicios con ids nuevos (sin compartir referencias)', async () => {
    const { plan, days } = await setupPlan(1);
    const srcDay = days[0];
    const srcEx = await repository.listPlanExercises(srcDay.id);
    expect(srcEx.length).toBe(1);

    const copy = await repository.duplicatePlanDay(srcDay.id, 'Full Body (copia)');
    expect(copy).toBeTruthy();
    expect(copy.name).toBe('Full Body (copia)');
    expect(copy.id).not.toBe(srcDay.id);

    // El plan ahora tiene un día más, al final.
    const allDays = await repository.listPlanDays(plan.id);
    expect(allDays.length).toBe(2);
    expect(allDays[1].id).toBe(copy.id);
    expect(copy.order).toBe(2);

    // Los ejercicios se clonaron con ids nuevos pero mismos valores.
    const copyEx = await repository.listPlanExercises(copy.id);
    expect(copyEx.length).toBe(1);
    expect(copyEx[0].id).not.toBe(srcEx[0].id);
    expect(copyEx[0].exerciseId).toBe(srcEx[0].exerciseId);
    expect(copyEx[0].targetWeight).toBe(srcEx[0].targetWeight);

    // Editar la copia NO altera el origen.
    await repository.savePlanExercise({ ...copyEx[0], targetWeight: 999 });
    const srcAfter = await repository.listPlanExercises(srcDay.id);
    expect(srcAfter[0].targetWeight).toBe(srcEx[0].targetWeight);
  });

  it('duplicatePlanDay de un día inexistente devuelve null', async () => {
    await setupPlan(1);
    const copy = await repository.duplicatePlanDay('no-existe');
    expect(copy).toBe(null);
  });

  // --- B7: siembra incremental de ejercicios semilla ---

  it('reconcileSeedExercises inserta solo los seeds que faltan, sin duplicar ni tocar los propios', async () => {
    await app.bootstrap(); // siembra el catálogo completo
    const { SEED_EXERCISES } = await import('../src/data/seedExercises.js');
    const fullCount = SEED_EXERCISES.length;
    expect(await repository.countExercises(U)).toBe(fullCount);

    // El usuario crea un ejercicio propio.
    await repository.addExercise({ name: 'Mi ejercicio raro', muscleGroup: 'core', equipment: 'peso corporal', icon: 'bodyweight' }, U);
    expect(await repository.countExercises(U)).toBe(fullCount + 1);

    // Simulamos una instalación "antigua": borramos 2 seeds concretos.
    const all = await repository.listExercises(U);
    const toRemove = all.filter((e) => !e.isCustom).slice(0, 2);
    for (const e of toRemove) await db.exercises.delete(e.id);
    expect(await repository.countExercises(U)).toBe(fullCount - 1); // -2 seeds +1 propio

    // La siembra incremental repone exactamente los 2 que faltan.
    await app.reconcileSeedExercises();
    expect(await repository.countExercises(U)).toBe(fullCount + 1);

    // Idempotente: una segunda pasada no añade nada.
    await app.reconcileSeedExercises();
    expect(await repository.countExercises(U)).toBe(fullCount + 1);

    // El ejercicio propio sigue intacto.
    const stillCustom = (await repository.listExercises(U)).find((e) => e.name === 'Mi ejercicio raro');
    expect(stillCustom).toBeTruthy();
    expect(stillCustom.isCustom).toBe(true);
  });

  // --- B9: series de calentamiento ---

  it('una serie de calentamiento NO genera PR ni se persiste como récord', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    const r = await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 100, reps: 10, isWarmup: true });
    expect(r.isPR).toBe(false);
    expect(await repository.getPR(press.id, U)).toBe(null); // no hay récord pese al 100kg
    // La serie se guarda marcada como calentamiento.
    const sets = await repository.listSetsForExercise(press.id);
    expect(sets[0].isWarmup).toBe(true);
  });

  it('tras un calentamiento, una serie real SÍ marca PR (el warmup no lo bloquea)', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 40, reps: 10, isWarmup: true });
    const real = await app.logSet({ sessionId: s.id, exercise: press, setNumber: 2, weight: 50, reps: 8 });
    expect(real.isPR).toBe(true);
    expect((await repository.getPR(press.id, U)).bestWeight).toBe(50);
  });

  it('las series de calentamiento NO suman al volumen semanal', async () => {
    const { plan, press, days } = await setupPlan(3);
    const s = await app.startSession(plan, days[0]);
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 40, reps: 10, isWarmup: true });
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 2, weight: 50, reps: 8 });
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 3, weight: 50, reps: 8 });
    await repository.finishSession(s.id);

    const { ranking } = await app.weeklyVolume();
    const pecho = ranking.find((r) => r.muscle === 'pecho');
    expect(pecho.sets).toBe(2); // 2 series reales, el calentamiento no cuenta
  });

  it('marcar una serie como calentamiento al editar recomputa el PR', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    const r1 = await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 80, reps: 5 }); // PR
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 2, weight: 50, reps: 8 });
    expect((await repository.getPR(press.id, U)).bestWeight).toBe(80);

    // Resulta que la de 80 era calentamiento: al marcarla, el PR baja al siguiente real.
    const { pr } = await app.editSet(r1.set.id, { isWarmup: true });
    expect(pr.bestWeight).toBe(50);
  });

  it('exerciseHistory ignora las series de calentamiento (A2+B9)', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 100, reps: 10, isWarmup: true }); // calentón "pesado"
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 2, weight: 50, reps: 8 });
    await repository.finishSession(s.id);

    const { points, totalSets } = await app.exerciseHistory(press.id);
    expect(totalSets).toBe(1);                 // solo la serie de trabajo
    expect(points[0].bestWeight).toBe(50);     // el "mejor 1RM" no lo marca el calentamiento
  });

  it('una sesión SOLO de calentamientos es válida (asistencia) pero sin volumen ni PR (B9)', async () => {
    const { plan, press, days } = await setupPlan(3);
    const s = await app.startSession(plan, days[0]);
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 40, reps: 10, isWarmup: true });
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 2, weight: 40, reps: 10, isWarmup: true });
    await repository.finishSession(s.id);

    // Cuenta como día entrenado: la semana efectiva avanza.
    const pos = await app.currentPosition(plan);
    expect(pos.dayInWeek).toBe(2);
    // Pero no aporta volumen ni récord.
    const { ranking } = await app.weeklyVolume();
    expect(ranking.length).toBe(0);
    expect(await repository.getPR(press.id, U)).toBe(null);
  });

  // --- C12: resumen post-sesión ---

  it('sessionSummary cuenta series de trabajo, volumen (Σ peso×reps) y PRs, sin warmup', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    // 2 series de trabajo (la 1ª es PR por ser la primera) + 1 calentamiento.
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 50, reps: 10 }); // PR, vol 500
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 2, weight: 40, reps: 8 });  // vol 320
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 3, weight: 60, reps: 5, isWarmup: true }); // no cuenta
    await repository.finishSession(s.id);

    const sum = await app.sessionSummary(s.id);
    expect(sum.sets).toBe(2);              // calentamiento excluido
    expect(sum.totalVolumeKg).toBe(820);   // 500 + 320 (el warmup no suma)
    expect(sum.prs).toBe(1);               // solo la primera serie marcó PR
  });

  // --- C13: volumen semanal con objetivo y semáforo ---

  it('weeklyVolume devuelve target y status por músculo (C13)', async () => {
    const { plan, press, days } = await setupPlan(3);
    // objetivo bajo para forzar status 'high' con pocas series
    await repository.saveSettings({ ...(await repository.getSettings(U)), weeklyVolumeTarget: 2 }, U);
    const s = await app.startSession(plan, days[0]);
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 40, reps: 10 });
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 2, weight: 40, reps: 10 });
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 3, weight: 40, reps: 10 });
    await repository.finishSession(s.id);

    const { ranking, target } = await app.weeklyVolume();
    expect(target).toBe(2);
    const pecho = ranking.find((r) => r.muscle === 'pecho');
    expect(pecho.sets).toBe(3);
    expect(pecho.target).toBe(2);
    expect(pecho.status).toBe('high'); // 3 > 2*1.3
  });

  // --- B10: RIR (reps en reserva) opcional por serie ---

  it('logSet persiste el RIR cuando se indica, y null cuando no', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    const withRir = await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 40, reps: 10, rir: 2 });
    const noRir = await app.logSet({ sessionId: s.id, exercise: press, setNumber: 2, weight: 40, reps: 9 });
    expect(withRir.set.rir).toBe(2);
    expect(noRir.set.rir).toBe(null);
  });

  it('el RIR no afecta al PR y se puede editar', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    const r1 = await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 50, reps: 8, rir: 3 });
    const prBefore = await repository.getPR(press.id, U);
    expect(prBefore.bestWeight).toBe(50);

    // Editar solo el RIR no cambia el récord.
    const { set, pr } = await app.editSet(r1.set.id, { rir: 1 });
    expect(set.rir).toBe(1);
    expect(pr.bestWeight).toBe(50);
    expect(set.weight).toBe(50); // peso/reps intactos
    expect(set.reps).toBe(8);
  });

  // --- B8: notas por ejercicio dentro de la sesión ---

  it('setExerciseNote guarda por ejercicio sin pisar otras notas ni la global', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    const exercises = await repository.listExercises(U);
    const sentadilla = exercises.find((e) => e.name === 'Sentadilla con barra');

    // Nota global de la sesión + notas por ejercicio.
    await app.setSessionNote(s.id, 'Buen día de fuerza');
    await app.setExerciseNote(s.id, press.id, 'Hombro molestó un poco');
    await app.setExerciseNote(s.id, sentadilla.id, 'Profundidad perfecta');

    let sess = await repository.getSession(s.id);
    expect(sess.note).toBe('Buen día de fuerza');
    expect(sess.exerciseNotes[press.id]).toBe('Hombro molestó un poco');
    expect(sess.exerciseNotes[sentadilla.id]).toBe('Profundidad perfecta');

    // Editar una no toca la otra ni la global.
    await app.setExerciseNote(s.id, press.id, 'Mejor, sin molestia');
    sess = await repository.getSession(s.id);
    expect(sess.exerciseNotes[press.id]).toBe('Mejor, sin molestia');
    expect(sess.exerciseNotes[sentadilla.id]).toBe('Profundidad perfecta');
    expect(sess.note).toBe('Buen día de fuerza');

    // Vaciar una nota la elimina del mapa.
    await app.setExerciseNote(s.id, sentadilla.id, '   ');
    sess = await repository.getSession(s.id);
    expect(sess.exerciseNotes[sentadilla.id]).toBeUndefined();
    expect(sess.exerciseNotes[press.id]).toBe('Mejor, sin molestia');
  });

  it('bootstrap sobre BD ya sembrada añade los seeds nuevos del catálogo', async () => {
    // Primera instalación con catálogo completo.
    await app.bootstrap();
    const { SEED_EXERCISES } = await import('../src/data/seedExercises.js');
    // Simulamos que esta BD se sembró con un catálogo más viejo: quitamos uno.
    const all = await repository.listExercises(U);
    const victim = all.find((e) => !e.isCustom);
    await db.exercises.delete(victim.id);
    expect(await repository.countExercises(U)).toBe(SEED_EXERCISES.length - 1);

    // Reabrir la app (bootstrap de nuevo, rama else) repone el que falta.
    await app.bootstrap();
    expect(await repository.countExercises(U)).toBe(SEED_EXERCISES.length);
  });

  // --- C15: aviso de exportar copia de seguridad externa ---

  it('backupReminder no avisa si no hay sesiones válidas aunque nunca se exportara', async () => {
    await app.bootstrap(); // settings sembrados, sin lastExportAt, sin sesiones
    const r = await app.backupReminder();
    expect(r.shouldWarn).toBe(false);
    expect(r.daysSince).toBe(null);
  });

  it('backupReminder avisa si hay sesiones válidas y nunca se exportó', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 40, reps: 10 });
    await repository.finishSession(s.id);

    const r = await app.backupReminder();
    expect(r.shouldWarn).toBe(true);
    expect(r.daysSince).toBe(null); // nunca exportó
  });

  it('backupReminder NO avisa si la última exportación es reciente (<14 días)', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 40, reps: 10 });
    await repository.finishSession(s.id);

    const recent = new Date(Date.now() - 3 * 86400000).toISOString(); // hace 3 días
    await repository.saveSettings({ ...(await repository.getSettings(U)), lastExportAt: recent }, U);

    const r = await app.backupReminder();
    expect(r.shouldWarn).toBe(false);
    expect(r.daysSince).toBe(3);
  });

  it('backupReminder vuelve a avisar si la última exportación es antigua (>14 días)', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 40, reps: 10 });
    await repository.finishSession(s.id);

    const old = new Date(Date.now() - 20 * 86400000).toISOString(); // hace 20 días
    await repository.saveSettings({ ...(await repository.getSettings(U)), lastExportAt: old }, U);

    const r = await app.backupReminder();
    expect(r.shouldWarn).toBe(true);
    expect(r.daysSince).toBe(20);
  });

  it('backupReminder trata una fecha corrupta como si nunca se hubiera exportado', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 40, reps: 10 });
    await repository.finishSession(s.id);

    await repository.saveSettings({ ...(await repository.getSettings(U)), lastExportAt: 'no-es-fecha' }, U);

    const r = await app.backupReminder();
    expect(r.shouldWarn).toBe(true);
    expect(r.daysSince).toBe(null);
  });

  // --- D16: tipos de medición por ejercicio (reps_only / time) ---

  it('reps_only (Dominadas): el PR es por reps y el 1RM no aplica', async () => {
    await app.bootstrap();
    const dominadas = (await repository.listExercises(U)).find((e) => e.name === 'Dominadas');
    expect(dominadas.tracking).toBe('reps_only'); // viene del catálogo semilla

    const plan = await repository.savePlan({ name: 'P', daysPerWeek: 1, isActive: true }, U);
    await repository.setActivePlan(plan.id, U);
    const day = await repository.savePlanDay({ planId: plan.id, name: 'D1', order: 1 });
    await repository.savePlanExercise({ planDayId: day.id, exerciseId: dominadas.id, order: 1, targetSets: 3, repMin: 6, repMax: 10, targetReps: 8, restSeconds: 90 });

    const s = await app.startSession(plan, day);
    const r1 = await app.logSet({ sessionId: s.id, exercise: dominadas, setNumber: 1, reps: 8 });
    expect(r1.isPR).toBe(true);
    const r2 = await app.logSet({ sessionId: s.id, exercise: dominadas, setNumber: 2, reps: 10 });
    expect(r2.isPR).toBe(true); // más reps = nuevo récord
    await repository.finishSession(s.id);

    const pr = await repository.getPR(dominadas.id, U);
    expect(pr.tracking).toBe('reps_only');
    expect(pr.repsAtBest).toBe(10);
    expect(pr.score).toBe(10);
    expect(pr.estimated1RM).toBe(0);

    // La sugerencia propone una repetición más, sin peso.
    const [pe] = await repository.listPlanExercises(day.id);
    const sug = await app.suggestionFor(dominadas, pe);
    expect(sug.kind).toBe('reps');
    expect(sug.reps).toBe(11);
    expect(sug.weight).toBe(0);
  });

  it('time (Plancha): el PR es por segundos y aguantar más lo bate', async () => {
    await app.bootstrap();
    const plancha = (await repository.listExercises(U)).find((e) => e.name === 'Plancha');
    expect(plancha.tracking).toBe('time');

    const plan = await repository.savePlan({ name: 'P', daysPerWeek: 1, isActive: true }, U);
    await repository.setActivePlan(plan.id, U);
    const day = await repository.savePlanDay({ planId: plan.id, name: 'D1', order: 1 });
    await repository.savePlanExercise({ planDayId: day.id, exerciseId: plancha.id, order: 1, targetSets: 3, targetDurationSeconds: 30, restSeconds: 60 });

    const s = await app.startSession(plan, day);
    const r1 = await app.logSet({ sessionId: s.id, exercise: plancha, setNumber: 1, durationSeconds: 45 });
    expect(r1.isPR).toBe(true);
    expect(r1.set.durationSeconds).toBe(45);
    const r2 = await app.logSet({ sessionId: s.id, exercise: plancha, setNumber: 2, durationSeconds: 30 });
    expect(r2.isPR).toBe(false); // menos tiempo no bate
    await repository.finishSession(s.id);

    const pr = await repository.getPR(plancha.id, U);
    expect(pr.tracking).toBe('time');
    expect(pr.bestDurationSeconds).toBe(45);

    // editSet sobre tiempo recomputa el PR.
    const { pr: pr2 } = await app.editSet(r1.set.id, { durationSeconds: 20 });
    expect(pr2.bestDurationSeconds).toBe(30); // el mejor que queda (la 2ª serie)
  });

  it('un ejercicio time no aporta volumen en kg al resumen de sesión', async () => {
    await app.bootstrap();
    const plancha = (await repository.listExercises(U)).find((e) => e.name === 'Plancha');
    const plan = await repository.savePlan({ name: 'P', daysPerWeek: 1, isActive: true }, U);
    await repository.setActivePlan(plan.id, U);
    const day = await repository.savePlanDay({ planId: plan.id, name: 'D1', order: 1 });
    await repository.savePlanExercise({ planDayId: day.id, exerciseId: plancha.id, order: 1, targetSets: 2, targetDurationSeconds: 30, restSeconds: 60 });

    const s = await app.startSession(plan, day);
    await app.logSet({ sessionId: s.id, exercise: plancha, setNumber: 1, durationSeconds: 40 });
    await repository.finishSession(s.id);

    const sum = await app.sessionSummary(s.id);
    expect(sum.sets).toBe(1);           // cuenta como serie de trabajo
    expect(sum.totalVolumeKg).toBe(0);  // pero sin peso no hay volumen en kg
    expect(sum.prs).toBe(1);
  });

  it('reconcileExerciseTracking hace backfill del tipo en instalaciones previas a D16', async () => {
    await app.bootstrap();
    const all = await repository.listExercises(U);
    const dominadas = all.find((e) => e.name === 'Dominadas');
    const press = all.find((e) => e.name === 'Press banca con barra');

    // Simular instalación antigua: quitar el campo tracking a mano.
    await db.exercises.update(dominadas.id, { tracking: undefined });
    await db.exercises.update(press.id, { tracking: undefined });

    await app.reconcileExerciseTracking();

    expect((await repository.getExercise(dominadas.id)).tracking).toBe('reps_only'); // del catálogo
    expect((await repository.getExercise(press.id)).tracking).toBe('weight_reps');   // default
  });

  // --- Reseteo de la app a valores iniciales (punto 3) ---

  it('resetToInitial borra datos del usuario y resiembra el catálogo', async () => {
    // Montar un estado con plan, sesión, serie y PR.
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 60, reps: 5 });
    await repository.finishSession(s.id);
    // Un ejercicio propio del usuario.
    await repository.addExercise({ name: 'Mi ejercicio', muscleGroup: 'core', equipment: 'peso corporal', icon: 'bodyweight' }, U);
    // Cambiar un ajuste para comprobar que vuelve al valor por defecto.
    await repository.saveSettings({ ...(await repository.getSettings(U)), weeklyVolumeTarget: 99 }, U);

    expect(await repository.countAllSessions(U)).toBe(1);
    expect(await repository.countPRs(U)).toBeGreaterThan(0);

    await app.resetToInitial();

    const { SEED_EXERCISES } = await import('../src/data/seedExercises.js');
    // Catálogo resembrado exactamente (sin el ejercicio propio).
    expect(await repository.countExercises(U)).toBe(SEED_EXERCISES.length);
    expect((await repository.listExercises(U)).find((e) => e.name === 'Mi ejercicio')).toBeUndefined();
    // Datos del usuario vaciados.
    expect(await repository.countAllSessions(U)).toBe(0);
    expect(await repository.countAllSets(U)).toBe(0);
    expect(await repository.countPRs(U)).toBe(0);
    expect(await repository.listPlans(U)).toEqual([]);
    // Ajustes vueltos al valor por defecto.
    const settings = await repository.getSettings(U);
    expect(settings.weeklyVolumeTarget).toBe(12);
  });

  it('wipeAll deja todas las tablas vacías (sin resembrar)', async () => {
    const { plan, press, days } = await setupPlan(1);
    const s = await app.startSession(plan, days[0]);
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 40, reps: 10 });
    await repository.finishSession(s.id);

    await repository.wipeAll();

    expect(await repository.countExercises(U)).toBe(0); // wipeAll NO resiembra
    expect(await repository.listPlans(U)).toEqual([]);
    expect(await repository.countAllSessions(U)).toBe(0);
  });

  // --- D17: superseries / triseries / circuitos ---

  /** Monta un día con 3 ejercicios conocidos y devuelve {day, pes}. */
  async function setupDayWith3() {
    await app.bootstrap();
    const exs = await repository.listExercises(U);
    const press = exs.find((e) => e.name === 'Press banca con barra');
    const curl = exs.find((e) => e.name === 'Curl con barra');
    const sent = exs.find((e) => e.name === 'Sentadilla con barra');
    const plan = await repository.savePlan({ name: 'P', daysPerWeek: 1, isActive: true }, U);
    await repository.setActivePlan(plan.id, U);
    const day = await repository.savePlanDay({ planId: plan.id, name: 'D1', order: 1 });
    const mk = (ex, order) => repository.savePlanExercise({ planDayId: day.id, exerciseId: ex.id, order, targetSets: 3, repMin: 8, repMax: 12, targetReps: 10, targetWeight: 40, restSeconds: 90 });
    await mk(press, 1); await mk(curl, 2); await mk(sent, 3);
    return { plan, day, press, curl, sent };
  }

  it('groupWithNext crea una superserie con groupId común y groupType superset', async () => {
    const { day } = await setupDayWith3();
    let items = await repository.listPlanExercises(day.id);
    const changed = await repository.groupWithNext(day.id, items[0].id);
    expect(changed).toBe(true);
    items = await repository.listPlanExercises(day.id);
    // Los dos primeros comparten groupId; el tercero sigue suelto.
    expect(items[0].groupId).toBeTruthy();
    expect(items[1].groupId).toBe(items[0].groupId);
    expect(items[0].groupType).toBe('superset');
    expect(items[2].groupId == null).toBe(true);
  });

  it('encadenar un tercero convierte la superserie en triserie', async () => {
    const { day } = await setupDayWith3();
    let items = await repository.listPlanExercises(day.id);
    await repository.groupWithNext(day.id, items[0].id); // 1+2 superset
    items = await repository.listPlanExercises(day.id);
    await repository.groupWithNext(day.id, items[1].id); // +3 → triserie
    items = await repository.listPlanExercises(day.id);
    const gid = items[0].groupId;
    expect(items.every((pe) => pe.groupId === gid)).toBe(true);
    expect(items.every((pe) => pe.groupType === 'triset')).toBe(true);
  });

  it('ungroup deshace el grupo dejando a los miembros sin groupId', async () => {
    const { day } = await setupDayWith3();
    let items = await repository.listPlanExercises(day.id);
    await repository.groupWithNext(day.id, items[0].id);
    items = await repository.listPlanExercises(day.id);
    await repository.ungroup(day.id, items[0].id);
    items = await repository.listPlanExercises(day.id);
    expect(items.every((pe) => pe.groupId == null)).toBe(true);
  });

  it('borrar un miembro degrada un grupo de 2 a ejercicio normal', async () => {
    const { day } = await setupDayWith3();
    let items = await repository.listPlanExercises(day.id);
    await repository.groupWithNext(day.id, items[0].id); // 1+2 superset
    items = await repository.listPlanExercises(day.id);
    await repository.deletePlanExercise(items[0].id);    // borra un miembro
    items = await repository.listPlanExercises(day.id);
    // El miembro superviviente ya no es grupo.
    const survivor = items.find((pe) => pe.exerciseId && pe.groupId);
    expect(survivor).toBeUndefined();
  });

  it('duplicatePlanDay remapea groupId (la copia no comparte grupo con el origen)', async () => {
    const { day } = await setupDayWith3();
    let items = await repository.listPlanExercises(day.id);
    await repository.groupWithNext(day.id, items[0].id);
    items = await repository.listPlanExercises(day.id);
    const srcGroupId = items[0].groupId;

    const copy = await repository.duplicatePlanDay(day.id, 'Copia');
    const copyItems = await repository.listPlanExercises(copy.id);
    const copyGroupMembers = copyItems.filter((pe) => pe.groupId);
    expect(copyGroupMembers.length).toBe(2);
    // Mismo agrupamiento, pero groupId NUEVO (no comparte con el origen).
    expect(copyGroupMembers[0].groupId).toBe(copyGroupMembers[1].groupId);
    expect(copyGroupMembers[0].groupId).not.toBe(srcGroupId);
  });

  it('groupWithNext normaliza targetSets al máximo de los miembros (D17 #3)', async () => {
    const { day, press, curl } = await setupDayWith3();
    // Dar distinto nº de series a los dos primeros antes de agrupar.
    let items = await repository.listPlanExercises(day.id);
    await repository.savePlanExercise({ ...items[0], targetSets: 4 });
    await repository.savePlanExercise({ ...items[1], targetSets: 3 });
    items = await repository.listPlanExercises(day.id);
    await repository.groupWithNext(day.id, items[0].id);
    items = await repository.listPlanExercises(day.id);
    const grp = items.filter((pe) => pe.groupId);
    expect(grp.length).toBe(2);
    expect(grp.every((pe) => pe.targetSets === 4)).toBe(true); // normalizado al máximo
  });

  it('movePlanExercise mueve el grupo como una unidad sin partirlo (D17 #1)', async () => {
    const { day } = await setupDayWith3(); // [press(1), curl(2), sent(3)]
    let items = await repository.listPlanExercises(day.id);
    // Agrupar curl+sent (posiciones 2 y 3).
    await repository.groupWithNext(day.id, items[1].id);
    items = await repository.listPlanExercises(day.id);
    const groupId = items[1].groupId;
    expect(items[1].groupId).toBe(groupId);
    expect(items[2].groupId).toBe(groupId);

    // Subir press (suelto, pos 1) una posición: debe saltar el grupo entero,
    // no colarse en medio. Resultado esperado: [curl, sent, press].
    await repository.movePlanExercise(day.id, items[0].id, +1);
    items = await repository.listPlanExercises(day.id);
    // El grupo sigue contiguo (posiciones 1 y 2) y press queda al final.
    expect(items[0].groupId).toBe(groupId);
    expect(items[1].groupId).toBe(groupId);
    expect(items[2].groupId == null).toBe(true);
    expect(items.map((pe) => pe.order)).toEqual([1, 2, 3]);
  });

  it('entrenar un circuito registra las series de cada ejercicio por vuelta', async () => {
    const { plan, day, press, curl } = await setupDayWith3();
    let items = await repository.listPlanExercises(day.id);
    await repository.groupWithNext(day.id, items[0].id); // press+curl en superserie

    // Simular 2 vueltas: una serie de cada ejercicio por vuelta (setNumber = vuelta).
    const s = await app.startSession(plan, day);
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 1, weight: 50, reps: 8 });
    await app.logSet({ sessionId: s.id, exercise: curl, setNumber: 1, weight: 20, reps: 10 });
    await app.logSet({ sessionId: s.id, exercise: press, setNumber: 2, weight: 50, reps: 8 });
    await app.logSet({ sessionId: s.id, exercise: curl, setNumber: 2, weight: 20, reps: 10 });
    await repository.finishSession(s.id);

    // Cada ejercicio tiene sus 2 series y su PR, pese a registrarse intercalado.
    const pressSets = await repository.listSetsForExercise(press.id);
    const curlSets = await repository.listSetsForExercise(curl.id);
    expect(pressSets.length).toBe(2);
    expect(curlSets.length).toBe(2);
    expect((await repository.getPR(press.id, U)).bestWeight).toBe(50);
    expect((await repository.getPR(curl.id, U)).bestWeight).toBe(20);
    // La sesión cuenta las 4 series.
    const sess = await repository.getSession(s.id);
    expect(sess.setCount).toBe(4);
  });
});
