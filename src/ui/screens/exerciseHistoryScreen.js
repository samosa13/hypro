/**
 * UI · Pantalla "Historial por ejercicio" (A2).
 * Muestra la evolución del 1RM estimado a lo largo de las sesiones + el detalle
 * por sesión (mejor serie y nº de series). Sub-pantalla: se abre desde la ficha
 * de un ejercicio y vuelve a su origen con el gesto atrás / botón Hecho.
 */
import { h, clear } from '../dom.js';
import { icon } from '../icons.js';
import { formatDate } from '../../domain/dateKey.js';
import { pushLayer, popLayer } from '../nav.js';
import { t } from '../../i18n/index.js';
import { kgToDisplay, unitLabel, formatDuration } from '../../domain/units.js';
import { normalizeTracking } from '../../domain/personalRecord.js';

/**
 * @param {HTMLElement} root
 * @param {object} app  appService
 * @param {object} ex   ejercicio (id, name, icon)
 * @param {Function} onBack  callback que repinta la pantalla de origen
 */
export async function renderExerciseHistory(root, app, ex, onBack) {
  clear(root);
  const settings = await app.repo.getSettings(app.userId);
  const unit = settings.unit === 'lb' ? 'lb' : 'kg';
  const u = unitLabel(unit);
  const screen = h('div', { class: 'screen' });

  // Cabecera: icono + nombre + título.
  screen.appendChild(h('div', { class: 'row', style: 'align-items:center;gap:10px' }, [
    h('div', { class: 'ex-icon', html: icon(ex.icon) }),
    h('div', {}, [
      h('div', { style: 'font-weight:800;font-size:18px' }, ex.name),
      h('div', { class: 'muted' }, t('exh.title')),
    ]),
  ]));

  const { points, pr, totalSets } = await app.exerciseHistory(ex.id);
  const tracking = normalizeTracking(ex.tracking); // tipo de medición (D16)

  // Representación del valor comparable (score) de un punto, según el tipo.
  const scoreText = (p) => {
    if (tracking === 'reps_only') return `${Math.round(p.bestScore)} reps`;
    if (tracking === 'time') return formatDuration(p.bestScore);
    return `${kgToDisplay(p.bestScore, unit)} ${u}`;
  };
  // Para la gráfica: el eje Y es el score (reps/segundos tal cual; 1RM en la
  // unidad del usuario para peso+reps).
  const scoreY = (p) => (tracking === 'weight_reps' ? kgToDisplay(p.bestScore, unit) : p.bestScore);

  // PR vigente, con el texto adecuado al tipo de medición.
  const prText = pr
    ? tracking === 'reps_only'
      ? t('exh.prReps', { reps: pr.repsAtBest, date: formatDate(pr.achievedAt) })
      : tracking === 'time'
        ? t('exh.prTime', { time: formatDuration(pr.bestDurationSeconds), date: formatDate(pr.achievedAt) })
        : t('exh.pr', { reps: pr.repsAtBest, weight: kgToDisplay(pr.bestWeight, unit), unit: u, date: formatDate(pr.achievedAt) })
    : null;
  screen.appendChild(h('div', { class: 'card' }, [
    prText ? h('div', { class: 'pr-line' }, prText) : h('div', { class: 'muted' }, t('exh.noPR')),
  ]));

  if (points.length === 0) {
    screen.appendChild(h('div', { class: 'empty' }, t('exh.noData')));
    finish(screen, root, onBack);
    return;
  }

  // Métricas rápidas: mejor marca (score) y nº de series.
  const bestPoint = points.reduce((a, b) => (b.bestScore > a.bestScore ? b : a));
  const bestLabel = tracking === 'reps_only' ? t('exh.bestReps') : tracking === 'time' ? t('exh.bestTime') : t('exh.best1RM');
  screen.appendChild(h('div', { class: 'card grid2' }, [
    h('div', { class: 'metric' }, [
      h('div', { class: 'big', style: 'font-size:22px' }, scoreText(bestPoint)),
      h('div', { class: 'lbl' }, bestLabel),
    ]),
    h('div', { class: 'metric' }, [
      h('div', { class: 'big', style: 'font-size:22px' }, String(totalSets)),
      h('div', { class: 'lbl' }, t('exh.totalSets')),
    ]),
  ]));

  // Gráfica de evolución (línea SVG) del valor comparable.
  const evoTitle = tracking === 'reps_only' ? t('exh.evolutionReps') : tracking === 'time' ? t('exh.evolutionTime') : t('exh.evolution');
  const evoHint = tracking === 'weight_reps' ? t('exh.evolutionHint') : t('exh.evolutionHintGeneric');
  screen.appendChild(h('div', { class: 'card' }, [
    h('div', { style: 'font-weight:800;margin-bottom:10px' }, evoTitle),
    lineChart(points.map((p) => ({ x: p.date, y: scoreY(p) }))),
    h('div', { class: 'faint', style: 'margin-top:8px' }, evoHint),
  ]));

  // Representación de la mejor serie de una sesión en la lista.
  const sessionBest = (p) => {
    if (tracking === 'reps_only') return t('exh.sessionLineReps', { reps: p.bestReps, sets: p.sets });
    if (tracking === 'time') return t('exh.sessionLineTime', { time: formatDuration(p.bestDurationSeconds), sets: p.sets });
    return t('exh.sessionLine', { weight: kgToDisplay(p.bestWeight, unit), unit: u, reps: p.bestReps, sets: p.sets });
  };

  // Lista de sesiones (más reciente primero).
  screen.appendChild(h('div', { style: 'font-weight:800;margin:14px 4px 8px' }, t('exh.sessions', { n: points.length })));
  for (const p of [...points].reverse()) {
    screen.appendChild(h('div', { class: 'card row-between' }, [
      h('div', {}, [
        h('div', { style: 'font-weight:700' }, formatDate(p.date)),
        h('div', { class: 'muted' }, sessionBest(p)),
      ]),
      h('div', { class: 'pr-line', style: 'font-weight:800' }, scoreText(p)),
    ]));
  }

  finish(screen, root, onBack);
}

