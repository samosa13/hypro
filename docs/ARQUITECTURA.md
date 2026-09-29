# Arquitectura — Hypro

Versión 1.0 · Documento vivo. Se actualiza cuando cambian decisiones estructurales.

## 1. Objetivo y principios

Hypro nace como app **personal** de registro de entrenamiento, pero se diseña desde
el día 1 para poder convertirse en **producto vendible y multiusuario** sin reescribir.

Principios rectores:

1. **Offline-first.** El gimnasio suele tener mala cobertura. Todo funciona sin red.
2. **El "loop" es sagrado.** Mirar la última vez → decidir → registrar la serie debe
   costar segundos. Ninguna funcionalidad puede ralentizar eso.
3. **Separación estricta en capas.** La UI no sabe cómo se guardan los datos; el
   dominio no sabe si los datos están en local o en la nube. Cambiar la persistencia
   no debe tocar la lógica ni las pantallas.
4. **Coste cero hoy.** Sin backend, sin cuentas, sin servicios de pago. Todo en el móvil.
5. **Preparado para crecer.** El salto a multitenant/nube es cambiar UNA capa.
6. **Parametrización central.** Nombre de app, tema y colores viven en un único fichero.

## 2. Arquitectura por capas

```
┌─────────────────────────────────────────────────────────┐
│  CAPA UI  (src/ui/)                                       │
│  Pantallas y componentes. Vanilla JS. Solo presenta datos │
│  y captura interacciones. No contiene reglas de negocio.  │
└───────────────▲───────────────────────────────────────────┘
                │ llama a servicios de dominio
┌───────────────┴───────────────────────────────────────────┐
│  CAPA DOMINIO  (src/domain/)                               │
│  El "cerebro". Reglas de negocio puras y testeables:       │
│   · cálculo de semana efectiva y antigüedad total          │
│   · detección de récord personal (PR)                      │
│   · racha inteligente (respeta días de descanso)           │
│   · estadísticas y agregados para gráficas                 │
│  No importa nada de UI ni de IndexedDB. Recibe y devuelve  │
│  objetos planos. Es 100% testeable en aislamiento.         │
└───────────────▲───────────────────────────────────────────┘
                │ pide/guarda datos a través de una interfaz
┌───────────────┴───────────────────────────────────────────┐
│  CAPA DATOS  (src/data/)                                   │
│  Repositorios con una INTERFAZ única (contrato).           │
│   · Hoy:    LocalRepository  → IndexedDB (Dexie)           │
│   · Mañana: CloudRepository  → API REST / backend          │
│  El resto del código depende de la interfaz, no de la      │
│  implementación. Cambiar de local a nube = cambiar la      │
│  factoría que decide qué repositorio se inyecta.           │
└─────────────────────────────────────────────────────────────┘
```

### Por qué esto habilita la venta futura

- **Multitenant:** cada entidad de datos incluye `userId` (hoy fijo a un usuario
  local `"me"`; mañana el id real del usuario autenticado). El dominio ya opera
  "por usuario", así que soportar muchos usuarios no cambia la lógica.
- **Nube/sync:** el día que exista backend, se implementa `CloudRepository`
  cumpliendo el mismo contrato que `LocalRepository`. La UI y el dominio no se enteran.
- **Planes premium:** el modelo separa *plantilla de plan* de *ejecución*, así que
  distribuir/vender planes prediseñados es añadir plantillas, no tocar el motor.

## 3. Modelo de datos

Todas las entidades llevan `id` (uuid) y `userId` (multitenant-ready).

### `exercises` — catálogo de ejercicios

| Campo | Tipo | Notas |
|-------|------|-------|
| id | string | uuid |
| userId | string | `"me"` por ahora; permite ejercicios propios por usuario |
| name | string | "Press banca con barra" |
| muscleGroup | string | pecho, espalda, pierna, hombro, bíceps, tríceps, core... |
| equipment | string | máquina / mancuerna / barra / polea / peso corporal |
| icon | string | clave del icono SVG (patrón de movimiento) |
| isCustom | boolean | true si lo creó el usuario |
| createdAt | ISO date | |

