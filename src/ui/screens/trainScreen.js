/**
 * UI · Pantalla "Entrenar" — el loop principal.
 * RF-20..RF-27: cabecera Semana XX·Día N de M, PR con fecha, logging rápido,
 * cronómetro de descanso con bip, celebración de récord.
 */
import { h, clear, toast, confirmDialog } from '../dom.js';
import { icon } from '../icons.js';
import { positionLabel } from '../../domain/effectiveWeek.js';
import { formatDate } from '../../domain/dateKey.js';
import { initAudio, beepWarning, beepEnd, beepPR, vibrate } from '../sound.js';
import { pushLayer, popLayer } from '../nav.js';
import { t } from '../../i18n/index.js';
import { deriveRepRange } from '../../domain/progression.js';
import { unitLabel, kgToDisplay, displayToKg } from '../../domain/units.js';

/**
 * Reps objetivo de un plan-ejercicio ACOTADAS a su rango. Si el plan es antiguo
 * y aún no tiene rango, se deriva del targetReps. Evita prefijar un valor fuera
 * del rango configurado (p.ej. targetReps=12 heredado con rango 6-8).
 */
function targetRepsInRange(pe) {
  const r = pe.repMin > 0 && pe.repMax > 0 ? { min: pe.repMin, max: pe.repMax } : deriveRepRange(pe.targetReps);
  const target = pe.targetReps ?? r.min;
  return Math.min(r.max, Math.max(r.min, target));
}

// Handle del cronómetro de descanso activo. Vive a nivel de módulo para poder
// cancelarlo si el usuario navega fuera de Entrenar (peer review #9).
let activeRestTimer = null;

/** Cancela y limpia el cronómetro de descanso si hay uno activo. */
export function cancelRestTimer() {
  if (activeRestTimer) {
    clearInterval(activeRestTimer.interval);
    activeRestTimer.overlay?.remove();
    if (activeRestTimer.hadLayer) popLayer(); // sincroniza el historial (#8)
    activeRestTimer = null;
  }
}

export async function renderTrain(root, app) {
  cancelRestTimer(); // al (re)entrar, no dejar timers colgando
  clear(root);
  const screen = h('div', { class: 'screen' });

  const plan = await app.repo.getActivePlan(app.userId);
  if (!plan) {
    screen.appendChild(h('div', { class: 'empty' }, t('train.needPlan')));
    root.appendChild(screen);
    return;
  }

  const sessionsDone = await app.repo.countSessions(plan.id);
  const pos = positionLabel(sessionsDone, plan.daysPerWeek);
  const days = await app.repo.listPlanDays(plan.id);
  const { dayInWeek } = await app.currentPosition(plan);
  // Día que toca: indexar por posición ordenada, robusto ante `order` no
  // contiguo tras editar/borrar días (peer review #6).
  const ordered = [...days].sort((a, b) => a.order - b.order);
  const todayDay = ordered.length ? ordered[(dayInWeek - 1) % ordered.length] : null;

  screen.appendChild(h('div', { class: 'banner week' }, pos));
  screen.appendChild(h('div', { class: 'card row-between' }, [
    h('div', {}, [
      h('div', { class: 'muted' }, t('train.todayTrain')),
      h('div', { style: 'font-weight:800;font-size:20px' }, todayDay ? todayDay.name : '—'),
    ]),
  ]));

  if (!todayDay) { root.appendChild(screen); return; }

  const planExercises = await app.repo.listPlanExercises(todayDay.id);
  if (planExercises.length === 0) {
    screen.appendChild(h('div', { class: 'empty' }, t('train.dayNoExercises')));
    root.appendChild(screen);
    return;
  }

  const startBtn = h('button', { class: 'btn', onClick: start }, t('train.start'));
  screen.appendChild(startBtn);
  root.appendChild(screen);

  async function start() {
    initAudio(); // habilita el sonido tras gesto del usuario
    const settings = await app.repo.getSettings(app.userId);
    const unit = settings.unit === 'lb' ? 'lb' : 'kg';
    const session = await app.startSession(plan, todayDay);
    renderActiveSession(root, app, { plan, day: todayDay, planExercises, session, pos, unit });
  }
}

