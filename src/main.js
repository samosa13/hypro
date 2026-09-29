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
import { initNav, clearLayers } from './ui/nav.js';
import { t, setLocale, resolveInitialLocale } from './i18n/index.js';

import { renderTrain, cancelRestTimer } from './ui/screens/trainScreen.js';
import { renderPlan } from './ui/screens/planScreen.js';
import { renderWelcome } from './ui/screens/welcomeScreen.js';
import { renderExercises } from './ui/screens/exercisesScreen.js';
import { renderProgress } from './ui/screens/progressScreen.js';
import { renderSettings } from './ui/screens/settingsScreen.js';

applyTheme();
initNav(); // soporte del botón/gesto "atrás" de Android (History API)

const app = createAppService();
const root = document.getElementById('app');

// La etiqueta se resuelve con t() en cada render (para reaccionar al idioma).
const TABS = [
  { id: 'train', labelKey: 'nav.train', icon: 'ex_press_banca_barra', render: renderTrain },
  { id: 'plan', labelKey: 'nav.plan', icon: 'ex_sentadilla', render: renderPlan },
  { id: 'exercises', labelKey: 'nav.exercises', icon: 'ex_curl_db', render: renderExercises },
  { id: 'progress', labelKey: 'nav.progress', icon: 'ex_dominadas', render: renderProgress },
  { id: 'settings', labelKey: 'nav.settings', icon: 'ex_press_maquina', render: renderSettings },
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
    TABS.map((tab) =>
      h('button', {
        class: tab.id === current ? 'active' : '',
        onClick: () => navigate(tab.id),
      }, [
        h('div', { class: 'ico', html: icon(tab.icon) }),
        h('span', {}, t(tab.labelKey)),
      ])
    )
  );
  document.body.appendChild(tabbar);
}

async function navigate(tabId) {
  cancelRestTimer(); // cancelar cronómetro de descanso al cambiar de pantalla (#9)
  clearLayers();     // cambiar de tab resetea el contexto de sub-pantallas (#7)
  current = tabId;
  renderChrome();
  // Onboarding: si aún no hay plan y el usuario está en "Entrenar", mostramos
  // la pantalla de bienvenida (mejor primera impresión) en vez de un aviso soso.
  // El CTA lleva a Plan para crear el plan.
  if (tabId === 'train' && !(await app.repo.getActivePlan(app.userId))) {
    renderWelcome(root, app, () => navigate('plan'));
    window.scrollTo(0, 0);
    return;
  }
  const tab = TABS.find((x) => x.id === tabId);
  await tab.render(root, app);
  window.scrollTo(0, 0);
}

async function showOpeningMessage() {
  const settings = await app.repo.getSettings(app.userId);
  const sessions = await app.repo.listValidSessions(app.userId); // solo sesiones reales (#13)

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
  const settings0 = await app.bootstrap();
  // Aplica el idioma guardado (o el del navegador) ANTES de pintar y ANTES de
  // los banners, para que todo (incl. instalar/actualizar) salga en el idioma
  // correcto cuando haya más de uno (peer review i18n #1).
  setLocale(resolveInitialLocale(settings0?.locale));

  // Banner de instalación/actualización (como VendIX), ya con el idioma aplicado.
  setupInstallBanner();
  setupUpdateBanner();

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
