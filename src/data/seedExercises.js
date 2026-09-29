/**
 * CAPA DATOS · Catálogo semilla de ejercicios (RF-01)
 *
 * Se carga la primera vez que arranca la app si la tabla está vacía.
 * Cada ejercicio: nombre, grupo muscular, equipo e icono (clave de icons.js).
 * El usuario puede añadir los suyos (isCustom), estos son isCustom:false.
 *
 * Grupos: pecho, espalda, hombro, biceps, triceps, pierna, gluteo, core, antebrazo
 * Equipos: barra, mancuerna, maquina, polea, peso corporal
 */

// icon: pushHorizontal, pushVertical, pull, squat, hinge, curl, extension, core,
//       bodyweight, barbell, dumbbell, machine, cable
export const SEED_EXERCISES = [
  // ---- Pecho ----
  { name: 'Press banca con barra', muscleGroup: 'pecho', equipment: 'barra', icon: 'pushHorizontal' },
  { name: 'Press banca con mancuernas', muscleGroup: 'pecho', equipment: 'mancuerna', icon: 'pushHorizontal' },
  { name: 'Press inclinado con barra', muscleGroup: 'pecho', equipment: 'barra', icon: 'pushHorizontal' },
  { name: 'Press inclinado con mancuernas', muscleGroup: 'pecho', equipment: 'mancuerna', icon: 'pushHorizontal' },
  { name: 'Aperturas con mancuernas', muscleGroup: 'pecho', equipment: 'mancuerna', icon: 'dumbbell' },
  { name: 'Contractor de pecho (peck deck)', muscleGroup: 'pecho', equipment: 'maquina', icon: 'machine' },
  { name: 'Cruce de poleas', muscleGroup: 'pecho', equipment: 'polea', icon: 'cable' },
  { name: 'Fondos en paralelas', muscleGroup: 'pecho', equipment: 'peso corporal', icon: 'bodyweight' },
  { name: 'Press de pecho en máquina', muscleGroup: 'pecho', equipment: 'maquina', icon: 'machine' },

  // ---- Espalda ----
  { name: 'Dominadas', muscleGroup: 'espalda', equipment: 'peso corporal', icon: 'pull' },
  { name: 'Jalón al pecho', muscleGroup: 'espalda', equipment: 'polea', icon: 'pull' },
  { name: 'Remo con barra', muscleGroup: 'espalda', equipment: 'barra', icon: 'pull' },
  { name: 'Remo con mancuerna', muscleGroup: 'espalda', equipment: 'mancuerna', icon: 'pull' },
  { name: 'Remo en máquina', muscleGroup: 'espalda', equipment: 'maquina', icon: 'machine' },
  { name: 'Remo en polea baja', muscleGroup: 'espalda', equipment: 'polea', icon: 'cable' },
  { name: 'Peso muerto', muscleGroup: 'espalda', equipment: 'barra', icon: 'hinge' },
  { name: 'Pull-over con mancuerna', muscleGroup: 'espalda', equipment: 'mancuerna', icon: 'dumbbell' },

  // ---- Hombro ----
  { name: 'Press militar con barra', muscleGroup: 'hombro', equipment: 'barra', icon: 'pushVertical' },
  { name: 'Press de hombro con mancuernas', muscleGroup: 'hombro', equipment: 'mancuerna', icon: 'pushVertical' },
  { name: 'Elevaciones laterales', muscleGroup: 'hombro', equipment: 'mancuerna', icon: 'dumbbell' },
  { name: 'Elevaciones frontales', muscleGroup: 'hombro', equipment: 'mancuerna', icon: 'dumbbell' },
  { name: 'Pájaros (deltoide posterior)', muscleGroup: 'hombro', equipment: 'mancuerna', icon: 'dumbbell' },
  { name: 'Press de hombro en máquina', muscleGroup: 'hombro', equipment: 'maquina', icon: 'machine' },
  { name: 'Face pull en polea', muscleGroup: 'hombro', equipment: 'polea', icon: 'cable' },

  // ---- Bíceps ----
  { name: 'Curl con barra', muscleGroup: 'biceps', equipment: 'barra', icon: 'curl' },
  { name: 'Curl con mancuernas', muscleGroup: 'biceps', equipment: 'mancuerna', icon: 'curl' },
  { name: 'Curl martillo', muscleGroup: 'biceps', equipment: 'mancuerna', icon: 'curl' },
  { name: 'Curl en polea', muscleGroup: 'biceps', equipment: 'polea', icon: 'cable' },
  { name: 'Curl concentrado', muscleGroup: 'biceps', equipment: 'mancuerna', icon: 'curl' },
  { name: 'Curl predicador en máquina', muscleGroup: 'biceps', equipment: 'maquina', icon: 'machine' },

  // ---- Tríceps ----
  { name: 'Extensión de tríceps en polea', muscleGroup: 'triceps', equipment: 'polea', icon: 'extension' },
  { name: 'Press francés con barra', muscleGroup: 'triceps', equipment: 'barra', icon: 'extension' },
  { name: 'Extensión de tríceps con mancuerna', muscleGroup: 'triceps', equipment: 'mancuerna', icon: 'extension' },
  { name: 'Fondos en banco', muscleGroup: 'triceps', equipment: 'peso corporal', icon: 'bodyweight' },
  { name: 'Patada de tríceps', muscleGroup: 'triceps', equipment: 'mancuerna', icon: 'extension' },

  // ---- Pierna ----
  { name: 'Sentadilla con barra', muscleGroup: 'pierna', equipment: 'barra', icon: 'squat' },
  { name: 'Prensa de piernas', muscleGroup: 'pierna', equipment: 'maquina', icon: 'machine' },
  { name: 'Extensión de cuádriceps', muscleGroup: 'pierna', equipment: 'maquina', icon: 'machine' },
  { name: 'Curl femoral', muscleGroup: 'pierna', equipment: 'maquina', icon: 'machine' },
  { name: 'Zancadas con mancuernas', muscleGroup: 'pierna', equipment: 'mancuerna', icon: 'squat' },
  { name: 'Sentadilla búlgara', muscleGroup: 'pierna', equipment: 'mancuerna', icon: 'squat' },
  { name: 'Peso muerto rumano', muscleGroup: 'pierna', equipment: 'barra', icon: 'hinge' },
  { name: 'Elevación de gemelos', muscleGroup: 'pierna', equipment: 'maquina', icon: 'machine' },
  { name: 'Hip thrust', muscleGroup: 'gluteo', equipment: 'barra', icon: 'hinge' },
  { name: 'Patada de glúteo en polea', muscleGroup: 'gluteo', equipment: 'polea', icon: 'cable' },

  // ---- Core ----
  { name: 'Plancha', muscleGroup: 'core', equipment: 'peso corporal', icon: 'core' },
  { name: 'Crunch abdominal', muscleGroup: 'core', equipment: 'peso corporal', icon: 'core' },
  { name: 'Elevación de piernas', muscleGroup: 'core', equipment: 'peso corporal', icon: 'core' },
  { name: 'Rueda abdominal', muscleGroup: 'core', equipment: 'peso corporal', icon: 'core' },
  { name: 'Crunch en polea', muscleGroup: 'core', equipment: 'polea', icon: 'cable' },

  // ---- Antebrazo ----
  { name: 'Curl de muñeca', muscleGroup: 'antebrazo', equipment: 'barra', icon: 'curl' },
];

export const MUSCLE_GROUPS = ['pecho', 'espalda', 'hombro', 'biceps', 'triceps', 'pierna', 'gluteo', 'core', 'antebrazo'];
export const EQUIPMENT_TYPES = ['barra', 'mancuerna', 'maquina', 'polea', 'peso corporal'];