async function renderActiveSession(root, app, ctx) {
  const { day, planExercises, session, pos } = ctx;
  const allEx = await app.repo.listExercises(app.userId);
  const exMap = Object.fromEntries(allEx.map((e) => [e.id, e]));

  clear(root);
  const screen = h('div', { class: 'screen' });
  screen.appendChild(h('div', { class: 'banner week' }, `${pos} · ${day.name}`));

  for (const pe of planExercises) {
    const ex = exMap[pe.exerciseId];
    if (!ex) continue;
    screen.appendChild(await exerciseCard(app, ctx, pe, ex));
  }

  // Nota de la sesión (#5): texto libre, se guarda al escribir.
  const noteInput = h('input', {
    type: 'text', placeholder: t('train.note'),
    value: session.note ?? '',
  });
  noteInput.addEventListener('change', () => app.setSessionNote(session.id, noteInput.value));
  screen.appendChild(h('div', { class: 'card' }, [noteInput]));

  // Terminar: marca fin y descarta la sesión si quedó vacía (peer review #1).
  screen.appendChild(h('button', {
    class: 'btn', style: 'margin-top:8px',
    onClick: async () => {
      cancelRestTimer();
      const discarded = await app.repo.discardSessionIfEmpty(session.id);
      if (!discarded) {
        await app.repo.finishSession(session.id);
        toast(t('train.sessionSaved'));
      } else {
        toast(t('train.emptyDiscarded'));
      }
      renderTrain(root, app);
    }
  }, t('train.finish')));

  // Cancelar/salir sin registrar: descarta la sesión fantasma.
  screen.appendChild(h('button', {
    class: 'btn btn-ghost', style: 'margin-top:8px',
    onClick: async () => {
      cancelRestTimer();
      await app.repo.discardSessionIfEmpty(session.id);
      renderTrain(root, app);
    }
  }, t('train.exitNoSave')));

  root.appendChild(screen);
}

async function exerciseCard(app, ctx, pe, ex) {
  const unit = ctx.unit ?? 'kg';
  const pr = await app.repo.getPR(ex.id, app.userId);
  const last = await app.lastPerformance(ex.id, ctx.session.id);       // #2 autorrelleno
  const suggestion = await app.suggestionFor(ex, pe, ctx.session.id);   // #1 sugerencia
  const prevSets = last?.sets ?? [];

  const card = h('div', { class: 'card' });
  card.appendChild(h('div', { class: 'row' }, [
    h('div', { class: 'ex-icon', html: icon(ex.icon) }),
    h('div', {}, [
      h('div', { style: 'font-weight:800' }, ex.name),
      pr
        ? h('div', { class: 'pr-line' }, t('train.prLine', { reps: pr.repsAtBest, weight: kgToDisplay(pr.bestWeight, unit), unit: unitLabel(unit), date: formatDate(pr.achievedAt) }))
        : h('div', { class: 'muted' }, t('train.noPR')),
      prevSets.length
        ? h('div', { class: 'last-line' }, t('train.lastTime', { sets: prevSets.map((s) => `${kgToDisplay(s.weight, unit)}×${s.reps}`).join(' · ') }))
        : null,
      // Sugerencia de progresión (coach ligero, #1)
      suggestion ? h('div', { class: 'suggestion' }, `💡 ${suggestion.text}`) : null,
    ]),
  ]));

  // Valores por defecto de las series: lo de la última vez, si no el objetivo (#2).
  // Sin historial, las reps objetivo se acotan al rango configurado del ejercicio
  // para no prefijar un valor fuera de rango (dato antiguo sin curar).
  // El peso se guarda en kg (canónico) pero se PREFIJA en la unidad del usuario (B11).
  const prefillWeight = kgToDisplay(last ? last.weight : (pe.targetWeight ?? 0), unit);
  const prefillReps = last ? last.reps : targetRepsInRange(pe);

  // Filas de series (targetSets). Comparten un "estado previo" para el botón repetir (#3).
  const setsWrap = h('div', { style: 'margin-top:10px' });
  const nSets = pe.targetSets || 3;
  const lastEntered = { weight: prefillWeight, reps: prefillReps };
  for (let i = 1; i <= nSets; i++) {
    setsWrap.appendChild(setRow(app, ctx, pe, ex, i, { prefillWeight, prefillReps, lastEntered, unit }));
  }
  card.appendChild(setsWrap);

  // Nota por ejercicio dentro de la sesión (B8): texto libre, se guarda al salir del campo.
  const exNote = h('input', {
    type: 'text', class: 'ex-note',
    placeholder: t('train.exerciseNote'),
    value: ctx.session.exerciseNotes?.[ex.id] ?? '',
  });
  exNote.addEventListener('change', async () => {
    await app.setExerciseNote(ctx.session.id, ex.id, exNote.value);
    // Mantener el objeto de sesión en memoria coherente con lo guardado.
    ctx.session.exerciseNotes = { ...(ctx.session.exerciseNotes ?? {}) };
    if (exNote.value.trim()) ctx.session.exerciseNotes[ex.id] = exNote.value.trim();
    else delete ctx.session.exerciseNotes[ex.id];
  });
  card.appendChild(exNote);
  return card;
}

