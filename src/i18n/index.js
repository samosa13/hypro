/**
 * i18n · Infraestructura de internacionalización.
 *
 * Español por defecto. Preparado para escalar a producto multi-idioma sin tocar
 * las pantallas: el código usa siempre `t('clave', { params })`, y añadir un
 * idioma es registrar su diccionario aquí.
 *
 * Uso:
 *   import { t, setLocale, getLocale } from '../i18n/index.js';
 *   t('plan.perWeek', { n: 3 })  ->  "3 días por semana"
 */
import es from './es.js';
import { APP } from '../config/app.config.js';

// Registro de diccionarios. Para añadir inglés: import en from './en.js' y
// añadir `en` aquí. `supportedLocales` en app.config controla qué se ofrece.
const DICTS = { es };

let current = APP.defaultLocale || 'es';

/**
 * Determina el idioma inicial: preferencia guardada > idioma del navegador
 * (si está soportado) > defaultLocale. NO accede a la BD (eso lo hace el
 * arranque, que llama a setLocale con la preferencia del usuario).
 * @param {string|null} saved locale guardado en ajustes (o null)
 * @returns {string}
 */
export function resolveInitialLocale(saved = null) {
  const supported = APP.supportedLocales || ['es'];
  if (saved && supported.includes(saved)) return saved;
  const nav = (typeof navigator !== 'undefined' && navigator.language || '').slice(0, 2);
  if (supported.includes(nav)) return nav;
  return APP.defaultLocale || 'es';
}

/** Fija el idioma activo (si está soportado y tiene diccionario). */
export function setLocale(locale) {
  if (DICTS[locale]) current = locale;
}

/** Idioma activo. */
export function getLocale() {
  return current;
}

/**
 * Traduce una clave. Sustituye placeholders {x} con `params`. Si la clave no
 * existe en el idioma actual, cae al español; si tampoco, devuelve la clave
 * (para detectar traducciones olvidadas en desarrollo/tests).
 * @param {string} key
 * @param {object} params
 * @returns {string}
 */
export function t(key, params = {}) {
  const dict = DICTS[current] || DICTS.es;
  let str = (dict && dict[key]) ?? DICTS.es[key] ?? key;
  return str.replace(/\{(\w+)\}/g, (_, name) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`
  );
}
