/**
 * CAPA DATOS · Catálogo semilla de ejercicios (RF-01)
 *
 * Se carga la primera vez que arranca la app si la tabla está vacía.
 * Cada ejercicio: nombre, grupo muscular, equipo e icono (clave de icons.js).
 * El usuario puede añadir los suyos (isCustom), estos son isCustom:false.
 *
 * Grupos: pecho, espalda, hombro, biceps, triceps, pierna, gluteo, core, antebrazo
 * Equipos: barra, mancuerna, maquina, polea, peso corporal
 *
 * Los iconos son pictogramas de figura humana específicos por ejercicio
 * (ver ui/icons.js), para que se reconozca el gesto de un vistazo.
 */

export const SEED_EXERCISES = [
  // ---- Pecho ----
  { name: 'Press banca con barra', muscleGroup: 'pecho', equipment: 'barra', icon: 'ex_press_banca_barra' },
  { name: 'Press banca con mancuernas', muscleGroup: 'pecho', equipment: 'mancuerna', icon: 'ex_press_banca_db' },
  { name: 'Press inclinado con barra', muscleGroup: 'pecho', equipment: 'barra', icon: 'ex_incline_barra' },
  { name: 'Press inclinado con mancuernas', muscleGroup: 'pecho', equipment: 'mancuerna', icon: 'ex_incline_db' },
  { name: 'Aperturas con mancuernas', muscleGroup: 'pecho', equipment: 'mancuerna', icon: 'ex_aperturas' },
  { name: 'Contractor de pecho (peck deck)', muscleGroup: 'pecho', equipment: 'maquina', icon: 'ex_peck_deck' },
  { name: 'Cruce de poleas', muscleGroup: 'pecho', equipment: 'polea', icon: 'ex_cruce_poleas' },
  { name: 'Fondos en paralelas', muscleGroup: 'pecho', equipment: 'peso corporal', icon: 'ex_fondos_paralelas', tracking: 'reps_only' },
  { name: 'Press de pecho en máquina', muscleGroup: 'pecho', equipment: 'maquina', icon: 'ex_press_maquina' },

  // ---- Espalda ----
  { name: 'Dominadas', muscleGroup: 'espalda', equipment: 'peso corporal', icon: 'ex_dominadas', tracking: 'reps_only' },
  { name: 'Jalón al pecho', muscleGroup: 'espalda', equipment: 'polea', icon: 'ex_jalon' },
  { name: 'Remo con barra', muscleGroup: 'espalda', equipment: 'barra', icon: 'ex_remo_barra' },
  { name: 'Remo con mancuerna', muscleGroup: 'espalda', equipment: 'mancuerna', icon: 'ex_remo_db' },
  { name: 'Remo en máquina', muscleGroup: 'espalda', equipment: 'maquina', icon: 'ex_remo_maquina' },
  { name: 'Remo en polea baja', muscleGroup: 'espalda', equipment: 'polea', icon: 'ex_remo_polea' },
  { name: 'Peso muerto', muscleGroup: 'espalda', equipment: 'barra', icon: 'ex_peso_muerto' },
  { name: 'Pull-over con mancuerna', muscleGroup: 'espalda', equipment: 'mancuerna', icon: 'ex_pullover' },

  // ---- Hombro ----
  { name: 'Press militar con barra', muscleGroup: 'hombro', equipment: 'barra', icon: 'ex_press_militar' },
  { name: 'Press de hombro con mancuernas', muscleGroup: 'hombro', equipment: 'mancuerna', icon: 'ex_press_hombro_db' },
  { name: 'Elevaciones laterales', muscleGroup: 'hombro', equipment: 'mancuerna', icon: 'ex_elev_lateral' },
  { name: 'Elevaciones frontales', muscleGroup: 'hombro', equipment: 'mancuerna', icon: 'ex_elev_frontal' },
  { name: 'Pájaros (deltoide posterior)', muscleGroup: 'hombro', equipment: 'mancuerna', icon: 'ex_pajaros' },
  { name: 'Press de hombro en máquina', muscleGroup: 'hombro', equipment: 'maquina', icon: 'ex_press_hombro_maquina' },
  { name: 'Face pull en polea', muscleGroup: 'hombro', equipment: 'polea', icon: 'ex_face_pull' },

  // ---- Bíceps ----
  { name: 'Curl con barra', muscleGroup: 'biceps', equipment: 'barra', icon: 'ex_curl_barra' },
  { name: 'Curl con mancuernas', muscleGroup: 'biceps', equipment: 'mancuerna', icon: 'ex_curl_db' },
  { name: 'Curl martillo', muscleGroup: 'biceps', equipment: 'mancuerna', icon: 'ex_curl_martillo' },
  { name: 'Curl en polea', muscleGroup: 'biceps', equipment: 'polea', icon: 'ex_curl_polea' },
  { name: 'Curl concentrado', muscleGroup: 'biceps', equipment: 'mancuerna', icon: 'ex_curl_concentrado' },
  { name: 'Curl predicador en máquina', muscleGroup: 'biceps', equipment: 'maquina', icon: 'ex_curl_predicador' },

  // ---- Tríceps ----
  { name: 'Extensión de tríceps en polea', muscleGroup: 'triceps', equipment: 'polea', icon: 'ex_tri_polea' },
  { name: 'Press francés con barra', muscleGroup: 'triceps', equipment: 'barra', icon: 'ex_press_frances' },
  { name: 'Extensión de tríceps con mancuerna', muscleGroup: 'triceps', equipment: 'mancuerna', icon: 'ex_tri_db' },
  { name: 'Fondos en banco', muscleGroup: 'triceps', equipment: 'peso corporal', icon: 'ex_fondos_banco', tracking: 'reps_only' },
  { name: 'Patada de tríceps', muscleGroup: 'triceps', equipment: 'mancuerna', icon: 'ex_patada_tri' },

  // ---- Pierna ----
  { name: 'Sentadilla con barra', muscleGroup: 'pierna', equipment: 'barra', icon: 'ex_sentadilla' },
  { name: 'Prensa de piernas', muscleGroup: 'pierna', equipment: 'maquina', icon: 'ex_prensa' },
  { name: 'Extensión de cuádriceps', muscleGroup: 'pierna', equipment: 'maquina', icon: 'ex_ext_cuadriceps' },
  { name: 'Curl femoral', muscleGroup: 'pierna', equipment: 'maquina', icon: 'ex_curl_femoral' },
  { name: 'Zancadas con mancuernas', muscleGroup: 'pierna', equipment: 'mancuerna', icon: 'ex_zancadas' },
  { name: 'Sentadilla búlgara', muscleGroup: 'pierna', equipment: 'mancuerna', icon: 'ex_bulgara' },
  { name: 'Peso muerto rumano', muscleGroup: 'pierna', equipment: 'barra', icon: 'ex_peso_muerto_rumano' },
  { name: 'Elevación de gemelos', muscleGroup: 'pierna', equipment: 'maquina', icon: 'ex_gemelos' },
  { name: 'Hip thrust', muscleGroup: 'gluteo', equipment: 'barra', icon: 'ex_hip_thrust' },
  { name: 'Patada de glúteo en polea', muscleGroup: 'gluteo', equipment: 'polea', icon: 'ex_patada_gluteo' },

  // ---- Core ----
  { name: 'Plancha', muscleGroup: 'core', equipment: 'peso corporal', icon: 'ex_plancha', tracking: 'time' },
  { name: 'Crunch abdominal', muscleGroup: 'core', equipment: 'peso corporal', icon: 'ex_crunch' },
  { name: 'Elevación de piernas', muscleGroup: 'core', equipment: 'peso corporal', icon: 'ex_elev_piernas', tracking: 'reps_only' },
  { name: 'Rueda abdominal', muscleGroup: 'core', equipment: 'peso corporal', icon: 'ex_rueda_ab' },
  { name: 'Crunch en polea', muscleGroup: 'core', equipment: 'polea', icon: 'ex_crunch_polea' },

  // ---- Antebrazo ----
  { name: 'Curl de muñeca', muscleGroup: 'antebrazo', equipment: 'barra', icon: 'ex_curl_muneca' },
  { name: 'Curl de muñeca invertido', muscleGroup: 'antebrazo', equipment: 'barra', icon: 'ex_curl_muneca_inv' },

  // ========================================================================
  // Clásicos añadidos (B7). Grupos/equipos limitados a los existentes;
  // trapecio y lumbar se encuadran en espalda.
  // ========================================================================

  // ---- Pecho ----
  { name: 'Press declinado con barra', muscleGroup: 'pecho', equipment: 'barra', icon: 'ex_press_declinado' },
  { name: 'Flexiones', muscleGroup: 'pecho', equipment: 'peso corporal', icon: 'ex_flexiones', tracking: 'reps_only' },

  // ---- Espalda ----
  { name: 'Remo Pendlay', muscleGroup: 'espalda', equipment: 'barra', icon: 'ex_remo_pendlay' },
  { name: 'Remo en punta (T-bar)', muscleGroup: 'espalda', equipment: 'barra', icon: 'ex_remo_tbar' },
  { name: 'Jalón agarre neutro', muscleGroup: 'espalda', equipment: 'polea', icon: 'ex_jalon_neutro' },
  { name: 'Pullover en polea', muscleGroup: 'espalda', equipment: 'polea', icon: 'ex_pullover_polea' },
  { name: 'Encogimientos con barra (trapecio)', muscleGroup: 'espalda', equipment: 'barra', icon: 'ex_shrugs_barra' },
  { name: 'Encogimientos con mancuernas (trapecio)', muscleGroup: 'espalda', equipment: 'mancuerna', icon: 'ex_shrugs_db' },
  { name: 'Hiperextensiones lumbares', muscleGroup: 'espalda', equipment: 'peso corporal', icon: 'ex_hiperextension' },

  // ---- Hombro ----
  { name: 'Press Arnold', muscleGroup: 'hombro', equipment: 'mancuerna', icon: 'ex_press_arnold' },
  { name: 'Remo al mentón', muscleGroup: 'hombro', equipment: 'barra', icon: 'ex_remo_menton' },

  // ---- Tríceps ----
  { name: 'Fondos en máquina asistida', muscleGroup: 'triceps', equipment: 'maquina', icon: 'ex_fondos_maquina' },
  { name: 'Extensión de tríceps sobre la cabeza', muscleGroup: 'triceps', equipment: 'mancuerna', icon: 'ex_tri_overhead' },

  // ---- Bíceps ----
  { name: 'Curl araña', muscleGroup: 'biceps', equipment: 'mancuerna', icon: 'ex_curl_arana' },
  { name: 'Curl inclinado con mancuernas', muscleGroup: 'biceps', equipment: 'mancuerna', icon: 'ex_curl_inclinado' },

  // ---- Pierna ----
  { name: 'Sentadilla frontal', muscleGroup: 'pierna', equipment: 'barra', icon: 'ex_sentadilla_frontal' },
  { name: 'Peso muerto sumo', muscleGroup: 'pierna', equipment: 'barra', icon: 'ex_peso_muerto_sumo' },
  { name: 'Good morning', muscleGroup: 'pierna', equipment: 'barra', icon: 'ex_good_morning' },
  { name: 'Gemelo sentado', muscleGroup: 'pierna', equipment: 'maquina', icon: 'ex_gemelo_sentado' },
  { name: 'Hack squat', muscleGroup: 'pierna', equipment: 'maquina', icon: 'ex_hack_squat' },

  // ---- Glúteo ----
  { name: 'Hip thrust a una pierna', muscleGroup: 'gluteo', equipment: 'peso corporal', icon: 'ex_hip_thrust_1' },
  { name: 'Abducción de cadera en máquina', muscleGroup: 'gluteo', equipment: 'maquina', icon: 'ex_abduccion' },

  // ---- Core ----
  { name: 'Russian twist', muscleGroup: 'core', equipment: 'peso corporal', icon: 'ex_russian_twist' },
  { name: 'Mountain climbers', muscleGroup: 'core', equipment: 'peso corporal', icon: 'ex_mountain_climbers', tracking: 'time' },
  { name: 'Plancha lateral', muscleGroup: 'core', equipment: 'peso corporal', icon: 'ex_plancha_lateral', tracking: 'time' },
];

export const MUSCLE_GROUPS = ['pecho', 'espalda', 'hombro', 'biceps', 'triceps', 'pierna', 'gluteo', 'core', 'antebrazo'];
export const EQUIPMENT_TYPES = ['barra', 'mancuerna', 'maquina', 'polea', 'peso corporal'];