function setRow(app, ctx, pe, ex, setNumber, opts) {
  const { prefillWeight, prefillReps, lastEntered, unit = 'kg' } = opts;
  // Incremento del spinner acorde a la unidad: discos de gimnasio van de 2.5 en
  // 2.5 lb / 1.25 en kg aprox; usamos 2.5 (lb) y 0.5 (kg) como pasos cómodos.
  const weightStepAttr = unit === 'lb' ? '2.5' : '0.5';
  const weight = h('input', { type: 'number', min: '0', step: weightStepAttr, value: String(prefillWeight ?? 0), style: 'width:80px' });
  const reps = h('input', { type: 'number', min: '0', value: String(prefillReps ?? 0), style: 'width:70px' });
  // RIR opcional (B10): reps en reserva (0 = al fallo). Vacío = sin dato.
  const rir = h('input', { type: 'number', min: '0', max: '10', placeholder: 'RIR', title: t('train.rirHint'), class: 'rir-input', style: 'width:58px' });
  const row = h('div', { class: 'set-row' });

  // Id de la serie una vez persistida (A1): habilita editar/borrar.
  let setId = null;
  // Estado de calentamiento de la serie (B9): no cuenta para PR ni volumen.
  let isWarmup = false;

  // Toggle de calentamiento (B9): marca la serie como aproximación.
  const warmBtn = h('button', { class: 'btn btn-ghost btn-sm warm-toggle', title: t('train.warmup'), onClick: toggleWarmup }, '🔥');
  // Botón "repetir la serie anterior" (#3): copia lo último confirmado.
  const repeatBtn = h('button', { class: 'btn btn-ghost btn-sm', title: t('train.repeatSet'), onClick: () => {
    weight.value = String(lastEntered.weight ?? prefillWeight ?? 0);
    reps.value = String(lastEntered.reps ?? prefillReps ?? 0);
  } }, '⟲');
  const doneBtn = h('button', { class: 'btn btn-sm', title: t('train.saveSet'), onClick: confirm }, '✓');
  // Botones de edición/borrado, ocultos hasta que la serie está confirmada (A1).
  const editBtn = h('button', { class: 'btn btn-ghost btn-sm', title: t('train.editSet'), style: 'display:none', onClick: edit }, '✎');
  const delBtn = h('button', { class: 'btn btn-ghost btn-sm', title: t('train.deleteSet'), style: 'display:none', onClick: remove }, '🗑');

  row.appendChild(h('div', { class: 'setno' }, String(setNumber)));
  row.appendChild(weight); row.appendChild(h('span', { class: 'unit muted' }, unitLabel(unit)));
  row.appendChild(reps); row.appendChild(h('span', { class: 'unit muted' }, 'reps'));
  row.appendChild(rir);
  row.appendChild(warmBtn);
  row.appendChild(repeatBtn);
  row.appendChild(doneBtn);
  row.appendChild(editBtn);
  row.appendChild(delBtn);

  /** Alterna el flag de calentamiento (antes o después de confirmar). */
  async function toggleWarmup() {
    isWarmup = !isWarmup;
    row.classList.toggle('warmup', isWarmup);
    warmBtn.classList.toggle('active', isWarmup);
    // Si la serie ya está registrada, persistir el cambio y recomputar PR,
    // reconciliando el trofeo (.pr) y celebrando si desmarcar la asciende a PR.
    if (setId) {
      const { set, pr, isPR } = await app.editSet(setId, { isWarmup });
      const wKg = set?.weight ?? 0, r = set?.reps ?? 0; // set.weight ya está en kg
      // Una serie de calentamiento nunca lleva trofeo; si no, se marca si es el PR.
      row.classList.toggle('pr', !isWarmup && isThisThePR(pr, wKg, r));
      if (isPR) celebratePR(ex, kgToDisplay(wKg, unit), r, unit);
    }
  }

  /** Pasa la fila a modo "confirmada": inputs bloqueados, botones editar/borrar. */
  function toConfirmedUI() {
    row.classList.add('done');
    weight.disabled = true; reps.disabled = true; rir.disabled = true;
    doneBtn.style.display = 'none';
    repeatBtn.style.display = 'none';
    warmBtn.style.display = 'none';
    editBtn.style.display = '';
    delBtn.style.display = '';
  }
  /** Pasa la fila a modo "edición": inputs activos, botón guardar visible. */
  function toEditingUI() {
    row.classList.remove('done');
    weight.disabled = false; reps.disabled = false; rir.disabled = false;
    doneBtn.style.display = '';
    warmBtn.style.display = '';
    editBtn.style.display = 'none';
    delBtn.style.display = 'none';
  }

  /** RIR del input: entero 0..10 o null si está vacío/ inválido. */
  function parseRir() {
    const v = rir.value.trim();
    if (v === '') return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : null;
  }

  async function confirm() {
    const w = parseFloat(weight.value) || 0; // en la unidad del usuario (display)
    const r = parseInt(reps.value) || 0;
    if (w <= 0 || r <= 0) { toast(t('train.needWeightReps')); return; }
    const rirVal = parseRir();
    // El dominio trabaja SIEMPRE en kg: convertimos el valor introducido (B11).
    const wKg = displayToKg(w, unit);

    // Recordar lo confirmado para el botón "repetir" (en unidad display, #3).
    lastEntered.weight = w;
    lastEntered.reps = r;

    if (setId) {
      // Edición de una serie ya registrada (A1): no crea serie nueva ni timer.
      const { pr, isPR } = await app.editSet(setId, { weight: wKg, reps: r, rir: rirVal });
      row.classList.toggle('pr', isThisThePR(pr, wKg, r));
      toConfirmedUI();
      // Si al corregir se bate récord, se celebra igual que al registrar (#3).
      if (isPR) celebratePR(ex, w, r, unit);
      else toast(t('train.setUpdated'));
      return;
    }

    // El descanso real lo calcula appService desde el loggedAt de la última
    // serie persistida (peer review #10): medida estable, sin estado en la vista.
    const { isPR, set } = await app.logSet({
      sessionId: ctx.session.id, exercise: ex, setNumber, weight: wKg, reps: r, isWarmup, rir: rirVal,
    });
    setId = set.id;

    toConfirmedUI();
    if (isPR) { row.classList.add('pr'); celebratePR(ex, w, r, unit); }

    // Inicia cronómetro de descanso hacia la siguiente serie
    startRestTimer(app, pe.restSeconds ?? 90);
  }

  function edit() {
    cancelRestTimer(); // editar no debería competir con el descanso en curso
    toEditingUI();
  }

  async function remove() {
    const w = parseFloat(weight.value) || 0;
    const r = parseInt(reps.value) || 0;
    const ok = await confirmDialog(t('train.deleteSetConfirm', { weight: w, unit: unitLabel(unit), reps: r }), { confirmText: t('common.delete') });
    if (!ok) return;
    if (setId) await app.removeSet(setId);
    // Si lo que se repite en filas hermanas eran los valores de ESTA serie,
    // devolverlos al prefill para no sugerir datos de una serie borrada (#6).
    if (lastEntered.weight === w && lastEntered.reps === r) {
      lastEntered.weight = prefillWeight;
      lastEntered.reps = prefillReps;
    }
    row.remove();
    toast(t('train.setDeleted'));
  }

  return row;
}

