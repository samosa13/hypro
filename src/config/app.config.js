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
  // Versión del esquema de datos (para migraciones futuras)
  dataVersion: 1,
  // Usuario local por defecto (multitenant-ready: mañana será el id real)
  defaultUserId: 'me',
};

/**
 * TEMA VISUAL — naranja sobre negro.
 * Paleta pensada para el gimnasio: fondo oscuro (menos reflejos), acento
 * naranja eléctrico, números legibles sudando.
 */
export const THEME = {
  colors: {
    // Fondos
    bg: '#0a0a0c',           // negro casi puro
    surface: '#15151a',      // tarjetas
    surfaceAlt: '#1e1e26',   // tarjetas alternas / inputs
    border: '#2a2a34',

    // Acento (naranja eléctrico)
    accent: '#ff6a00',
    accentSoft: '#ff8c3a',
    accentGlow: 'rgba(255, 106, 0, 0.35)',

    // Texto
    text: '#f5f5f7',
    textMuted: '#a0a0aa',
    textFaint: '#6a6a75',

    // Estados
    success: '#31d158',      // PR / progreso
    warning: '#ffd60a',      // estancamiento
    danger: '#ff453a',       // racha rota / faltas

    // Récord (celebración)
    pr: '#ffd60a',
  },
  radius: '16px',
  radiusSmall: '10px',
  font: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
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
}
