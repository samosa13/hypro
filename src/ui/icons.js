/**
 * UI · Pictogramas de ejercicio (estilo figura humana maciza).
 *
 * Cada ejercicio tiene su propia silueta reconocible de una persona haciendo el
 * gesto, más el implemento (barra / mancuerna / máquina / polea) cuando aplica.
 * Estilo: figura de "muñeco" con cabeza circular y extremidades de trazo grueso,
 * en currentColor (hereda el naranja del tema). ViewBox 48x48.
 *
 * Set propio, libre de derechos (inspirado en el estilo pictográfico clásico de
 * gimnasio, sin copiar ningún pack concreto).
 *
 * La clave de cada ejercicio se mapea en data/seedExercises.js.
 */

const S = (inner) =>
  `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" fill="currentColor" stroke="currentColor">${inner}</svg>`;

// Helpers de trazo (line-cap redondo para que la figura sea "maciza")
const L = 'stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"';   // extremidades
const T = 'stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" fill="none"';   // torso
const head = (cx, cy, r = 3.4) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
// Barra con discos
const barbell = (x1, x2, y) =>
  `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke-width="2.4" stroke-linecap="round"/>` +
  `<rect x="${x1 - 2}" y="${y - 4}" width="3" height="8" rx="1"/>` +
  `<rect x="${x2 - 1}" y="${y - 4}" width="3" height="8" rx="1"/>`;
// Mancuerna pequeña en un punto
const db = (x, y) =>
  `<rect x="${x - 3.5}" y="${y - 2.6}" width="2.2" height="5.2" rx="0.8"/>` +
  `<rect x="${x + 1.3}" y="${y - 2.6}" width="2.2" height="5.2" rx="0.8"/>` +
  `<line x1="${x - 2}" y1="${y}" x2="${x + 2}" y2="${y}" stroke-width="1.6"/>`;

