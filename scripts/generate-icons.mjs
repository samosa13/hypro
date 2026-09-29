/**
 * Genera los PNG del icono de Hypro a partir de public/icons/logo.svg.
 * Usa `sharp` (dependencia dev, con binarios prebuilt) para rasterizar el SVG.
 *
 * Uso:  node scripts/generate-icons.mjs
 * Salida: public/icons/icon-192.png, icon-512.png, icon-maskable-512.png
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'public', 'icons');
const svg = readFileSync(join(iconsDir, 'logo.svg'));

// Iconos normales: el SVG ya incluye su fondo redondeado del tema.
async function render(name, size) {
  await sharp(svg).resize(size, size).png().toFile(join(iconsDir, name));
  console.log(`✓ ${name} (${size}x${size})`);
}

// Maskable: el arte debe caber en la "safe zone" (~80% central). Renderizamos
// el logo al 80% y lo centramos sobre un lienzo con el fondo del tema.
async function renderMaskable(name, size) {
  const inner = Math.round(size * 0.8);
  const logo = await sharp(svg).resize(inner, inner).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: '#0a0a0c' },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(join(iconsDir, name));
  console.log(`✓ ${name} (${size}x${size}, maskable)`);
}

await render('icon-192.png', 192);
await render('icon-512.png', 512);
await renderMaskable('icon-maskable-512.png', 512);
console.log('Iconos generados en public/icons/');
