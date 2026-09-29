/**
 * UI · Pantalla "Plan" — crear/editar plan, días con nombre libre y sus ejercicios.
 * RF-10..RF-14. Editar no rompe historial (el historial vive en sessions/loggedSets).
 */
import { h, clear, toast, confirmDialog } from '../dom.js';
import { icon } from '../icons.js';
import { pushLayer, popLayer } from '../nav.js';

export async function renderPlan(root, app, opts = {}) {
  clear(root);
  const screen = h('div', { class: 'screen' });
  screen.appendChild(h('h2', {}, 'Mi plan'));

  let plan = await app.repo.getActivePlan(app.userId);

  if (!plan) {
    screen.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'muted', style: 'margin-bottom:12px' }, 'Aún no tienes un plan. Créalo para empezar a entrenar.'),
      h('button', { class: 'btn', onClick: () => openNewPlan(root, app) }, 'Crear mi plan'),
    ]));
    root.appendChild(screen);
    return;
  }

  const settings = await app.repo.getSettings(app.userId);
  const days = await app.repo.listPlanDays(plan.id);

  screen.appendChild(h('div', { class: 'card row-between' }, [
    h('div', {}, [
      h('div', { style: 'font-weight:800;font-size:18px' }, plan.name),
      h('div', { class: 'muted' }, `${plan.daysPerWeek} días por semana`),
    ]),
    h('button', { class: 'btn btn-ghost btn-sm', onClick: () => openNewPlan(root, app) }, 'Nuevo'),
  ]));

  const dayCards = {};
  for (const day of days) {
    const exs = await app.repo.listPlanExercises(day.id);
    const cardEl = h('div', { class: 'card' }, [
      h('div', { class: 'row-between' }, [
        h('div', { style: 'font-weight:800' }, `Día ${day.order}: ${day.name}`),
        h('button', { class: 'btn btn-ghost btn-sm', onClick: () => openEditDay(root, app, plan, day) }, 'Editar'),
      ]),
      h('div', { class: 'muted', style: 'margin-top:6px' },
        exs.length ? `${exs.length} ejercicios` : 'Sin ejercicios aún'),
    ]);
    dayCards[day.id] = cardEl;
    screen.appendChild(cardEl);
  }

  root.appendChild(screen);

  // Volver al punto de origen: si venimos de editar un día, hacer scroll a él (#5).
  if (opts.scrollToDayId && dayCards[opts.scrollToDayId]) {
    dayCards[opts.scrollToDayId].scrollIntoView({ block: 'center' });
  }
}

async function openNewPlan(root, app) {
  clear(root);
  const screen = h('div', { class: 'screen' });
  screen.appendChild(h('h2', {}, 'Nuevo plan'));

  const name = h('input', { placeholder: 'Nombre del plan (p.ej. Mi rutina full body)', value: 'Mi rutina' });
  const dpw = h('input', { type: 'number', min: '1', max: '7', value: '3' });

  screen.appendChild(h('div', { class: 'card' }, [
    h('label', {}, 'Nombre del plan'), name,
    h('label', {}, '¿Cuántas veces entrenas por semana?'), dpw,
  ]));

  const doCreate = async () => {
    const n = Math.max(1, Math.min(7, parseInt(dpw.value) || 3));
    const plan = await app.repo.savePlan({ name: name.value.trim() || 'Mi rutina', daysPerWeek: n, isActive: true }, app.userId);
    await app.repo.setActivePlan(plan.id, app.userId);
    for (let i = 1; i <= n; i++) {
      await app.repo.savePlanDay({ planId: plan.id, name: `Día ${i}`, order: i });
    }
    toast('Plan creado. Ahora edita cada día.');
    popLayer();
    renderPlan(root, app);
  };

  screen.appendChild(h('button', {
    class: 'btn', onClick: async () => {
      // Si ya hay un plan activo, crear otro lo reemplaza: confirmar (#2).
      const active = await app.repo.getActivePlan(app.userId);
      if (active) {
        const ok = await confirmDialog(
          'Crear un plan nuevo reemplazará tu plan activo (el anterior se conserva en tus datos). ¿Continuar?',
          { confirmText: 'Crear plan nuevo', danger: false }
        );
        if (!ok) return;
      }
      await doCreate();
    }
  }, 'Crear plan'));
  screen.appendChild(h('button', { class: 'btn btn-ghost', style: 'margin-top:8px', onClick: () => { popLayer(); renderPlan(root, app); } }, 'Cancelar'));
  root.appendChild(screen);
  // Registrar capa: el gesto atrás cancela y vuelve al Plan.
  pushLayer(() => renderPlan(root, app));
}

