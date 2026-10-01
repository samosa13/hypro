/**
 * DOMINIO · Búsqueda de texto para filtros de listas. Funciones puras.
 *
 * Unifica el comportamiento de los buscadores de la app (al estilo de VendIX):
 *  - Insensible a MAYÚSCULAS/minúsculas.
 *  - Insensible a ACENTOS/diacríticos: "biceps" encuentra "bíceps", "banca"
 *    encuentra "bánca", etc. (normalización NFD + quitar marcas).
 *  - Coincidencia por subcadena (includes), no por palabra completa.
 *  - Búsqueda MULTI-CAMPO: una entrada casa si el término aparece en CUALQUIERA
 *    de los campos indicados (p.ej. nombre, grupo muscular o equipo).
 */

/**
 * Normaliza un texto para comparar: minúsculas, sin acentos/diacríticos y sin
 * espacios sobrantes en los extremos.
 * @param {string} s
 * @returns {string}
 */
export function normalizeText(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita marcas diacríticas (acentos, tildes…)
    .trim();
}

/**
 * ¿La entrada casa con el término de búsqueda? Casa si el término (normalizado)
 * es subcadena de ALGUNO de los campos (normalizados). Término vacío casa
 * siempre (no filtra).
 * @param {string} query término tecleado por el usuario
 * @param {Array<string>} fields valores de los campos donde buscar
 * @returns {boolean}
 */
export function matchesSearch(query, fields = []) {
  const q = normalizeText(query);
  if (!q) return true;
  return fields.some((f) => normalizeText(f).includes(q));
}
