/**
 * Tests de las mejoras de valor: sugerencia de progresión y volumen por músculo.
 */
import { describe, it, expect } from 'vitest';
import { suggestNext, weightStep } from '../src/domain/progression.js';
import { volumeByMuscle, volumeRanking } from '../src/domain/volume.js';

describe('progression · sugerencia de progresión', () => {
  it('sin historial sugiere el objetivo del plan', () => {
    const s = suggestNext({ lastBest: null, target: { targetReps: 10, targetWeight: 40 } });
    expect(s.kind).toBe('plan');
    expect(s.reps).toBe(10);
    expect(s.weight).toBe(40);
  });

  it('dentro del rango de reps: sugiere +1 rep al mismo peso', () => {
    const s = suggestNext({ lastBest: { weight: 40, reps: 10 }, repRange: { min: 8, max: 12 } });
    expect(s.kind).toBe('reps');
    expect(s.reps).toBe(11);
    expect(s.weight).toBe(40);
  });

  it('en el tope de reps: sube peso y reinicia reps al mínimo', () => {
    const s = suggestNext({ lastBest: { weight: 40, reps: 12 }, repRange: { min: 8, max: 12 }, equipment: 'barra' });
    expect(s.kind).toBe('weight');
    expect(s.reps).toBe(8);
    expect(s.weight).toBe(42.5); // +2.5 barra
  });

  it('incremento de peso según equipo y magnitud', () => {
    expect(weightStep(40, 'mancuerna')).toBe(2);
    expect(weightStep(40, 'barra')).toBe(2.5);
    expect(weightStep(10, 'barra')).toBe(1.25);       // pesos pequeños más finos
    expect(weightStep(10, 'mancuerna')).toBe(1.25);   // fino también en mancuerna pequeña
  });
});

describe('volume · volumen por grupo muscular', () => {
  it('cuenta series por grupo muscular', () => {
    const sets = [
      { muscleGroup: 'pecho' }, { muscleGroup: 'pecho' }, { muscleGroup: 'pecho' },
      { muscleGroup: 'espalda' }, { muscleGroup: 'espalda' },
    ];
    const v = volumeByMuscle(sets);
    expect(v.pecho).toBe(3);
    expect(v.espalda).toBe(2);
  });

  it('ranking ordena de mayor a menor', () => {
    const r = volumeRanking({ pecho: 3, espalda: 5, pierna: 1 });
    expect(r[0]).toEqual({ muscle: 'espalda', sets: 5 });
    expect(r[2]).toEqual({ muscle: 'pierna', sets: 1 });
  });

  it('series sin grupo van a "otros"', () => {
    expect(volumeByMuscle([{}, {}]).otros).toBe(2);
  });
});
