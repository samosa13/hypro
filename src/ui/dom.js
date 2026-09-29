/**
 * UI · Micro-helpers de DOM (sin framework).
 * h() crea elementos; clear() vacía; toast() muestra un aviso efímero.
 */

export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined && v !== false) {
      el.setAttribute(k, v);
    }
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

let toastTimer = null;
export function toast(msg, ms = 2200) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = h('div', { class: 'toast' }, msg);
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ms);
}

/**
 * Diálogo de confirmación para acciones destructivas (peer review navegación
 * #2, #3). Devuelve una Promise<boolean>. Registra una capa de navegación para
 * que el gesto "atrás" lo cierre como "cancelar".
 * @param {string} message
 * @param {object} opts { confirmText, cancelText, danger }
 */
export async function confirmDialog(message, opts = {}) {
  const { confirmText = 'Confirmar', cancelText = 'Cancelar', danger = true } = opts;
  const nav = await import('./nav.js'); // import dinámico para evitar ciclos
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val, viaBack) => {
      if (settled) return;
      settled = true;
      overlay.remove();
      if (!viaBack) nav.popLayer(); // sincroniza historial si se cerró por botón
      resolve(val);
    };
    const overlay = h('div', { class: 'pr-flash confirm-overlay' }, [
      h('div', { class: 'card', style: 'max-width:320px;margin:16px;text-align:center' }, [
        h('div', { style: 'font-weight:700;margin-bottom:16px' }, message),
        h('button', { class: danger ? 'btn btn-danger' : 'btn', onClick: () => finish(true, false) }, confirmText),
        h('button', { class: 'btn btn-ghost', style: 'margin-top:8px', onClick: () => finish(false, false) }, cancelText),
      ]),
    ]);
    document.body.appendChild(overlay);
    // Capa de navegación: el gesto atrás equivale a cancelar (viaBack=true).
    nav.pushLayer(() => { overlay.remove(); if (!settled) { settled = true; resolve(false); } });
  });
}
