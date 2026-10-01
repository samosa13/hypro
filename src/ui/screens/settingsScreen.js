/**
 * UI · Pantalla "Ajustes" — descanso, sonido, entreno nocturno, backup export/import.
 * RF-25, RF-40, RF-50, RF-51.
 */
import { h, clear, toast, confirmDialog } from '../dom.js';
import { APP } from '../../config/app.config.js';
import { t, setLocale, getLocale } from '../../i18n/index.js';

export async function renderSettings(root, app) {
  clear(root);
  const screen = h('div', { class: 'screen' });
  screen.appendChild(h('h2', {}, t('settings.title')));

  const s = await app.repo.getSettings(app.userId);

  const defaultSets = h('input', { type: 'number', min: '1', value: String(s.defaultSets) });
  const rest = h('input', { type: 'number', min: '0', value: String(s.defaultRestSeconds) });
  const lead = h('input', { type: 'number', min: '0', value: String(s.beepLeadSeconds) });
  const sound = h('input', { type: 'checkbox' }); sound.checked = s.soundEnabled !== false;
  const night = h('input', { type: 'checkbox' }); night.checked = s.trainsAtNight !== false;
  const inactivity = h('input', { type: 'number', min: '1', value: String(s.inactivityThresholdDays) });
  const volTarget = h('input', { type: 'number', min: '0', value: String(s.weeklyVolumeTarget ?? 12) });
  const secsPerSet = h('input', { type: 'number', min: '5', value: String(s.secondsPerSet ?? 40) });
  const gymStart = h('input', { type: 'date', value: (s.gymStartDate ?? '').slice(0, 10) });

  // Selector de idioma (i18n). Solo español disponible hoy, pero funcional:
  // añadir idiomas es ampliar APP.supportedLocales + su diccionario.
  const langSel = h('select', {},
    (APP.supportedLocales || ['es']).map((code) => h('option', { value: code }, t(`lang.${code}`)))
  );
  langSel.value = getLocale();

  // Selector de unidad de peso (B11): kg (canónico) | lb (solo presentación).
  const unitSel = h('select', {}, [
    h('option', { value: 'kg' }, t('settings.unitKg')),
    h('option', { value: 'lb' }, t('settings.unitLb')),
  ]);
  unitSel.value = s.unit === 'lb' ? 'lb' : 'kg';

  screen.appendChild(h('div', { class: 'card' }, [
    h('label', {}, t('settings.defaultSets')), defaultSets,
    h('label', {}, t('settings.defaultRest')), rest,
    h('label', {}, t('settings.beepLead')), lead,
    h('label', {}, t('settings.inactivityDays')), inactivity,
    h('label', {}, t('settings.gymStart')), gymStart,
    h('label', {}, t('settings.language')), langSel,
    h('label', {}, t('settings.unit')), unitSel,
    h('label', {}, t('settings.weeklyVolumeTarget')), volTarget,
    h('label', {}, t('settings.secondsPerSet')), secsPerSet,
    h('div', { class: 'row-between', style: 'margin-top:14px' }, [h('span', {}, t('settings.sound')), sound]),
    h('div', { class: 'row-between', style: 'margin-top:10px' }, [h('span', {}, t('settings.night')), night]),
    h('button', {
      class: 'btn', style: 'margin-top:16px',
      onClick: async () => {
        const newLocale = langSel.value;
        await app.repo.saveSettings({
          ...s,
          defaultSets: parseInt(defaultSets.value) || 3,
          defaultRestSeconds: parseInt(rest.value) || 90,
          beepLeadSeconds: parseInt(lead.value) || 10,
          inactivityThresholdDays: parseInt(inactivity.value) || 4,
          soundEnabled: sound.checked,
          trainsAtNight: night.checked,
          locale: newLocale,
          unit: unitSel.value === 'lb' ? 'lb' : 'kg',
          weeklyVolumeTarget: Math.max(0, parseInt(volTarget.value) || 0),
          secondsPerSet: Math.max(5, parseInt(secsPerSet.value) || 40),
          // El <input type=date> da "YYYY-MM-DD"; lo interpretamos como fecha
          // LOCAL (no UTC) para que no se desfase un día en husos al oeste (#12).
          gymStartDate: gymStart.value ? localDateToISO(gymStart.value) : s.gymStartDate,
        }, app.userId);
        setLocale(newLocale);        // aplica el idioma elegido
        toast(t('settings.saved'));
        renderSettings(root, app);   // re-render para reflejar el idioma nuevo
      }
    }, t('settings.saveSettings')),
  ]));

  // --- Backup ---
  // Aviso de copia externa pendiente (C15): el dominio decide si procede.
  const reminder = await app.backupReminder();
  const backupCard = [
    h('div', { class: 'muted', style: 'margin-bottom:12px' }, t('settings.backupHint')),
  ];
  if (reminder.shouldWarn) {
    const msg = reminder.daysSince == null
      ? t('settings.backupNever')
      : t('settings.backupStale', { days: reminder.daysSince });
    backupCard.push(h('div', {
      class: 'notice notice-warn',
      style: 'margin-bottom:12px;padding:10px 12px;border-radius:10px;background:rgba(255,170,0,.14);color:#ffb020;font-weight:700',
    }, `⚠ ${msg}`));
  }
  backupCard.push(h('button', { class: 'btn btn-ghost btn-sm', onClick: exportData }, t('settings.export')));

  screen.appendChild(h('div', { style: 'font-weight:800;margin:14px 4px 8px' }, t('settings.backup')));
  screen.appendChild(h('div', { class: 'card' }, [
    ...backupCard,
    h('div', { class: 'spacer' }),
    h('label', { style: 'margin-top:10px' }, t('settings.import')),
    (() => {
      const file = h('input', { type: 'file', accept: 'application/json' });
      file.addEventListener('change', () => importData(file));
      return file;
    })(),
  ]));

  // --- Zona de peligro: reseteo a estado inicial ---
  screen.appendChild(h('div', { style: 'font-weight:800;margin:14px 4px 8px;color:var(--color-danger,#ff453a)' }, t('settings.dangerZone')));
  screen.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'muted', style: 'margin-bottom:12px' }, t('settings.resetHint')),
    h('button', { class: 'btn btn-danger btn-sm', onClick: resetApp }, t('settings.reset')),
  ]));

  screen.appendChild(h('div', { class: 'faint', style: 'text-align:center;margin-top:20px' }, t('settings.footer', { app: APP.name, version: APP.version })));
  // Atribución de iconos (requisito de la licencia CC BY 3.0 de game-icons).
  screen.appendChild(h('div', { class: 'faint', style: 'text-align:center;margin-top:6px;font-size:11px' }, t('settings.iconsCredit')));
  root.appendChild(screen);

  async function exportData() {
    const data = await app.repo.exportAll(app.userId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hypro-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    // Marca cuándo se exportó por última vez para apagar el aviso de C15.
    await app.repo.saveSettings({ ...s, lastExportAt: new Date().toISOString() }, app.userId);
    toast(t('settings.exported'));
    renderSettings(root, app); // re-render para ocultar el aviso de backup
  }

  async function resetApp() {
    // Confirmación destructiva única. El texto recuerda exportar antes (el botón
    // de exportar está justo encima, en esta misma pantalla). Se evita encadenar
    // dos diálogos porque popLayer() usa history.back() asíncrono y el segundo
    // diálogo se cerraría solo al procesarse el popstate pendiente del primero.
    const ok = await confirmDialog(t('settings.resetConfirm'), {
      confirmText: t('settings.resetConfirmBtn'),
      cancelText: t('settings.resetCancel'),
      danger: true,
    });
    if (!ok) return;
    await app.resetToInitial();
    toast(t('settings.resetDone'));
    renderSettings(root, app);
  }

  async function importData(fileInput) {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const data = JSON.parse(text);
      const res = await app.repo.importAll(data, app.userId);
      if (res && res.ok === false) {
        toast(res.reason || t('settings.invalidFile'));
        return;
      }
      toast(t('settings.restored'));
      renderSettings(root, app);
    } catch (e) {
      toast(t('settings.invalidFile'));
    }
  }
}

/** Convierte "YYYY-MM-DD" (input date) a ISO tratándolo como medianoche LOCAL. */
function localDateToISO(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}
