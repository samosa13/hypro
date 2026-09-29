/**
 * UI · Pantalla "Plan" — crear/editar plan, días con nombre libre y sus ejercicios.
 * RF-10..RF-14. Editar no rompe historial (el historial vive en sessions/loggedSets).
 */
import { h, clear, toast, confirmDialog } from '../dom.js';
import { icon } from '../icons.js';
import { pushLayer, popLayer } from '../nav.js';
import { t } from '../../i18n/index.js';

export async function renderPlan(root, app, opts = {}) {
  clear(root);
  const screen = h('div', { class: 'screen' });
  screen.appendChild(h('h2', {}, t('plan.title')));

  let plan = await app.repo.getActivePlan(app.userId);

  if (!plan) {
    screen.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'muted', style: 'margin-bottom:12px' }, t('plan.noPlan')),
      h('button', { class: 'btn', onClick: () => openNewPlan(root, app) }, t('plan.createMine')),
    ]));
    root.appendChild(screen);
    return;
  }

  const settings = await app.repo.getSettings(app.userId);
  const days = await app.repo.listPlanDays(plan.id);

  screen.appendChild(h('div', { class: 'card row-between' }, [
    h('div', {}, [
      h('div', { style: 'font-weight:800;font-size:18px' }, plan.name),
      h('div', { class: 'muted' }, t('plan.perWeek', { n: plan.daysPerWeek })),
    ]),
    h('button', { class: 'btn btn-ghost btn-sm', onClick: () => openNewPlan(root, app) }, t('common.new')),
  ]));

  const dayCards = {};
  for (const day of days) {
    const exs = await app.repo.listPlanExercises(day.id);
    const cardEl = h('div', { class: 'card' }, [
      h('div', { class: 'row-between' }, [
        h('div', { style: 'font-weight:800' }, t('plan.dayLabel', { order: day.order, name: day.name })),
        h('button', { class: 'btn btn-ghost btn-sm', onClick: () => openEditDay(root, app, plan, day) }, t('common.edit')),
      ]),
      h('div', { class: 'muted', style: 'margin-top:6px' },
        exs.length ? t('plan.nExercises', { n: exs.length }) : t('plan.noExercisesYet')),
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
  screen.appendChild(h('h2', {}, t('plan.newPlan')));

  const name = h('input', { placeholder: t('plan.planNamePh'), value: 'Mi rutina' });
  const dpw = h('input', { type: 'number', min: '1', max: '7', value: '3' });

  screen.appendChild(h('div', { class: 'card' }, [
    h('label', {}, t('plan.planName')), name,
    h('label', {}, t('plan.howManyPerWeek')), dpw,
  ]));

  const doCreate = async () => {
    const n = Math.max(1, Math.min(7, parseInt(dpw.value) || 3));
    const plan = await app.repo.savePlan({ name: name.value.trim() || 'Mi rutina', daysPerWeek: n, isActive: true }, app.userId);
    await app.repo.setActivePlan(plan.id, app.userId);
    for (let i = 1; i <= n; i++) {
      await app.repo.savePlanDay({ planId: plan.id, name: `Día ${i}`, order: i });
    }
    toast(t('plan.createdToast'));
    popLayer();
    renderPlan(root, app);
  };

  screen.appendChild(h('button', {
    class: 'btn', onClick: async () => {
      // Si ya hay un plan activo, crear otro lo reemplaza: confirmar (#2).
      const active = await app.repo.getActivePlan(app.userId);
      if (active) {
        const ok = await confirmDialog(t('plan.replaceConfirm'), { confirmText: t('plan.replaceConfirmBtn'), danger: false });
        if (!ok) return;
      }
      await doCreate();
    }
  }, t('plan.createPlan')));
  screen.appendChild(h('button', { class: 'btn btn-ghost', style: 'margin-top:8px', onClick: () => { popLayer(); renderPlan(root, app); } }, t('common.cancel')));
  root.appendChild(screen);
  // Registrar capa: el gesto atrás cancela y vuelve al Plan.
  pushLayer(() => renderPlan(root, app));
}

async function openEditDay(root, app, plan, day) {
  clear(root);
  const settings = await app.repo.getSettings(app.userId);
  const screen = h('div', { class: 'screen' });
  screen.appendChild(h('h2', {}, t('plan.editDay', { order: day.order })));

  // Nombre libre del día
  const dayName = h('input', { value: day.name, placeholder: t('plan.dayNamePh') });
  screen.appendChild(h('div', { class: 'card' }, [
    h('label', {}, t('plan.dayName')), dayName,
    h('button', {
      class: 'btn btn-ghost btn-sm', style: 'margin-top:10px',
      onClick: async () => { await app.repo.savePlanDay({ ...day, name: dayName.value.trim() || day.name }); toast(t('plan.nameSaved')); }
    }, t('plan.saveName')),
  ]));

  // Ejercicios del día
  const exWrap = h('div', {});
  screen.appendChild(h('div', { style: 'font-weight:800;margin:14px 4px 8px' }, t('plan.dayExercises')));
  screen.appendChild(exWrap);

  const allExercises = await app.repo.listExercises(app.userId);
  const exMap = Object.fromEntries(allExercises.map((e) => [e.id, e]));

  async function paintExercises() {
    clear(exWrap);
    const items = await app.repo.listPlanExercises(day.id);
    if (items.length === 0) {
      exWrap.appendChild(h('div', { class: 'empty' }, t('plan.addExercisesBelow')));
    }
    for (const pe of items) {
      const ex = exMap[pe.exerciseId];
      if (!ex) continue;
      exWrap.appendChild(h('div', { class: 'card row-between' }, [
        h('div', { class: 'row' }, [
          h('div', { class: 'ex-icon', html: icon(ex.icon) }),
          h('div', {}, [
            h('div', { style: 'font-weight:700' }, ex.name),
            h('div', { class: 'muted' }, t('plan.exerciseMeta', { sets: pe.targetSets, reps: pe.targetReps, weight: pe.targetWeight, rest: pe.restSeconds })),
          ]),
        ]),
        h('button', {
          class: 'btn btn-danger btn-sm',
          onClick: async () => {
            const ok = await confirmDialog(t('plan.removeExercise', { name: ex.name }), { confirmText: t('common.delete') });
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
    h('option', { value: '' }, t('plan.pickExercise')),
    ...allExercises.sort((a, b) => a.name.localeCompare(b.name)).map((e) => h('option', { value: e.id }, e.name)),
  ]);
  const sets = h('input', { type: 'number', min: '1', value: String(settings.defaultSets) });
  const reps = h('input', { type: 'number', min: '1', value: '10' });
  const weight = h('input', { type: 'number', min: '0', step: '0.5', value: '20' });
  const rest = h('input', { type: 'number', min: '0', value: String(settings.defaultRestSeconds) });

  screen.appendChild(h('div', { class: 'card' }, [
    h('label', {}, t('plan.addExercise')), picker,
    h('div', { class: 'grid2', style: 'margin-top:8px' }, [
      h('div', {}, [h('label', {}, t('plan.sets')), sets]),
      h('div', {}, [h('label', {}, t('plan.targetReps')), reps]),
    ]),
    h('div', { class: 'grid2' }, [
      h('div', {}, [h('label', {}, t('plan.weightKg')), weight]),
      h('div', {}, [h('label', {}, t('plan.restSec')), rest]),
    ]),
    h('button', {
      class: 'btn btn-sm', style: 'margin-top:12px',
      onClick: async () => {
        if (!picker.value) { toast(t('plan.pickOne')); return; }
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
    }, t('plan.addToDay')),
  ]));

  const back = () => { popLayer(); renderPlan(root, app, { scrollToDayId: day.id }); };
  screen.appendChild(h('button', { class: 'btn', style: 'margin-top:8px', onClick: back }, t('common.done')));
  root.appendChild(screen);
  // Registrar capa: el gesto atrás vuelve al Plan, al día que se editaba.
  pushLayer(() => renderPlan(root, app, { scrollToDayId: day.id }));
}
