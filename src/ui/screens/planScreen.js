/**
 * UI · Pantalla "Plan" — crear/editar plan, días con nombre libre y sus ejercicios.
 * RF-10..RF-14. Editar no rompe historial (el historial vive en sessions/loggedSets).
 */
import { h, clear, toast, confirmDialog } from '../dom.js';
import { icon } from '../icons.js';
import { pushLayer, popLayer } from '../nav.js';
import { t } from '../../i18n/index.js';
import { deriveRepRange, normalizeRepRange } from '../../domain/progression.js';
import { MUSCLE_GROUPS } from '../../data/seedExercises.js';
import { kgToDisplay, displayToKg, unitLabel, formatDuration } from '../../domain/units.js';
import { normalizeTracking } from '../../domain/personalRecord.js';
import { matchesSearch } from '../../domain/search.js';

/** Traduce una sugerencia de recorte de duración (punto 2) a texto para la UI. */
function cutText(s) {
  if (s.kind === 'dropSet') return t('plan.cutDropSet', { saved: s.savedMin, after: s.afterMinutes });
  if (s.kind === 'trimRest') return t('plan.cutTrimRest', { saved: s.savedMin, after: s.afterMinutes });
  if (s.kind === 'dropExercises') return t('plan.cutDropExercises', { count: s.count });
  return '';
}

/** Texto del rango de reps de un plan-ejercicio: "6-8" o "8" si min==max. */
function repRangeLabel(pe) {
  const r = pe.repMin > 0 && pe.repMax > 0 ? { min: pe.repMin, max: pe.repMax } : deriveRepRange(pe.targetReps);
  return r.min === r.max ? String(r.min) : `${r.min}-${r.max}`;
}

/**
 * Meta de un plan-ejercicio según su tipo de medición (D16):
 *  - weight_reps: "3×8-12 · 60 kg · 90s"
 *  - reps_only:   "3×8-12 reps · 90s"  (sin peso)
 *  - time:        "3× 1:30 · 90s"      (duración objetivo)
 */
