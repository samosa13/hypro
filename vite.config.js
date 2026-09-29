import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Nota: el nombre visible de la PWA (Hypro) se define también en app.config.js
// (APP.name), pero el manifest necesita valores estáticos en build. Mantener
// ambos sincronizados si se cambia la marca.
export default defineConfig({
  // GitHub Pages sirve la app en https://samosa13.github.io/hypro/ (subdirectorio).
  // base '/hypro/' hace que todos los assets, manifest, SW e iconos resuelvan bien
  // bajo esa ruta. Para desarrollo local (npm run dev) Vite sirve en la raíz igual.
  base: '/hypro/',
  plugins: [
    VitePWA({
      // injectManifest: usamos un service worker propio (src/sw.js) para poder
      // manejar 'periodicsync' (backup + aviso motivador en segundo plano en
      // Android). El plugin inyecta la lista de precache en ese SW.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ttf}'],
      },
      manifest: {
        name: 'Hypro',
        short_name: 'Hypro',
        description: 'Tu libreta de gimnasio, con la inteligencia de saber cuánto progresas de verdad.',
        theme_color: '#ff6a00',
        background_color: '#0a0a0c',
        display: 'standalone',
        orientation: 'portrait',
        // Absolutos y explícitos: evita que start_url resuelva a la raíz del
        // origen (samosa13.github.io) y choque con otras apps (p.ej. VendIX).
        // Deben coincidir con la subruta de GitHub Pages (/hypro/).
        id: '/hypro/',
        start_url: '/hypro/',
        scope: '/hypro/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    globals: true,
  },
});
