/**
 * UI · Compartir un logro como imagen (C14).
 *
 * Dibuja una tarjeta "para redes" en un <canvas> (sin dependencias) y la comparte
 * con navigator.share({files}) cuando el navegador lo soporta (móvil); si no,
 * descarga el PNG. El canvas usa fuentes del sistema (cargar las self-hosted en
 * canvas es frágil), con tipografía grande y legible.
 */
import { APP, THEME } from '../config/app.config.js';

const C = THEME.colors;

/**
 * Genera el PNG de la tarjeta de logro.
 * @param {object} opts
 *  - title: título grande (p.ej. "NUEVO RÉCORD" o "SESIÓN COMPLETADA")
 *  - headline: dato principal grande (p.ej. "100 kg × 5")
 *  - subtitle: línea secundaria (p.ej. nombre del ejercicio)
 *  - footer: pie pequeño (p.ej. la fecha)
 * @returns {Promise<Blob>} PNG
 */
export function renderCardBlob({ title, headline, subtitle, footer }) {
  const W = 1080, H = 1080; // formato cuadrado típico de redes
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Fondo con degradado oscuro + glow naranja arriba.
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 120, 50, W / 2, 120, 700);
  glow.addColorStop(0, 'rgba(255,106,0,0.22)');
  glow.addColorStop(1, 'rgba(255,106,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Marco redondeado sutil (tarjeta).
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 2;
  roundRect(ctx, 60, 60, W - 120, H - 120, 40);
  ctx.stroke();

  const cx = W / 2;
  ctx.textAlign = 'center';

  // Marca Hypro arriba (Hy + pro en acento).
  ctx.font = '700 64px system-ui, sans-serif';
  const name = APP.name || 'Hypro';
  const split = APP.logoSplitIndex ?? 2;
  const a = name.slice(0, split), b = name.slice(split);
  const wA = ctx.measureText(a).width, wB = ctx.measureText(b).width;
  const startX = cx - (wA + wB) / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = C.text; ctx.fillText(a, startX, 180);
  ctx.fillStyle = C.accent; ctx.fillText(b, startX + wA, 180);
  ctx.textAlign = 'center';

  // Título (p.ej. NUEVO RÉCORD).
  ctx.fillStyle = C.accent;
  ctx.font = '700 54px system-ui, sans-serif';
  ctx.fillText((title || '').toUpperCase(), cx, 400);

  // Trofeo / emoji grande.
  ctx.font = '160px system-ui, sans-serif';
  ctx.fillText('🏆', cx, 600);

  // Headline (dato principal).
  ctx.fillStyle = C.text;
  ctx.font = '800 120px system-ui, sans-serif';
  ctx.fillText(headline || '', cx, 760);

  // Subtítulo (ejercicio).
  if (subtitle) {
    ctx.fillStyle = C.textMuted;
    ctx.font = '500 48px system-ui, sans-serif';
    ctx.fillText(subtitle, cx, 850);
  }

  // Pie (fecha).
  if (footer) {
    ctx.fillStyle = C.textFaint;
    ctx.font = '400 36px system-ui, sans-serif';
    ctx.fillText(footer, cx, H - 110);
  }

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

/**
 * Comparte (o descarga) la tarjeta de logro. Devuelve 'shared' | 'downloaded'.
 * @param {object} opts  igual que renderCardBlob + { filename }
 */
export async function shareCard(opts) {
  const blob = await renderCardBlob(opts);
  const filename = opts.filename || 'hypro.png';
  const file = new File([blob], filename, { type: 'image/png' });

  // Compartir nativo si el navegador puede compartir ficheros (móvil moderno).
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: APP.name });
      return 'shared';
    } catch {
      // El usuario canceló el diálogo de compartir; no es un error.
      return 'cancelled';
    }
  }

  // Fallback: descargar el PNG.
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}

/** Rectángulo redondeado (helper de canvas). */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
