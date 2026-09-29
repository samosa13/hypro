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

- **Fase 1 (MVP, "libreta digital")** — en construcción.
- Fase 2 (inteligencia: semanas efectivas, progreso, rachas) — planificada.
- Fase 3 (producto: múltiples planes, multitenant, Google Play) — planificada.

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
npm run dev      # desarrollo
npm run build    # producción (genera dist/ instalable como PWA)
```
