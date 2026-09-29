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
 * Esquema v1. Los índices siguen el modelo de datos de docs/ARQUITECTURA.md.
 * `userId` está indexado en todas las tablas (multitenant-ready).
 */
db.version(APP.dataVersion).stores({
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
