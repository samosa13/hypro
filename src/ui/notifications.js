/**
 * UI · Capa de notificaciones (aislada).
 *
 * Estrategia de 3 niveles con degradación elegante (RF-42, RF-43):
 *  1. GARANTIZADO: aviso al abrir la app (lo hace main.js con toast). Siempre.
 *  2. BONUS (Android): notificación local del sistema al abrir + Periodic
 *     Background Sync para intentar disparar en segundo plano cuando el SO lo
 *     permita. No garantizado por diseño del navegador.
 *  3. FUTURO (con backend): Web Push real. Este módulo expone el mismo API, así
 *     que enchufar push no obliga a tocar UI ni dominio.
 *
 * Todo es "best effort": si el navegador no soporta algo, se ignora en silencio
 * y seguimos apoyándonos en el aviso-al-abrir garantizado.
 */

/** ¿El navegador soporta notificaciones del sistema? */
export function notificationsSupported() {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
}

/**
 * Pide permiso de notificaciones (solo si aún no se decidió).
 * @returns {Promise<'granted'|'denied'|'default'|'unsupported'>}
 */
export async function ensureNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Muestra una notificación local del sistema (vía service worker si está,
 * con fallback a la API Notification directa).
 */
export async function showLocalNotification(title, body) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) {
      await reg.showNotification(title, {
        body,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: 'hypro-motivation',
      });
      return true;
    }
    // Fallback
    new Notification(title, { body, icon: 'icons/icon-192.png' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Intenta registrar Periodic Background Sync (Android/Chrome). Best effort:
 * requiere permiso y que el navegador lo soporte; el SO decide la frecuencia.
 * El service worker debe manejar el evento 'periodicsync' (ver sw-custom).
 */
export async function registerPeriodicBackup() {
  try {
    if (!('serviceWorker' in navigator)) return { ok: false, reason: 'no-sw' };
    const reg = await navigator.serviceWorker.ready;
    if (!('periodicSync' in reg)) return { ok: false, reason: 'unsupported' };

    // Permiso específico de periodic-background-sync
    const status = await navigator.permissions?.query?.({ name: 'periodic-background-sync' });
    if (status && status.state !== 'granted') return { ok: false, reason: 'no-permission' };

    await reg.periodicSync.register('hypro-daily', {
      minInterval: 24 * 60 * 60 * 1000, // ~1 día; el SO ajusta
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}
