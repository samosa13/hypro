/**
 * CAPA DATOS · Definición de la base de datos local (IndexedDB vía Dexie)
 *
 * Este fichero solo define el esquema. El acceso se hace SIEMPRE a través del
 * repositorio (repository.js), que cumple un contrato. Nada fuera de la capa
 * de datos importa Dexie directamente.
 */

import Dexie from 'dexie';
import { APP } from '../config/app.config.js';

export const db = new Dexie('forja-db');

/**
 * Esquema v1 (histórico). Se mantiene para que Dexie sepa migrar desde datos
 * ya guardados en dispositivos que instalaron la primera versión.
 */
db.version(1).stores({
  exercises: 'id, userId, muscleGroup, equipment, isCustom',
  plans: 'id, userId, isActive',
  planDays: 'id, planId, order',
  planExercises: 'id, planDayId, exerciseId, order',
  sessions: 'id, userId, planId, planDayId, startedAt',
  loggedSets: 'id, sessionId, exerciseId, loggedAt',
  personalRecords: 'id, userId, exerciseId',
  settings: 'userId',
  backups: 'id, userId, dateKey',
});

/**
 * Esquema v2. Cambios respecto a v1 (peer review):
 *  - `loggedSets` indexa `userId` (multitenant-ready + conteo eficiente).
 *  - `sessions` indexa `setCount` (nº de series registradas): permite saber
 *    barato si una sesión es "válida" (setCount > 0) sin recorrer loggedSets.
 * La migración rellena estos campos en los datos existentes de forma NO
 * destructiva (no se pierde ningún registro).
 */
db.version(2)
  .stores({
    exercises: 'id, userId, muscleGroup, equipment, isCustom',
    plans: 'id, userId, isActive',
    planDays: 'id, planId, order',
    planExercises: 'id, planDayId, exerciseId, order',
    sessions: 'id, userId, planId, planDayId, startedAt, setCount',
    loggedSets: 'id, sessionId, exerciseId, userId, loggedAt',
    personalRecords: 'id, userId, exerciseId',
    settings: 'userId',
    backups: 'id, userId, dateKey',
  })
  .upgrade(async (tx) => {
    // Mapa sessionId -> userId para propagar userId a las series.
    const sessions = await tx.table('sessions').toArray();
    const userBySession = Object.fromEntries(sessions.map((s) => [s.id, s.userId]));

    // Rellenar userId en loggedSets y contar series por sesión.
    const sets = await tx.table('loggedSets').toArray();
    const countBySession = {};
    for (const set of sets) {
      const owner = userBySession[set.sessionId] ?? APP.defaultUserId;
      countBySession[set.sessionId] = (countBySession[set.sessionId] ?? 0) + 1;
      if (set.userId !== owner) {
        await tx.table('loggedSets').update(set.id, { userId: owner });
      }
    }
    // Fijar setCount en cada sesión (0 si no tenía series → sesión "fantasma").
    for (const s of sessions) {
      await tx.table('sessions').update(s.id, { setCount: countBySession[s.id] ?? 0 });
    }
  });
