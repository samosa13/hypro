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
import { unitLabel, kgToDisplay, displayToKg, formatDuration } from '../../domain/units.js';
import { normalizeTracking, scoreSet, prScore } from '../../domain/personalRecord.js';

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

/**
 * Texto de la línea de PR según el tipo de medición (D16):
 *  - weight_reps: "🏆 PR: 8 reps × 60 kg (fecha)"
 *  - reps_only:   "🏆 PR: 12 reps (fecha)"
 *  - time:        "🏆 PR: 1:30 (fecha)"
 */
function prLineText(pr, tracking, unit) {
  const date = formatDate(pr.achievedAt);
  if (tracking === 'reps_only') return t('train.prLineReps', { reps: pr.repsAtBest, date });
  if (tracking === 'time') return t('train.prLineTime', { time: formatDuration(pr.bestDurationSeconds), date });
  return t('train.prLine', { reps: pr.repsAtBest, weight: kgToDisplay(pr.bestWeight, unit), unit: unitLabel(unit), date });
}

/** Representación corta de una serie para la línea "última vez". */
function setBrief(s, tracking, unit) {
  if (tracking === 'reps_only') return `${s.reps}`;
  if (tracking === 'time') return formatDuration(s.durationSeconds);
  return `${kgToDisplay(s.weight, unit)}×${s.reps}`;
}

