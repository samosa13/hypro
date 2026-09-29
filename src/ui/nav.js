/**
 * UI · Navegación con soporte del botón/gesto "atrás" de Android (History API).
 *
 * Problema que resuelve (peer review navegación #1, #8): la app pintaba
 * sub-pantallas y overlays sobre `root` sin tocar el historial, así que el
 * gesto "atrás" del sistema cerraba la PWA en vez de cerrar el modal o volver
 * de la sub-pantalla.
 *
 * Modelo: una pila de "capas". Cada vez que se abre una sub-pantalla u overlay
 * se hace pushLayer(closeFn). El gesto atrás (popstate) ejecuta el `closeFn` de
 * la capa superior (cerrar overlay → cerrar sub-pantalla → …). Cuando la pila
 * está vacía, el back hace lo normal (cambiar de tab / salir de la app).
 *
 * Es deliberadamente mínimo y agnóstico de la UI: cada capa solo registra "cómo
 * cerrarse". No acopla lógica de negocio, así que no afecta a la escalabilidad
 * de Fase 3 (cuando haya router real, esto se sustituye por él sin tocar dominio).
 */

const stack = []; // [{ close: fn }]

/** Inicializa el listener global de popstate. Llamar una vez al arrancar. */
export function initNav() {
  window.addEventListener('popstate', () => {
    if (stack.length > 0) {
      const layer = stack.pop();
      try { layer.close(); } catch { /* noop */ }
      // Reponemos un estado para seguir capturando el siguiente "atrás".
      history.pushState({ hypro: true, depth: stack.length }, '');
    }
    // Si la pila está vacía, dejamos que el back siga su curso natural.
  });
  // Estado base para tener algo que "consumir" en el primer back.
  history.pushState({ hypro: true, depth: 0 }, '');
}

/**
 * Registra una capa abierta (sub-pantalla u overlay) y cómo cerrarla.
 * Empuja un estado al historial para que el próximo "atrás" la cierre.
 * @param {() => void} close función que cierra/deshace esta capa
 */
export function pushLayer(close) {
  stack.push({ close });
  history.pushState({ hypro: true, depth: stack.length }, '');
}

/**
 * Cierra la capa superior programáticamente (p.ej. botón "Cancelar"/"Hecho"),
 * sincronizando el historial para que no quede un estado colgando.
 * No ejecuta el `close` (lo hace el propio botón); solo ajusta la pila/historial.
 */
export function popLayer() {
  if (stack.length > 0) {
    stack.pop();
    history.back(); // consume el estado que empujó pushLayer
  }
}

/** Vacía la pila (al navegar por tabs, que es un "reset" de contexto). */
export function clearLayers() {
  stack.length = 0;
}

/** ¿Hay capas abiertas ahora mismo? */
export function hasLayers() {
  return stack.length > 0;
}
