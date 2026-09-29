/**
 * UI · Pantalla "Ajustes" — descanso, sonido, entreno nocturno, backup export/import.
 * RF-25, RF-40, RF-50, RF-51.
 */
import { h, clear, toast } from '../dom.js';
import { APP } from '../../config/app.config.js';

export async function renderSettings(root, app) {
  clear(root);
  const screen = h('div', { class: 'screen' });
  screen.appendChild(h('h2', {}, 'Ajustes'));

  const s = await app.repo.getSettings(app.userId);

  const defaultSets = h('input', { type: 'number', min: '1', value: String(s.defaultSets) });
  const rest = h('input', { type: 'number', min: '0', value: String(s.defaultRestSeconds) });
  const lead = h('input', { type: 'number', min: '0', value: String(s.beepLeadSeconds) });
  const sound = h('input', { type: 'checkbox' }); sound.checked = s.soundEnabled !== false;
  const night = h('input', { type: 'checkbox' }); night.checked = s.trainsAtNight !== false;
  const inactivity = h('input', { type: 'number', min: '1', value: String(s.inactivityThresholdDays) });
  const gymStart = h('input', { type: 'date', value: (s.gymStartDate ?? '').slice(0, 10) });

  screen.appendChild(h('div', { class: 'card' }, [
    h('label', {}, 'Series por defecto'), defaultSets,
    h('label', {}, 'Descanso por defecto (segundos)'), rest,
    h('label', {}, 'Bip de aviso a falta de (segundos)'), lead,
    h('label', {}, 'Días sin entrenar para el aviso motivador'), inactivity,
    h('label', {}, 'Fecha de inicio en el gimnasio'), gymStart,
    h('div', { class: 'row-between', style: 'margin-top:14px' }, [h('span', {}, 'Sonido del temporizador'), sound]),
    h('div', { class: 'row-between', style: 'margin-top:10px' }, [h('span', {}, 'Entreno de noche (frase por la mañana)'), night]),
    h('button', {
      class: 'btn', style: 'margin-top:16px',
      onClick: async () => {
        await app.repo.saveSettings({
          ...s,
          defaultSets: parseInt(defaultSets.value) || 3,
          defaultRestSeconds: parseInt(rest.value) || 90,
          beepLeadSeconds: parseInt(lead.value) || 10,
          inactivityThresholdDays: parseInt(inactivity.value) || 4,
          soundEnabled: sound.checked,
          trainsAtNight: night.checked,
          gymStartDate: gymStart.value ? new Date(gymStart.value).toISOString() : s.gymStartDate,
        }, app.userId);
        toast('Ajustes guardados');
      }
    }, 'Guardar ajustes'),
  ]));

  // --- Backup ---
  screen.appendChild(h('div', { style: 'font-weight:800;margin:14px 4px 8px' }, 'Copia de seguridad'));
  screen.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'muted', style: 'margin-bottom:12px' }, 'Tus datos son solo tuyos. Expórtalos a un fichero para guardarlos fuera del móvil.'),
    h('button', { class: 'btn btn-ghost btn-sm', onClick: exportData }, '⬇ Exportar copia (.json)'),
    h('div', { class: 'spacer' }),
    h('label', { style: 'margin-top:10px' }, 'Importar copia'),
    (() => {
      const file = h('input', { type: 'file', accept: 'application/json' });
      file.addEventListener('change', () => importData(file));
      return file;
    })(),
  ]));

  screen.appendChild(h('div', { class: 'faint', style: 'text-align:center;margin-top:20px' }, `${APP.name} v${'0.1.0'} · datos locales en tu dispositivo`));
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
    toast('Copia exportada');
  }

  async function importData(fileInput) {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const data = JSON.parse(text);
      await app.repo.importAll(data);
      toast('Datos restaurados');
      renderSettings(root, app);
    } catch (e) {
      toast('Fichero no válido');
    }
  }
}
