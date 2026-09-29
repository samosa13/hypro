/**
 * UI · Instalación y actualización de la PWA (patrón de VendIX).
 *
 * - Banner de instalación propio: captura `beforeinstallprompt`, guarda el evento
 *   y muestra un botón "Instalar" dentro de la app. Al pulsarlo, lanza el prompt
 *   nativo. Esto funciona mejor que depender del menú del navegador y es lo que
 *   el usuario ya conocía en VendIX.
 * - Aviso de actualización: cuando el service worker detecta una versión nueva,
 *   muestra un banner "Actualizar" que recarga con la versión fresca.
 */

import { t } from '../i18n/index.js';

let deferredPrompt = null;

// Captura el evento cuanto antes (puede dispararse antes de setupInstallBanner,
// que ahora corre tras setLocale). Guardamos el prompt para usarlo al montar.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const banner = document.getElementById('install-banner');
    if (banner && !isStandalone()) banner.classList.remove('hidden');
  });
}

/** Inicializa el banner de instalación. */
export function setupInstallBanner() {
  const banner = document.getElementById('install-banner');
  const btn = document.getElementById('install-btn');
  const dismiss = document.getElementById('install-dismiss');
  if (!banner || !btn) return;

  // Textos localizados (el HTML trae los de español como fallback).
  const txt = banner.querySelector('.install-text');
  if (txt) txt.textContent = t('pwa.installText');
  btn.textContent = t('pwa.install');

  // Si el evento ya llegó antes de montar, mostrar el banner ahora.
  if (deferredPrompt && !isStandalone()) banner.classList.remove('hidden');

  btn.addEventListener('click', async () => {
    if (!deferredPrompt) { banner.classList.add('hidden'); return; }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    banner.classList.add('hidden');
  });

  dismiss?.addEventListener('click', () => banner.classList.add('hidden'));

  // Si ya se instaló, ocultar y limpiar.
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    banner.classList.add('hidden');
  });
}

/**
 * Inicializa el aviso de actualización de la PWA.
 * Recibe el registro del SW (lo expone vite-plugin-pwa vía virtual:pwa-register,
 * pero al usar SW propio lo hacemos a mano detectando `updatefound`).
 */
export function setupUpdateBanner() {
  const banner = document.getElementById('update-banner');
  const btn = document.getElementById('update-btn');
  if (!banner || !btn || !('serviceWorker' in navigator)) return;

  const txt = banner.querySelector('.install-text');
  if (txt) txt.textContent = t('pwa.updateText');
  btn.textContent = t('pwa.update');

  navigator.serviceWorker.ready.then((reg) => {
    // Si aparece un SW nuevo esperando, avisar.
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        // Hay versión nueva instalada y ya había una controlando -> es update.
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          banner.classList.remove('hidden');
          btn.onclick = () => {
            nw.postMessage?.({ type: 'SKIP_WAITING' });
            window.location.reload();
          };
        }
      });
    });
  });

  // Cuando el nuevo SW toma control, recargar para servir la versión fresca.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

/** ¿La app está corriendo ya instalada (standalone)? */
export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}
