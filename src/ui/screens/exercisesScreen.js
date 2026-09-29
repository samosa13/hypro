/**
 * UI · Pantalla "Ejercicios" — librería con iconos, filtros y alta propia.
 * RF-01..RF-04.
 */
import { h, clear, toast } from '../dom.js';
import { icon } from '../icons.js';
import { MUSCLE_GROUPS, EQUIPMENT_TYPES } from '../../data/seedExercises.js';
import { ICON_KEYS } from '../icons.js';
import { pushLayer, popLayer } from '../nav.js';

// Estado de filtros persistente a nivel de módulo (peer review navegación #6):
// se conserva al volver de crear un ejercicio o cambiar de pestaña.
const filterState = { muscle: '', equipment: '', q: '' };

export async function renderExercises(root, app) {
  clear(root);
  const screen = h('div', { class: 'screen' });
  screen.appendChild(h('h2', {}, 'Ejercicios'));

  const state = filterState; // referencia compartida (persiste entre renders)
  const listWrap = h('div', { class: 'list-scroll' });

  // Filtros (se re-aplican los valores guardados)
  const muscleSel = h('select', {}, [
    h('option', { value: '' }, 'Todos los músculos'),
    ...MUSCLE_GROUPS.map((m) => h('option', { value: m }, m)),
  ]);
  const equipSel = h('select', {}, [
    h('option', { value: '' }, 'Todo el equipo'),
    ...EQUIPMENT_TYPES.map((e) => h('option', { value: e }, e)),
  ]);
  const search = h('input', { type: 'search', placeholder: 'Buscar ejercicio…' });
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
    h('button', { class: 'btn btn-ghost btn-sm', style: 'margin-bottom:12px', onClick: () => openNewExercise(app, paint) }, '+ Crear ejercicio propio')
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
      listWrap.appendChild(h('div', { class: 'empty' }, 'No hay ejercicios con esos filtros.'));
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
              ex.isCustom ? h('span', { class: 'chip' }, 'propio') : null,
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
  screen.appendChild(h('h2', {}, 'Nuevo ejercicio'));

  const name = h('input', { placeholder: 'Nombre del ejercicio' });
  const muscle = h('select', {}, MUSCLE_GROUPS.map((m) => h('option', { value: m }, m)));
  const equip = h('select', {}, EQUIPMENT_TYPES.map((e) => h('option', { value: e }, e)));
  const iconSel = h('select', {}, ICON_KEYS.map((k) => h('option', { value: k }, k)));

  const preview = h('div', { class: 'ex-icon', html: icon(ICON_KEYS[0]) });
  iconSel.addEventListener('change', () => { preview.innerHTML = icon(iconSel.value); });

  screen.appendChild(h('div', { class: 'card' }, [
    h('label', {}, 'Nombre'), name,
    h('label', {}, 'Grupo muscular'), muscle,
    h('label', {}, 'Equipo'), equip,
    h('label', {}, 'Icono'),
    h('div', { class: 'row' }, [preview, iconSel]),
  ]));

  screen.appendChild(h('button', {
    class: 'btn', onClick: async () => {
      if (!name.value.trim()) { toast('Ponle un nombre'); return; }
      await app.repo.addExercise({
        name: name.value.trim(), muscleGroup: muscle.value, equipment: equip.value, icon: iconSel.value,
      }, app.userId);
      toast('Ejercicio creado');
      popLayer();
      renderExercises(root, app);
    }
  }, 'Guardar'));
  screen.appendChild(h('button', { class: 'btn btn-ghost', style: 'margin-top:8px', onClick: () => { popLayer(); renderExercises(root, app); } }, 'Cancelar'));
  root.appendChild(screen);
  // Registrar capa: el gesto atrás cancela y vuelve a Ejercicios.
  pushLayer(() => renderExercises(root, app));
}
