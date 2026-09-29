/**
 * Tests unitarios de dominio (PLAN_TESTS §2). Puros, sin UI ni IndexedDB.
 */
import { describe, it, expect } from 'vitest';
import { estimate1RM, isNewPR, isTiePR, buildPR } from '../src/domain/personalRecord.js';
import { currentPosition, positionLabel, positionForNewSession } from '../src/domain/effectiveWeek.js';
import { tenureSince, tenureLabel } from '../src/domain/gymTenure.js';
import { currentStreak, maxGapDays } from '../src/domain/streak.js';
import { findPlateaus } from '../src/domain/plateau.js';

describe('personalRecord · 1RM y PR', () => {
  it('UT-PR-06 · Epley: peso*(1+reps/30)', () => {
    expect(estimate1RM(100, 0)).toBe(0);
    expect(estimate1RM(30, 30)).toBeCloseTo(60, 5); // 30*(1+1)=60
    expect(estimate1RM(40, 10)).toBeCloseTo(40 * (1 + 10 / 30), 5);
  });

  it('UT-PR-01 · primera serie siempre es PR', () => {
    expect(isNewPR({ weight: 20, reps: 8 }, null)).toBe(true);
  });

  it('UT-PR-02 · más reps al mismo peso es PR', () => {
    const pr = buildPR({ exerciseId: 'e1', weight: 40, reps: 8, loggedAt: '2026-09-14' }, 'me');
    expect(isNewPR({ weight: 40, reps: 10 }, pr)).toBe(true);
  });

  it('UT-PR-04 · menos reps al mismo peso no es PR', () => {
    const pr = buildPR({ exerciseId: 'e1', weight: 40, reps: 10, loggedAt: '2026-09-14' }, 'me');
    expect(isNewPR({ weight: 40, reps: 8 }, pr)).toBe(false);
  });

  it('UT-PR-03 · compara por 1RM estimado entre distinto peso/reps', () => {
    const pr = buildPR({ exerciseId: 'e1', weight: 40, reps: 10, loggedAt: '2026-09-14' }, 'me');
    // 42x6 => 1RM ~50.4 ; 40x10 => 1RM ~53.3 -> NO es PR
    expect(isNewPR({ weight: 42, reps: 6 }, pr)).toBe(false);
    // 45x9 => 1RM ~58.5 -> SÍ es PR
    expect(isNewPR({ weight: 45, reps: 9 }, pr)).toBe(true);
  });

  it('UT-PR-05 · el PR guarda su fecha', () => {
    const pr = buildPR({ exerciseId: 'e1', weight: 50, reps: 5, loggedAt: '2026-09-14T20:00:00Z' }, 'me');
    expect(pr.achievedAt).toBe('2026-09-14T20:00:00Z');
    expect(pr.bestWeight).toBe(50);
  });

  it('UT-PR-07 · isTiePR detecta empate exacto de 1RM', () => {
    const pr = buildPR({ exerciseId: 'e1', weight: 40, reps: 10, loggedAt: '2026-09-14' }, 'me');
    // misma serie => empate
    expect(isTiePR({ weight: 40, reps: 10 }, pr)).toBe(true);
    // superar no es empate
    expect(isTiePR({ weight: 45, reps: 10 }, pr)).toBe(false);
    // sin PR previo no hay empate
    expect(isTiePR({ weight: 40, reps: 10 }, null)).toBe(false);
  });
});

describe('effectiveWeek · semana efectiva (RB-1)', () => {
  it('UT-EW-01 · plan 3 días, 0 sesiones -> S1 D1', () => {
    expect(currentPosition(0, 3)).toEqual({ week: 1, dayInWeek: 1, daysPerWeek: 3 });
  });
  it('UT-EW-02 · plan 3 días, 2 sesiones -> S1 D3', () => {
    expect(currentPosition(2, 3)).toEqual({ week: 1, dayInWeek: 3, daysPerWeek: 3 });
  });
  it('UT-EW-03 · plan 3 días, 3 sesiones -> S2 D1', () => {
    expect(currentPosition(3, 3)).toEqual({ week: 2, dayInWeek: 1, daysPerWeek: 3 });
  });
  it('UT-EW-05 · plan 4 días, 7 sesiones -> S2 D4', () => {
    expect(currentPosition(7, 4)).toEqual({ week: 2, dayInWeek: 4, daysPerWeek: 4 });
  });
  it('etiqueta con formato Semana 07 · Día 2 de 3', () => {
    expect(positionLabel(19, 3)).toBe('Semana 07 · Día 2 de 3');
  });
  it('positionForNewSession usa la posición previa a la sesión', () => {
    expect(positionForNewSession(3, 3)).toEqual({ effectiveWeek: 2, dayNumber: 1 });
  });
});

describe('gymTenure · antigüedad total', () => {
  it('UT-GT-01 · meses y días', () => {
    const t = tenureSince('2026-04-26', new Date('2026-09-29'));
    expect(t.months).toBe(5);
    expect(t.days).toBe(3);
  });
  it('etiqueta legible', () => {
    expect(tenureLabel('2026-08-01', new Date('2026-09-29'))).toBe('1 mes y 28 días');
  });
});

describe('streak · racha inteligente (RB-3)', () => {
  it('maxGapDays 3/sem = ceil(7/3)+1 = 4', () => {
    expect(maxGapDays(3, 1)).toBe(4);
  });
  it('UT-ST-04 · sin sesiones -> 0', () => {
    expect(currentStreak([], 3)).toBe(0);
  });
  it('UT-ST-01 · sesiones dentro de tolerancia mantienen la racha', () => {
    const dates = ['2026-09-21', '2026-09-23', '2026-09-25', '2026-09-28'];
    expect(currentStreak(dates, 3, { now: new Date('2026-09-29') })).toBe(4);
  });
  it('UT-ST-03 · hueco excesivo desde la última sesión rompe la racha', () => {
    const dates = ['2026-09-01', '2026-09-03'];
    expect(currentStreak(dates, 3, { now: new Date('2026-09-29') })).toBe(0);
  });
});

describe('plateau · estancamiento (RB-4)', () => {
  it('UT-PL-01 · sin superar PR marca estancamiento con fecha', () => {
    const weekSets = [{ exerciseId: 'e1', exerciseName: 'Press banca', weight: 40, reps: 8 }];
    const prByExercise = { e1: { estimated1RM: estimate1RM(40, 10), achievedAt: '2026-09-14' } };
    const res = findPlateaus(weekSets, prByExercise);
    expect(res).toHaveLength(1);
    expect(res[0].prDate).toBe('2026-09-14');
  });
  it('UT-PL-02 · nuevo PR no marca estancamiento', () => {
    const weekSets = [{ exerciseId: 'e1', exerciseName: 'Press banca', weight: 50, reps: 10 }];
    const prByExercise = { e1: { estimated1RM: estimate1RM(40, 10), achievedAt: '2026-09-14' } };
    expect(findPlateaus(weekSets, prByExercise)).toHaveLength(0);
  });
});
