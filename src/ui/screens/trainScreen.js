/**
 * UI · Pantalla "Entrenar" — el loop principal.
 * RF-20..RF-27: cabecera Semana XX·Día N de M, PR con fecha, logging rápido,
 * cronómetro de descanso con bip, celebración de récord.
 */
import { h, clear, toast } from '../dom.js';
import { icon } from '../icons.js';
import { positionLabel } from '../../domain/effectiveWeek.js';
import { formatDate } from '../../domain/dateKey.js';
import { initAudio, beepWarning, beepEnd, beepPR, vibrate } from '../sound.js';
import { pushLayer, popLayer } from '../nav.js';

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
    screen.appendChild(h('div', { class: 'empty' }, 'Crea tu plan primero (pestaña Plan).'));
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
      h('div', { class: 'muted' }, 'Toca entrenar hoy'),
      h('div', { style: 'font-weight:800;font-size:20px' }, todayDay ? todayDay.name : '—'),
    ]),
  ]));

  if (!todayDay) { root.appendChild(screen); return; }

  const planExercises = await app.repo.listPlanExercises(todayDay.id);
  if (planExercises.length === 0) {
    screen.appendChild(h('div', { class: 'empty' }, 'Este día no tiene ejercicios. Añádelos en Plan.'));
    root.appendChild(screen);
    return;
  }

  const startBtn = h('button', { class: 'btn', onClick: start }, '▶ Empezar sesión');
  screen.appendChild(startBtn);
  root.appendChild(screen);

  async function start() {
    initAudio(); // habilita el sonido tras gesto del usuario
    const session = await app.startSession(plan, todayDay);
    renderActiveSession(root, app, { plan, day: todayDay, planExercises, session, pos });
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
    type: 'text', placeholder: '📝 Nota de hoy (opcional: sensaciones, molestias…)',
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
        toast('¡Sesión guardada! 💪');
      } else {
        toast('Sesión vacía descartada');
      }
      renderTrain(root, app);
    }
  }, '✓ Terminar sesión'));

  // Cancelar/salir sin registrar: descarta la sesión fantasma.
  screen.appendChild(h('button', {
    class: 'btn btn-ghost', style: 'margin-top:8px',
    onClick: async () => {
      cancelRestTimer();
      await app.repo.discardSessionIfEmpty(session.id);
      renderTrain(root, app);
    }
  }, 'Salir sin guardar'));

  root.appendChild(screen);
}

async function exerciseCard(app, ctx, pe, ex) {
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
        ? h('div', { class: 'pr-line' }, `🏆 PR: ${pr.repsAtBest} reps × ${pr.bestWeight}kg (${formatDate(pr.achievedAt)})`)
        : h('div', { class: 'muted' }, 'Sin récord aún — ¡a por el primero!'),
      prevSets.length
        ? h('div', { class: 'last-line' }, 'Última vez: ' + prevSets.map((s) => `${s.weight}×${s.reps}`).join(' · '))
        : null,
      // Sugerencia de progresión (coach ligero, #1)
      suggestion ? h('div', { class: 'suggestion' }, `💡 ${suggestion.text}`) : null,
    ]),
  ]));

  // Valores por defecto de las series: lo de la última vez, si no el objetivo (#2).
  const prefillWeight = last ? last.weight : (pe.targetWeight ?? 0);
  const prefillReps = last ? last.reps : (pe.targetReps ?? 0);

  // Filas de series (targetSets). Comparten un "estado previo" para el botón repetir (#3).
  const setsWrap = h('div', { style: 'margin-top:10px' });
  const nSets = pe.targetSets || 3;
  const lastEntered = { weight: prefillWeight, reps: prefillReps };
  for (let i = 1; i <= nSets; i++) {
    setsWrap.appendChild(setRow(app, ctx, pe, ex, i, { prefillWeight, prefillReps, lastEntered }));
  }
  card.appendChild(setsWrap);
  return card;
}

function setRow(app, ctx, pe, ex, setNumber, opts) {
  const { prefillWeight, prefillReps, lastEntered } = opts;
  const weight = h('input', { type: 'number', min: '0', step: '0.5', value: String(prefillWeight ?? 0), style: 'width:80px' });
  const reps = h('input', { type: 'number', min: '0', value: String(prefillReps ?? 0), style: 'width:70px' });
  const row = h('div', { class: 'set-row' });

  // Botón "repetir la serie anterior" (#3): copia lo último confirmado.
  const repeatBtn = h('button', { class: 'btn btn-ghost btn-sm', title: 'Repetir última serie', onClick: () => {
    weight.value = String(lastEntered.weight ?? prefillWeight ?? 0);
    reps.value = String(lastEntered.reps ?? prefillReps ?? 0);
  } }, '⟲');
  const doneBtn = h('button', { class: 'btn btn-sm', onClick: confirm }, '✓');

  row.appendChild(h('div', { class: 'setno' }, String(setNumber)));
  row.appendChild(weight); row.appendChild(h('span', { class: 'unit muted' }, 'kg'));
  row.appendChild(reps); row.appendChild(h('span', { class: 'unit muted' }, 'reps'));
  row.appendChild(repeatBtn);
  row.appendChild(doneBtn);

  async function confirm() {
    const w = parseFloat(weight.value) || 0;
    const r = parseInt(reps.value) || 0;
    if (w <= 0 || r <= 0) { toast('Pon peso y reps'); return; }

    // Recordar lo confirmado para el botón "repetir" de la siguiente serie (#3).
    lastEntered.weight = w;
    lastEntered.reps = r;

    // El descanso real lo calcula appService desde el loggedAt de la última
    // serie persistida (peer review #10): medida estable, sin estado en la vista.
    const { isPR } = await app.logSet({
      sessionId: ctx.session.id, exercise: ex, setNumber, weight: w, reps: r,
    });

    row.classList.add('done');
    weight.disabled = true; reps.disabled = true; doneBtn.disabled = true;

    if (isPR) { row.classList.add('pr'); celebratePR(ex, w, r); }

    // Inicia cronómetro de descanso hacia la siguiente serie
    startRestTimer(app, pe.restSeconds ?? 90);
  }

  return row;
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
      h('div', { class: 'muted', style: 'margin-bottom:10px;text-transform:uppercase;letter-spacing:2px' }, 'Descanso'),
      ringWrap,
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn btn-ghost btn-sm', onClick: stop }, 'Saltar descanso'),
      h('button', { class: 'btn btn-ghost btn-sm', style: 'margin-top:8px', onClick: () => { remaining += 15; num.textContent = String(remaining); setRing(); } }, '+15s'),
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
    toast('¡A por la siguiente serie!');
  }
  function stop() { cancelRestTimer(); }
}

/** Celebración visual de récord (RF-26). */
function celebratePR(ex, weight, reps) {
  beepPR();
  vibrate([200, 80, 200, 80, 300]);
  const flash = h('div', { class: 'pr-flash' }, [
    h('div', { class: 'box' }, [
      h('div', { class: 'trophy' }, '🏆'),
      h('div', { class: 'txt' }, '¡NUEVO RÉCORD!'),
      h('div', { class: 'sub2' }, `${ex.name}: ${weight}kg × ${reps}`),
    ]),
  ]);
  document.body.appendChild(flash);
  flash.addEventListener('click', () => flash.remove());
  setTimeout(() => flash.remove(), 2600);
}


