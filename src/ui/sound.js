/**
 * UI · Sonido del temporizador (Web Audio API)
 * Bip fiable en móvil (RF-24). Se activa con la primera interacción del usuario.
 */

let ctx = null;

/** Inicializa/reanuda el AudioContext (debe llamarse tras un gesto del usuario). */
export function initAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/**
 * Emite un bip.
 * @param {object} opts { freq, durationMs, type }
 */
export function beep({ freq = 880, durationMs = 150, type = 'sine' } = {}) {
  const audio = initAudio();
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.3, audio.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + durationMs / 1000);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + durationMs / 1000);
}

/** Doble bip de aviso (faltan N segundos). */
export function beepWarning() {
  beep({ freq: 660, durationMs: 120 });
  setTimeout(() => beep({ freq: 660, durationMs: 120 }), 180);
}

/** Bip largo de fin de descanso. */
export function beepEnd() {
  beep({ freq: 990, durationMs: 400, type: 'square' });
}

/** Sonido de celebración de récord (arpegio ascendente). */
export function beepPR() {
  [660, 880, 1175].forEach((f, i) =>
    setTimeout(() => beep({ freq: f, durationMs: 180 }), i * 130)
  );
}

/** Vibración (si el dispositivo lo soporta). */
export function vibrate(pattern = 200) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}