function finish(screen, root, onBack) {
  const back = () => { popLayer(); onBack(); };
  screen.appendChild(h('button', { class: 'btn', style: 'margin-top:12px', onClick: back }, t('common.done')));
  root.appendChild(screen);
  // Registrar capa: el gesto atrás vuelve a la pantalla de origen.
  pushLayer(() => onBack());
}

/**
 * Mini gráfica de línea en SVG. Dibuja la serie de puntos {x(fecha), y(valor)}
 * normalizada a un viewBox fijo, con relleno suave bajo la línea y marcadores.
 * Puro: no depende de datos externos.
 */
function lineChart(data) {
  const W = 320, H = 120, pad = 10;
  const ys = data.map((d) => d.y);
  const min = Math.min(...ys), max = Math.max(...ys);
  const span = max - min || 1;
  const n = data.length;

  // Coordenadas en el viewBox. Con un solo punto, se centra.
  const px = (i) => (n === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1));
  const py = (y) => H - pad - ((y - min) / span) * (H - 2 * pad);

  const pts = data.map((d, i) => `${px(i).toFixed(1)},${py(d.y).toFixed(1)}`);
  const line = pts.join(' ');
  const area = `${pad},${H - pad} ${line} ${(n === 1 ? W / 2 : W - pad)},${H - pad}`;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'line-chart');
  svg.setAttribute('width', '100%');
  svg.innerHTML =
    `<polygon points="${area}" fill="var(--color-accent)" opacity="0.12" />` +
    `<polyline points="${line}" fill="none" stroke="var(--color-accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />` +
    data.map((d, i) => `<circle cx="${px(i).toFixed(1)}" cy="${py(d.y).toFixed(1)}" r="3.5" fill="var(--color-accent)" />`).join('');
  return svg;
}
