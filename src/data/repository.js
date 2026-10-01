/**
 * CAPA DATOS · Repositorio local (IndexedDB)
 *
 * CONTRATO: la UI y el dominio solo conocen los métodos públicos de este objeto.
 * El día que exista backend, se crea un `cloudRepository.js` con EXACTAMENTE los
 * mismos métodos y se cambia qué repositorio se exporta (ver factoría abajo).
 * Ni UI ni dominio se enteran del cambio.
 *
 * Todos los métodos operan sobre un `userId` (multitenant-ready).
 */

import { db } from './database.js';
import { APP, DEFAULT_SETTINGS } from '../config/app.config.js';

const uid = () =>
  (crypto?.randomUUID?.() ??
    'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));

export const repository = {
  // ---------- Ejercicios ----------
  async listExercises(userId = APP.defaultUserId) {
    return db.exercises.where('userId').equals(userId).toArray();
  },
  /** Un ejercicio por id (o undefined). Usado para leer su tipo de medición (D16). */
  async getExercise(exerciseId) {
    return db.exercises.get(exerciseId);
  },
  async addExercise(exercise, userId = APP.defaultUserId) {
    // Tipo de medición por defecto (D16): si el alta no lo especifica, es
    // peso+reps (el comportamiento histórico).
    const record = {
      id: uid(), userId, isCustom: true, createdAt: new Date().toISOString(),
      tracking: 'weight_reps', ...exercise,
    };
    await db.exercises.put(record);
    return record;
  },
  async bulkAddExercises(exercises) {
    await db.exercises.bulkPut(exercises);
  },
  async countExercises(userId = APP.defaultUserId) {
    return db.exercises.where('userId').equals(userId).count();
  },

  // ---------- Planes ----------
  async getActivePlan(userId = APP.defaultUserId) {
    const plans = await db.plans.where('userId').equals(userId).toArray();
    return plans.find((p) => p.isActive) ?? null;
  },
  async listPlans(userId = APP.defaultUserId) {
    return db.plans.where('userId').equals(userId).toArray();
  },
  async savePlan(plan, userId = APP.defaultUserId) {
    const record = { id: plan.id ?? uid(), userId, createdAt: plan.createdAt ?? new Date().toISOString(), ...plan };
    await db.plans.put(record);
    return record;
  },
  async setActivePlan(planId, userId = APP.defaultUserId) {
    const plans = await db.plans.where('userId').equals(userId).toArray();
    await db.transaction('rw', db.plans, async () => {
      for (const p of plans) {
        await db.plans.update(p.id, { isActive: p.id === planId });
      }
    });
  },

  // ---------- Días del plan ----------
  async listPlanDays(planId) {
    const days = await db.planDays.where('planId').equals(planId).toArray();
    return days.sort((a, b) => a.order - b.order);
  },
  async savePlanDay(day) {
    const record = { id: day.id ?? uid(), ...day };
    await db.planDays.put(record);
    return record;
  },
  async deletePlanDay(dayId) {
    await db.transaction('rw', db.planDays, db.planExercises, async () => {
      await db.planExercises.where('planDayId').equals(dayId).delete();
      await db.planDays.delete(dayId);
    });
  },
  /**
   * Duplica un día del plan: crea un día nuevo al final (order = max+1) con el
   * nombre indicado (o el del origen + sufijo) y CLONA todos sus planExercises
   * con ids nuevos (no comparte referencias; editar la copia no toca el origen).
   * Transaccional. Devuelve el día creado.
   * @param {string} dayId  día a duplicar
   * @param {string} [newName]  nombre para la copia (si se omite, se usa el del origen)
   * @returns {Promise<object|null>} el nuevo planDay, o null si el origen no existe
   */
  async duplicatePlanDay(dayId, newName) {
    let created = null;
    await db.transaction('rw', db.planDays, db.planExercises, async () => {
      const src = await db.planDays.get(dayId);
      if (!src) return;
      const siblings = await db.planDays.where('planId').equals(src.planId).toArray();
      const maxOrder = siblings.reduce((m, d) => Math.max(m, d.order ?? 0), 0);
      const newDay = { id: uid(), planId: src.planId, name: newName ?? src.name, order: maxOrder + 1 };
      await db.planDays.put(newDay);
      const exs = (await db.planExercises.where('planDayId').equals(dayId).toArray())
        .sort((a, b) => a.order - b.order);
      // Remapeo de groupId (D17): si el día tiene superseries/circuitos, la copia
      // debe tener groupIds NUEVOS para no compartir identidad de grupo con el
      // origen. Se mapea cada groupId original a uno nuevo, conservando qué
      // ejercicios van juntos.
      const groupRemap = new Map();
      for (const pe of exs) {
        // Clona todos los campos salvo id/planDayId (nuevos). Spread primero para
        // arrastrar campos futuros (repMin/repMax, etc.) sin tener que listarlos.
        const clone = { ...pe, id: uid(), planDayId: newDay.id };
        if (pe.groupId) {
          if (!groupRemap.has(pe.groupId)) groupRemap.set(pe.groupId, uid());
          clone.groupId = groupRemap.get(pe.groupId);
        }
        await db.planExercises.put(clone);
      }
      created = newDay;
    });
    return created;
  },

  // ---------- Ejercicios de un día ----------
  async listPlanExercises(planDayId) {
    const items = await db.planExercises.where('planDayId').equals(planDayId).toArray();
    return items.sort((a, b) => a.order - b.order);
  },
  async savePlanExercise(pe) {
    const record = { id: pe.id ?? uid(), ...pe };
    await db.planExercises.put(record);
    return record;
  },
  async deletePlanExercise(id) {
    await db.transaction('rw', db.planExercises, async () => {
      const pe = await db.planExercises.get(id);
      await db.planExercises.delete(id);
      // Si el borrado deja un grupo (D17) con un solo miembro, ese miembro deja
      // de ser una superserie: se limpia su groupId para no mostrar un bloque
      // de un solo ejercicio.
      if (pe && pe.groupId) {
        const rest = (await db.planExercises.where('planDayId').equals(pe.planDayId).toArray())
          .filter((x) => x.groupId === pe.groupId);
        if (rest.length === 1) {
          await db.planExercises.update(rest[0].id, { groupId: null, groupType: null });
        } else if (rest.length >= 2) {
          // Reajusta groupType al nuevo tamaño del grupo.
          const groupType = rest.length === 2 ? 'superset' : rest.length === 3 ? 'triset' : 'circuit';
          for (const m of rest) await db.planExercises.update(m.id, { groupType });
        }
      }
    });
  },
  /**
   * Reordena un ejercicio dentro de su día moviéndolo una posición arriba
   * (dir=-1) o abajo (dir=+1). Reescribe el campo `order` de forma contigua
   * (1..N) tras el intercambio, para que no queden huecos ni empates. No-op si
   * el movimiento se sale de los límites. Transaccional.
   * @returns {Promise<boolean>} true si hubo cambio
   */
  async movePlanExercise(planDayId, planExerciseId, dir) {
    let changed = false;
    await db.transaction('rw', db.planExercises, async () => {
      const items = (await db.planExercises.where('planDayId').equals(planDayId).toArray())
        .sort((a, b) => a.order - b.order);

      // Agrupar en UNIDADES de movimiento (peer review D17 #1): un ejercicio
      // suelto es una unidad; un grupo (superserie/circuito) es UNA sola unidad
      // que se mueve en bloque. Así reordenar nunca parte un grupo ni mete un
      // ejercicio ajeno en medio. Los miembros de un grupo son contiguos (lo
      // garantiza groupWithNext), así que el agrupamiento por recorrido es seguro.
      const units = [];
      let i = 0;
      while (i < items.length) {
        const pe = items[i];
        if (pe.groupId) {
          const members = [];
          while (i < items.length && items[i].groupId === pe.groupId) { members.push(items[i]); i++; }
          units.push(members);
        } else {
          units.push([pe]); i++;
        }
      }

      // Localizar la unidad que contiene el ejercicio pulsado.
      const uIdx = units.findIndex((u) => u.some((pe) => pe.id === planExerciseId));
      if (uIdx === -1) return;
      const target = uIdx + dir;
      if (target < 0 || target >= units.length) return; // fuera de límites

      // Intercambia unidades completas y renumera 1..N de forma contigua.
      [units[uIdx], units[target]] = [units[target], units[uIdx]];
      let order = 1;
      for (const unit of units) {
        for (const pe of unit) {
          if (pe.order !== order) await db.planExercises.update(pe.id, { order });
          order++;
        }
      }
      changed = true;
    });
    return changed;
  },
  /**
   * Agrupa un ejercicio con el SIGUIENTE del día en una superserie/circuito
   * (D17). Si alguno de los dos ya pertenece a un grupo, el otro se une a ese
   * grupo (permite construir triseries/circuitos encadenando). Mantiene a los
   * miembros contiguos por `order` y renumera 1..N. Transaccional.
   *
   * Regla de bloque: un `groupId` es un conjunto de ejercicios consecutivos que
   * se entrenan en rotación. `groupType` se deriva del tamaño ('superset'=2,
   * 'triset'=3, 'circuit'=4+) y se guarda en todos los miembros para la UI.
   * @returns {Promise<boolean>} true si se agrupó
   */
  async groupWithNext(planDayId, planExerciseId) {
    let ok = false;
    await db.transaction('rw', db.planExercises, async () => {
      const items = (await db.planExercises.where('planDayId').equals(planDayId).toArray())
        .sort((a, b) => a.order - b.order);
      const idx = items.findIndex((pe) => pe.id === planExerciseId);
      if (idx === -1 || idx >= items.length - 1) return; // no hay "siguiente"
      const a = items[idx];
      const b = items[idx + 1];
      // Determinar el groupId resultante: reutiliza el de a o el de b si existe.
      const groupId = a.groupId || b.groupId || uid();
      // Miembros del grupo final = a, b y cualquiera que ya compartiera grupo
      // con alguno de los dos (encadenar triserie/circuito).
      const memberIds = new Set([a.id, b.id]);
      for (const pe of items) {
        if ((a.groupId && pe.groupId === a.groupId) || (b.groupId && pe.groupId === b.groupId)) {
          memberIds.add(pe.id);
        }
      }
      // Reordenar: llevar todos los miembros a posiciones contiguas, empezando
      // donde está el primero de ellos. El resto conserva su orden relativo.
      // INVARIANTE (peer review D17): firstMemberIdx es la posición del PRIMER
      // miembro en `items`; todo lo anterior es ajeno, así que en ese prefijo el
      // índice sobre `items` coincide con el índice sobre `rest`. El corte sobre
      // `rest` con firstMemberIdx es por tanto correcto: inserta el bloque justo
      // donde estaba el primer miembro.
      const members = items.filter((pe) => memberIds.has(pe.id));
      const rest = items.filter((pe) => !memberIds.has(pe.id));
      const firstMemberIdx = items.findIndex((pe) => memberIds.has(pe.id));
      const reordered = [...rest.slice(0, firstMemberIdx), ...members, ...rest.slice(firstMemberIdx)];
      const groupType = members.length === 2 ? 'superset' : members.length === 3 ? 'triset' : 'circuit';
      // Normalizar el nº de series entre miembros (peer review D17 #3): en una
      // rotación todos los ejercicios hacen el mismo nº de vueltas. Se adopta el
      // máximo targetSets de los miembros para no capar a nadie.
      const groupSets = members.reduce((m, pe) => Math.max(m, pe.targetSets || 0), 0) || 3;
      for (let i = 0; i < reordered.length; i++) {
        const pe = reordered[i];
        const patch = { order: i + 1 };
        if (memberIds.has(pe.id)) { patch.groupId = groupId; patch.groupType = groupType; patch.targetSets = groupSets; }
        await db.planExercises.update(pe.id, patch);
      }
      ok = true;
    });
    return ok;
  },

  /**
   * Deshace un grupo (D17): quita groupId/groupType a todos los miembros del
   * grupo al que pertenece el ejercicio dado. No cambia el orden. Transaccional.
   * @returns {Promise<boolean>} true si se desagrupó algo
   */
  async ungroup(planDayId, planExerciseId) {
    let ok = false;
    await db.transaction('rw', db.planExercises, async () => {
      const pe = await db.planExercises.get(planExerciseId);
      if (!pe || !pe.groupId) return;
      const members = (await db.planExercises.where('planDayId').equals(planDayId).toArray())
        .filter((x) => x.groupId === pe.groupId);
      for (const m of members) {
        await db.planExercises.update(m.id, { groupId: null, groupType: null });
      }
      ok = true;
    });
    return ok;
  },

  /**
   * Todos los planExercises del usuario. planExercises no lleva userId (cuelga
   * de planDay → plan), así que se resuelve la propiedad por sus planes. Se usa
   * en la migración de rangos de reps (repMin/repMax).
   */
  async listAllPlanExercises(userId = APP.defaultUserId) {
    const plans = await db.plans.where('userId').equals(userId).toArray();
    const planIds = new Set(plans.map((p) => p.id));
    const days = await db.planDays.toArray();
    const dayIds = new Set(days.filter((d) => planIds.has(d.planId)).map((d) => d.id));
    const all = await db.planExercises.toArray();
    return all.filter((pe) => dayIds.has(pe.planDayId));
  },
  /** Actualiza planExercises en lote (campos libres, sin cambio de esquema). */
  async bulkPutPlanExercises(items) {
    await db.planExercises.bulkPut(items);
  },

  // ---------- Sesiones ----------
  // CRITERIO ÚNICO de "sesión válida" (peer review #1/#13): una sesión cuenta
  // como día entrenado solo si tiene al menos una serie registrada (setCount>0).
  // Las sesiones "fantasma" (se pulsó Empezar y no se registró nada) NO cuentan
  // para semana efectiva, racha ni contadores.
  async countSessions(planId) {
    // Solo sesiones válidas (con series) de este plan.
    return db.sessions.where('planId').equals(planId).filter((s) => (s.setCount ?? 0) > 0).count();
  },
  async countAllSessions(userId = APP.defaultUserId) {
    return db.sessions.where('userId').equals(userId).filter((s) => (s.setCount ?? 0) > 0).count();
  },
  /** Todas las sesiones del usuario (incluye fantasma; filtrar con validSessions). */
  async listSessions(userId = APP.defaultUserId) {
    return db.sessions.where('userId').equals(userId).toArray();
  },
  /** Solo sesiones válidas (con al menos una serie). */
  async listValidSessions(userId = APP.defaultUserId) {
    return db.sessions.where('userId').equals(userId).filter((s) => (s.setCount ?? 0) > 0).toArray();
  },
  async getSession(sessionId) {
    return db.sessions.get(sessionId);
  },
  async startSession(session, userId = APP.defaultUserId) {
    const record = { id: uid(), userId, startedAt: new Date().toISOString(), finishedAt: null, setCount: 0, ...session };
    await db.sessions.put(record);
    return record;
  },
  async finishSession(sessionId) {
    await db.sessions.update(sessionId, { finishedAt: new Date().toISOString() });
  },
  /** Guarda una nota de texto libre en la sesión (#5). Campo libre, sin índice. */
  async updateSessionNote(sessionId, note) {
    await db.sessions.update(sessionId, { note: note ?? '' });
  },
  /**
   * Guarda/actualiza la nota de un EJERCICIO concreto dentro de la sesión (B8).
   * Las notas por ejercicio viven en un mapa `exerciseNotes` de la sesión
   * ({ [exerciseId]: texto }), campo libre sin índice. Una nota vacía se elimina
   * del mapa para no acumular basura.
   */
  async updateSessionExerciseNote(sessionId, exerciseId, note) {
    const s = await db.sessions.get(sessionId);
    if (!s) return;
    const notes = { ...(s.exerciseNotes ?? {}) };
    const text = (note ?? '').trim();
    if (text) notes[exerciseId] = text;
    else delete notes[exerciseId];
    await db.sessions.update(sessionId, { exerciseNotes: notes });
  },
  /**
   * Elimina una sesión fantasma (sin series). Se usa al salir de Entrenar sin
   * haber registrado nada, para no dejar basura en la tabla.
   */
  async discardSessionIfEmpty(sessionId) {
    const s = await db.sessions.get(sessionId);
    if (s && (s.setCount ?? 0) === 0) {
      await db.sessions.delete(sessionId);
      return true;
    }
    return false;
  },

  // ---------- Series registradas ----------
  async listSetsForSession(sessionId) {
    return db.loggedSets.where('sessionId').equals(sessionId).toArray();
  },
  async listSetsForExercise(exerciseId) {
    return db.loggedSets.where('exerciseId').equals(exerciseId).toArray();
  },
  async countAllSets(userId = APP.defaultUserId) {
    // loggedSets ahora lleva userId indexado (v2): conteo directo y eficiente.
    return db.loggedSets.where('userId').equals(userId).count();
  },
  /** Última serie registrada de una sesión (para medir descanso real estable). */
  async lastSetOfSession(sessionId) {
    const sets = await db.loggedSets.where('sessionId').equals(sessionId).toArray();
    if (sets.length === 0) return null;
    return sets.sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt))[0];
  },
  async logSet(set) {
    const record = {
      id: uid(),
      userId: set.userId ?? APP.defaultUserId,
      loggedAt: new Date().toISOString(),
      isPR: false,
      ...set,
    };
    await db.transaction('rw', db.loggedSets, db.sessions, async () => {
      await db.loggedSets.put(record);
      // Incrementa el contador de series de la sesión (criterio de validez).
      // NOTA (B9): una serie de calentamiento TAMBIÉN cuenta aquí. Es decir, una
      // sesión compuesta solo de calentamientos se considera "día entrenado"
      // (avanza semana efectiva y racha) aunque no aporte volumen ni PR. Es un
      // modelo deliberado de "asistencia ≠ productividad": fuiste al gym.
      const s = await db.sessions.get(record.sessionId);
      if (s) await db.sessions.update(record.sessionId, { setCount: (s.setCount ?? 0) + 1 });
    });
    return record;
  },
  async getSet(setId) {
    return db.loggedSets.get(setId);
  },
  /** Actualiza campos de una serie ya registrada (editar peso/reps, etc.). */
  async updateLoggedSet(setId, patch) {
    await db.loggedSets.update(setId, patch);
    return db.loggedSets.get(setId);
  },
  /**
   * Borra una serie registrada y decrementa el `setCount` de su sesión (el
   * criterio de "sesión válida"). No baja de 0. No recomputa el PR: eso lo hace
   * el appService, que conoce el dominio.
   */
  async deleteLoggedSet(setId) {
    await db.transaction('rw', db.loggedSets, db.sessions, async () => {
      const set = await db.loggedSets.get(setId);
      if (!set) return;
      await db.loggedSets.delete(setId);
      const s = await db.sessions.get(set.sessionId);
      if (s) await db.sessions.update(set.sessionId, { setCount: Math.max(0, (s.setCount ?? 1) - 1) });
    });
  },
  /** Elimina el PR de un ejercicio (cuando ya no queda ninguna serie válida). */
  async deletePR(exerciseId, userId = APP.defaultUserId) {
    const existing = await this.getPR(exerciseId, userId);
    if (existing) await db.personalRecords.delete(existing.id);
  },

  // ---------- Récords personales ----------
  async getPR(exerciseId, userId = APP.defaultUserId) {
    const prs = await db.personalRecords.where('exerciseId').equals(exerciseId).toArray();
    return prs.find((p) => p.userId === userId) ?? null;
  },
  async listPRs(userId = APP.defaultUserId) {
    return db.personalRecords.where('userId').equals(userId).toArray();
  },
  async savePR(pr) {
    // Un PR por (userId, exerciseId): buscamos el existente para reutilizar id.
    const existing = await this.getPR(pr.exerciseId, pr.userId);
    const record = { id: existing?.id ?? uid(), ...pr };
    await db.personalRecords.put(record);
    return record;
  },
  async countPRs(userId = APP.defaultUserId) {
    return db.personalRecords.where('userId').equals(userId).count();
  },

  // ---------- Ajustes ----------
  async getSettings(userId = APP.defaultUserId) {
    let s = await db.settings.get(userId);
    if (!s) {
      s = { userId, ...DEFAULT_SETTINGS };
      await db.settings.put(s);
    }
    return s;
  },
  async saveSettings(settings, userId = APP.defaultUserId) {
    const record = { ...settings, userId };
    await db.settings.put(record);
    return record;
  },

  // ---------- Backup / export / import ----------
  async hasBackupForDate(dateKey, userId = APP.defaultUserId) {
    const all = await db.backups.where('dateKey').equals(dateKey).toArray();
    return all.some((b) => b.userId === userId);
  },
  async exportAll(userId = APP.defaultUserId) {
    // Volcado completo (round-trip con importAll).
    return {
      meta: { app: APP.name, dataVersion: APP.dataVersion, exportedAt: new Date().toISOString(), userId },
      exercises: await db.exercises.toArray(),
      plans: await db.plans.toArray(),
      planDays: await db.planDays.toArray(),
      planExercises: await db.planExercises.toArray(),
      sessions: await db.sessions.toArray(),
      loggedSets: await db.loggedSets.toArray(),
      personalRecords: await db.personalRecords.toArray(),
      settings: await db.settings.toArray(),
    };
  },
  async saveBackup(dateKey, userId = APP.defaultUserId) {
    const payload = await this.exportAll(userId);
    const record = { id: uid(), userId, dateKey, createdAt: new Date().toISOString(), payload };
    await db.backups.put(record);
    return record;
  },
  /**
   * Valida que `data` parece un backup de Hypro antes de tocar nada.
   * Devuelve { ok, reason }. NO lanza. (peer review #4)
   */
  validateBackup(data) {
    if (!data || typeof data !== 'object') return { ok: false, reason: 'El fichero no es un backup válido.' };
    if (!data.meta || data.meta.app !== APP.name) {
      return { ok: false, reason: 'El fichero no es un backup de Hypro.' };
    }
    if (typeof data.meta.dataVersion !== 'number' || data.meta.dataVersion > APP.dataVersion) {
      return { ok: false, reason: 'El backup es de una versión más nueva y no es compatible.' };
    }
    // Las tablas presentes deben ser arrays.
    const tables = ['exercises', 'plans', 'planDays', 'planExercises', 'sessions', 'loggedSets', 'personalRecords', 'settings'];
    for (const t of tables) {
      if (data[t] !== undefined && !Array.isArray(data[t])) {
        return { ok: false, reason: `El backup está corrupto (tabla ${t}).` };
      }
    }
    return { ok: true };
  },

  /**
   * Restaura un backup de forma SEGURA (peer review #4):
   *  1. Valida el contenido; si no es válido, no toca nada y devuelve error.
   *  2. Hace un backup automático del estado actual (red de seguridad).
   *  3. Reemplaza los datos dentro de una transacción.
   * @returns {Promise<{ok:boolean, reason?:string}>}
   */
  async importAll(data, userId = APP.defaultUserId) {
    const check = this.validateBackup(data);
    if (!check.ok) return check;

    // Red de seguridad: backup del estado actual antes de destruir.
    try {
      await this.saveBackup('pre-import-' + new Date().toISOString(), userId);
    } catch {
      /* si falla el backup previo, seguimos: el usuario pidió importar */
    }

    await db.transaction(
      'rw',
      [db.exercises, db.plans, db.planDays, db.planExercises, db.sessions, db.loggedSets, db.personalRecords, db.settings],
      async () => {
        await Promise.all([
          db.exercises.clear(), db.plans.clear(), db.planDays.clear(), db.planExercises.clear(),
          db.sessions.clear(), db.loggedSets.clear(), db.personalRecords.clear(), db.settings.clear(),
        ]);
        if (data.exercises) await db.exercises.bulkPut(data.exercises);
        if (data.plans) await db.plans.bulkPut(data.plans);
        if (data.planDays) await db.planDays.bulkPut(data.planDays);
        if (data.planExercises) await db.planExercises.bulkPut(data.planExercises);
        if (data.sessions) await db.sessions.bulkPut(data.sessions);
        if (data.loggedSets) await db.loggedSets.bulkPut(data.loggedSets);
        if (data.personalRecords) await db.personalRecords.bulkPut(data.personalRecords);
        if (data.settings) await db.settings.bulkPut(data.settings);
      }
    );
    return { ok: true };
  },

  /**
   * Borra TODOS los datos del usuario (reseteo a estado inicial). Vacía las 9
   * tablas en una transacción, incluidas `exercises`, `settings` y `backups`.
   * NO resiembra el catálogo ni recrea los ajustes: de eso se encarga
   * `appService.bootstrap()`, que debe llamarse justo después para dejar la app
   * como recién instalada (catálogo semilla + ajustes por defecto).
   *
   * Operación DESTRUCTIVA e irreversible: la UI debe exigir doble confirmación
   * y ofrecer exportar una copia antes.
   */
  async wipeAll() {
    await db.transaction(
      'rw',
      [db.exercises, db.plans, db.planDays, db.planExercises, db.sessions, db.loggedSets, db.personalRecords, db.settings, db.backups],
      async () => {
        await Promise.all([
          db.exercises.clear(), db.plans.clear(), db.planDays.clear(), db.planExercises.clear(),
          db.sessions.clear(), db.loggedSets.clear(), db.personalRecords.clear(),
          db.settings.clear(), db.backups.clear(),
        ]);
      }
    );
  },
};

export default repository;