### `plans` — planes de entrenamiento (plantilla)

| Campo | Tipo | Notas |
|-------|------|-------|
| id | string | uuid |
| userId | string | |
| name | string | "Mi rutina full body" |
| daysPerWeek | number | 1..7 |
| isActive | boolean | el plan que se está siguiendo |
| createdAt | ISO date | |

### `planDays` — días de un plan (nombre libre + orden)

| Campo | Tipo | Notas |
|-------|------|-------|
| id | string | uuid |
| planId | string | FK a plans |
| name | string | nombre libre: "Full Body", "Empuje"... |
| order | number | 1, 2, 3 (Día 1, Día 2, Día 3) |

### `planExercises` — ejercicios de un día (objetivos)

| Campo | Tipo | Notas |
|-------|------|-------|
| id | string | uuid |
| planDayId | string | FK a planDays |
| exerciseId | string | FK a exercises |
| order | number | orden de ejecución dentro del día |
| targetSets | number | nº series objetivo (por defecto 3, configurable) |
| targetReps | number | reps objetivo |
| targetWeight | number | peso objetivo (kg) |
| restSeconds | number | descanso objetivo (hereda del ajuste global si null) |

### `sessions` — una sesión de entrenamiento realizada

| Campo | Tipo | Notas |
|-------|------|-------|
| id | string | uuid |
| userId | string | |
| planId | string | plan seguido ese día |
| planDayId | string | día del plan realizado |
| effectiveWeek | number | nº de semana EFECTIVA del plan (ver §4) |
| dayNumber | number | 1..daysPerWeek dentro de esa semana |
| startedAt | ISO date | inicio real |
| finishedAt | ISO date | fin real (para calcular duración) |
| setCount | number | nº de series registradas. **Criterio de "sesión válida"**: solo cuenta como día entrenado si `setCount > 0`. Las sesiones "fantasma" (Empezar y salir) no cuentan y se descartan. |

> **Clave del "editar sin drama":** el historial de lo que hiciste vive en `sessions`
> y `loggedSets`, que **copian** los datos del ejercicio en el momento de hacerlo.
> Si mañana cambias el plan, tu historial pasado no se altera.

### `loggedSets` — cada serie registrada (el corazón del tracking)

| Campo | Tipo | Notas |
|-------|------|-------|
| id | string | uuid |
| sessionId | string | FK a sessions |
| exerciseId | string | FK a exercises (para agregados por ejercicio) |
| exerciseName | string | copia del nombre (histórico inmutable) |
| setNumber | number | 1, 2, 3... |
| weight | number | kg levantados |
| reps | number | repeticiones hechas |
| restTakenSeconds | number | descanso REAL antes de esta serie (para gráfica de descansos) |
| userId | string | dueño de la serie (v2: indexado, multitenant + conteo eficiente) |
| loggedAt | ISO date | fecha/hora exacta (fechas en todo, como pediste) |
| isPR | boolean | true si al registrarla batió récord |

### `personalRecords` — récord por ejercicio (denormalizado para lectura rápida)

| Campo | Tipo | Notas |
|-------|------|-------|
| id | string | uuid |
| userId | string | |
| exerciseId | string | |
| bestWeight | number | mejor peso |
| repsAtBest | number | reps en ese mejor peso |
| estimated1RM | number | 1RM estimado (fórmula Epley) para comparar objetivamente |
| achievedAt | ISO date | **fecha del récord** (para "PR del 14 sep") |

### `settings` — ajustes del usuario

