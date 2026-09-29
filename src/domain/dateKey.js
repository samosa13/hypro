/**
 * DOMINIO · Utilidad de clave de fecha "AAAA-MM-DD" (para backup diario).
 */
export function dateKey(d = new Date()) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Días transcurridos (calendario) entre dos fechas. */
export function daysBetween(a, b = new Date()) {
  const MS = 24 * 60 * 60 * 1000;
  const da = new Date(a);
  const db = new Date(b);
  const na = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const nb = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((nb - na) / MS);
}

/** Formatea una fecha ISO a "14 sep 2026". */
export function formatDate(iso) {
  if (!iso) return '';
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const d = new Date(iso);
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
}
