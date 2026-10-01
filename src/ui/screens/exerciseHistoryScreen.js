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

/**
 * @param {HTMLElement} root
 * @param {object} app  appService
 * @param {object} ex   ejercicio (id, name, icon)
 * @param {Function} onBack  callback que repinta la pantalla de origen
 */
export async function renderExerciseHistory(root, app, ex, onBack) {
  clear(root);
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

  // PR vigente.
  screen.appendChild(h('div', { class: 'card' }, [
    pr
      ? h('div', { class: 'pr-line' }, t('exh.pr', { reps: pr.repsAtBest, weight: pr.bestWeight, date: formatDate(pr.achievedAt) }))
      : h('div', { class: 'muted' }, t('exh.noPR')),
  ]));

  if (points.length === 0) {
    screen.appendChild(h('div', { class: 'empty' }, t('exh.noData')));
    finish(screen, root, onBack);
    return;
  }

  // Métricas rápidas.
  const best1RM = Math.max(...points.map((p) => p.best1RM));
  screen.appendChild(h('div', { class: 'card grid2' }, [
    h('div', { class: 'metric' }, [
      h('div', { class: 'big', style: 'font-size:22px' }, `${best1RM} kg`),
      h('div', { class: 'lbl' }, t('exh.best1RM')),
    ]),
    h('div', { class: 'metric' }, [
      h('div', { class: 'big', style: 'font-size:22px' }, String(totalSets)),
      h('div', { class: 'lbl' }, t('exh.totalSets')),
    ]),
  ]));

  // Gráfica de evolución del 1RM (línea SVG).
  screen.appendChild(h('div', { class: 'card' }, [
    h('div', { style: 'font-weight:800;margin-bottom:10px' }, t('exh.evolution')),
    lineChart(points.map((p) => ({ x: p.date, y: p.best1RM }))),
    h('div', { class: 'faint', style: 'margin-top:8px' }, t('exh.evolutionHint')),
  ]));

  // Lista de sesiones (más reciente primero).
  screen.appendChild(h('div', { style: 'font-weight:800;margin:14px 4px 8px' }, t('exh.sessions', { n: points.length })));
  for (const p of [...points].reverse()) {
    screen.appendChild(h('div', { class: 'card row-between' }, [
      h('div', {}, [
        h('div', { style: 'font-weight:700' }, formatDate(p.date)),
        h('div', { class: 'muted' }, t('exh.sessionLine', { weight: p.bestWeight, reps: p.bestReps, sets: p.sets })),
      ]),
      h('div', { class: 'pr-line', style: 'font-weight:800' }, `${p.best1RM} kg`),
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
