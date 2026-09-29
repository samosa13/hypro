/**
 * Service Worker de Hypro (estrategia injectManifest).
 *
 * Responsabilidades:
 *  - Precache offline-first de la app-shell (self.__WB_MANIFEST lo inyecta el
 *    plugin en build).
 *  - navigateFallback a index.html para que la PWA funcione sin conexión.
 *  - Manejar 'periodicsync' en Android: mostrar un aviso motivador en segundo
 *    plano cuando el sistema lo permita (best effort, RF-42).
 *  - Manejar clic en la notificación para abrir/enfocar la app.
 *
 * Nota: el backup diario real se garantiza al abrir la app (appService). Aquí
 * solo intentamos el recordatorio en segundo plano; no accedemos a IndexedDB
 * desde el SW para mantener una sola fuente de verdad del backup.
 */
import { precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { createHandlerBoundToURL } from 'workbox-precaching';

// Precache de todos los assets (inyectado por vite-plugin-pwa en build).
precacheAndRoute(self.__WB_MANIFEST || []);

// App-shell: cualquier navegación cae en index.html (offline-first).
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Actualización: cuando la UI pide SKIP_WAITING, el SW nuevo toma el control
// sin esperar a que se cierren todas las pestañas (aviso "Actualizar").
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Aviso motivador en segundo plano (Android). El SO decide cuándo dispara.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'hypro-daily') {
    event.waitUntil(
      self.registration.showNotification('Hypro', {
        body: '¡Hoy es tu día! Entra y revienta tu próxima serie 💪',
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: 'hypro-daily',
      })
    );
  }
});

// Al tocar la notificación, abrir/enfocar la app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
