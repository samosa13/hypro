/**
 * Hypro · Arranque de la app.
 * Aplica el tema, inicializa datos, muestra la frase motivadora al abrir
 * (RF-40/41 garantizado), y monta la navegación entre pantallas.
 */
import { APP, applyTheme } from './config/app.config.js';
import createAppService from './domain/appService.js';
import { dailyQuote, comebackQuote, isMorning } from './domain/motivation.js';
import { daysBetween } from './domain/dateKey.js';
import { h, clear, toast } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { ensureNotificationPermission, showLocalNotification, registerPeriodicBackup } from './ui/notifications.js';
import { setupInstallBanner, setupUpdateBanner } from './ui/pwaInstall.js';

import { renderTrain } from './ui/screens/trainScreen.js';
import { renderPlan } from './ui/screens/planScreen.js';
import { renderExercises } from './ui/screens/exercisesScreen.js';
import { renderProgress } from './ui/screens/progressScreen.js';
import { renderSettings } from './ui/screens/settingsScreen.js';

applyTheme();

// Banner de instalación/actualización (como VendIX). Se engancha cuanto antes
// para no perder el evento beforeinstallprompt.
setupInstallBanner();
setupUpdateBanner();

const app = createAppService();
const root = document.getElementById('app');

const TABS = [
  { id: 'train', label: 'Entrenar', icon: 'ex_press_banca_barra', render: renderTrain },
  { id: 'plan', label: 'Plan', icon: 'ex_sentadilla', render: renderPlan },
  { id: 'exercises', label: 'Ejercicios', icon: 'ex_curl_db', render: renderExercises },
  { id: 'progress', label: 'Progreso', icon: 'ex_dominadas', render: renderProgress },
  { id: 'settings', label: 'Ajustes', icon: 'ex_press_maquina', render: renderSettings },
];

let current = 'train';

function renderChrome() {
  // Topbar
  const existingBar = document.querySelector('.topbar');
  if (existingBar) existingBar.remove();
  const existingTab = document.querySelector('.tabbar');
  if (existingTab) existingTab.remove();

  const split = APP.logoSplitIndex ?? Math.ceil(APP.name.length / 2);
  const topbar = h('div', { class: 'topbar' }, [
    h('h1', { html: `${APP.name.slice(0, split)}<span class="accent">${APP.name.slice(split)}</span>` }),
    h('div', { class: 'sub' }, APP.tagline),
  ]);
  document.body.insertBefore(topbar, document.body.firstChild);

  const tabbar = h('div', { class: 'tabbar' },
    TABS.map((t) =>
      h('button', {
        class: t.id === current ? 'active' : '',
        onClick: () => navigate(t.id),
      }, [
        h('div', { class: 'ico', html: icon(t.icon) }),
        h('span', {}, t.label),
      ])
    )
  );
  document.body.appendChild(tabbar);
}

async function navigate(tabId) {
  current = tabId;
  renderChrome();
  const tab = TABS.find((t) => t.id === tabId);
  await tab.render(root, app);
  window.scrollTo(0, 0);
}

async function showOpeningMessage() {
  const settings = await app.repo.getSettings(app.userId);
  const sessions = await app.repo.listSessions(app.userId);

  // Aviso por inactividad (RF-41)
  if (sessions.length > 0) {
    const last = sessions.map((s) => s.startedAt).sort().at(-1);
    const inactive = daysBetween(last);
    if (inactive >= (settings.inactivityThresholdDays ?? 4)) {
      const msg = comebackQuote(inactive);
      toast(msg, 4000);                             // garantizado (al abrir)
      showLocalNotification('Hypro', msg);          // bonus: notificación del sistema
      return;
    }
  }
  // Frase matutina (RF-40) — respeta que entrena de noche
  if (settings.trainsAtNight === false || isMorning()) {
    toast(dailyQuote(), 4000);
  }
}

async function boot() {
  clear(root);
  root.appendChild(h('div', { class: 'empty' }, 'Cargando…'));
  await app.bootstrap();
  await navigate('train');
  setTimeout(showOpeningMessage, 600);

  // Notificaciones (best effort). Pedimos permiso y registramos el intento de
  // aviso en segundo plano en Android. Si el navegador no lo soporta, se ignora
  // y seguimos con el aviso-al-abrir garantizado.
  const settings = await app.repo.getSettings(app.userId);
  if (settings.notificationsAsked !== true) {
    await ensureNotificationPermission();
    await app.repo.saveSettings({ ...settings, notificationsAsked: true }, app.userId);
  }
  registerPeriodicBackup();
}

boot();
