/**
 * Tests de las mejoras de valor: sugerencia de progresión y volumen por músculo.
 */
import { describe, it, expect } from 'vitest';
import { suggestNext, weightStep, deriveRepRange, normalizeRepRange } from '../src/domain/progression.js';
import { volumeByMuscle, volumeRanking, volumeStatus } from '../src/domain/volume.js';

describe('volume · semáforo de volumen vs objetivo (C13)', () => {
  it('low por debajo del 70% del objetivo', () => {
    expect(volumeStatus(8, 12)).toBe('low');   // 8 < 8.4
  });
  it('onTarget en la zona 70%-130%', () => {
    expect(volumeStatus(12, 12)).toBe('onTarget');
    expect(volumeStatus(9, 12)).toBe('onTarget');  // 9 >= 8.4
    expect(volumeStatus(15, 12)).toBe('onTarget'); // 15 <= 15.6
  });
  it('high por encima del 130% del objetivo', () => {
    expect(volumeStatus(16, 12)).toBe('high');  // 16 > 15.6
  });
  it('sin objetivo (<=0) devuelve onTarget', () => {
    expect(volumeStatus(5, 0)).toBe('onTarget');
    expect(volumeStatus(5, undefined)).toBe('onTarget');
  });
});
import { kgToDisplay, displayToKg, unitLabel, formatWeight } from '../src/domain/units.js';

describe('units · conversión kg/lb (B11)', () => {
  it('etiqueta de unidad', () => {
    expect(unitLabel('kg')).toBe('kg');
    expect(unitLabel('lb')).toBe('lb');
    expect(unitLabel(undefined)).toBe('kg');
  });

  it('kg se muestra tal cual en kg y convertido en lb', () => {
    expect(kgToDisplay(60, 'kg')).toBe(60);
    // 60 kg ≈ 132.277 lb → redondeo a 0.5 = 132.5
    expect(kgToDisplay(60, 'lb')).toBe(132.5);
  });

  it('entrada del usuario se convierte a kg canónico', () => {
    expect(displayToKg(60, 'kg')).toBe(60);
    // 132.5 lb ≈ 60.1 kg
    expect(displayToKg(132.5, 'lb')).toBeCloseTo(60.1, 1);
  });

  it('round-trip sin drift grande: kg→lb→kg se mantiene cerca', () => {
    const kg = 100;
    const lb = kgToDisplay(kg, 'lb');     // display en lb (redondeado a .5)
    const back = displayToKg(lb, 'lb');   // de vuelta a kg
    expect(back).toBeCloseTo(kg, 0);      // within ~0.5 kg por el redondeo de display
  });

  it('formatWeight incluye la unidad', () => {
    expect(formatWeight(60, 'kg')).toBe('60 kg');
    expect(formatWeight(60, 'lb')).toBe('132.5 lb');
  });

  it('el coach formatea el texto en la unidad elegida pero devuelve weight en kg', () => {
    const s = suggestNext({ lastBest: { weight: 60, reps: 8 }, repRange: { min: 6, max: 10 }, unit: 'lb' });
    expect(s.weight).toBe(60);            // el peso devuelto sigue en kg
    expect(s.text).toContain('lb');       // el texto se muestra en lb
    expect(s.text).not.toContain('kg');
  });
});

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

  // --- Progresión por rango configurable (el fallo del 8-12 fijo) ---

  it('respeta un rango bajo: a 6 reps con rango 6-8 sugiere 7, NO empuja a 12', () => {
    const s = suggestNext({ lastBest: { weight: 60, reps: 6 }, repRange: { min: 6, max: 8 }, equipment: 'barra' });
    expect(s.kind).toBe('reps');
    expect(s.reps).toBe(7);
    expect(s.weight).toBe(60);
  });

  it('en el tope de un rango bajo (8 reps, rango 6-8) sube peso y baja a 6', () => {
    const s = suggestNext({ lastBest: { weight: 60, reps: 8 }, repRange: { min: 6, max: 8 }, equipment: 'barra' });
    expect(s.kind).toBe('weight');
    expect(s.reps).toBe(6);          // reinicia al MÍNIMO del rango, no a 8
    expect(s.weight).toBe(62.5);
  });

  it('rango alto (12-15): a 12 reps sugiere 13, no sube peso todavía', () => {
    const s = suggestNext({ lastBest: { weight: 30, reps: 12 }, repRange: { min: 12, max: 15 } });
    expect(s.kind).toBe('reps');
    expect(s.reps).toBe(13);
  });

  it('sin historial ACOTA el targetReps heredado al rango (no empuja a 12 con rango 6-8)', () => {
    // Caso migración: plan antiguo con targetReps=12 pero rango configurado 6-8.
    const s = suggestNext({ lastBest: null, target: { targetReps: 12, targetWeight: 60 }, repRange: { min: 6, max: 8 } });
    expect(s.kind).toBe('plan');
    expect(s.reps).toBe(8); // clampeado al máximo del rango, no 12
    expect(s.weight).toBe(60);
  });

  it('sin historial usa el targetReps si ya cae dentro del rango', () => {
    const s = suggestNext({ lastBest: null, target: { targetReps: 7, targetWeight: 60 }, repRange: { min: 6, max: 8 } });
    expect(s.reps).toBe(7);
  });

  it('rango degenerado (min==max): dentro sube reps hasta el tope, en el tope sube peso', () => {
    const below = suggestNext({ lastBest: { weight: 50, reps: 7 }, repRange: { min: 8, max: 8 }, equipment: 'barra' });
    expect(below.kind).toBe('reps');
    expect(below.reps).toBe(8);
    const atCap = suggestNext({ lastBest: { weight: 50, reps: 8 }, repRange: { min: 8, max: 8 }, equipment: 'barra' });
    expect(atCap.kind).toBe('weight');
    expect(atCap.reps).toBe(8); // reinicia al único valor del rango
    expect(atCap.weight).toBe(52.5);
  });
});

describe('progression · derivación y normalización de rangos', () => {
  it('deriva rango centrado ±2 desde targetReps', () => {
    expect(deriveRepRange(10)).toEqual({ min: 8, max: 12 });
    expect(deriveRepRange(6)).toEqual({ min: 4, max: 8 });
  });

  it('acota el mínimo a 1 y cae a 8-12 si targetReps es inválido', () => {
    expect(deriveRepRange(2)).toEqual({ min: 1, max: 4 });
    expect(deriveRepRange(0)).toEqual({ min: 8, max: 12 });
    expect(deriveRepRange(undefined)).toEqual({ min: 8, max: 12 });
  });

  it('normaliza rangos incoherentes (min>max se invierte, valores <1 se acotan)', () => {
    expect(normalizeRepRange(8, 12)).toEqual({ min: 8, max: 12 });
    expect(normalizeRepRange(12, 8)).toEqual({ min: 8, max: 12 }); // invertido
    expect(normalizeRepRange(0, 5)).toEqual({ min: 1, max: 5 });   // min acotado
    expect(normalizeRepRange(8, 8)).toEqual({ min: 8, max: 8 });   // degenerado válido
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