export const ICONS = {
  // ============ PECHO ============
  // Press banca con barra: figura tumbada, barra arriba
  ex_press_banca_barra: () => S(`
    ${head(11, 30)}
    <path d="M14 30 h16" ${T}/>
    <path d="M30 30 l4 -6 M30 30 l4 6" ${L}/>
    ${barbell(30, 40, 20)}
    <path d="M30 30 l4 -10 M40 30 l-6 -10" ${L}/>
    <rect x="6" y="34" width="30" height="3" rx="1.5"/>`),

  // Press banca con mancuernas: tumbado, mancuernas arriba
  ex_press_banca_db: () => S(`
    ${head(11, 30)}
    <path d="M14 30 h16" ${T}/>
    <path d="M28 30 l5 -8 M32 30 l4 -8" ${L}/>
    ${db(34, 20)}
    <rect x="6" y="34" width="30" height="3" rx="1.5"/>`),

  // Press inclinado con barra: banco inclinado
  ex_incline_barra: () => S(`
    ${head(13, 32)}
    <path d="M16 31 l12 -6" ${T}/>
    <path d="M28 25 l5 -4 M28 25 l3 5" ${L}/>
    ${barbell(28, 40, 15)}
    <path d="M28 25 l3 -9 M40 25 l-9 -9" ${L}/>
    <line x1="8" y1="38" x2="30" y2="24" stroke-width="3"/>`),

  // Press inclinado con mancuernas
  ex_incline_db: () => S(`
    ${head(13, 32)}
    <path d="M16 31 l12 -6" ${T}/>
    <path d="M27 26 l6 -7 M31 27 l4 -8" ${L}/>
    ${db(34, 16)}
    <line x1="8" y1="38" x2="30" y2="24" stroke-width="3"/>`),

  // Aperturas con mancuernas: de pie, brazos abiertos
  ex_aperturas: () => S(`
    ${head(24, 12)}
    <path d="M24 16 v14" ${T}/>
    <path d="M24 20 l-9 3 M24 20 l9 3" ${L}/>
    ${db(13, 24)} ${db(35, 24)}
    <path d="M24 30 l-5 12 M24 30 l5 12" ${L}/>`),

  // Contractor de pecho (máquina peck deck): sentado, brazos al frente
  ex_peck_deck: () => S(`
    ${head(24, 13)}
    <path d="M24 17 v11" ${T}/>
    <path d="M24 20 l-8 4 M24 20 l8 4" ${L}/>
    <rect x="10" y="22" width="4" height="8" rx="1"/>
    <rect x="34" y="22" width="4" height="8" rx="1"/>
    <path d="M24 28 h-7 v10 M24 28 h7" ${L}/>
    <line x1="10" y1="40" x2="38" y2="40" stroke-width="3"/>`),

  // Cruce de poleas: de pie, cables desde arriba
  ex_cruce_poleas: () => S(`
    ${head(24, 14)}
    <path d="M24 18 v13" ${T}/>
    <path d="M24 21 l-8 5 M24 21 l8 5" ${L}/>
    <line x1="6" y1="6" x2="16" y2="26" stroke-width="1.6"/>
    <line x1="42" y1="6" x2="32" y2="26" stroke-width="1.6"/>
    <path d="M24 31 l-5 11 M24 31 l5 11" ${L}/>`),

  // Fondos en paralelas: cuerpo suspendido entre barras
  ex_fondos_paralelas: () => S(`
    ${head(24, 12)}
    <path d="M24 16 v13" ${T}/>
    <path d="M24 18 l-7 2 M24 18 l7 2" ${L}/>
    <line x1="10" y1="18" x2="10" y2="40" stroke-width="2.4"/>
    <line x1="38" y1="18" x2="38" y2="40" stroke-width="2.4"/>
    <line x1="6" y1="20" x2="16" y2="20" stroke-width="2.4"/>
    <line x1="32" y1="20" x2="42" y2="20" stroke-width="2.4"/>
    <path d="M24 29 l-3 9 M24 29 l3 9" ${L}/>`),

  // Press de pecho en máquina: sentado, empuje al frente
  ex_press_maquina: () => S(`
    ${head(16, 15)}
    <path d="M16 19 v10" ${T}/>
    <path d="M16 22 h12" ${L}/>
    <rect x="30" y="10" width="5" height="26" rx="2"/>
    <path d="M16 29 h-6 v9 M16 29 h6 v9" ${L}/>`),

  // ============ ESPALDA ============
  // Dominadas: colgado de barra
  ex_dominadas: () => S(`
    ${barbell(8, 40, 8)}
    ${head(24, 18)}
    <path d="M18 10 l6 4 M30 10 l-6 4" ${L}/>
    <path d="M24 21 v10" ${T}/>
    <path d="M24 31 l-4 10 M24 31 l4 10" ${L}/>`),

  // Jalón al pecho: sentado, tira de barra desde arriba
  ex_jalon: () => S(`
    ${barbell(12, 36, 10)}
    ${head(24, 20)}
    <path d="M18 12 l6 6 M30 12 l-6 6" ${L}/>
    <path d="M24 23 v8" ${T}/>
    <path d="M24 31 h-6 v7 M24 31 h6 v7" ${L}/>
    <line x1="12" y1="40" x2="36" y2="40" stroke-width="2.4"/>`),

  // Remo con barra: inclinado, tira barra hacia el torso
  ex_remo_barra: () => S(`
    ${head(12, 16)}
    <path d="M14 17 l16 6" ${T}/>
    <path d="M22 20 l4 8 M30 23 l-4 5" ${L}/>
    ${barbell(20, 32, 30)}
    <path d="M30 23 l2 12 M30 23 l-4 12" ${L}/>`),

  // Remo con mancuerna: apoyado en banco, un brazo
  ex_remo_db: () => S(`
    ${head(12, 18)}
    <path d="M15 19 h16" ${T}/>
    <path d="M31 19 l0 8" ${L}/>
    ${db(31, 29)}
    <line x1="8" y1="30" x2="20" y2="30" stroke-width="2.4"/>
    <path d="M20 19 l-2 11" ${L}/>`),

  // Remo en máquina: sentado, tira hacia atrás
  ex_remo_maquina: () => S(`
    ${head(16, 16)}
    <path d="M16 20 v9" ${T}/>
    <path d="M16 23 l12 2" ${L}/>
    <rect x="32" y="12" width="4" height="22" rx="1.5"/>
    <path d="M16 29 h10 v8" ${L}/>
    <line x1="10" y1="38" x2="30" y2="38" stroke-width="3"/>`),

  // Remo en polea baja: sentado, cable bajo
  ex_remo_polea: () => S(`
    ${head(15, 17)}
    <path d="M15 21 v8" ${T}/>
    <path d="M15 24 l14 4" ${L}/>
    <line x1="29" y1="28" x2="40" y2="36" stroke-width="1.6"/>
    <path d="M15 29 h11" ${L}/>
    <line x1="8" y1="38" x2="30" y2="38" stroke-width="3"/>`),

  // Peso muerto: bisagra de cadera con barra en el suelo
  ex_peso_muerto: () => S(`
    ${head(18, 12)}
    <path d="M18 15 l3 11" ${T}/>
    <path d="M21 20 l6 8" ${L}/>
    ${barbell(20, 34, 30)}
    <path d="M21 26 l-1 14 M21 26 l6 14" ${L}/>`),

  // Pull-over con mancuerna: tumbado, mancuerna tras la cabeza
  ex_pullover: () => S(`
    ${head(30, 30)}
    <path d="M27 30 h-14" ${T}/>
    <path d="M30 30 l-6 -8" ${L}/>
    ${db(22, 20)}
    <rect x="8" y="34" width="28" height="3" rx="1.5"/>`),

  // ============ HOMBRO ============
  // Press militar con barra: de pie, empuje sobre la cabeza
  ex_press_militar: () => S(`
    ${head(24, 22)}
    <path d="M24 26 v8" ${T}/>
    <path d="M24 27 l-6 -6 M24 27 l6 -6" ${L}/>
    ${barbell(14, 34, 12)}
    <path d="M24 34 l-5 8 M24 34 l5 8" ${L}/>`),

  // Press de hombro con mancuernas
  ex_press_hombro_db: () => S(`
    ${head(24, 22)}
    <path d="M24 26 v8" ${T}/>
    <path d="M24 27 l-6 -6 M24 27 l6 -6" ${L}/>
    ${db(18, 15)} ${db(30, 15)}
    <path d="M24 34 l-5 8 M24 34 l5 8" ${L}/>`),

  // Elevaciones laterales: brazos abiertos a los lados
  ex_elev_lateral: () => S(`
    ${head(24, 13)}
    <path d="M24 17 v13" ${T}/>
    <path d="M24 20 l-9 2 M24 20 l9 2" ${L}/>
    ${db(13, 22)} ${db(35, 22)}
    <path d="M24 30 l-5 12 M24 30 l5 12" ${L}/>`),

  // Elevaciones frontales: brazos al frente
  ex_elev_frontal: () => S(`
    ${head(16, 13)}
    <path d="M16 17 v13" ${T}/>
    <path d="M16 20 l12 -1" ${L}/>
    ${db(30, 19)}
    <path d="M16 30 l-3 12 M16 30 l4 12" ${L}/>`),

  // Pájaros (deltoide posterior): inclinado, brazos abiertos
  ex_pajaros: () => S(`
    ${head(12, 16)}
    <path d="M14 18 l14 4" ${T}/>
    <path d="M21 20 l-6 6 M21 20 l10 -2" ${L}/>
    ${db(13, 27)} ${db(33, 17)}
    <path d="M28 22 l2 13" ${L}/>`),

  // Press de hombro en máquina
  ex_press_hombro_maquina: () => S(`
    ${head(20, 18)}
    <path d="M20 22 v8" ${T}/>
    <path d="M20 23 l-5 -5 M20 23 l5 -5" ${L}/>
    <rect x="10" y="10" width="26" height="4" rx="2"/>
    <path d="M20 30 h-6 v8 M20 30 h6 v8" ${L}/>`),

  // Face pull en polea: tira hacia la cara
  ex_face_pull: () => S(`
    ${head(18, 18)}
    <path d="M18 22 v9" ${T}/>
    <path d="M18 21 l8 -2 M18 23 l8 1" ${L}/>
    <line x1="26" y1="19" x2="40" y2="10" stroke-width="1.6"/>
    <path d="M18 31 l-4 10 M18 31 l4 10" ${L}/>`),

  // ============ BÍCEPS ============
  // Curl con barra: de pie, flexión de codo con barra
  ex_curl_barra: () => S(`
    ${head(24, 12)}
    <path d="M24 16 v14" ${T}/>
    <path d="M24 22 l-6 2 l2 -6 M24 22 l6 2 l-2 -6" ${L}/>
    ${barbell(16, 32, 16)}
    <path d="M24 30 l-4 12 M24 30 l4 12" ${L}/>`),

  // Curl con mancuernas
  ex_curl_db: () => S(`
    ${head(24, 12)}
    <path d="M24 16 v14" ${T}/>
    <path d="M24 22 l-5 1 l1 -6 M24 22 l5 1 l-1 -6" ${L}/>
    ${db(18, 15)} ${db(30, 15)}
    <path d="M24 30 l-4 12 M24 30 l4 12" ${L}/>`),

  // Curl martillo: mancuernas verticales
  ex_curl_martillo: () => S(`
    ${head(24, 12)}
    <path d="M24 16 v14" ${T}/>
    <path d="M24 22 l-5 2 l0 -6 M24 22 l5 2 l0 -6" ${L}/>
    <rect x="17" y="12" width="4" height="6" rx="1"/>
    <rect x="27" y="12" width="4" height="6" rx="1"/>
    <path d="M24 30 l-4 12 M24 30 l4 12" ${L}/>`),

  // Curl en polea
  ex_curl_polea: () => S(`
    ${head(20, 13)}
    <path d="M20 17 v13" ${T}/>
    <path d="M20 22 l6 3 l-1 -6" ${L}/>
    <line x1="26" y1="19" x2="38" y2="38" stroke-width="1.6"/>
    <path d="M20 30 l-4 12 M20 30 l4 12" ${L}/>`),

  // Curl concentrado: sentado, un brazo apoyado
  ex_curl_concentrado: () => S(`
    ${head(18, 16)}
    <path d="M18 20 l4 8" ${T}/>
    <path d="M22 24 l6 3 l-1 -6" ${L}/>
    ${db(27, 21)}
    <path d="M18 28 h10" ${L}/>
    <line x1="10" y1="40" x2="30" y2="40" stroke-width="2.4"/>`),

  // Curl predicador en máquina
  ex_curl_predicador: () => S(`
    ${head(18, 15)}
    <path d="M18 19 v8" ${T}/>
    <path d="M18 21 l10 6" ${L}/>
    <path d="M14 24 l14 6" stroke-width="3.6" stroke-linecap="round" fill="none"/>
    ${db(29, 28)}
    <line x1="10" y1="40" x2="30" y2="40" stroke-width="2.4"/>`),

  // ============ TRÍCEPS ============
  // Extensión de tríceps en polea (pushdown)
  ex_tri_polea: () => S(`
    ${head(24, 13)}
    <path d="M24 17 v13" ${T}/>
    <path d="M24 21 l-3 8 M24 21 l3 8" ${L}/>
    <line x1="24" y1="6" x2="24" y2="20" stroke-width="1.6"/>
    <path d="M24 30 l-4 12 M24 30 l4 12" ${L}/>`),

  // Press francés con barra: tumbado, extensión sobre la frente
  ex_press_frances: () => S(`
    ${head(12, 30)}
    <path d="M15 30 h14" ${T}/>
    <path d="M29 30 l3 -8 l-4 -3" ${L}/>
    ${barbell(22, 34, 18)}
    <rect x="6" y="34" width="28" height="3" rx="1.5"/>`),

  // Extensión de tríceps con mancuerna (sobre la cabeza)
  ex_tri_db: () => S(`
    ${head(24, 14)}
    <path d="M24 18 v12" ${T}/>
    <path d="M24 20 l-3 -7 M24 20 l3 -7" ${L}/>
    ${db(24, 9)}
    <path d="M24 30 l-4 12 M24 30 l4 12" ${L}/>`),

  // Fondos en banco: apoyo tras la espalda
  ex_fondos_banco: () => S(`
    ${head(20, 16)}
    <path d="M20 20 l0 8" ${T}/>
    <path d="M20 21 l8 3" ${L}/>
    <line x1="28" y1="22" x2="28" y2="34" stroke-width="2.4"/>
    <line x1="24" y1="34" x2="40" y2="34" stroke-width="2.4"/>
    <path d="M20 28 l6 6" ${L}/>`),

  // Patada de tríceps: inclinado, extensión atrás
  ex_patada_tri: () => S(`
    ${head(12, 16)}
    <path d="M14 18 l12 4" ${T}/>
    <path d="M20 20 l4 4 l6 4" ${L}/>
    ${db(31, 29)}
    <path d="M26 22 l2 13" ${L}/>`),

  // ============ PIERNA ============
  // Sentadilla con barra: barra sobre hombros, cuclillas
  ex_sentadilla: () => S(`
    ${head(24, 12)}
    ${barbell(14, 34, 16)}
    <path d="M24 16 v10" ${T}/>
    <path d="M24 26 l-6 6 l0 8 M24 26 l6 6 l0 8" ${L}/>`),

  // Prensa de piernas: sentado empujando plataforma
  ex_prensa: () => S(`
    ${head(11, 26)}
    <path d="M14 26 h10" ${T}/>
    <path d="M24 26 l6 -6 l6 4" ${L}/>
    <rect x="34" y="10" width="5" height="18" rx="2"/>
    <line x1="6" y1="30" x2="24" y2="30" stroke-width="2.4"/>`),

  // Extensión de cuádriceps: sentado, pierna al frente
  ex_ext_cuadriceps: () => S(`
    ${head(16, 15)}
    <path d="M16 19 v8" ${T}/>
    <path d="M16 27 l10 0 l6 -4" ${L}/>
    <rect x="30" y="20" width="3" height="8" rx="1"/>
    <line x1="10" y1="27" x2="18" y2="27" stroke-width="2.4"/>
    <line x1="10" y1="27" x2="10" y2="40" stroke-width="2.4"/>`),

  // Curl femoral: tumbado boca abajo, flexión de rodilla
  ex_curl_femoral: () => S(`
    ${head(10, 22)}
    <path d="M13 22 h16" ${T}/>
    <path d="M29 22 l6 2 l-2 8" ${L}/>
    <rect x="31" y="30" width="8" height="3" rx="1.5"/>
    <rect x="6" y="25" width="30" height="3" rx="1.5"/>`),

  // Zancadas con mancuernas
  ex_zancadas: () => S(`
    ${head(22, 12)}
    <path d="M22 16 v10" ${T}/>
    <path d="M22 26 l-8 5 l0 8 M22 26 l7 8 l0 6" ${L}/>
    ${db(14, 22)} ${db(30, 22)}`),

  // Sentadilla búlgara: pie trasero elevado
  ex_bulgara: () => S(`
    ${head(20, 12)}
    <path d="M20 16 v10" ${T}/>
    <path d="M20 26 l-2 8 l0 6 M20 26 l8 4 l6 -2" ${L}/>
    <line x1="32" y1="36" x2="40" y2="36" stroke-width="2.4"/>
    ${db(12, 22)} ${db(28, 22)}`),

  // Peso muerto rumano: bisagra con piernas casi rectas
  ex_peso_muerto_rumano: () => S(`
    ${head(16, 12)}
    <path d="M16 15 l4 11" ${T}/>
    <path d="M20 20 l6 8" ${L}/>
    ${barbell(20, 32, 30)}
    <path d="M20 26 l0 14 M20 26 l6 14" ${L}/>`),

  // Elevación de gemelos: de puntillas
  ex_gemelos: () => S(`
    ${head(24, 12)}
    <path d="M24 16 v14" ${T}/>
    <path d="M24 20 l-5 3 M24 20 l5 3" ${L}/>
    <path d="M24 30 l-3 8 l-2 3 M24 30 l3 8 l2 3" ${L}/>
    <line x1="14" y1="42" x2="34" y2="42" stroke-width="2.4"/>`),

  // ============ GLÚTEO ============
  // Hip thrust: espalda apoyada, cadera arriba con barra
  ex_hip_thrust: () => S(`
    ${head(10, 24)}
    <path d="M13 24 l8 4 l6 -4" ${T}/>
    ${barbell(18, 30, 22)}
    <path d="M27 24 l6 2 l0 8" ${L}/>
    <line x1="6" y1="20" x2="14" y2="20" stroke-width="2.4"/>
    <line x1="30" y1="36" x2="38" y2="36" stroke-width="2.4"/>`),

  // Patada de glúteo en polea: a cuatro apoyos, pierna atrás
  ex_patada_gluteo: () => S(`
    ${head(12, 18)}
    <path d="M15 20 h12" ${T}/>
    <path d="M27 20 l6 6 l6 2" ${L}/>
    <path d="M15 20 l-2 8 M27 20 l0 8" ${L}/>
    <line x1="10" y1="30" x2="30" y2="30" stroke-width="2.4"/>`),

  // ============ CORE ============
  // Plancha: cuerpo recto en apoyo de antebrazos
  ex_plancha: () => S(`
    ${head(10, 24)}
    <path d="M13 25 l24 6" ${T}/>
    <path d="M13 26 l-2 8 M37 31 l2 8" ${L}/>
    <line x1="6" y1="40" x2="42" y2="40" stroke-width="2.4"/>`),

  // Crunch abdominal: tumbado, tronco elevado
  ex_crunch: () => S(`
    ${head(14, 24)}
    <path d="M16 26 l8 -2 l8 6" ${T}/>
    <path d="M14 27 l4 8 M32 30 l6 6 l0 4" ${L}/>
    <line x1="8" y1="40" x2="40" y2="40" stroke-width="2.4"/>`),

  // Elevación de piernas: colgado o tumbado, piernas arriba
  ex_elev_piernas: () => S(`
    ${head(12, 26)}
    <path d="M15 26 h12" ${T}/>
    <path d="M27 26 l6 -8 l4 -2" ${L}/>
    <line x1="8" y1="30" x2="30" y2="30" stroke-width="2.4"/>`),

  // Rueda abdominal (ab wheel)
  ex_rueda_ab: () => S(`
    ${head(14, 18)}
    <path d="M16 20 l6 6" ${T}/>
    <path d="M22 26 l8 6" ${L}/>
    <circle cx="34" cy="34" r="5" fill="none" stroke-width="3"/>
    <path d="M14 20 l-2 10" ${L}/>`),

  // Crunch en polea: arrodillado, tira de cuerda hacia abajo
  ex_crunch_polea: () => S(`
    ${head(20, 16)}
    <path d="M20 20 l2 8" ${T}/>
    <path d="M20 21 l4 -3" ${L}/>
    <line x1="24" y1="18" x2="30" y2="6" stroke-width="1.6"/>
    <path d="M22 28 l-4 6 M22 28 l6 4" ${L}/>
    <line x1="12" y1="36" x2="32" y2="36" stroke-width="2.4"/>`),

  // ============ ANTEBRAZO ============
  // Curl de muñeca: antebrazos apoyados, flexión de muñeca con barra
  ex_curl_muneca: () => S(`
    <path d="M10 30 h18" ${T}/>
    <path d="M28 30 l4 -3" ${L}/>
    ${barbell(28, 40, 22)}
    <line x1="6" y1="34" x2="30" y2="34" stroke-width="2.4"/>`),

  // ============ FALLBACK genérico ============
  bodyweight: () => S(`
    ${head(24, 12)}
    <path d="M24 16 v12" ${T}/>
    <path d="M24 19 l-7 4 M24 19 l7 4" ${L}/>
    <path d="M24 28 l-5 12 M24 28 l5 12" ${L}/>`),
};

/**
 * Devuelve el SVG de un icono por clave. Fallback a figura genérica.
 * @param {string} key
 * @returns {string} SVG
 */
export function icon(key) {
  const fn = ICONS[key] ?? ICONS.bodyweight;
  return fn();
}

export const ICON_KEYS = Object.keys(ICONS);