/** ¿La serie (w×r) es la que marca el PR vigente del ejercicio? */
function isThisThePR(pr, w, r) {
  if (!pr) return false;
  const rm = w * (1 + r / 30);
  return Math.abs(rm - pr.estimated1RM) < 1e-6;
}

/** Cronómetro de descanso con bip a falta de N segundos (RF-24). */
async function startRestTimer(app, seconds) {
  const settings = await app.repo.getSettings(app.userId);
  const lead = settings.beepLeadSeconds ?? 10;
  const soundOn = settings.soundEnabled !== false;

  cancelRestTimer(); // no solapar timers

  const total = seconds;
  let remaining = seconds;

  // Anillo circular SVG que se vacía (r=90 → circunferencia ≈ 565.49).
  const R = 90, C = 2 * Math.PI * R;
  const num = h('div', { class: 'timer-num' }, String(remaining));
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('viewBox', '0 0 200 200');
  ring.innerHTML =
    `<circle class="ring-bg" cx="100" cy="100" r="${R}"/>` +
    `<circle class="ring-fg" cx="100" cy="100" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="0"/>`;
  const fg = ring.querySelector('.ring-fg');
  const ringWrap = h('div', { class: 'timer-ring' }, [num]);
  ringWrap.insertBefore(ring, num);

  const setRing = () => {
    const frac = Math.max(0, remaining) / total;
    fg.style.strokeDashoffset = String(C * (1 - frac)); // se vacía al avanzar
  };
  setRing();

  const overlay = h('div', { class: 'rest-overlay pr-flash' }, [
    h('div', { class: 'box' }, [
      h('div', { class: 'muted', style: 'margin-bottom:10px;text-transform:uppercase;letter-spacing:2px' }, t('train.rest')),
      ringWrap,
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn btn-ghost btn-sm', onClick: stop }, t('train.skipRest')),
      h('button', { class: 'btn btn-ghost btn-sm', style: 'margin-top:8px', onClick: () => { remaining += 15; num.textContent = String(remaining); setRing(); } }, t('train.addRest')),
    ]),
  ]);
  document.body.appendChild(overlay);

  let warned = false;
  const interval = setInterval(() => {
    remaining--;
    num.textContent = String(Math.max(0, remaining));
    setRing();
    if (remaining <= lead && remaining > 0) {
      num.classList.add('warn');
      ringWrap.classList.add('warn');
      if (!warned) { warned = true; if (soundOn) beepWarning(); vibrate(80); }
    }
    if (remaining <= 0) { finish(); }
  }, 1000);

  // Registrar el timer activo para poder cancelarlo al navegar (peer review #9).
  activeRestTimer = { interval, overlay, hadLayer: true };
  // Capa de navegación: el gesto "atrás" cierra el descanso (peer review nav #8).
  // El close solo limpia interval+overlay (el popstate ya consumió el estado).
  pushLayer(() => {
    clearInterval(interval);
    overlay.remove();
    activeRestTimer = null;
  });

  function finish() {
    cancelRestTimer();
    if (soundOn) beepEnd();
    vibrate([120, 60, 120]);
    toast(t('train.nextSet'));
  }
  function stop() { cancelRestTimer(); }
}

/** Celebración visual de récord (RF-26). weight ya viene en la unidad de display. */
function celebratePR(ex, weight, reps, unit = 'kg') {
  beepPR();
  vibrate([200, 80, 200, 80, 300]);
  const flash = h('div', { class: 'pr-flash' }, [
    h('div', { class: 'box' }, [
      h('div', { class: 'trophy' }, '🏆'),
      h('div', { class: 'txt' }, t('train.newRecord')),
      h('div', { class: 'sub2' }, `${ex.name}: ${weight}${unitLabel(unit)} × ${reps}`),
    ]),
  ]);
  document.body.appendChild(flash);
  flash.addEventListener('click', () => flash.remove());
  setTimeout(() => flash.remove(), 2600);
}


