/**
 * UI · Pantalla "Ejercicios" — librería con iconos, filtros y alta propia.
 * RF-01..RF-04.
 */
import { h, clear, toast } from '../dom.js';
import { icon } from '../icons.js';
import { MUSCLE_GROUPS, EQUIPMENT_TYPES } from '../../data/seedExercises.js';
import { ICON_KEYS } from '../icons.js';
import { pushLayer, popLayer } from '../nav.js';
import { t } from '../../i18n/index.js';

// Estado de filtros persistente a nivel de módulo (peer review navegación #6):
// se conserva al volver de crear un ejercicio o cambiar de pestaña.
const filterState = { muscle: '', equipment: '', q: '' };

export async function renderExercises(root, app) {
  clear(root);
  const screen = h('div', { class: 'screen' });
  screen.appendChild(h('h2', {}, t('ex.title')));

  const state = filterState; // referencia compartida (persiste entre renders)
  const listWrap = h('div', { class: 'list-scroll' });

  // Filtros (se re-aplican los valores guardados)
  const muscleSel = h('select', {}, [
    h('option', { value: '' }, t('ex.allMuscles')),
    ...MUSCLE_GROUPS.map((m) => h('option', { value: m }, m)),
  ]);
  const equipSel = h('select', {}, [
    h('option', { value: '' }, t('ex.allEquipment')),
    ...EQUIPMENT_TYPES.map((e) => h('option', { value: e }, e)),
  ]);
  const search = h('input', { type: 'search', placeholder: t('ex.searchPh') });
  // Restaurar los filtros guardados en los controles.
  muscleSel.value = state.muscle;
  equipSel.value = state.equipment;
  search.value = state.q;

  muscleSel.addEventListener('change', () => { state.muscle = muscleSel.value; paint(); });
  equipSel.addEventListener('change', () => { state.equipment = equipSel.value; paint(); });
  search.addEventListener('input', () => { state.q = search.value.toLowerCase(); paint(); });

  const filters = h('div', { class: 'card' }, [
    search,
    h('div', { class: 'grid2', style: 'margin-top:10px' }, [muscleSel, equipSel]),
  ]);

  screen.appendChild(filters);
  screen.appendChild(
    h('button', { class: 'btn btn-ghost btn-sm', style: 'margin-bottom:12px', onClick: () => openNewExercise(app, paint) }, t('ex.createOwn'))
  );
  screen.appendChild(listWrap);
  root.appendChild(screen);

  let all = await app.repo.listExercises(app.userId);

  function paint() {
    clear(listWrap);
    const filtered = all.filter((e) =>
      (!state.muscle || e.muscleGroup === state.muscle) &&
      (!state.equipment || e.equipment === state.equipment) &&
      (!state.q || e.name.toLowerCase().includes(state.q))
    );
    if (filtered.length === 0) {
      listWrap.appendChild(h('div', { class: 'empty' }, t('ex.none')));
      return;
    }
    for (const ex of filtered.sort((a, b) => a.name.localeCompare(b.name))) {
      listWrap.appendChild(
        h('div', { class: 'card row' }, [
          h('div', { class: 'ex-icon', html: icon(ex.icon) }),
          h('div', {}, [
            h('div', { style: 'font-weight:700' }, ex.name),
            h('div', { class: 'row', style: 'gap:6px;margin-top:4px' }, [
              h('span', { class: 'chip' }, ex.muscleGroup),
              h('span', { class: 'chip' }, ex.equipment),
              ex.isCustom ? h('span', { class: 'chip' }, t('ex.own')) : null,
            ]),
          ]),
        ])
      );
    }
  }
  paint();

  async function reload() { all = await app.repo.listExercises(app.userId); paint(); }
  paint.reload = reload;
}

function openNewExercise(app, paint) {
  const root = document.getElementById('app');
  clear(root);
  const screen = h('div', { class: 'screen' });
  screen.appendChild(h('h2', {}, t('ex.new')));

  const name = h('input', { placeholder: t('ex.namePh') });
  const muscle = h('select', {}, MUSCLE_GROUPS.map((m) => h('option', { value: m }, m)));
  const equip = h('select', {}, EQUIPMENT_TYPES.map((e) => h('option', { value: e }, e)));
  const iconSel = h('select', {}, ICON_KEYS.map((k) => h('option', { value: k }, k)));

  const preview = h('div', { class: 'ex-icon', html: icon(ICON_KEYS[0]) });
  iconSel.addEventListener('change', () => { preview.innerHTML = icon(iconSel.value); });

  screen.appendChild(h('div', { class: 'card' }, [
    h('label', {}, t('ex.name')), name,
    h('label', {}, t('ex.muscleGroup')), muscle,
    h('label', {}, t('ex.equipment')), equip,
    h('label', {}, t('ex.icon')),
    h('div', { class: 'row' }, [preview, iconSel]),
  ]));

  screen.appendChild(h('button', {
    class: 'btn', onClick: async () => {
      if (!name.value.trim()) { toast(t('ex.needName')); return; }
      await app.repo.addExercise({
        name: name.value.trim(), muscleGroup: muscle.value, equipment: equip.value, icon: iconSel.value,
      }, app.userId);
      toast(t('ex.created'));
      popLayer();
      renderExercises(root, app);
    }
  }, t('common.save')));
  screen.appendChild(h('button', { class: 'btn btn-ghost', style: 'margin-top:8px', onClick: () => { popLayer(); renderExercises(root, app); } }, t('common.cancel')));
  root.appendChild(screen);
  // Registrar capa: el gesto atrás cancela y vuelve a Ejercicios.
  pushLayer(() => renderExercises(root, app));
}
