/**
 * UI · Pantalla "Progreso" — doble métrica de tiempo + PRs + gráficas sencillas.
 * RF-30..RF-34.
 */
import { h, clear, toast } from '../dom.js';
import { icon } from '../icons.js';
import { tenureLabel } from '../../domain/gymTenure.js';
import { positionLabel } from '../../domain/effectiveWeek.js';
import { currentStreak } from '../../domain/streak.js';
import { formatDate } from '../../domain/dateKey.js';
import { t } from '../../i18n/index.js';
import { kgToDisplay, unitLabel } from '../../domain/units.js';
import { shareCard } from '../shareCard.js';

export async function renderProgress(root, app) {
  clear(root);
  const screen = h('div', { class: 'screen' });
  screen.appendChild(h('h2', {}, t('progress.title')));

  const settings = await app.repo.getSettings(app.userId);
  const plan = await app.repo.getActivePlan(app.userId);
  const summary = await app.progressSummary();
  const sessions = await app.repo.listValidSessions(app.userId); // solo sesiones reales (#13)
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
        h('div', { class: 'lbl' }, t('progress.inPlan')),
      ]),
      h('div', { class: 'metric' }, [
        h('div', { class: 'big', style: 'font-size:18px' }, tenure),
        h('div', { class: 'lbl' }, t('progress.inGym')),
      ]),
    ]),
  ]));

  // --- Contadores globales ---
  const sessionDates = sessions.map((s) => s.startedAt);
  const streak = plan ? currentStreak(sessionDates, plan.daysPerWeek) : 0;
  screen.appendChild(h('div', { class: 'card grid3' }, [
    metric(summary.sessions, t('progress.sessions')),
    metric(summary.prs, t('progress.records')),
    metric(streak, t('progress.streak')),
  ]));

  // --- Aviso de estancamiento de la semana (RB-4) ---
  if (plan) {
    const { week, plateaus } = await app.weeklyPlateaus();
    if (plateaus.length > 0) {
      screen.appendChild(h('div', { class: 'card', style: 'border-color:var(--color-warning)' }, [
        h('div', { style: 'font-weight:800;color:var(--color-warning);margin-bottom:8px' },
          t('progress.plateauTitle', { week: String(week).padStart(2, '0') })),
        ...plateaus.map((p) =>
          h('div', { class: 'muted', style: 'margin:4px 0' },
            t('progress.plateauLine', { name: p.exerciseName, date: formatDate(p.prDate) }))
        ),
      ]));
    }
  }

  // --- Gráfica de asistencia (últimas 8 semanas de calendario, informativa) ---
  screen.appendChild(h('div', { class: 'card' }, [
    h('div', { style: 'font-weight:800;margin-bottom:10px' }, t('progress.attendance')),
    attendanceBars(sessionDates),
    h('div', { class: 'faint', style: 'margin-top:8px' }, t('progress.attendanceHint')),
  ]));

  // --- Descansos reales y duración de sesiones (RF-28, RF-34) ---
  const stats = await app.restAndDurationStats();
  if (stats.restSamples.length > 0 || stats.sessionDurations.length > 0) {
    const durList = stats.sessionDurations.slice(-8);
    screen.appendChild(h('div', { class: 'card' }, [
      h('div', { style: 'font-weight:800;margin-bottom:10px' }, t('progress.restDuration')),
      h('div', { class: 'grid2' }, [
        h('div', { class: 'metric' }, [
          h('div', { class: 'big', style: 'font-size:24px' }, stats.avgRest ? `${stats.avgRest}s` : '—'),
          h('div', { class: 'lbl' }, t('progress.avgRest')),
        ]),
        h('div', { class: 'metric' }, [
          h('div', { class: 'big', style: 'font-size:24px' },
            durList.length ? `${Math.round(durList.reduce((a, b) => a + b.minutes, 0) / durList.length)} min` : '—'),
          h('div', { class: 'lbl' }, t('progress.avgDuration')),
        ]),
      ]),
      durList.length ? durationBars(durList) : null,
      durList.length ? h('div', { class: 'faint', style: 'margin-top:8px' }, t('progress.durationHint')) : null,
    ]));
  }

  // --- Volumen semanal por grupo muscular (#4) ---
  if (plan) {
    const { ranking: volume, isCompletedWeek, target } = await app.weeklyVolume();
    if (volume.length > 0) {
      // Escala contra el máximo entre volumen y objetivo, para que la marca del
      // objetivo (C13) quepa dentro de la barra.
      const maxV = Math.max(...volume.map((v) => v.sets), target || 0, 1);
      const title = isCompletedWeek ? t('progress.volumeLastWeek') : t('progress.volumeThisWeek');
      screen.appendChild(h('div', { class: 'card' }, [
        h('div', { style: 'font-weight:800;margin-bottom:10px' }, title),
        ...volume.map((v) => {
          const trackChildren = [
            h('div', { class: `vol-bar vol-${v.status}`, style: `width:${Math.max(6, (v.sets / maxV) * 100)}%` }),
          ];
          // Marca vertical del objetivo (si hay objetivo configurado).
          if (target > 0) {
            trackChildren.push(h('div', { class: 'vol-target-mark', style: `left:${Math.min(100, (target / maxV) * 100)}%`, title: t('progress.volumeTarget', { n: target }) }));
          }
          return h('div', { class: 'vol-row' }, [
            h('div', { class: 'vol-label' }, v.muscle),
            h('div', { class: 'vol-bar-track' }, trackChildren),
            h('div', { class: `vol-count vol-${v.status}` }, String(v.sets)),
          ]);
        }),
        target > 0
          ? h('div', { class: 'faint', style: 'margin-top:8px' }, t('progress.volumeTargetHint', { n: target }))
          : h('div', { class: 'faint', style: 'margin-top:8px' }, t('progress.volumeHint')),
      ]));
    }
  }

  // --- PRs por ejercicio con fecha ---
  screen.appendChild(h('div', { style: 'font-weight:800;margin:14px 4px 8px' }, t('progress.yourRecords')));
  if (prs.length === 0) {
    screen.appendChild(h('div', { class: 'empty' }, t('progress.noRecords')));
  } else {
    for (const pr of prs.sort((a, b) => new Date(b.achievedAt) - new Date(a.achievedAt))) {
      const ex = exMap[pr.exerciseId];
      const exName = ex?.name ?? 'Ejercicio';
      const weightTxt = `${kgToDisplay(pr.bestWeight, settings.unit)}${unitLabel(settings.unit)}`;
      // Botón compartir el PR como imagen (C14).
      const shareBtn = h('button', {
        class: 'btn btn-ghost btn-sm', title: t('share.pr'),
        onClick: async () => {
          const res = await shareCard({
            title: t('train.newRecord'),
            headline: `${kgToDisplay(pr.bestWeight, settings.unit)} ${unitLabel(settings.unit)} × ${pr.repsAtBest}`,
            subtitle: exName,
            footer: formatDate(pr.achievedAt),
            filename: `hypro-pr-${(ex?.seedKey || exName).toString().toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`,
          });
          if (res === 'downloaded') toast(t('share.downloaded'));
        },
      }, '📤');
      screen.appendChild(h('div', { class: 'card row-between' }, [
        h('div', { class: 'row' }, [
          h('div', { class: 'ex-icon', html: icon(ex?.icon ?? 'bodyweight') }),
          h('div', {}, [
            h('div', { style: 'font-weight:700' }, exName),
            h('div', { class: 'pr-line' }, `${pr.repsAtBest} reps × ${weightTxt}`),
            h('div', { class: 'faint' }, formatDate(pr.achievedAt)),
          ]),
        ]),
        shareBtn,
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
