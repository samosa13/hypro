/**
 * UI · Pantalla "Progreso" — doble métrica de tiempo + PRs + gráficas sencillas.
 * RF-30..RF-34.
 */
import { h, clear } from '../dom.js';
import { icon } from '../icons.js';
import { tenureLabel } from '../../domain/gymTenure.js';
import { positionLabel } from '../../domain/effectiveWeek.js';
import { currentStreak } from '../../domain/streak.js';
import { formatDate } from '../../domain/dateKey.js';

export async function renderProgress(root, app) {
  clear(root);
  const screen = h('div', { class: 'screen' });
  screen.appendChild(h('h2', {}, 'Progreso'));

  const settings = await app.repo.getSettings(app.userId);
  const plan = await app.repo.getActivePlan(app.userId);
  const summary = await app.progressSummary();
  const sessions = await app.repo.listSessions(app.userId);
  const prs = await app.repo.listPRs(app.userId);
  const allEx = await app.repo.listExercises(app.userId);
  const exMap = Object.fromEntries(allEx.map((e) => [e.id, e]));

  // --- Doble métrica de tiempo (el diferenciador) ---
  const effLabel = plan
    ? positionLabel(await app.repo.countSessions(plan.id), plan.daysPerWeek)
    : '—';
  const tenure = settings.gymStartDate ? tenureLabel(settings.gymStartDate) : '—';

  screen.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'grid2' }, [
      h('div', { class: 'metric' }, [
        h('div', { class: 'big', style: 'font-size:18px' }, effLabel),
        h('div', { class: 'lbl' }, 'En tu plan actual'),
      ]),
      h('div', { class: 'metric' }, [
        h('div', { class: 'big', style: 'font-size:18px' }, tenure),
        h('div', { class: 'lbl' }, 'En el gimnasio'),
      ]),
    ]),
  ]));

  // --- Contadores globales ---
  const sessionDates = sessions.map((s) => s.startedAt);
  const streak = plan ? currentStreak(sessionDates, plan.daysPerWeek) : 0;
  screen.appendChild(h('div', { class: 'card grid3' }, [
    metric(summary.sessions, 'Sesiones'),
    metric(summary.prs, 'Récords'),
    metric(streak, 'Racha 🔥'),
  ]));

  // --- Aviso de estancamiento de la semana (RB-4) ---
  if (plan) {
    const { week, plateaus } = await app.weeklyPlateaus();
    if (plateaus.length > 0) {
      screen.appendChild(h('div', { class: 'card', style: 'border-color:var(--color-warning)' }, [
        h('div', { style: 'font-weight:800;color:var(--color-warning);margin-bottom:8px' },
          `⚠️ Semana ${String(week).padStart(2, '0')}: sin superar récord`),
        ...plateaus.map((p) =>
          h('div', { class: 'muted', style: 'margin:4px 0' },
            `${p.exerciseName}: tu récord sigue siendo del ${formatDate(p.prDate)}. ¡A por él la próxima!`)
        ),
      ]));
    }
  }

  // --- Gráfica de asistencia (últimas 8 semanas de calendario, informativa) ---
  screen.appendChild(h('div', { class: 'card' }, [
    h('div', { style: 'font-weight:800;margin-bottom:10px' }, 'Asistencia (últimas semanas)'),
    attendanceBars(sessionDates),
    h('div', { class: 'faint', style: 'margin-top:8px' }, 'Barras naranjas = semanas con entreno. Rojas = semanas sin registrar.'),
  ]));

  // --- Descansos reales y duración de sesiones (RF-28, RF-34) ---
  const stats = await app.restAndDurationStats();
  if (stats.restSamples.length > 0 || stats.sessionDurations.length > 0) {
    const durList = stats.sessionDurations.slice(-8);
    screen.appendChild(h('div', { class: 'card' }, [
      h('div', { style: 'font-weight:800;margin-bottom:10px' }, 'Descansos y duración'),
      h('div', { class: 'grid2' }, [
        h('div', { class: 'metric' }, [
          h('div', { class: 'big', style: 'font-size:24px' }, stats.avgRest ? `${stats.avgRest}s` : '—'),
          h('div', { class: 'lbl' }, 'Descanso medio entre series'),
        ]),
        h('div', { class: 'metric' }, [
          h('div', { class: 'big', style: 'font-size:24px' },
            durList.length ? `${Math.round(durList.reduce((a, b) => a + b.minutes, 0) / durList.length)} min` : '—'),
          h('div', { class: 'lbl' }, 'Duración media de sesión'),
        ]),
      ]),
      durList.length ? durationBars(durList) : null,
      durList.length ? h('div', { class: 'faint', style: 'margin-top:8px' }, 'Minutos por sesión (últimas 8).') : null,
    ]));
  }

  // --- PRs por ejercicio con fecha ---
  screen.appendChild(h('div', { style: 'font-weight:800;margin:14px 4px 8px' }, 'Tus récords'));
  if (prs.length === 0) {
    screen.appendChild(h('div', { class: 'empty' }, 'Aún no hay récords. Entrena y llegarán.'));
  } else {
    for (const pr of prs.sort((a, b) => new Date(b.achievedAt) - new Date(a.achievedAt))) {
      const ex = exMap[pr.exerciseId];
      screen.appendChild(h('div', { class: 'card row' }, [
        h('div', { class: 'ex-icon', html: icon(ex?.icon ?? 'bodyweight') }),
        h('div', {}, [
          h('div', { style: 'font-weight:700' }, ex?.name ?? 'Ejercicio'),
          h('div', { class: 'pr-line' }, `${pr.repsAtBest} reps × ${pr.bestWeight}kg`),
          h('div', { class: 'faint' }, formatDate(pr.achievedAt)),
        ]),
      ]));
    }
  }

  root.appendChild(screen);
}

function metric(value, label) {
  return h('div', { class: 'metric' }, [
    h('div', { class: 'big' }, String(value)),
    h('div', { class: 'lbl' }, label),
  ]);
}

/** Barras de asistencia por semana de calendario (8 últimas). Informativo. */
function attendanceBars(sessionDates) {
  const weeks = 8;
  const now = new Date();
  const counts = new Array(weeks).fill(0);
  for (const d of sessionDates) {
    const diffDays = Math.floor((now - new Date(d)) / (1000 * 60 * 60 * 24));
    const wk = Math.floor(diffDays / 7);
    if (wk >= 0 && wk < weeks) counts[weeks - 1 - wk]++;
  }
  const max = Math.max(1, ...counts);
  return h('div', { class: 'bars' },
    counts.map((c) =>
      h('div', {
        class: 'bar' + (c === 0 ? ' miss' : ''),
        style: `height:${Math.max(4, (c / max) * 100)}%`,
        title: `${c} sesiones`,
      })
    )
  );
}

/** Barras de duración de sesión (minutos). */
function durationBars(durList) {
  const max = Math.max(1, ...durList.map((d) => d.minutes));
  return h('div', { class: 'bars', style: 'margin-top:12px' },
    durList.map((d) =>
      h('div', {
        class: 'bar',
        style: `height:${Math.max(4, (d.minutes / max) * 100)}%`,
        title: `${d.minutes} min`,
      })
    )
  );
}
