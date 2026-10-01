/**
 * Tests de la infraestructura i18n: traducción, placeholders, fallback y locale.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { t, setLocale, getLocale, resolveInitialLocale } from '../src/i18n/index.js';
import es from '../src/i18n/es.js';

describe('i18n', () => {
  beforeEach(() => setLocale('es'));

  it('traduce una clave existente', () => {
    expect(t('nav.train')).toBe('Entrenar');
  });

  it('sustituye placeholders', () => {
    expect(t('plan.perWeek', { n: 3 })).toBe('3 días por semana');
    expect(t('train.prLine', { reps: 10, weight: 40, unit: 'kg', date: '14 sep 2026' }))
      .toBe('🏆 PR: 10 reps × 40kg (14 sep 2026)');
  });

  it('placeholder sin valor se deja como {clave}', () => {
    expect(t('plan.perWeek')).toBe('{n} días por semana');
  });

  it('clave inexistente devuelve la propia clave (para detectar olvidos)', () => {
    expect(t('no.existe.esta.clave')).toBe('no.existe.esta.clave');
  });

  it('locale por defecto es es', () => {
    expect(getLocale()).toBe('es');
  });

  it('resolveInitialLocale respeta lo guardado si está soportado', () => {
    expect(resolveInitialLocale('es')).toBe('es');
    // idioma no soportado -> cae a es
    expect(resolveInitialLocale('fr')).toBe('es');
  });

  it('todas las claves del diccionario es son strings no vacías', () => {
    for (const [key, val] of Object.entries(es)) {
      expect(typeof val, `clave ${key}`).toBe('string');
      expect(val.length, `clave ${key}`).toBeGreaterThan(0);
    }
  });
});
