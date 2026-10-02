/**
 * UI · Pantalla "Calendario" (F3).
 *
 * Vista mensual (lunes→domingo) de los entrenos realizados. Los días con una
 * sesión válida se pintan coloreados (por su `startedAt` real); el resto, vacío.
 * Tocar un día:
 *   - con entreno  → muestra el detalle de la sesión de ese día.
 *   - vacío y válido (hoy o pasado reciente que la barrera permite) → abre la
 *     ficha de registro a toro pasado, serie a serie, SIN cronómetro de
 *     descansos (reutiliza appService.logPastSession, que es la vía retroactiva).
 *
 * NUNCA permite registrar a futuro ni en días que descuadrarían la semana
 * efectiva (la barrera canLogPastSession decide; aquí solo se refleja en la UI).
 *
 * Navegación: cada sub-ficha registra una capa (pushLayer) para que el gesto
 * "atrás" de Android vuelva al calendario en vez de salir de la app.
 */
import { h, clear, toast } from '../dom.js';
import { icon } from '../icons.js';
import { pushLayer, popLayer } from '../nav.js';
import { t } from '../../i18n/index.js';
import { dateKey, formatDate } from '../../domain/dateKey.js';
import { displayToKg, unitLabel, kgToDisplay, formatDuration } from '../../domain/units.js';
import { normalizeTracking } from '../../domain/personalRecord.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Fecha "sellada" de un día del calendario: mediodía local, para evitar que un
 *  cambio de huso al pasar por medianoche UTC desplace el día. */
function sealedISO(year, month, day) {
  return new Date(year, month, day, 12, 0, 0, 0).toISOString();
}

/**
 * @param {HTMLElement} root
 * @param {object} app appService
 * @param {{year:number, month:number}} [view] mes a mostrar (0-based month)
 */