function exerciseMetaText(pe, ex, settings) {
  const tracking = normalizeTracking(ex.tracking);
  if (tracking === 'time') {
    return t('plan.exerciseMetaTime', {
      sets: pe.targetSets, time: formatDuration(pe.targetDurationSeconds ?? 30), rest: pe.restSeconds,
    });
  }
  if (tracking === 'reps_only') {
    return t('plan.exerciseMetaReps', { sets: pe.targetSets, reps: repRangeLabel(pe), rest: pe.restSeconds });
  }
  return t('plan.exerciseMeta', {
    sets: pe.targetSets, reps: repRangeLabel(pe),
    weight: kgToDisplay(pe.targetWeight, settings.unit), unit: unitLabel(settings.unit), rest: pe.restSeconds,
  });
}

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
        h('div', { class: 'row', style: 'gap:4px' }, [
          h('button', { class: 'btn btn-ghost btn-sm', onClick: () => openEditDay(root, app, plan, day) }, t('common.edit')),
          h('button', {
            class: 'btn btn-ghost btn-sm', title: t('plan.duplicate'),
            onClick: async () => {
              await app.repo.duplicatePlanDay(day.id, t('plan.copySuffix', { name: day.name }));
              toast(t('plan.dayDuplicated'));
              renderPlan(root, app, { scrollToDayId: day.id });
            }
          }, t('plan.duplicate')),
        ]),
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

  // Nombre del día + tiempo disponible objetivo (punto 2).
  const dayName = h('input', { value: day.name, placeholder: t('plan.dayNamePh') });
  const dayDuration = h('input', { type: 'number', min: '0', value: String(day.targetDurationMin ?? ''), placeholder: t('plan.dayDurationPh') });
  screen.appendChild(h('div', { class: 'card' }, [
    h('label', {}, t('plan.dayName')), dayName,
    h('label', { style: 'margin-top:10px' }, t('plan.dayDuration')), dayDuration,
    h('div', { class: 'muted', style: 'font-size:12px;margin-top:4px' }, t('plan.dayDurationHint')),
    h('button', {
      class: 'btn btn-ghost btn-sm', style: 'margin-top:10px',
      onClick: async () => {
        // Si el campo está vacío, no se fija objetivo (no sobreescribir con 0).
        const raw = dayDuration.value.trim();
        const mins = raw === '' ? null : Math.max(0, parseInt(raw) || 0);
        await app.repo.savePlanDay({ ...day, name: dayName.value.trim() || day.name, targetDurationMin: mins });
        day.targetDurationMin = mins; // mantener en memoria para el aviso
        toast(t('plan.nameSaved'));
        paintDurationNotice();
      }
    }, t('plan.saveName')),
  ]));

  // Aviso de viabilidad del día (punto 2): estimación vs tiempo disponible.
  const durationNotice = h('div', {});
  screen.appendChild(durationNotice);

  // Ejercicios del día
  const exWrap = h('div', {});
  screen.appendChild(h('div', { style: 'font-weight:800;margin:14px 4px 8px' }, t('plan.dayExercises')));
  screen.appendChild(exWrap);

  const allExercises = await app.repo.listExercises(app.userId);
  const exMap = Object.fromEntries(allExercises.map((e) => [e.id, e]));

  /** Pinta la estimación de duración del día y, si no cabe, las sugerencias. */
  async function paintDurationNotice() {
    clear(durationNotice);
    const est = await app.dayDurationEstimate(day.id);
    // Siempre mostramos la duración estimada; el aviso de "no cabe" solo si hay objetivo.
    const line = est.availableMinutes > 0
      ? t('plan.durationEstimateVs', { est: est.estimatedMinutes, avail: est.availableMinutes })
      : t('plan.durationEstimate', { est: est.estimatedMinutes });
    const children = [h('div', { class: 'muted', style: 'font-weight:700' }, `⏱ ${line}`)];
    if (!est.fits && est.availableMinutes > 0) {
      children.push(h('div', {
        style: 'margin-top:6px;padding:10px 12px;border-radius:10px;background:rgba(255,170,0,.14);color:#ffb020;font-weight:700',
      }, t('plan.durationOver', { over: est.overByMinutes })));
      for (const s of est.suggestions) {
        children.push(h('div', { class: 'muted', style: 'font-size:13px;margin-top:4px' }, `• ${cutText(s)}`));
      }
    }
    durationNotice.appendChild(h('div', { class: 'card' }, children));
  }

  async function paintExercises() {
    // Preservar la posición de scroll al repintar la lista (reordenar/borrar/
    // agrupar). Se lee ANTES de tocar el DOM y se restaura tras reconstruir, para
    // que el usuario no "salte" arriba y pierda de vista el ejercicio que movía.
    const prevScroll = window.scrollY;
    // Cargar los datos ANTES de vaciar, para minimizar el tiempo en que la lista
    // está vacía (que es lo que provoca el salto de scroll).
    const items = await app.repo.listPlanExercises(day.id);
    clear(exWrap);
    if (items.length === 0) {
      exWrap.appendChild(h('div', { class: 'empty' }, t('plan.addExercisesBelow')));
    }
    items.forEach((pe, idx) => {
      const ex = exMap[pe.exerciseId];
      if (!ex) return;
      const isFirst = idx === 0;
      const isLast = idx === items.length - 1;
      // ¿Este ejercicio comparte grupo con el siguiente? (para el indicador visual)
      const next = items[idx + 1];
      const samGroupAsNext = pe.groupId && next && next.groupId === pe.groupId;
      // Botones de acción del ejercicio. Van en una franja de POSICIÓN FIJA
      // (absoluta) en la esquina superior derecha de la card, con tamaño
      // reducido (btn-xs), para que estén SIEMPRE en el mismo sitio sin importar
      // el largo del nombre ni el badge de grupo, y no se desborden.
      const upBtn = h('button', {
        class: 'btn btn-ghost btn-xs', title: t('plan.moveUp'), disabled: isFirst,
        onClick: async () => { await app.repo.movePlanExercise(day.id, pe.id, -1); paintExercises(); },
      }, '↑');
      const downBtn = h('button', {
        class: 'btn btn-ghost btn-xs', title: t('plan.moveDown'), disabled: isLast,
        onClick: async () => { await app.repo.movePlanExercise(day.id, pe.id, +1); paintExercises(); },
      }, '↓');
      // Agrupar con el siguiente (D17) / desagrupar.
      const groupBtns = [];
      if (pe.groupId) {
        groupBtns.push(h('button', {
          class: 'btn btn-ghost btn-xs', title: t('plan.ungroup'),
          onClick: async () => { await app.repo.ungroup(day.id, pe.id); paintExercises(); },
        }, '🔗✕'));
      } else if (!isLast) {
        groupBtns.push(h('button', {
          class: 'btn btn-ghost btn-xs', title: t('plan.groupWithNext'),
          onClick: async () => { await app.repo.groupWithNext(day.id, pe.id); paintExercises(); },
        }, '🔗'));
      }
      const delBtn = h('button', {
        class: 'btn btn-danger btn-xs', title: t('common.delete'),
        onClick: async () => {
          const ok = await confirmDialog(t('plan.removeExercise', { name: ex.name }), { confirmText: t('common.delete') });
          if (!ok) return;
          await app.repo.deletePlanExercise(pe.id);
          paintExercises();
        }
      }, '✕');
      // Etiqueta de grupo (badge) si pertenece a uno.
      const groupBadge = pe.groupId
        ? h('span', { class: 'chip', style: 'margin-left:8px' }, t(`train.group.${pe.groupType || 'superset'}`))
        : null;
      // Card con padding derecho reservado para la franja de botones (no la invade
      // el texto). La franja de acciones va posicionada en absoluto.
      exWrap.appendChild(h('div', { class: `card pe-card${pe.groupId ? ' grouped' : ''}${samGroupAsNext ? ' group-cont' : ''}` }, [
        h('div', { class: 'row' }, [
          h('div', { class: 'ex-icon', html: icon(ex.icon) }),
          h('div', {}, [
            h('div', { style: 'font-weight:700' }, [ex.name, groupBadge]),
            h('div', { class: 'muted' }, exerciseMetaText(pe, ex, settings)),
          ]),
        ]),
        h('div', { class: 'pe-actions' }, [...groupBtns, upBtn, downBtn, delBtn]),
      ]));
    });
    // Restaurar la posición de scroll previa (reordenar no debe saltar arriba).
    // Se hace en el siguiente frame para que el layout ya esté recalculado.
    requestAnimationFrame(() => window.scrollTo(0, prevScroll));
    // Tras repintar los ejercicios, recalcular el aviso de duración (punto 2).
    paintDurationNotice();
  }
  await paintExercises();

  // --- Añadir ejercicio: selector rico (búsqueda + filtro músculo + iconos) (A4) ---
  // Estado local del selector: ejercicio elegido y filtros.
  const pick = { exerciseId: '', q: '', muscle: '' };

  const sets = h('input', { type: 'number', min: '1', value: String(settings.defaultSets) });
  const repMin = h('input', { type: 'number', min: '1', value: '8' });
  const repMax = h('input', { type: 'number', min: '1', value: '12' });
  // Peso por defecto 20 kg, mostrado en la unidad del usuario (B11). Step acorde
  // a la unidad (2.5 lb / 0.5 kg) para que las flechas encajen con discos reales.
  const weightStepAttr = settings.unit === 'lb' ? '2.5' : '0.5';
  const weight = h('input', { type: 'number', min: '0', step: weightStepAttr, value: String(kgToDisplay(20, settings.unit)) });
  const rest = h('input', { type: 'number', min: '0', value: String(settings.defaultRestSeconds) });
  // Duración objetivo (segundos) para ejercicios de tiempo (D16).
  const durationTarget = h('input', { type: 'number', min: '1', step: '1', value: '30' });

  const search = h('input', { type: 'search', placeholder: t('plan.searchExercise') });
  const muscleSel = h('select', {}, [
    h('option', { value: '' }, t('plan.allMuscles')),
    ...MUSCLE_GROUPS.map((m) => h('option', { value: m }, m)),
  ]);
  const pickList = h('div', { class: 'list-scroll picker-list' });
  // Zona de configuración (series/rango/peso/descanso), visible solo al elegir.
  const configWrap = h('div', {});

  function renderConfig() {
    clear(configWrap);
    if (!pick.exerciseId) {
      configWrap.appendChild(h('div', { class: 'muted', style: 'font-size:13px;margin-top:6px' }, t('plan.pickFromList')));
      return;
    }
    const ex = exMap[pick.exerciseId];
    const tracking = normalizeTracking(ex.tracking); // tipo de medición (D16)
    configWrap.appendChild(h('div', { class: 'row-between', style: 'margin-top:4px' }, [
      h('div', { class: 'row' }, [
        h('div', { class: 'ex-icon', html: icon(ex.icon) }),
        h('div', { style: 'font-weight:700' }, ex.name),
      ]),
      h('button', { class: 'btn btn-ghost btn-sm', onClick: () => { pick.exerciseId = ''; renderConfig(); paintPicker(); } }, t('plan.changeExercise')),
    ]));

    if (tracking === 'time') {
      // Series + duración objetivo. Sin peso ni rango de reps.
      configWrap.appendChild(h('div', { class: 'grid2', style: 'margin-top:8px' }, [
        h('div', {}, [h('label', {}, t('plan.sets')), sets]),
        h('div', {}, [h('label', {}, t('plan.targetDuration')), durationTarget]),
      ]));
    } else if (tracking === 'reps_only') {
      // Series + rango de reps. Sin peso.
      configWrap.appendChild(h('div', { class: 'grid2', style: 'margin-top:8px' }, [
        h('div', {}, [h('label', {}, t('plan.sets')), sets]),
        h('div', {}),
      ]));
      configWrap.appendChild(h('label', { style: 'margin-top:8px' }, t('plan.repRange')));
      configWrap.appendChild(h('div', { class: 'grid2' }, [
        h('div', {}, [h('label', { class: 'muted' }, t('plan.repMin')), repMin]),
        h('div', {}, [h('label', { class: 'muted' }, t('plan.repMax')), repMax]),
      ]));
      configWrap.appendChild(h('div', { class: 'muted', style: 'font-size:12px;margin-top:4px' }, t('plan.repRangeHint')));
    } else {
      // Peso + reps (comportamiento clásico).
      configWrap.appendChild(h('div', { class: 'grid2', style: 'margin-top:8px' }, [
        h('div', {}, [h('label', {}, t('plan.sets')), sets]),
        h('div', {}, [h('label', {}, t('plan.weightKg', { unit: unitLabel(settings.unit) })), weight]),
      ]));
      configWrap.appendChild(h('label', { style: 'margin-top:8px' }, t('plan.repRange')));
      configWrap.appendChild(h('div', { class: 'grid2' }, [
        h('div', {}, [h('label', { class: 'muted' }, t('plan.repMin')), repMin]),
        h('div', {}, [h('label', { class: 'muted' }, t('plan.repMax')), repMax]),
      ]));
      configWrap.appendChild(h('div', { class: 'muted', style: 'font-size:12px;margin-top:4px' }, t('plan.repRangeHint')));
    }

    configWrap.appendChild(h('div', { class: 'grid2', style: 'margin-top:8px' }, [
      h('div', {}, [h('label', {}, t('plan.restSec')), rest]),
      h('div', {}),
    ]));
    configWrap.appendChild(h('button', {
      class: 'btn btn-sm', style: 'margin-top:12px',
      onClick: () => addSelected(tracking),
    }, t('plan.addToDay')));
  }

  function paintPicker() {
    clear(pickList);
    // Si hay ejercicio elegido, no mostramos la lista (ya está en configuración).
    if (pick.exerciseId) return;
    const filtered = allExercises
      // Búsqueda multi-campo e insensible a acentos (estilo VendIX).
      .filter((e) => (!pick.muscle || e.muscleGroup === pick.muscle) && matchesSearch(pick.q, [e.name, e.muscleGroup, e.equipment]))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (filtered.length === 0) {
      pickList.appendChild(h('div', { class: 'empty' }, t('plan.noMatches')));
      return;
    }
    for (const e of filtered) {
      pickList.appendChild(h('div', {
        class: 'card row picker-item', style: 'cursor:pointer',
        onClick: () => { pick.exerciseId = e.id; renderConfig(); paintPicker(); },
      }, [
        h('div', { class: 'ex-icon', html: icon(e.icon) }),
        h('div', { style: 'flex:1' }, [
          h('div', { style: 'font-weight:700' }, e.name),
          h('div', { class: 'row', style: 'gap:6px;margin-top:4px' }, [
            h('span', { class: 'chip' }, e.muscleGroup),
            h('span', { class: 'chip' }, e.equipment),
            normalizeTracking(e.tracking) !== 'weight_reps'
              ? h('span', { class: 'chip' }, t(`tracking.${normalizeTracking(e.tracking)}`))
              : null,
          ]),
        ]),
      ]));
    }
  }

  async function addSelected(tracking = 'weight_reps') {
    if (!pick.exerciseId) { toast(t('plan.pickOne')); return; }
    const existing = await app.repo.listPlanExercises(day.id);
    const base = {
      planDayId: day.id, exerciseId: pick.exerciseId, order: existing.length + 1,
      targetSets: parseInt(sets.value) || settings.defaultSets,
      restSeconds: parseInt(rest.value) || settings.defaultRestSeconds,
    };
    if (tracking === 'time') {
      // Ejercicio de tiempo: objetivo en segundos; sin peso ni reps.
      base.targetDurationSeconds = Math.max(1, parseInt(durationTarget.value) || 30);
    } else {
      // Rango de reps (reps_only y weight_reps). targetReps = centro del rango.
      const range = normalizeRepRange(repMin.value, repMax.value);
      base.repMin = range.min;
      base.repMax = range.max;
      base.targetReps = Math.round((range.min + range.max) / 2);
      // El peso solo aplica a weight_reps; se guarda en kg (B11).
      if (tracking !== 'reps_only') {
        base.targetWeight = displayToKg(parseFloat(weight.value) || 0, settings.unit);
      }
    }
    await app.repo.savePlanExercise(base);
    // Reset del selector para poder añadir otro, restaurando valores por defecto.
    pick.exerciseId = '';
    sets.value = String(settings.defaultSets);
    repMin.value = '8'; repMax.value = '12';
    weight.value = String(kgToDisplay(20, settings.unit)); rest.value = String(settings.defaultRestSeconds);
    durationTarget.value = '30';
    renderConfig();
    paintPicker();
    paintExercises();
  }

  // Se guarda el texto crudo; matchesSearch normaliza al filtrar. Se escuchan
  // 'input' Y 'search' porque la "x" nativa de input[type=search] dispara
  // 'search' (no siempre 'input'): sin esto, limpiar con la "x" no reseteaba.
  const onPickSearch = () => { pick.q = search.value; paintPicker(); };
  search.addEventListener('input', onPickSearch);
  search.addEventListener('search', onPickSearch);
  muscleSel.addEventListener('change', () => { pick.muscle = muscleSel.value; paintPicker(); });

  // Barra de búsqueda visual con icono (estilo VendIX).
  const searchBar = h('div', { class: 'search-bar' }, [
    h('span', { class: 'search-icon' }, '🔍'),
    search,
  ]);
  screen.appendChild(h('div', { class: 'card' }, [
    h('label', {}, t('plan.addExercise')),
    searchBar,
    h('div', { style: 'margin-top:8px' }, muscleSel),
    pickList,
    configWrap,
  ]));
  paintPicker();
  renderConfig();

  const back = () => { popLayer(); renderPlan(root, app, { scrollToDayId: day.id }); };
  screen.appendChild(h('button', { class: 'btn', style: 'margin-top:8px', onClick: back }, t('common.done')));
  root.appendChild(screen);
  // Registrar capa: el gesto atrás vuelve al Plan, al día que se editaba.
  pushLayer(() => renderPlan(root, app, { scrollToDayId: day.id }));
}