| Campo | Tipo | Notas |
|-------|------|-------|
| userId | string | clave |
| defaultSets | number | series por defecto (3) |
| defaultRestSeconds | number | descanso por defecto |
| soundEnabled | boolean | bip del timer |
| beepLeadSeconds | number | segundos antes de fin para avisar (10) |
| trainsAtNight | boolean | true → frase motivadora por la mañana |
| inactivityThresholdDays | number | días sin entrenar para el aviso motivador |
| gymStartDate | ISO date | inicio de antigüedad total en el gym |
| planStartDate | ISO date | inicio de la semana efectiva 01 del plan activo |

### `backups` — copias de seguridad locales

| Campo | Tipo | Notas |
|-------|------|-------|
| id | string | uuid |
| userId | string | |
| createdAt | ISO date | |
| dateKey | string | "AAAA-MM-DD" para saber si hoy ya hay backup |
| payload | JSON | volcado completo de todas las tablas |

## 4. Concepto diferenciador: tiempo REAL de entrenamiento

Dos métricas independientes, calculadas en la capa de dominio:

- **Semana efectiva del plan.** No avanza por calendario. La "Semana 01" empieza con
  `planStartDate`. La semana `N` se considera completa cuando se han realizado los
  `daysPerWeek` días de esa semana. Si faltas un mes, no saltas semanas: retomas el
  día pendiente de tu semana actual. Cabecera de la pantalla de entrenar:
  `Semana 07 · Día 2 de 3`.
- **Antigüedad total en el gym.** Desde `gymStartDate`: "5 meses y 3 días, 47 sesiones,
  312 series, 18 PRs". Es tu historia global, sobreviva al plan que sea.

Esto da la visibilidad que pediste: *"llevo 3 semanas reales con este plan, pero 5
meses en el gym"*.

## 5. Racha inteligente

La racha mide constancia **respetando los días de descanso planificados**. No se
rompe por descansar cuando el plan dice descansar. Se rompe cuando dejas pasar más
días de los que tu plan contempla sin registrar actividad. (Regla exacta en
`docs/REQUISITOS.md`.)

## 6. Notificaciones (límites honestos sin backend)

- **Garantizado (sin coste):** al abrir la app se evalúa la hora y la inactividad.
  Por la mañana → frase motivadora del día. Si superas el umbral de días sin
  registrar → mensaje motivador.
- **Bonus (Android, no garantizado):** `Periodic Background Sync` + notificaciones
  locales intentan disparar avisos en segundo plano cuando el sistema lo permite.
- **Futuro (con backend):** Web Push real → notificaciones 100% fiables a hora fija.
  La capa de notificaciones está aislada para enchufar push sin tocar el resto.

## 7. Backup

- Diario. Objetivo 00:01; realidad sin backend: **al abrir la app**, si no hay backup
  con el `dateKey` de hoy, se genera. En Android se intenta además en segundo plano.
- Exportable/importable a fichero JSON (los datos son del usuario y portables).
- **Import seguro:** `importAll` valida el fichero (app, `dataVersion`, forma de los
  arrays) ANTES de tocar la base; rechaza backups ajenos o de versión incompatible; y
  crea un backup automático del estado actual antes de reemplazar. Nunca destruye datos
  si el fichero no es válido.

## 7.1 Versionado del esquema

El esquema de IndexedDB está versionado con Dexie (`APP.dataVersion`). La v2 (peer review)
añadió `userId` indexado en `loggedSets` y `setCount` en `sessions`, con una migración
**no destructiva** (`db.version(2).upgrade(...)`) que rellena ambos campos en los datos ya
guardados. Regla: cualquier cambio de esquema sube la versión y migra sin perder datos.

## 8. Empaquetado y despliegue

- **Hoy:** PWA instalable (Add to Home Screen) servida como sitio estático.
- **Mañana (Google Play):** envolver la PWA como TWA con Bubblewrap → APK/AAB.
  No requiere reescribir: es la misma PWA empaquetada.
- **iOS futuro:** la misma base PWA; ciertas capacidades (push, background) siguen
  las reglas de Safari, se adaptan en la capa de notificaciones.

## 8.1 Navegación y flujo de retorno

