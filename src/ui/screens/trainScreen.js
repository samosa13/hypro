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

export async function renderTrain(root, app) {
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
  const todayDay = days.find((d) => d.order === dayInWeek) ?? days[0];

  screen.appendChild(h('div', { class: 'banner' }, pos));
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
  screen.appendChild(h('div', { class: 'banner' }, `${pos} · ${day.name}`));

  for (const pe of planExercises) {
    const ex = exMap[pe.exerciseId];
    if (!ex) continue;
    screen.appendChild(await exerciseCard(app, ctx, pe, ex));
  }

  screen.appendChild(h('button', {
    class: 'btn', style: 'margin-top:8px',
    onClick: async () => { await app.repo.finishSession(session.id); toast('¡Sesión guardada! 💪'); renderTrain(root, app); }
  }, '✓ Terminar sesión'));
  root.appendChild(screen);
}

async function exerciseCard(app, ctx, pe, ex) {
  const pr = await app.repo.getPR(ex.id, app.userId);
  const prevSets = await lastSessionSets(app, ex.id, ctx.session.id);

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
    ]),
  ]));

  // Filas de series (targetSets)
  const setsWrap = h('div', { style: 'margin-top:10px' });
  const nSets = pe.targetSets || 3;
  let restTimerHandle = { last: null };
  for (let i = 1; i <= nSets; i++) {
    setsWrap.appendChild(setRow(app, ctx, pe, ex, i, restTimerHandle));
  }
  card.appendChild(setsWrap);
  return card;
}

function setRow(app, ctx, pe, ex, setNumber, restHandle) {
  const weight = h('input', { type: 'number', min: '0', step: '0.5', value: String(pe.targetWeight ?? 0), style: 'width:80px' });
  const reps = h('input', { type: 'number', min: '0', value: String(pe.targetReps ?? 0), style: 'width:70px' });
  const row = h('div', { class: 'set-row' });

  const doneBtn = h('button', { class: 'btn btn-sm', onClick: confirm }, '✓');

  row.appendChild(h('div', { class: 'setno' }, String(setNumber)));
  row.appendChild(weight); row.appendChild(h('span', { class: 'unit muted' }, 'kg'));
  row.appendChild(reps); row.appendChild(h('span', { class: 'unit muted' }, 'reps'));
  row.appendChild(doneBtn);

  async function confirm() {
    const w = parseFloat(weight.value) || 0;
    const r = parseInt(reps.value) || 0;
    if (w <= 0 || r <= 0) { toast('Pon peso y reps'); return; }

    // descanso real desde la serie anterior de este ejercicio
    let restTaken = null;
    const now = Date.now();
    if (restHandle.last) restTaken = Math.round((now - restHandle.last) / 1000);
    restHandle.last = now;

    const { isPR } = await app.logSet({
      sessionId: ctx.session.id, exercise: ex, setNumber, weight: w, reps: r, restTakenSeconds: restTaken,
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

  const existing = document.querySelector('.rest-overlay');
  if (existing) existing.remove();

  let remaining = seconds;
  const num = h('div', { class: 'timer-num' }, String(remaining));
  const overlay = h('div', { class: 'rest-overlay pr-flash' }, [
    h('div', { class: 'box' }, [
      h('div', { class: 'muted' }, 'Descanso'),
      num,
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn btn-ghost btn-sm', onClick: stop }, 'Saltar descanso'),
      h('button', { class: 'btn btn-ghost btn-sm', style: 'margin-top:8px', onClick: () => { remaining += 15; num.textContent = String(remaining); } }, '+15s'),
    ]),
  ]);
  document.body.appendChild(overlay);

  let warned = false;
  const interval = setInterval(() => {
    remaining--;
    num.textContent = String(Math.max(0, remaining));
    if (remaining <= lead && remaining > 0) {
      num.classList.add('warn');
      if (!warned) { warned = true; if (soundOn) beepWarning(); vibrate(80); }
    }
    if (remaining <= 0) { finish(); }
  }, 1000);

  function finish() {
    clearInterval(interval);
    if (soundOn) beepEnd();
    vibrate([120, 60, 120]);
    overlay.remove();
    toast('¡A por la siguiente serie!');
  }
  function stop() { clearInterval(interval); overlay.remove(); }
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

/** Series de la última sesión previa en que se hizo este ejercicio. */
async function lastSessionSets(app, exerciseId, currentSessionId) {
  const sets = await app.repo.listSetsForExercise(exerciseId);
  const prior = sets.filter((s) => s.sessionId !== currentSessionId);
  if (prior.length === 0) return [];
  // agrupa por sesión, coge la más reciente
  const bySession = {};
  for (const s of prior) (bySession[s.sessionId] ??= []).push(s);
  const latestId = prior.sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt))[0].sessionId;
  return bySession[latestId].sort((a, b) => a.setNumber - b.setNumber);
}