async function openEditDay(root, app, plan, day) {
  clear(root);
  const settings = await app.repo.getSettings(app.userId);
  const screen = h('div', { class: 'screen' });
  screen.appendChild(h('h2', {}, `Editar Día ${day.order}`));

  // Nombre libre del día
  const dayName = h('input', { value: day.name, placeholder: 'Nombre del día (p.ej. Full Body)' });
  screen.appendChild(h('div', { class: 'card' }, [
    h('label', {}, 'Nombre del día'), dayName,
    h('button', {
      class: 'btn btn-ghost btn-sm', style: 'margin-top:10px',
      onClick: async () => { await app.repo.savePlanDay({ ...day, name: dayName.value.trim() || day.name }); toast('Nombre guardado'); }
    }, 'Guardar nombre'),
  ]));

  // Ejercicios del día
  const exWrap = h('div', {});
  screen.appendChild(h('div', { style: 'font-weight:800;margin:14px 4px 8px' }, 'Ejercicios de este día'));
  screen.appendChild(exWrap);

  const allExercises = await app.repo.listExercises(app.userId);
  const exMap = Object.fromEntries(allExercises.map((e) => [e.id, e]));

  async function paintExercises() {
    clear(exWrap);
    const items = await app.repo.listPlanExercises(day.id);
    if (items.length === 0) {
      exWrap.appendChild(h('div', { class: 'empty' }, 'Añade ejercicios abajo.'));
    }
    for (const pe of items) {
      const ex = exMap[pe.exerciseId];
      if (!ex) continue;
      exWrap.appendChild(h('div', { class: 'card row-between' }, [
        h('div', { class: 'row' }, [
          h('div', { class: 'ex-icon', html: icon(ex.icon) }),
          h('div', {}, [
            h('div', { style: 'font-weight:700' }, ex.name),
            h('div', { class: 'muted' }, `${pe.targetSets}×${pe.targetReps} · ${pe.targetWeight}kg · ${pe.restSeconds}s`),
          ]),
        ]),
        h('button', {
          class: 'btn btn-danger btn-sm',
          onClick: async () => {
            const ok = await confirmDialog(`¿Quitar "${ex.name}" de este día?`, { confirmText: 'Quitar' });
            if (!ok) return;
            await app.repo.deletePlanExercise(pe.id);
            paintExercises();
          }
        }, '✕'),
      ]));
    }
  }
  await paintExercises();

  // Añadir ejercicio
  const picker = h('select', {}, [
    h('option', { value: '' }, 'Selecciona un ejercicio…'),
    ...allExercises.sort((a, b) => a.name.localeCompare(b.name)).map((e) => h('option', { value: e.id }, e.name)),
  ]);
  const sets = h('input', { type: 'number', min: '1', value: String(settings.defaultSets) });
  const reps = h('input', { type: 'number', min: '1', value: '10' });
  const weight = h('input', { type: 'number', min: '0', step: '0.5', value: '20' });
  const rest = h('input', { type: 'number', min: '0', value: String(settings.defaultRestSeconds) });

  screen.appendChild(h('div', { class: 'card' }, [
    h('label', {}, 'Añadir ejercicio'), picker,
    h('div', { class: 'grid2', style: 'margin-top:8px' }, [
      h('div', {}, [h('label', {}, 'Series'), sets]),
      h('div', {}, [h('label', {}, 'Reps objetivo'), reps]),
    ]),
    h('div', { class: 'grid2' }, [
      h('div', {}, [h('label', {}, 'Peso (kg)'), weight]),
      h('div', {}, [h('label', {}, 'Descanso (s)'), rest]),
    ]),
    h('button', {
      class: 'btn btn-sm', style: 'margin-top:12px',
      onClick: async () => {
        if (!picker.value) { toast('Elige un ejercicio'); return; }
        const existing = await app.repo.listPlanExercises(day.id);
        await app.repo.savePlanExercise({
          planDayId: day.id, exerciseId: picker.value, order: existing.length + 1,
          targetSets: parseInt(sets.value) || settings.defaultSets,
          targetReps: parseInt(reps.value) || 10,
          targetWeight: parseFloat(weight.value) || 0,
          restSeconds: parseInt(rest.value) || settings.defaultRestSeconds,
        });
        picker.value = '';
        paintExercises();
      }
    }, '+ Añadir al día'),
  ]));

  const back = () => { popLayer(); renderPlan(root, app, { scrollToDayId: day.id }); };
  screen.appendChild(h('button', { class: 'btn', style: 'margin-top:8px', onClick: back }, 'Hecho'));
  root.appendChild(screen);
  // Registrar capa: el gesto atrás vuelve al Plan, al día que se editaba.
  pushLayer(() => renderPlan(root, app, { scrollToDayId: day.id }));
}
