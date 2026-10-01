/**
 * CONFIGURACIÓN CENTRAL DE LA APP
 * ================================
 * Todo lo "marca" (nombre, colores, tema) vive AQUÍ y solo aquí.
 * Cambiar el nombre o los colores de la app no debe tocar ningún otro fichero.
 *
 * Los colores se inyectan como variables CSS en :root al arrancar
 * (ver applyTheme más abajo), así que el CSS usa var(--color-...) y nunca
 * valores hardcodeados.
 */

export const APP = {
  // --- Identidad (cámbialo aquí y se propaga a toda la app) ---
  name: 'Hypro',
  tagline: 'Tu progreso, en serio',
  // Logo por sílabas: la primera parte va en texto normal, la segunda en acento.
  // Cambiar el nombre => ajustar aquí el corte de sílaba (índice donde empieza
  // la segunda sílaba). Para "Hypro" => "Hy" + "pro".
  logoSplitIndex: 2,
  // Versión del esquema de datos (para migraciones futuras).
  // v2: userId indexado en loggedSets + setCount en sessions (peer review).
  dataVersion: 2,
  // Usuario local por defecto (multitenant-ready: mañana será el id real)
  defaultUserId: 'me',
  // Internacionalización (i18n). Español por defecto. Para vender en más
  // idiomas: añadir el código aquí + su diccionario en src/i18n/. La app ya
  // usa t('clave') en todo, así que no hay que tocar pantallas.
  defaultLocale: 'es',
  supportedLocales: ['es'], // añadir 'en', etc. cuando existan sus diccionarios
  version: '0.1.0',
};

/**
 * TEMA VISUAL — naranja sobre negro.
 * Paleta pensada para el gimnasio: fondo oscuro (menos reflejos), acento
 * naranja eléctrico, números legibles sudando.
 */
export const THEME = {
  colors: {
    // Fondos (con más escalones para dar profundidad en v2)
    bg: '#08080a',           // negro casi puro (fondo base)
    bgElevated: '#101014',   // zona elevada sutil
    surface: '#16161c',      // tarjetas
    surfaceAlt: '#20202a',   // tarjetas alternas / inputs
    surfaceHi: '#2a2a36',    // hover / borde-luz superior
    border: '#2c2c38',
    borderSoft: '#22222c',

    // Acento (naranja eléctrico)
    accent: '#ff6a00',
    accentSoft: '#ff8c3a',
    accentDeep: '#e85d00',
    accentGlow: 'rgba(255, 106, 0, 0.35)',
    accentDim: 'rgba(255, 106, 0, 0.12)', // fondos tenues (pill activa, éxito suave)

    // Texto
    text: '#f6f6f8',
    textMuted: '#9a9aa6',
    textFaint: '#63636f',

    // Estados
    success: '#31d158',      // PR / progreso
    successDim: 'rgba(49, 209, 88, 0.14)',
    warning: '#ffd60a',      // estancamiento
    danger: '#ff453a',       // racha rota / faltas

    // Récord (celebración)
    pr: '#ffd60a',
  },
  radius: '18px',
  radiusSmall: '12px',
  // Display = tipografía condensada deportiva (números/títulos). Body = Inter.
  font: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
  fontDisplay: "'Barlow Condensed', 'Inter', system-ui, sans-serif",
};

/**
 * Ajustes por defecto de un usuario nuevo.
 * Se copian a la tabla `settings` la primera vez.
 */
export const DEFAULT_SETTINGS = {
  defaultSets: 3,
  defaultRestSeconds: 90,
  soundEnabled: true,
  beepLeadSeconds: 10,       // bip a falta de 10s
  trainsAtNight: true,       // el usuario entrena de noche
  inactivityThresholdDays: 4,
  unit: 'kg',                // unidad de PESO de presentación (kg|lb); se guarda siempre en kg (B11)
  weeklyVolumeTarget: 12,    // objetivo de series/semana por grupo muscular (C13); semáforo contra este valor
  secondsPerSet: 40,         // tiempo estimado de EJECUCIÓN de una serie de peso/reps (para estimar duración de la sesión, punto 2). Las de tiempo usan su targetDurationSeconds.
  // gymStartDate y planStartDate se fijan al usar la app la primera vez
};

/**
 * Inyecta la paleta THEME como variables CSS en :root.
 * Llamar una vez al arrancar (main.js). El CSS solo usa var(--color-*).
 */
export function applyTheme(theme = THEME) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.colors)) {
    // camelCase -> kebab-case: surfaceAlt -> --color-surface-alt
    const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    root.style.setProperty(`--color-${cssKey}`, value);
  }
  root.style.setProperty('--radius', theme.radius);
  root.style.setProperty('--radius-small', theme.radiusSmall);
  root.style.setProperty('--font', theme.font);
  root.style.setProperty('--font-display', theme.fontDisplay);
}
