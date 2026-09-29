/**
 * Tests de integración del repositorio con IndexedDB real simulado
 * (fake-indexeddb). Cubre el import SEGURO (#4): validación antes de destruir.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { APP } from '../src/config/app.config.js';

// Importar el repo después de fake-indexeddb para que Dexie use el shim.
const { default: repository } = await import('../src/data/repository.js');
const { db } = await import('../src/data/database.js');

describe('repository · import seguro (#4)', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.exercises.clear(), db.plans.clear(), db.planDays.clear(), db.planExercises.clear(),
      db.sessions.clear(), db.loggedSets.clear(), db.personalRecords.clear(), db.settings.clear(),
    ]);
  });

  it('validateBackup rechaza objetos que no son backups de Hypro', () => {
    expect(repository.validateBackup(null).ok).toBe(false);
    expect(repository.validateBackup({}).ok).toBe(false);
    expect(repository.validateBackup({ meta: { app: 'Otra' } }).ok).toBe(false);
  });

  it('validateBackup rechaza versiones de datos más nuevas', () => {
    const res = repository.validateBackup({ meta: { app: APP.name, dataVersion: APP.dataVersion + 5 } });
    expect(res.ok).toBe(false);
  });

  it('validateBackup acepta un backup bien formado', () => {
    const res = repository.validateBackup({ meta: { app: APP.name, dataVersion: APP.dataVersion }, exercises: [] });
    expect(res.ok).toBe(true);
  });

  it('importAll NO destruye datos si el backup es inválido', async () => {
    await db.exercises.put({ id: 'keep1', userId: 'me', name: 'Sentadilla' });
    const res = await repository.importAll({ garbage: true }, 'me');
    expect(res.ok).toBe(false);
    // Los datos siguen intactos
    expect(await db.exercises.count()).toBe(1);
    expect((await db.exercises.get('keep1')).name).toBe('Sentadilla');
  });

  it('importAll restaura un backup válido (round-trip)', async () => {
    await db.exercises.put({ id: 'old', userId: 'me', name: 'Viejo' });
    const backup = {
      meta: { app: APP.name, dataVersion: APP.dataVersion },
      exercises: [{ id: 'new1', userId: 'me', name: 'Press banca' }],
      plans: [], planDays: [], planExercises: [],
      sessions: [], loggedSets: [], personalRecords: [], settings: [],
    };
    const res = await repository.importAll(backup, 'me');
    expect(res.ok).toBe(true);
    expect(await db.exercises.get('old')).toBeUndefined();     // se reemplazó
    expect((await db.exercises.get('new1')).name).toBe('Press banca');
  });
});