/** Traduce una sugerencia de recorte de duración (punto 2) para el aviso de Entrenar. */
function trainCutText(s) {
  if (s.kind === 'dropSet') return t('train.cutDropSet', { saved: s.savedMin, after: s.afterMinutes });
  if (s.kind === 'trimRest') return t('train.cutTrimRest', { saved: s.savedMin, after: s.afterMinutes });
  if (s.kind === 'dropExercises') return t('train.cutDropExercises', { count: s.count });
  return '';
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
  const days = (await app.repo.listPlanDays(plan.id)).sort((a, b) => a.order - b.order);

  if (days.length === 0) {
    screen.appendChild(h('div', { class: 'banner week' }, pos));
    screen.appendChild(h('div', { class: 'empty' }, t('train.dayNoExercises')));
    root.appendChild(screen);
    return;
  }

  // Día SUGERIDO (siguiente de la secuencia) y días ya hechos esta semana
  // efectiva (para el aviso de duplicado). El usuario puede ELEGIR cualquier día
  // (F1): la app sugiere, no impone.
  const suggested = await app.suggestedDay(plan);
  const doneThisWeek = await app.currentWeekPlanDayIds(plan);
  let selectedDay = suggested ?? days[0];

  screen.appendChild(h('div', { class: 'banner week' }, pos));

  // Selector de día: una fila de "chips", el sugerido marcado. Al tocar uno se
  // selecciona y se repinta la zona del día (viabilidad + empezar).
  const dayPicker = h('div', { class: 'day-picker' });
  screen.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'muted', style: 'margin-bottom:8px' }, t('train.chooseDay')),
    dayPicker,
  ]));

  // Zona que depende del día elegido (se repinta al cambiar de día).
  const dayZone = h('div', {});
  screen.appendChild(dayZone);
  root.appendChild(screen);

  function paintDayPicker() {
    clear(dayPicker);
    for (const d of days) {
      const isSel = d.id === selectedDay.id;
      const isSuggested = suggested && d.id === suggested.id;
      const alreadyDone = doneThisWeek.has(d.id);
      const chip = h('button', {
        class: `day-chip${isSel ? ' active' : ''}${alreadyDone ? ' done' : ''}`,
        onClick: () => { selectedDay = d; paintDayPicker(); paintDayZone(); },
      }, [
        h('span', {}, d.name),
        // Marca visual: ✓ si ya se hizo esta semana y/o ★ si es el sugerido.
        // Si el sugerido coincide con uno ya hecho, se muestran AMBAS (peer review F1 #2).
        (alreadyDone || isSuggested)
          ? h('span', { class: 'chip-mark' }, `${alreadyDone ? ' ✓' : ''}${isSuggested ? ' ★' : ''}`)
          : null,
      ]);
      dayPicker.appendChild(chip);
    }
  }

  // Token de render: si se cambia de día mientras una pintura async está en
  // curso, la obsoleta se descarta y solo "gana" la última (peer review F1 #3).
  let dayZoneToken = 0;
  async function paintDayZone() {
    const myToken = ++dayZoneToken;
    const planExercises = await app.repo.listPlanExercises(selectedDay.id);
    if (myToken !== dayZoneToken) return; // llegó otra selección después: abortar
    clear(dayZone);
    if (planExercises.length === 0) {
      dayZone.appendChild(h('div', { class: 'empty' }, t('train.dayNoExercises')));
      return;
    }

    // Aviso (no bloqueante) si el día elegido YA se registró esta semana efectiva.
    if (doneThisWeek.has(selectedDay.id)) {
      dayZone.appendChild(h('div', {
        class: 'card', style: 'background:rgba(255,170,0,.14);color:#ffb020;font-weight:700',
      }, `⚠ ${t('train.dayAlreadyDone', { name: selectedDay.name })}`));
    }

    // Viabilidad del día (punto 2): "hoy tengo X min".
    const overrideMinutes = selectedDay.targetDurationMin ?? null;
    const timeInput = h('input', {
      type: 'number', min: '0', style: 'width:90px',
      value: overrideMinutes != null ? String(overrideMinutes) : '',
      placeholder: t('train.timeTodayPh'),
    });
    const fitNotice = h('div', { style: 'margin-top:8px' });
    dayZone.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'row-between' }, [
        h('span', {}, t('train.timeToday')),
        h('div', { class: 'row', style: 'gap:6px;align-items:center' }, [timeInput, h('span', { class: 'muted' }, t('train.minutes'))]),
      ]),
      fitNotice,
    ]));

    async function paintFit() {
      clear(fitNotice);
      const mins = timeInput.value === '' ? null : Math.max(0, parseInt(timeInput.value) || 0);
      const est = await app.dayDurationEstimate(selectedDay.id, mins);
      const line = est.availableMinutes > 0
        ? t('train.durationEstimateVs', { est: est.estimatedMinutes, avail: est.availableMinutes })
        : t('train.durationEstimate', { est: est.estimatedMinutes });
      fitNotice.appendChild(h('div', { class: 'muted', style: 'font-weight:700' }, `⏱ ${line}`));
      if (!est.fits && est.availableMinutes > 0) {
        fitNotice.appendChild(h('div', {
          style: 'margin-top:6px;padding:10px 12px;border-radius:10px;background:rgba(255,170,0,.14);color:#ffb020;font-weight:700',
        }, t('train.durationOver', { over: est.overByMinutes })));
        for (const sgg of est.suggestions) {
          fitNotice.appendChild(h('div', { class: 'muted', style: 'font-size:13px;margin-top:4px' }, `• ${trainCutText(sgg)}`));
        }
      }
    }
    timeInput.addEventListener('input', paintFit);
    await paintFit();

    dayZone.appendChild(h('button', {
      class: 'btn', style: 'margin-top:8px',
      onClick: async () => {
        initAudio(); // habilita el sonido tras gesto del usuario
        const settings = await app.repo.getSettings(app.userId);
        const unit = settings.unit === 'lb' ? 'lb' : 'kg';
        const session = await app.startSession(plan, selectedDay);
        renderActiveSession(root, app, { plan, day: selectedDay, planExercises, session, pos, unit });
      },
    }, t('train.start')));
  }

  paintDayPicker();
  await paintDayZone();
}

