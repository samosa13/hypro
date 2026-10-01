/**
 * UI · Iconos de ejercicio.
 *
 * Usa iconos open source empaquetados localmente (src/ui/iconData.js, generado
 * por scripts/build-icons.mjs desde @iconify/json). Se eligen por patrón de
 * movimiento / músculo / equipo, con acabado profesional.
 *
 * Licencias: game-icons (CC BY 3.0, atribución en Ajustes), tabler (MIT),
 * mdi (Apache-2.0), ph (MIT).
 *
 * Cada clave de ejercicio (ex_*) se mapea a una clave de ICON_DATA. El seed
 * (data/seedExercises.js) referencia las claves ex_*.
 */
import { ICON_DATA } from './iconData.js';

// Envuelve el body de un icono en un <svg> con el viewBox correcto.
function render(dataKey) {
  const d = ICON_DATA[dataKey] || ICON_DATA.bodyweight;
  if (!d) return '';
  return `<svg viewBox="${d.viewBox}" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">${d.body}</svg>`;
}

/**
 * Mapa de cada clave de ejercicio -> icono base (clave de ICON_DATA).
 * Criterio: el gesto/músculo/equipo más representativo con el mejor icono
 * disponible en los sets libres.
 */
const EXERCISE_ICON = {
  // Pecho — press = empuje; aperturas = mancuerna; máquina/polea por equipo
  ex_press_banca_barra: 'weightlift_up',
  ex_press_banca_db: 'dumbbell',
  ex_incline_barra: 'weightlift_up',
  ex_incline_db: 'dumbbell',
  ex_aperturas: 'dumbbell',
  ex_peck_deck: 'machine',
  ex_cruce_poleas: 'cable',
  ex_fondos_paralelas: 'bodyweight',
  ex_press_maquina: 'machine',

  // Espalda — tirón (dominada/jalón) / remo / peso muerto / lumbar
  ex_dominadas: 'acrobatic',          // cuerpo colgado, gesto de dominada
  ex_jalon: 'pull',                   // tirón vertical en polea
  ex_remo_barra: 'barbell',
  ex_remo_db: 'dumbbell',
  ex_remo_maquina: 'machine',
  ex_remo_polea: 'pull',              // tirón horizontal
  ex_peso_muerto: 'weightlift_down',  // levantamiento desde el suelo
  ex_pullover: 'dumbbell',

  // Hombro — press arriba / elevaciones con brazos / equipo
  ex_press_militar: 'weightlift_up',
  ex_press_hombro_db: 'handsup',      // brazos arriba
  ex_elev_lateral: 'handsup',
  ex_elev_frontal: 'handsup',
  ex_pajaros: 'handsup',
  ex_press_hombro_maquina: 'machine',
  ex_face_pull: 'pull',

  // Bíceps — brazo flexionado; polea/máquina por equipo
  ex_curl_barra: 'biceps',
  ex_curl_db: 'biceps',
  ex_curl_martillo: 'biceps',
  ex_curl_polea: 'cable',
  ex_curl_concentrado: 'biceps',
  ex_curl_predicador: 'machine',

  // Tríceps — polea/barra/mancuerna/fondos por equipo-gesto
  ex_tri_polea: 'cable',
  ex_press_frances: 'barbell',
  ex_tri_db: 'dumbbell',
  ex_fondos_banco: 'bodyweight',
  ex_patada_tri: 'dumbbell',

  // Pierna — sentadilla/pierna, zancadas de rodilla, bisagra, glúteo
  ex_sentadilla: 'leg',
  ex_prensa: 'machine',
  ex_ext_cuadriceps: 'machine',
  ex_curl_femoral: 'machine',
  ex_zancadas: 'kick',                // zancada / paso adelante
  ex_bulgara: 'kneeling',             // apoyo en banco, rodilla atrás
  ex_peso_muerto_rumano: 'weightlift_down',
  ex_gemelos: 'leg',
  ex_hip_thrust: 'kick',              // empuje de cadera / glúteo
  ex_patada_gluteo: 'kick',

  // Core — abdominales; plancha isométrica; crunch en polea
  ex_plancha: 'stretch',              // isométrico / posición mantenida
  ex_crunch: 'abdominal',
  ex_elev_piernas: 'abdominal',
  ex_rueda_ab: 'abdominal',
  ex_crunch_polea: 'cable',

  // Antebrazo
  ex_curl_muneca: 'barbell',

  // Genéricos / nav
  bodyweight: 'bodyweight',
  muscle: 'muscle_up',
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  machine: 'machine',
  run: 'run',
};

/**
 * Devuelve el SVG de un icono por su clave de ejercicio (ex_*) o clave genérica.
 * @param {string} key
 * @returns {string} SVG
 */
export function icon(key) {
  const dataKey = EXERCISE_ICON[key] || (ICON_DATA[key] ? key : 'bodyweight');
  return render(dataKey);
}

// Claves disponibles para el selector de icono al crear ejercicio propio:
// exponemos las claves lógicas de ejercicio.
export const ICON_KEYS = Object.keys(EXERCISE_ICON);
