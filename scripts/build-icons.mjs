/**
 * Extrae los SVG concretos que usa Hypro desde @iconify/json (sets open source)
 * a un fichero local src/ui/iconData.js. Así el runtime no depende de red ni
 * carga toda la librería: solo empaquetamos los iconos usados.
 *
 * Fuentes y licencias:
 *  - game-icons (CC BY 3.0) → siluetas de fuerza/músculo (requiere atribución)
 *  - tabler (MIT), mdi (Apache-2.0), ph (MIT) → equipo y complementos
 *
 * Uso: node scripts/build-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsonDir = join(__dirname, '..', 'node_modules', '@iconify', 'json', 'json');

// Cache de sets cargados
const sets = {};
function loadSet(prefix) {
  if (!sets[prefix]) {
    sets[prefix] = JSON.parse(readFileSync(join(jsonDir, `${prefix}.json`), 'utf8'));
  }
  return sets[prefix];
}

/**
 * Devuelve el body SVG (contenido interno) y el viewBox de un icono "prefix:name".
 * Resuelve el tamaño del set (width/height) para un viewBox correcto.
 */
function getIcon(token) {
  const [prefix, name] = token.split(':');
  const set = loadSet(prefix);
  const icon = set.icons[name];
  if (!icon) throw new Error(`Icono no encontrado: ${token}`);
  const w = icon.width || set.width || 24;
  const h = icon.height || set.height || 24;
  return { body: icon.body, viewBox: `0 0 ${w} ${h}` };
}

/**
 * MAPEO: clave lógica de Hypro -> icono de Iconify.
 * Se eligen por patrón de movimiento / músculo / equipo, con el mejor acabado
 * disponible en sets libres. game-icons aporta las siluetas "de fuerza".
 */
const MAP = {
  // Fuerza / cuerpo (game-icons, CC BY 3.0)
  weightlift_up: 'game-icons:weight-lifting-up',
  weightlift_down: 'game-icons:weight-lifting-down',
  muscle_up: 'game-icons:muscle-up',
  biceps: 'game-icons:biceps',
  leg: 'game-icons:leg',
  abdominal: 'game-icons:abdominal-armor',
  gymbag: 'game-icons:gym-bag',
  // Equipo (sets MIT/Apache)
  barbell: 'tabler:barbell-filled',
  dumbbell: 'mdi:dumbbell',
  kettlebell: 'mdi:kettlebell',
  machine: 'mdi:weight-lifter',
  cable: 'game-icons:pull',
  bodyweight: 'game-icons:body-balance',
  run: 'ph:person-simple-run-fill',
};

// Verificamos qué existe realmente; si alguno no está, avisamos para ajustar.
const out = {};
const missing = [];
for (const [key, token] of Object.entries(MAP)) {
  try {
    out[key] = getIcon(token);
  } catch (e) {
    missing.push({ key, token, error: String(e.message) });
  }
}

if (missing.length) {
  console.warn('Iconos NO encontrados (ajustar mapeo):');
  for (const m of missing) console.warn(`  ${m.key} -> ${m.token}`);
}

const header = `/**
 * AUTO-GENERADO por scripts/build-icons.mjs — NO editar a mano.
 * SVG de iconos open source empaquetados localmente.
 * game-icons: CC BY 3.0 (https://github.com/game-icons/icons) — atribución en Ajustes.
 * tabler: MIT · mdi: Apache-2.0 · ph: MIT
 */
export const ICON_DATA = ${JSON.stringify(out, null, 2)};
`;

writeFileSync(join(__dirname, '..', 'src', 'ui', 'iconData.js'), header);
console.log(`Generados ${Object.keys(out).length} iconos en src/ui/iconData.js`);