La app es una SPA sin router de historial completo. Para que el **botón/gesto "atrás"
de Android** funcione (cerrar overlay/sub-pantalla en vez de salir de la app), hay una
capa mínima sobre la History API en `src/ui/nav.js`:
- `initNav()` escucha `popstate` y, si hay capas abiertas, cierra la de arriba.
- Cada sub-pantalla (nuevo plan, editar día, nuevo ejercicio) y cada overlay (descanso,
  confirmación) hace `pushLayer(closeFn)` al abrirse y `popLayer()` al cerrarse por botón.
- Orden del "atrás": overlay → sub-pantalla → tab → (salir de la app).
- Cambiar de tab (`navigate`) hace `clearLayers()` (reset de contexto).

**Retorno al punto de origen:** editar un día vuelve al Plan haciendo scroll a la tarjeta
de ese día (`renderPlan(root, app, {scrollToDayId})`); los filtros de Ejercicios persisten
a nivel de módulo entre renders. Acciones destructivas (crear plan nuevo que reemplaza el
activo, quitar ejercicio de un día) piden `confirmDialog`.

## 8.2 Tema visual (v2)

Tipografía: **Barlow Condensed** (display: títulos, números, timer) + **Inter** (cuerpo),
self-hosted en `public/fonts/` (offline-first, sin llamadas externas). Profundidad con
degradados sutiles en tarjetas + sombras + glow radial de fondo. Nav inferior con "pill"
activa. Rest timer con anillo circular SVG que se vacía. Todo el color sigue viniendo de
`THEME` en `app.config.js` (variables CSS); nada hardcodeado.

## 8.3 Internacionalización (i18n)

Español por defecto, preparado para vender en más idiomas sin tocar pantallas.
- `src/i18n/index.js`: `t(clave, params)` con fallback (idioma actual → español →
  la propia clave), `setLocale`, `getLocale`, `resolveInitialLocale` (preferencia
  guardada → idioma del navegador → default, todo filtrado por `supportedLocales`).
- `src/i18n/es.js`: diccionario español, **fuente de verdad de las claves**.
- Config en `app.config.js`: `defaultLocale: 'es'`, `supportedLocales: ['es']`.
- Todas las pantallas usan `t('clave')`. Añadir un idioma = crear `en.js`,
  registrarlo en `index.js` y añadir `'en'` a `supportedLocales`. El selector de
  idioma está en Ajustes y persiste en `settings.locale`.
- **Pendiente i18n fase 2** (queda en español hasta que entre un 2º idioma):
  frases motivadoras (`motivation.js`), texto del coach de progresión
  (`progression.js`), nombres de ejercicios semilla (`seedExercises.js`, son datos
  editables → decisión de modelo), y literales sueltos ("Cargando…", unidades
  kg/reps, nombres por defecto de plan/día).

## 8.4 iOS / iPhone (preparado para Fase 3)

La misma PWA corre en Safari iOS. Ya configurado en `index.html`:
`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`,
`apple-mobile-web-app-title` y `apple-touch-icon` (192/512, rutas `/hypro/icons/`
correctas en producción; 404 solo en `npm run dev`). Instalación en iOS: Safari →
Compartir → "Añadir a pantalla de inicio". Capacidades que degradan en iOS y que el
código ya maneja best-effort: Web Push, Periodic Background Sync, matices de Web Audio.

## 9. Estructura de carpetas

```
gym/
├─ docs/                 # esta documentación
├─ public/               # manifest, iconos, service worker base
├─ src/
│  ├─ config/            # app.config.js (nombre, tema, colores) — PARAMETRIZACIÓN
│  ├─ ui/                # pantallas y componentes
│  ├─ domain/            # reglas de negocio puras (testeables)
│  ├─ data/              # repositorios (LocalRepository, contrato/interfaz)
│  └─ main.js            # arranque
├─ test/                 # tests de dominio y datos
├─ index.html
├─ package.json
└─ vite.config.js
```
