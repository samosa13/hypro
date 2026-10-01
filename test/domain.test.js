/**
 * Tests unitarios de dominio (PLAN_TESTS §2). Puros, sin UI ni IndexedDB.
 */
import { describe, it, expect } from 'vitest';
import { estimate1RM, isNewPR, isTiePR, buildPR, scoreSet, bestPRFromSets, normalizeTracking } from '../src/domain/personalRecord.js';
import { currentPosition, positionLabel, positionForNewSession } from '../src/domain/effectiveWeek.js';
import { tenureSince, tenureLabel } from '../src/domain/gymTenure.js';
import { currentStreak, maxGapDays } from '../src/domain/streak.js';
import { findPlateaus } from '../src/domain/plateau.js';
import { suggestNext } from '../src/domain/progression.js';
import { formatDuration } from '../src/domain/units.js';
import { normalizeText, matchesSearch } from '../src/domain/search.js';

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

describe('personalRecord · tipos de medición (D16)', () => {
  it('normalizeTracking acota a los tres valores válidos', () => {
    expect(normalizeTracking('reps_only')).toBe('reps_only');
    expect(normalizeTracking('time')).toBe('time');
    expect(normalizeTracking('weight_reps')).toBe('weight_reps');
    expect(normalizeTracking(undefined)).toBe('weight_reps');
    expect(normalizeTracking('loquesea')).toBe('weight_reps');
  });

  it('scoreSet puntúa según el tipo: 1RM / reps / segundos', () => {
    expect(scoreSet({ weight: 40, reps: 10 }, 'weight_reps')).toBeCloseTo(estimate1RM(40, 10), 5);
    expect(scoreSet({ reps: 12 }, 'reps_only')).toBe(12);
    expect(scoreSet({ durationSeconds: 45 }, 'time')).toBe(45);
    // Datos ausentes del tipo → serie no puntuable (0).
    expect(scoreSet({ weight: 0, reps: 0 }, 'reps_only')).toBe(0);
    expect(scoreSet({ reps: 10 }, 'time')).toBe(0);
  });

  it('reps_only: el PR es hacer más repeticiones (el peso es irrelevante)', () => {
    const pr = buildPR({ exerciseId: 'e1', reps: 8, loggedAt: '2026-09-14' }, 'me', 'reps_only');
    expect(pr.tracking).toBe('reps_only');
    expect(pr.repsAtBest).toBe(8);
    expect(pr.score).toBe(8);
    expect(isNewPR({ reps: 10 }, pr, 'reps_only')).toBe(true);  // más reps bate
    expect(isNewPR({ reps: 7 }, pr, 'reps_only')).toBe(false);  // menos no
    expect(isTiePR({ reps: 8 }, pr, 'reps_only')).toBe(true);   // igualar refresca fecha
  });

  it('time: el PR es aguantar más segundos', () => {
    const pr = buildPR({ exerciseId: 'e1', durationSeconds: 60, loggedAt: '2026-09-14' }, 'me', 'time');
    expect(pr.tracking).toBe('time');
    expect(pr.bestDurationSeconds).toBe(60);
    expect(pr.score).toBe(60);
    expect(pr.estimated1RM).toBe(0); // 1RM no aplica a tiempo
    expect(isNewPR({ durationSeconds: 75 }, pr, 'time')).toBe(true);
    expect(isNewPR({ durationSeconds: 50 }, pr, 'time')).toBe(false);
  });

  it('bestPRFromSets recomputa el mejor por tipo, ignorando calentamientos', () => {
    const sets = [
      { exerciseId: 'e1', reps: 10, loggedAt: '2026-09-10' },
      { exerciseId: 'e1', reps: 14, loggedAt: '2026-09-12', isWarmup: true }, // no cuenta
      { exerciseId: 'e1', reps: 12, loggedAt: '2026-09-14' },
    ];
    const pr = bestPRFromSets(sets, 'e1', 'me', 'reps_only');
    expect(pr.repsAtBest).toBe(12); // la de 14 era calentamiento
    expect(pr.score).toBe(12);
  });

  it('PR antiguo sin `score` se compara por estimated1RM (compatibilidad)', () => {
    const legacyPR = { estimated1RM: estimate1RM(40, 10), achievedAt: '2026-01-01' };
    expect(isNewPR({ weight: 45, reps: 9 }, legacyPR, 'weight_reps')).toBe(true);
    expect(isNewPR({ weight: 40, reps: 8 }, legacyPR, 'weight_reps')).toBe(false);
  });
});

describe('progression · progresión por tipo de medición (D16)', () => {
  it('reps_only: con historial sugiere +1 rep, sin peso', () => {
    const s = suggestNext({ lastBest: { reps: 10 }, tracking: 'reps_only' });
    expect(s.kind).toBe('reps');
    expect(s.reps).toBe(11);
    expect(s.weight).toBe(0);
  });

  it('reps_only: sin historial propone el objetivo del plan', () => {
    const s = suggestNext({ lastBest: null, target: { targetReps: 8 }, tracking: 'reps_only' });
    expect(s.kind).toBe('plan');
    expect(s.reps).toBe(8);
  });

  it('time: con historial sugiere +5 s', () => {
    const s = suggestNext({ lastBest: { durationSeconds: 60 }, tracking: 'time' });
    expect(s.kind).toBe('time');
    expect(s.durationSeconds).toBe(65);
  });

  it('time: sin historial propone el objetivo de duración', () => {
    const s = suggestNext({ lastBest: null, target: { targetDurationSeconds: 45 }, tracking: 'time' });
    expect(s.kind).toBe('plan');
    expect(s.durationSeconds).toBe(45);
  });
});

describe('search · normalización y filtrado multi-campo', () => {
  it('normalizeText pasa a minúsculas, quita acentos y recorta', () => {
    expect(normalizeText('  Bíceps ')).toBe('biceps');
    expect(normalizeText('Pájaros')).toBe('pajaros');
    expect(normalizeText('PRESS Banca')).toBe('press banca');
    expect(normalizeText(null)).toBe('');
  });

  it('matchesSearch es insensible a acentos y mayúsculas', () => {
    expect(matchesSearch('biceps', ['Curl de bíceps'])).toBe(true);
    expect(matchesSearch('BÍCEPS', ['curl de biceps'])).toBe(true);
    expect(matchesSearch('pajaro', ['Pájaros (deltoide posterior)'])).toBe(true);
  });

  it('matchesSearch casa contra cualquiera de los campos (multi-campo)', () => {
    const fields = ['Press banca con barra', 'pecho', 'barra'];
    expect(matchesSearch('pecho', fields)).toBe(true);   // por grupo muscular
    expect(matchesSearch('barra', fields)).toBe(true);   // por equipo
    expect(matchesSearch('banca', fields)).toBe(true);   // por nombre
    expect(matchesSearch('polea', fields)).toBe(false);  // no está en ninguno
  });

  it('término vacío casa siempre (no filtra)', () => {
    expect(matchesSearch('', ['lo que sea'])).toBe(true);
    expect(matchesSearch('   ', ['lo que sea'])).toBe(true);
  });
});

describe('units · formatDuration (D16)', () => {
  it('menos de un minuto se muestra en segundos', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(59)).toBe('59s');
  });
  it('a partir de un minuto, formato m:ss', () => {
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(125)).toBe('2:05');
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
