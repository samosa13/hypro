# Hypro — App de entrenamiento (hipertrofia)

PWA offline-first para llevar el registro de entrenamientos de fuerza/hipertrofia.
Pensada primero para uso personal, con una arquitectura preparada para escalar a
producto multiusuario (multitenant) y venderse en el futuro.

> **Hypro** (Hy·pro, de *hypertrophy* + *pro*). El nombre está parametrizado en un
> único sitio (`src/config/app.config.js`), así que cambiarlo no toca el resto del código.

## Idea en una frase

Tan rápido como tu libreta del gimnasio, con la inteligencia de saber cuánto has
progresado **de verdad** (semanas efectivas de entrenamiento, no de calendario).

## Estado

- **Fase 1 (MVP, "libreta digital")** — COMPLETA, verificada y endurecida.
- **Fase 2 (inteligencia: semanas efectivas, progreso, rachas, estancamiento)** — COMPLETA.
- Peer review completa aplicada (14 hallazgos resueltos) + 34 tests verdes.
- **En producción:** https://samosa13.github.io/hypro/ (deploy automático por push a `main`).
- Fase 3 (producto: múltiples planes, multitenant, Google Play) — planificada (ver steering `#hypro-contexto`).

Ver el detalle en `docs/REQUISITOS.md` y `docs/ARQUITECTURA.md`.

## Documentación

| Documento | Contenido |
|-----------|-----------|
| `docs/ARQUITECTURA.md` | Arquitectura por capas, modelo de datos, camino a multitenant/nube. |
| `docs/REQUISITOS.md` | Requisitos funcionales y no funcionales, por fases. |
| `docs/PLAN_TESTS.md` | Estrategia y casos de test. |
| `docs/PLAN_UAT.md` | Pruebas de aceptación de usuario. |
| `docs/MANUAL_USUARIO.md` | Cómo instalar y usar la app. |

## Stack

- Vanilla JS + Vite (UI ligera, arranque instantáneo)
- IndexedDB vía Dexie (base de datos local, offline-first)
- Service Worker + Web App Manifest (instalable en Android, funciona sin internet)
- Web Audio API (bip del temporizador de descanso)
- Canvas/SVG propio para gráficas (sin librerías pesadas)

## Cómo ejecutar (cuando esté el código)

```bash
cd gym
npm install
npm run dev      # desarrollo (localhost:PORT/hypro/)
npm run build    # producción (genera dist/ instalable como PWA)

# tests (npm run test puede dar exit -1 según el entorno):
node node_modules/vitest/vitest.mjs run
```
