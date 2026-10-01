/**
 * UI · Pantalla "Ajustes" — descanso, sonido, entreno nocturno, backup export/import.
 * RF-25, RF-40, RF-50, RF-51.
 */
import { h, clear, toast } from '../dom.js';
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
  screen.appendChild(h('div', { style: 'font-weight:800;margin:14px 4px 8px' }, t('settings.backup')));
  screen.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'muted', style: 'margin-bottom:12px' }, t('settings.backupHint')),
    h('button', { class: 'btn btn-ghost btn-sm', onClick: exportData }, t('settings.export')),
    h('div', { class: 'spacer' }),
    h('label', { style: 'margin-top:10px' }, t('settings.import')),
    (() => {
      const file = h('input', { type: 'file', accept: 'application/json' });
      file.addEventListener('change', () => importData(file));
      return file;
    })(),
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
    toast(t('settings.exported'));
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