async function renderActiveSession(root, app, ctx) {
  const { day, planExercises, session, pos } = ctx;
  const allEx = await app.repo.listExercises(app.userId);
  const exMap = Object.fromEntries(allEx.map((e) => [e.id, e]));

  clear(root);
  const screen = h('div', { class: 'screen' });
  screen.appendChild(h('div', { class: 'banner week' }, `${pos} · ${day.name}`));

  // Agrupar por superserie/circuito (D17): los planExercises con el mismo
  // groupId forman un bloque que se entrena en rotación. Los sueltos van como
  // card individual. Se respeta el orden; los miembros de un grupo son
  // contiguos (lo garantiza el editor del plan).
  const blocks = [];
  let i = 0;
  while (i < planExercises.length) {
    const pe = planExercises[i];
    if (pe.groupId) {
      const members = [];
      while (i < planExercises.length && planExercises[i].groupId === pe.groupId) {
        members.push(planExercises[i]);
        i++;
      }
      blocks.push({ type: 'group', members });
    } else {
      blocks.push({ type: 'single', pe });
      i++;
    }
  }

  for (const block of blocks) {
    if (block.type === 'single') {
      const ex = exMap[block.pe.exerciseId];
      if (!ex) continue;
      screen.appendChild(await exerciseCard(app, ctx, block.pe, ex));
    } else {
      const members = block.members.filter((pe) => exMap[pe.exerciseId]);
      if (members.length === 1) {
        // Grupo degenerado (quedó un solo miembro válido): card normal.
        screen.appendChild(await exerciseCard(app, ctx, members[0], exMap[members[0].exerciseId]));
      } else if (members.length) {
        screen.appendChild(await groupBlock(app, ctx, members, exMap));
      }
    }
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
        // Cierra la sesión (marca fin + persiste adherencia al plan del día).
        await app.finishSession(session.id);
        // Resumen de cierre de la sesión (C12 + adherencia): series, volumen, PRs
        // y cuántos ejercicios del plan se tocaron / cuáles faltaron.
        const summary = await app.sessionSummary(session.id);
        showSessionSummary(summary, ctx.unit ?? 'kg', () => renderTrain(root, app));
      } else {
        toast(t('train.emptyDiscarded'));
        renderTrain(root, app);
      }
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

/**
 * Cabecera de un ejercicio (icono, nombre, PR, última vez, sugerencia) +
 * prefills/lastEntered. Reutilizable por la card individual y por cada miembro
 * de un bloque de superserie (D17).
 * @returns {Promise<{header:HTMLElement, prefills:object, lastEntered:object, tracking:string}>}
 */
async function exerciseHeader(app, ctx, pe, ex) {
  const unit = ctx.unit ?? 'kg';
  const tracking = normalizeTracking(ex.tracking); // tipo de medición (D16)
  const pr = await app.repo.getPR(ex.id, app.userId);
  const last = await app.lastPerformance(ex.id, ctx.session.id);       // #2 autorrelleno
  const suggestion = await app.suggestionFor(ex, pe, ctx.session.id);   // #1 sugerencia
  const prevSets = last?.sets ?? [];

  const header = h('div', { class: 'row' }, [
    h('div', { class: 'ex-icon', html: icon(ex.icon) }),
    h('div', {}, [
      h('div', { style: 'font-weight:800' }, ex.name),
      pr ? h('div', { class: 'pr-line' }, prLineText(pr, tracking, unit)) : h('div', { class: 'muted' }, t('train.noPR')),
      prevSets.length
        ? h('div', { class: 'last-line' }, t('train.lastTime', { sets: prevSets.map((s) => setBrief(s, tracking, unit)).join(' · ') }))
        : null,
      suggestion ? h('div', { class: 'suggestion' }, `💡 ${suggestion.text}`) : null,
    ]),
  ]);

  // Valores por defecto de las series: lo de la última vez, si no el objetivo (#2).
  // El peso se guarda en kg (canónico) pero se PREFIJA en la unidad del usuario (B11).
  const prefillWeight = kgToDisplay(last ? last.weight : (pe.targetWeight ?? 0), unit);
  const prefillReps = last ? last.reps : targetRepsInRange(pe);
  const prefillDuration = last && last.durationSeconds > 0 ? last.durationSeconds : (pe.targetDurationSeconds ?? 30);
  const prefills = { prefillWeight, prefillReps, prefillDuration, unit, tracking };
  // Estado "previo" compartido por las filas del MISMO ejercicio (botón repetir).
  const lastEntered = { weight: prefillWeight, reps: prefillReps, durationSeconds: prefillDuration };
  return { header, prefills, lastEntered, tracking };
}

/** Campo de nota por ejercicio dentro de la sesión (B8). */
function exerciseNoteInput(app, ctx, ex) {
  const exNote = h('input', {
    type: 'text', class: 'ex-note',
    placeholder: t('train.exerciseNote'),
    value: ctx.session.exerciseNotes?.[ex.id] ?? '',
  });
  exNote.addEventListener('change', async () => {
    await app.setExerciseNote(ctx.session.id, ex.id, exNote.value);
    ctx.session.exerciseNotes = { ...(ctx.session.exerciseNotes ?? {}) };
    if (exNote.value.trim()) ctx.session.exerciseNotes[ex.id] = exNote.value.trim();
    else delete ctx.session.exerciseNotes[ex.id];
  });
  return exNote;
}

async function exerciseCard(app, ctx, pe, ex) {
  const { header, prefills, lastEntered } = await exerciseHeader(app, ctx, pe, ex);
  const card = h('div', { class: 'card' });
  card.appendChild(header);

  // Filas de series (targetSets). Comparten `lastEntered` para el botón repetir (#3).
  const setsWrap = h('div', { style: 'margin-top:10px' });
  const nSets = pe.targetSets || 3;
  for (let i = 1; i <= nSets; i++) {
    setsWrap.appendChild(setRow(app, ctx, pe, ex, i, { ...prefills, lastEntered }));
  }
  card.appendChild(setsWrap);
  card.appendChild(exerciseNoteInput(app, ctx, ex));
  return card;
}

/**
 * Bloque de superserie / triserie / circuito (D17). Los ejercicios del grupo se
 * entrenan en ROTACIÓN: una serie de cada uno por "vuelta", y el descanso solo
 * se toma al CERRAR la vuelta (tras el último ejercicio del grupo), no entre
 * ejercicios dentro de la misma vuelta.
 *
 * Reutiliza `setRow` tal cual (edición/borrado/warmup/RIR/repetir siguen
 * funcionando por fila). El nº de vueltas = targetSets del primer miembro. El
 * descanso al cerrar vuelta usa el restSeconds del último miembro.
 */
async function groupBlock(app, ctx, members, exMap) {
  const groupType = members[0].groupType || 'superset';
  const rounds = members[0].targetSets || 3;
  const lastMember = members[members.length - 1];

  const card = h('div', { class: 'card group-block' });
  // Cabecera del bloque: etiqueta del tipo + nombres de los ejercicios.
  card.appendChild(h('div', { class: 'group-head', style: 'font-weight:800;margin-bottom:6px' }, [
    h('span', { class: 'chip' }, t(`train.group.${groupType}`)),
    h('span', { class: 'muted', style: 'margin-left:8px' }, members.map((m) => exMap[m.exerciseId].name).join(' + ')),
  ]));

  // Precalcular cabecera/prefills/lastEntered de cada miembro (una vez).
  const perMember = [];
  for (const pe of members) {
    const ex = exMap[pe.exerciseId];
    const hdr = await exerciseHeader(app, ctx, pe, ex);
    perMember.push({ pe, ex, ...hdr });
  }

  // Una sección por vuelta; dentro, una fila por ejercicio del grupo.
  for (let round = 1; round <= rounds; round++) {
    const roundWrap = h('div', { class: 'group-round', style: 'margin-top:12px' });
    roundWrap.appendChild(h('div', { class: 'muted', style: 'font-weight:700;margin-bottom:4px' }, t('train.group.round', { n: round })));
    // El descanso se toma cuando la VUELTA está completa (todos los miembros
    // confirmados), no por identidad del último miembro (peer review D17 #2).
    // Así confirmar en desorden descansa en el momento correcto, una sola vez.
    const confirmedThisRound = new Set();
    let restedThisRound = false;
    const onLogged = ({ pe }) => {
      confirmedThisRound.add(pe.id);
      if (!restedThisRound && confirmedThisRound.size >= perMember.length) {
        restedThisRound = true;
        startRestTimer(app, lastMember.restSeconds ?? 90);
      }
    };
    for (const m of perMember) {
      // Mini-etiqueta del ejercicio dentro de la vuelta.
      roundWrap.appendChild(h('div', { class: 'group-ex-label', style: 'font-size:13px;font-weight:600;margin-top:6px' }, [
        h('span', { class: 'ex-icon ex-icon-sm', html: icon(m.ex.icon) }),
        h('span', { style: 'margin-left:6px' }, m.ex.name),
      ]));
      roundWrap.appendChild(setRow(app, ctx, m.pe, m.ex, round, { ...m.prefills, lastEntered: m.lastEntered, onLogged }));
    }
    card.appendChild(roundWrap);
  }

  // Notas por ejercicio del grupo (B8), una por miembro, al final del bloque.
  const notesWrap = h('div', { style: 'margin-top:10px' });
  for (const m of perMember) {
    notesWrap.appendChild(h('div', { class: 'muted', style: 'font-size:12px;margin-top:6px' }, m.ex.name));
    notesWrap.appendChild(exerciseNoteInput(app, ctx, m.ex));
  }
  card.appendChild(notesWrap);
  return card;
}

function setRow(app, ctx, pe, ex, setNumber, opts) {
  const { prefillWeight, prefillReps, prefillDuration, lastEntered, unit = 'kg', tracking = 'weight_reps' } = opts;
  const isRepsOnly = tracking === 'reps_only';
  const isTime = tracking === 'time';
  // Incremento del spinner acorde a la unidad: discos de gimnasio van de 2.5 en
  // 2.5 lb / 1.25 en kg aprox; usamos 2.5 (lb) y 0.5 (kg) como pasos cómodos.
  const weightStepAttr = unit === 'lb' ? '2.5' : '0.5';
  const weight = h('input', { type: 'number', min: '0', step: weightStepAttr, value: String(prefillWeight ?? 0), style: 'width:80px' });
  const reps = h('input', { type: 'number', min: '0', value: String(prefillReps ?? 0), style: 'width:70px' });
  // Input de duración en segundos para ejercicios de tiempo (D16).
  const duration = h('input', { type: 'number', min: '0', step: '1', value: String(prefillDuration ?? 0), class: 'dur-input', style: 'width:72px' });
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
    duration.value = String(lastEntered.durationSeconds ?? prefillDuration ?? 0);
  } }, '⟲');
  const doneBtn = h('button', { class: 'btn btn-sm', title: t('train.saveSet'), onClick: confirm }, '✓');
  // Botones de edición/borrado, ocultos hasta que la serie está confirmada (A1).
  const editBtn = h('button', { class: 'btn btn-ghost btn-sm', title: t('train.editSet'), style: 'display:none', onClick: edit }, '✎');
  const delBtn = h('button', { class: 'btn btn-ghost btn-sm', title: t('train.deleteSet'), style: 'display:none', onClick: remove }, '🗑');

  // Zona de campos: pares input+unidad agrupados en .field para que envuelvan
  // juntos (nunca se separa "68" de "kg") sin empujar las acciones.
  const fields = h('div', { class: 'set-fields' });
  fields.appendChild(h('div', { class: 'setno' }, String(setNumber)));
  // Campos según el tipo de medición (D16):
  if (isTime) {
    // Solo duración (segundos). Sin peso ni reps.
    fields.appendChild(h('div', { class: 'field' }, [duration, h('span', { class: 'unit muted' }, t('train.seconds'))]));
  } else {
    if (!isRepsOnly) {
      // Peso solo en ejercicios de peso+reps.
      fields.appendChild(h('div', { class: 'field' }, [weight, h('span', { class: 'unit muted' }, unitLabel(unit))]));
    }
    fields.appendChild(h('div', { class: 'field' }, [reps, h('span', { class: 'unit muted' }, 'reps')]));
  }
  fields.appendChild(h('div', { class: 'field' }, [rir]));
  row.appendChild(fields);
  // Acciones ancladas a la derecha en un sitio fijo (no dependen de la longitud
  // de la fila ni se solapan): ver .set-actions en styles.css.
  row.appendChild(h('div', { class: 'set-actions' }, [warmBtn, repeatBtn, doneBtn, editBtn, delBtn]));

  /** Alterna el flag de calentamiento (antes o después de confirmar). */
  async function toggleWarmup() {
    isWarmup = !isWarmup;
    row.classList.toggle('warmup', isWarmup);
    warmBtn.classList.toggle('active', isWarmup);
    // Si la serie ya está registrada, persistir el cambio y recomputar PR,
    // reconciliando el trofeo (.pr) y celebrando si desmarcar la asciende a PR.
    if (setId) {
      const { set, pr, isPR } = await app.editSet(setId, { isWarmup });
      // Una serie de calentamiento nunca lleva trofeo; si no, se marca si es el PR.
      row.classList.toggle('pr', !isWarmup && isThisThePR(pr, set, tracking));
      if (isPR) celebratePR(ex, set, tracking, unit);
    }
  }

  /** Pasa la fila a modo "confirmada": inputs bloqueados, botones editar/borrar. */
  function toConfirmedUI() {
    row.classList.add('done');
    weight.disabled = true; reps.disabled = true; duration.disabled = true; rir.disabled = true;
    doneBtn.style.display = 'none';
    repeatBtn.style.display = 'none';
    warmBtn.style.display = 'none';
    editBtn.style.display = '';
    delBtn.style.display = '';
  }
  /** Pasa la fila a modo "edición": inputs activos, botón guardar visible. */
  function toEditingUI() {
    row.classList.remove('done');
    weight.disabled = false; reps.disabled = false; duration.disabled = false; rir.disabled = false;
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
    const w = parseFloat(weight.value) || 0;        // peso en unidad display
    const r = parseInt(reps.value) || 0;
    const d = parseInt(duration.value) || 0;         // segundos (time)
    const rirVal = parseRir();
    // El dominio trabaja SIEMPRE en kg: convertimos el peso introducido (B11).
    const wKg = displayToKg(w, unit);

    // Validación y payload según el tipo de medición (D16).
    let payload;
    if (isTime) {
      if (d <= 0) { toast(t('train.needDuration')); return; }
      payload = { durationSeconds: d };
      lastEntered.durationSeconds = d;
    } else if (isRepsOnly) {
      if (r <= 0) { toast(t('train.needReps')); return; }
      payload = { reps: r };
      lastEntered.reps = r;
    } else {
      if (w <= 0 || r <= 0) { toast(t('train.needWeightReps')); return; }
      payload = { weight: wKg, reps: r };
      lastEntered.weight = w;
      lastEntered.reps = r;
    }

    if (setId) {
      // Edición de una serie ya registrada (A1): no crea serie nueva ni timer.
      const { set, pr, isPR } = await app.editSet(setId, { ...payload, rir: rirVal });
      row.classList.toggle('pr', isThisThePR(pr, set, tracking));
      toConfirmedUI();
      // Si al corregir se bate récord, se celebra igual que al registrar (#3).
      if (isPR) celebratePR(ex, set, tracking, unit);
      else toast(t('train.setUpdated'));
      return;
    }

    // El descanso real lo calcula appService desde el loggedAt de la última
    // serie persistida (peer review #10): medida estable, sin estado en la vista.
    const { isPR, set } = await app.logSet({
      sessionId: ctx.session.id, exercise: ex, setNumber, ...payload, isWarmup, rir: rirVal,
    });
    setId = set.id;

    toConfirmedUI();
    if (isPR) { row.classList.add('pr'); celebratePR(ex, set, tracking, unit); }

    // Qué descanso iniciar tras confirmar la serie. En un ejercicio normal es
    // siempre su restSeconds (comportamiento histórico). En una superserie
    // (D17) el bloque decide: solo se descansa al cerrar la vuelta. Esa decisión
    // vive en `opts.onLogged`; si no se pasa, se usa el descanso del ejercicio.
    if (typeof opts.onLogged === 'function') {
      opts.onLogged({ pe, setNumber });
    } else {
      startRestTimer(app, pe.restSeconds ?? 90);
    }
  }

  function edit() {
    cancelRestTimer(); // editar no debería competir con el descanso en curso
    toEditingUI();
  }

  async function remove() {
    const w = parseFloat(weight.value) || 0;
    const r = parseInt(reps.value) || 0;
    const d = parseInt(duration.value) || 0;
    // Descripción de la serie a borrar según el tipo de medición (D16).
    const brief = isTime
      ? formatDuration(d)
      : isRepsOnly
        ? t('train.deleteSetReps', { reps: r })
        : t('train.deleteSetConfirm', { weight: w, unit: unitLabel(unit), reps: r });
    const ok = await confirmDialog(
      isTime ? t('train.deleteSetTime', { time: brief }) : brief,
      { confirmText: t('common.delete') }
    );
    if (!ok) return;
    if (setId) await app.removeSet(setId);
    // Si lo que se repite en filas hermanas eran los valores de ESTA serie,
    // devolverlos al prefill para no sugerir datos de una serie borrada (#6).
    if (lastEntered.weight === w && lastEntered.reps === r && lastEntered.durationSeconds === d) {
      lastEntered.weight = prefillWeight;
      lastEntered.reps = prefillReps;
      lastEntered.durationSeconds = prefillDuration;
    }
    row.remove();
    toast(t('train.setDeleted'));
  }

  return row;
}