export async function renderCalendar(root, app, view) {
  clear(root);
  const screen = h('div', { class: 'screen' });
  const now = new Date();
  const state = view ?? { year: now.getFullYear(), month: now.getMonth() };

  const plan = await app.repo.getActivePlan(app.userId);

  // Cabecera.
  screen.appendChild(h('div', { class: 'row', style: 'align-items:center;gap:10px;margin-bottom:4px' }, [
    h('div', {}, [
      h('div', { style: 'font-weight:800;font-size:18px' }, t('calendar.title')),
      h('div', { class: 'muted' }, t('calendar.subtitle')),
    ]),
  ]));

  if (!plan) {
    screen.appendChild(h('div', { class: 'empty' }, t('calendar.needPlan')));
    root.appendChild(screen);
    return;
  }

  // Sesiones válidas del plan, indexadas por clave de día (según startedAt real).
  const sessions = (await app.repo.listValidSessions(app.userId)).filter((s) => s.planId === plan.id);
  const byDay = new Map();
  for (const s of sessions) {
    const k = dateKey(s.startedAt);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(s);
  }

  const card = h('div', { class: 'card' });

  // Navegación de mes.
  const goMonth = (delta) => {
    let m = state.month + delta, y = state.year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    renderCalendar(root, app, { year: y, month: m });
  };
  card.appendChild(h('div', { class: 'cal-head' }, [
    h('button', { class: 'cal-nav', title: t('calendar.prevMonth'), onClick: () => goMonth(-1) }, '‹'),
    h('div', { class: 'cal-month' }, `${MESES[state.month]} ${state.year}`),
    h('button', { class: 'cal-nav', title: t('calendar.nextMonth'), onClick: () => goMonth(1) }, '›'),
  ]));

  // Rejilla: cabecera de días (lunes→domingo) + celdas.
  const grid = h('div', { class: 'cal-grid' });
  for (const wd of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
    grid.appendChild(h('div', { class: 'cal-weekday' }, t(`calendar.weekday${wd}`)));
  }

  // Hueco inicial: cuántas celdas vacías antes del día 1 (semana empieza en lunes).
  // getDay(): 0=domingo..6=sábado → desplazamos para que lunes=0.
  const first = new Date(state.year, state.month, 1);
  const lead = (first.getDay() + 6) % 7;
  for (let i = 0; i < lead; i++) grid.appendChild(h('div', { class: 'cal-day empty' }));

  const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
  const todayKey = dateKey(now);

  for (let d = 1; d <= daysInMonth; d++) {
    const k = `${state.year}-${String(state.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const trained = byDay.has(k);
    const isToday = k === todayKey;
    const classes = ['cal-day'];
    if (trained) classes.push('trained');
    if (isToday) classes.push('today');

    const cell = h('button', { class: classes.join(' ') }, String(d));
    cell.addEventListener('click', async () => {
      if (trained) {
        // Mostrar el entreno (o entrenos) de ese día.
        renderSessionDetail(root, app, plan, byDay.get(k), state);
        return;
      }
      // Día vacío: ¿se puede registrar? La barrera de dominio decide.
      const iso = sealedISO(state.year, state.month, d);
      const check = await app.canLogPastSession(plan, iso);
      if (!check.ok) { toast(check.reason || t('calendar.futureBlocked')); return; }
      renderLogPastDay(root, app, plan, { year: state.year, month: state.month, day: d, iso }, state);
    });
    grid.appendChild(cell);
  }

  card.appendChild(grid);
  card.appendChild(h('div', { class: 'cal-legend' }, [
    h('span', {}, [h('span', { class: 'dot trained' }), t('calendar.legendTrained')]),
    h('span', {}, [h('span', { class: 'dot today' }), t('calendar.legendToday')]),
  ]));
  screen.appendChild(card);
  root.appendChild(screen);
}

/**
 * Sub-ficha: detalle del/los entreno(s) de un día ya entrenado (solo lectura).
 */
async function renderSessionDetail(root, app, plan, sessions, calView) {
  clear(root);
  const screen = h('div', { class: 'screen' });
  const settings = await app.repo.getSettings(app.userId);
  const unit = settings.unit === 'lb' ? 'lb' : 'kg';
  const u = unitLabel(unit);

  const back = () => { popLayer(); renderCalendar(root, app, calView); };

  const dateLabel = formatDate(sessions[0].startedAt);
  screen.appendChild(h('div', { style: 'font-weight:800;font-size:18px;margin-bottom:4px' }, t('calendar.sessionTitle', { date: dateLabel })));

  const days = await app.repo.listPlanDays(plan.id);
  const dayById = Object.fromEntries(days.map((d) => [d.id, d]));

  for (const s of sessions) {
    const sets = await app.repo.listSetsForSession(s.id);
    const dayName = dayById[s.planDayId]?.name ?? '';
    const card = h('div', { class: 'card' });
    card.appendChild(h('div', { class: 'row-between' }, [
      h('div', { style: 'font-weight:700' }, dayName || t('calendar.sessionTitle', { date: dateLabel })),
      h('div', { class: 'muted' }, t('calendar.sessionSets', { n: sets.length })),
    ]));
    // Agrupa series por ejercicio para una lectura rápida.
    const byEx = new Map();
    for (const st of sets) {
      if (!byEx.has(st.exerciseName)) byEx.set(st.exerciseName, []);
      byEx.get(st.exerciseName).push(st);
    }
    for (const [name, list] of byEx) {
      const tracking = normalizeTracking(list[0]?.tracking);
      const lines = list.map((st) => {
        if (tracking === 'time' || st.durationSeconds) return formatDuration(st.durationSeconds);
        if (tracking === 'reps_only' || st.weight == null) return `${st.reps} reps`;
        return `${kgToDisplay(st.weight, unit)} ${u} × ${st.reps}`;
      }).join('  ·  ');
      card.appendChild(h('div', { style: 'margin-top:8px' }, [
        h('div', { style: 'font-weight:600' }, name),
        h('div', { class: 'muted', style: 'font-size:13px' }, lines),
      ]));
    }
    screen.appendChild(card);
  }

  screen.appendChild(h('button', { class: 'btn', style: 'margin-top:12px', onClick: back }, t('common.done')));
  root.appendChild(screen);
  pushLayer(() => renderCalendar(root, app, calView));
}

/**
 * Sub-ficha: registro de un entreno a toro pasado para un día vacío.
 * Flujo: elegir el día del plan que se hizo → añadir series (sin cronómetro) →
 * Guardar → logPastSession. Vuelve al calendario y lo repinta.
 */
async function renderLogPastDay(root, app, plan, picked, calView) {
  clear(root);
  const screen = h('div', { class: 'screen' });
  const settings = await app.repo.getSettings(app.userId);
  const unit = settings.unit === 'lb' ? 'lb' : 'kg';

  const dateLabel = formatDate(picked.iso);
  screen.appendChild(h('div', { style: 'font-weight:800;font-size:18px;margin-bottom:4px' }, t('calendar.logTitle', { date: dateLabel })));

  const days = await app.repo.listPlanDays(plan.id);
  if (days.length === 0) {
    screen.appendChild(h('div', { class: 'empty' }, t('calendar.dayNoExercises')));
    finishBack(screen, root, app, calView);
    return;
  }

  // Día del plan por defecto: el que el motor sugeriría a continuación.
  let selectedDay = (await app.suggestedDay(plan)) ?? days[0];

  // --- Selector de día del plan (reutiliza el look de .day-picker/.day-chip) ---
  const dayPicker = h('div', { class: 'day-picker' });
  const setsWrap = h('div', { style: 'margin-top:14px' });

  const paintPicker = () => {
    clear(dayPicker);
    for (const d of days) {
      const chip = h('button', {
        class: 'day-chip' + (d.id === selectedDay.id ? ' active' : ''),
        onClick: () => { selectedDay = d; paintPicker(); paintSets(); },
      }, d.name || `Día ${d.order}`);
      dayPicker.appendChild(chip);
    }
  };

  screen.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'muted', style: 'margin-bottom:8px' }, t('calendar.chooseDay')),
    dayPicker,
  ]));

  // --- Series a registrar ---
  // Cada entrada en `rows` es un objeto editable con sus inputs; al guardar se
  // leen todas y se envían de una a logPastSession.
  const rows = []; // [{ exerciseSelect, weight, reps, duration, rir, warm, getData }]

  async function paintSets() {
    clear(setsWrap);
    rows.length = 0;
    const pes = await app.repo.listPlanExercises(selectedDay.id);
    if (pes.length === 0) {
      setsWrap.appendChild(h('div', { class: 'empty' }, t('calendar.dayNoExercises')));
      return;
    }
    const allEx = await app.repo.listExercises(app.userId);
    const exById = Object.fromEntries(allEx.map((e) => [e.id, e]));

    // Por cada ejercicio planificado, pre-generar sus series objetivo.
    for (const pe of pes) {
      const ex = exById[pe.exerciseId];
      if (!ex) continue;
      const card = h('div', { class: 'card' });
      card.appendChild(h('div', { class: 'row', style: 'align-items:center;gap:10px' }, [
        h('div', { class: 'ex-icon', html: icon(ex.icon) }),
        h('div', { style: 'font-weight:700' }, ex.name),
      ]));
      const exSets = h('div', { style: 'margin-top:8px' });
      const nSets = pe.targetSets || 3;
      // Contador monótono por ejercicio: la etiqueta de nº de serie no retrocede
      // al borrar filas (el guardado renumera igualmente, pero la etiqueta visible
      // queda coherente). peer review F3 #1.
      let nextSetNo = 0;
      const addRow = () => {
        nextSetNo += 1;
        const row = buildSetRow(ex, pe, nextSetNo, unit);
        rows.push(row);
        exSets.appendChild(row.el);
      };
      for (let i = 1; i <= nSets; i++) addRow();
      // Botón para añadir una serie extra a este ejercicio.
      card.appendChild(exSets);
      card.appendChild(h('button', {
        class: 'btn btn-ghost btn-sm', style: 'margin-top:6px',
        onClick: () => addRow(),
      }, t('calendar.addSet')));
      setsWrap.appendChild(card);
    }
  }

  screen.appendChild(setsWrap);

  // --- Guardar ---
  const saveBtn = h('button', { class: 'btn', style: 'margin-top:12px', onClick: save }, t('calendar.save'));
  const cancelBtn = h('button', { class: 'btn btn-ghost', style: 'margin-top:8px', onClick: () => { popLayer(); renderCalendar(root, app, calView); } }, t('common.cancel'));
  screen.appendChild(saveBtn);
  screen.appendChild(cancelBtn);

  async function save() {
    // Recoge las series rellenadas (ignora las vacías). Convierte peso a kg.
    const sets = [];
    let n = 0;
    for (const r of rows) {
      const data = r.getData();
      if (!data) continue; // fila vacía o inválida → se omite
      n += 1;
      sets.push({ ...data, setNumber: n });
    }
    if (sets.length === 0) { toast(t('calendar.needOneSet')); return; }
    try {
      await app.logPastSession(plan, selectedDay, picked.iso, sets);
      toast(t('calendar.saved', { date: dateLabel }));
      popLayer();
      renderCalendar(root, app, calView);
    } catch (err) {
      toast(err?.message || 'Error');
    }
  }

  paintPicker();
  await paintSets();
  root.appendChild(screen);
  pushLayer(() => renderCalendar(root, app, calView));
}

/**
 * Construye una fila de serie para el registro a pasado. A diferencia del
 * `setRow` de entrenar, NO persiste nada al vuelo ni arranca cronómetro: solo
 * recoge datos. Devuelve { el, getData } donde getData() lee los inputs y
 * devuelve el objeto para logPastSession, o null si la fila está vacía.
 */
function buildSetRow(ex, pe, setNumber, unit) {
  const tracking = normalizeTracking(ex.tracking);
  const isRepsOnly = tracking === 'reps_only';
  const isTime = tracking === 'time';
  const weightStep = unit === 'lb' ? '2.5' : '0.5';

  // Etiquetas de unidad como placeholder (ahorra espacio → cabe en una línea en móvil).
  const weight = h('input', { type: 'number', min: '0', step: weightStep, placeholder: unitLabel(unit), value: String(kgToDisplay(pe.targetWeight ?? 0, unit) || 0) });
  const reps = h('input', { type: 'number', min: '0', placeholder: 'reps', value: String(pe.targetReps ?? 0) });
  const duration = h('input', { type: 'number', min: '0', step: '1', placeholder: t('train.seconds'), value: String(pe.targetDurationSeconds ?? 0) });
  const rir = h('input', { type: 'number', min: '0', max: '10', placeholder: 'RIR', class: 'rir-input' });

  let isWarmup = false;
  const warmBtn = h('button', { class: 'btn btn-ghost btn-sm warm-toggle', title: t('train.warmup'), onClick: () => {
    isWarmup = !isWarmup;
    el.classList.toggle('warmup', isWarmup);
    warmBtn.classList.toggle('active', isWarmup);
  } }, '🔥');
  // Quitar la fila (no cuenta al guardar). No elimina nada persistido: aún no lo está.
  const delBtn = h('button', { class: 'btn btn-ghost btn-sm', title: t('calendar.removeSet'), onClick: () => { el.remove(); removed = true; } }, '🗑');

  // Zona de campos en UNA línea: nº + inputs (la unidad va como placeholder).
  const fields = h('div', { class: 'set-fields' });
  fields.appendChild(h('div', { class: 'setno' }, String(setNumber)));
  if (isTime) {
    fields.appendChild(duration);
  } else {
    if (!isRepsOnly) fields.appendChild(weight);
    fields.appendChild(reps);
  }
  fields.appendChild(rir);

  const el = h('div', { class: 'set-row' });
  el.appendChild(fields);
  // Acciones ancladas a la derecha en un sitio fijo (ancho fijo, no se encogen):
  // ver .set-actions en styles.css.
  el.appendChild(h('div', { class: 'set-actions' }, [warmBtn, delBtn]));

  let removed = false;
  function parseRir() {
    const v = rir.value.trim();
    if (v === '') return null;
    const nn = parseInt(v, 10);
    return Number.isFinite(nn) ? Math.max(0, Math.min(10, nn)) : null;
  }
  function getData() {
    if (removed) return null;
    const rirVal = parseRir();
    if (isTime) {
      const d = parseInt(duration.value) || 0;
      if (d <= 0) return null;
      return { exercise: ex, weight: null, reps: null, durationSeconds: d, isWarmup, rir: rirVal };
    }
    if (isRepsOnly) {
      const r = parseInt(reps.value) || 0;
      if (r <= 0) return null;
      return { exercise: ex, weight: null, reps: r, durationSeconds: null, isWarmup, rir: rirVal };
    }
    const r = parseInt(reps.value) || 0;
    const w = parseFloat(weight.value) || 0;
    if (r <= 0) return null; // sin reps no hay serie que registrar
    return { exercise: ex, weight: displayToKg(w, unit), reps: r, durationSeconds: null, isWarmup, rir: rirVal };
  }
  return { el, getData };
}

/** Botón "Hecho" + registro de capa para sub-fichas sin acción de guardado. */
function finishBack(screen, root, app, calView) {
  const back = () => { popLayer(); renderCalendar(root, app, calView); };
  screen.appendChild(h('button', { class: 'btn', style: 'margin-top:12px', onClick: back }, t('common.done')));
  root.appendChild(screen);
  pushLayer(() => renderCalendar(root, app, calView));
}
