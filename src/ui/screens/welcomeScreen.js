/**
 * UI · Pantalla de bienvenida / onboarding.
 *
 * Se muestra cuando el usuario aún NO tiene un plan (primera vez tras instalar).
 * Mejora la primera impresión: en vez de una pantalla de Entrenar casi vacía con
 * un aviso soso, recibe con el logo, el propósito de la app y un CTA claro para
 * empezar. Al pulsar, navega a la creación de plan.
 */
import { h, clear } from '../dom.js';
import { APP } from '../../config/app.config.js';
import { t } from '../../i18n/index.js';
import { icon } from '../icons.js';

/**
 * @param {HTMLElement} root
 * @param {object} app  appService
 * @param {() => void} onStart  callback al pulsar "Crear mi plan" (navega a Plan)
 */
export function renderWelcome(root, app, onStart) {
  clear(root);
  const screen = h('div', { class: 'screen welcome' });

  const split = APP.logoSplitIndex ?? Math.ceil(APP.name.length / 2);

  screen.appendChild(h('div', { class: 'welcome-hero' }, [
    h('div', { class: 'welcome-logo', html: icon('ex_press_banca_barra') }),
    h('h1', { class: 'welcome-name', html: `${APP.name.slice(0, split)}<span class="accent">${APP.name.slice(split)}</span>` }),
    h('div', { class: 'welcome-sub' }, t('welcome.subtitle')),
  ]));

  screen.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'welcome-heading' }, t('welcome.title')),
    h('div', { class: 'welcome-pitch' }, t('welcome.pitch')),
    h('div', { class: 'welcome-features' }, [
      h('div', { class: 'welcome-feat' }, t('welcome.feature1')),
      h('div', { class: 'welcome-feat' }, t('welcome.feature2')),
      h('div', { class: 'welcome-feat' }, t('welcome.feature3')),
    ]),
  ]));

  screen.appendChild(h('button', { class: 'btn', onClick: onStart }, t('welcome.cta')));

  root.appendChild(screen);
}