/**
 * ¿La serie es la que marca el PR vigente del ejercicio? Compara el score de la
 * serie (según el tipo de medición) con el score del PR. Admite PR antiguos sin
 * `score` (solo `estimated1RM`).
 */
function isThisThePR(pr, set, tracking) {
  if (!pr || !set) return false;
  return Math.abs(scoreSet(set, tracking) - prScore(pr)) < 1e-6;
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

/**
 * Resumen de cierre de sesión (C12): overlay con series, volumen total y PRs.
 * El volumen llega en kg y se muestra en la unidad del usuario. Al cerrar
 * (botón o click fuera), ejecuta onClose (que vuelve a la pantalla de Entrenar).
 */
function showSessionSummary(summary, unit, onClose) {
  const vol = kgToDisplay(summary.totalVolumeKg, unit);
  let closed = false;
  const close = () => { if (closed) return; closed = true; overlay.remove(); onClose(); };

  const overlay = h('div', { class: 'rest-overlay pr-flash' }, [
    h('div', { class: 'box session-summary' }, [
      h('div', { class: 'trophy' }, '🎉'),
      h('div', { class: 'txt' }, t('train.summaryTitle')),
      h('div', { class: 'summary-grid' }, [
        h('div', { class: 'metric' }, [
          h('div', { class: 'big' }, String(summary.sets)),
          h('div', { class: 'lbl' }, t('train.summarySets')),
        ]),
        h('div', { class: 'metric' }, [
          h('div', { class: 'big' }, `${vol}`),
          h('div', { class: 'lbl' }, `${t('train.summaryVolume')} (${unitLabel(unit)})`),
        ]),
        h('div', { class: 'metric' }, [
          h('div', { class: 'big' }, String(summary.prs)),
          h('div', { class: 'lbl' }, t('train.summaryPRs')),
        ]),
      ]),
      // Adherencia al plan del día (punto 1): cuántos ejercicios planificados se
      // tocaron y, si faltó alguno, cuáles. Solo si el día tenía plan.
      ...adherenceBlock(summary),
      h('button', { class: 'btn', style: 'margin-top:16px', onClick: close }, t('train.summaryClose')),
    ]),
  ]);
  document.body.appendChild(overlay);
}

/**
 * Bloque visual de adherencia para el resumen de cierre (punto 1). Devuelve un
 * array de nodos (vacío si el día no tenía ejercicios planificados). Si se
 * completaron todos, muestra un mensaje positivo; si faltaron, lista cuáles.
 */
function adherenceBlock(summary) {
  if (!summary.plannedCount) return [];
  const allDone = summary.doneCount >= summary.plannedCount;
  const nodes = [
    h('div', {
      class: allDone ? 'adherence ok' : 'adherence warn',
      style: `margin-top:14px;padding:10px 12px;border-radius:10px;font-weight:700;${allDone
        ? 'background:rgba(49,209,88,.14);color:#31d158'
        : 'background:rgba(255,170,0,.14);color:#ffb020'}`,
    }, t('train.summaryAdherence', { done: summary.doneCount, planned: summary.plannedCount })),
  ];
  if (!allDone && summary.skipped.length) {
    nodes.push(h('div', {
      class: 'adherence-skipped',
      style: 'margin-top:6px;font-size:13px;color:var(--color-text-muted)',
    }, `${t('train.summarySkipped')}: ${summary.skipped.map((s) => s.name).join(', ')}`));
  }
  return nodes;
}

/**
 * Celebración visual de récord (RF-26). Recibe la serie registrada (con el peso
 * en kg canónico) y arma el subtexto según el tipo de medición (D16).
 */
function celebratePR(ex, set, tracking = 'weight_reps', unit = 'kg') {
  beepPR();
  vibrate([200, 80, 200, 80, 300]);
  let detail;
  if (tracking === 'reps_only') detail = `${set.reps} reps`;
  else if (tracking === 'time') detail = formatDuration(set.durationSeconds);
  else detail = `${kgToDisplay(set.weight, unit)}${unitLabel(unit)} × ${set.reps}`;
  const flash = h('div', { class: 'pr-flash' }, [
    h('div', { class: 'box' }, [
      h('div', { class: 'trophy' }, '🏆'),
      h('div', { class: 'txt' }, t('train.newRecord')),
      h('div', { class: 'sub2' }, `${ex.name}: ${detail}`),
    ]),
  ]);
  document.body.appendChild(flash);
  flash.addEventListener('click', () => flash.remove());
  setTimeout(() => flash.remove(), 2600);
}


