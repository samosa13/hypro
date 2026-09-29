# Navegación y flujo de retorno en Hypro

Revisión centrada exclusivamente en navegación y retorno (de dónde parto → a dónde voy → a dónde vuelvo) en las cinco pantallas y sus sub-flujos. Hypro es una SPA sin router de historial: `main.js` mantiene una variable `current` y las sub-pantallas (nuevo plan, editar día, nuevo ejercicio) se pintan escribiendo directamente sobre `root` sin pasar por `navigate()`. Ese patrón es la raíz de casi todos los hallazgos: como el "retorno" se codifica a mano en cada botón llamando a `renderX(root, app)`, cualquier contexto (día editado, filtros, scroll, sesión activa) que no se pase explícitamente se pierde, y el back/gesto de Android no está contemplado en absoluto.

Watch for:
- **Back de Android sale de la app en vez de volver atrás** en cualquier sub-pantalla o modal (confirmed). No hay `history`/`popstate` en todo `src/`.
- **"Nuevo" plan pisa el plan activo sin confirmación** y sin volver a un punto claro (confirmed, destructivo).
- **Borrar ejercicio de un día con ✕ no pide confirmación** (confirmed, destructivo).
- **Crear ejercicio propio desde "editar día" escupe a la lista de Ejercicios**, no vuelve al día que se estaba montando (confirmed, pérdida de contexto).
- **Overlay de descanso al terminar/volver a Entrenar por gesto queda huérfano** en algunos caminos (likely).

**Verdict**: NEEDS_CHANGES

## High-level view

La navegación principal por tabs (`navigate()` en `main.js`) es coherente: cancela el timer de descanso, repinta el chrome, resetea scroll. El problema no está en las tabs sino en la **navegación de segundo nivel**, que no existe como concepto: editar un día, crear un plan o crear un ejercicio son pantallas completas pintadas sobre `root` que no actualizan `current` ni el estado del chrome, así que la app "cree" que sigues en la tab de origen mientras ves otra cosa. El retorno de esas sub-pantallas está cableado a mano botón por botón.

El retorno a nivel de registro (volver al día concreto, al ejercicio concreto, al scroll) no se preserva en ningún flujo. Editar un día y pulsar "Hecho" te devuelve a la lista de Plan reconstruida desde arriba; crear un ejercicio propio te lleva a Ejercicios aunque vinieras de montar un día; los filtros de Ejercicios se reinician cada vez que se re-renderiza la pantalla. En todos estos casos el usuario acaba en la pantalla correcta pero no en el punto de origen.

Hay dos acciones destructivas sin red de seguridad: "Nuevo" en Plan crea y activa un plan nuevo pisando el activo sin preguntar, y el ✕ de un ejercicio del día lo borra al instante. Ninguna es reversible desde la UI.

El back físico/gesto de Android no está manejado en ningún sitio. En una PWA instalada, eso significa que el gesto de volver cierra la app en lugar de cerrar el modal de descanso, cancelar una edición o volver de una sub-pantalla — el reflejo de navegación más básico en Android.

Los overlays (descanso, celebración PR) se anclan a `document.body`, no a la pantalla, y su ciclo de vida depende de que se llame a `cancelRestTimer()`. Los caminos por botón lo hacen bien; los caminos por gesto o por cierre inesperado no.

<details>
<summary>Issues (9)</summary>

1. **Back/gesto de Android no contemplado** — no hay `history.pushState`/`popstate` en `src/`; el gesto de volver cierra la PWA en vez de cerrar modal o sub-pantalla. Introducir una pila de navegación mínima basada en History API.
2. **"Nuevo" plan destructivo sin confirmar** (`planScreen.js` → `openNewPlan`) — crea y activa plan nuevo pisando el activo sin diálogo. Añadir confirmación explícita antes de `setActivePlan`.
3. **Borrar ejercicio del día sin confirmar** (`planScreen.js` → `paintExercises`, botón ✕) — `deletePlanExercise` inmediato. Pedir confirmación o ofrecer deshacer.
4. **Crear ejercicio propio pierde el contexto de origen** (`exercisesScreen.js` → `openNewExercise`) — al guardar/cancelar siempre va a `renderExercises`, aunque se llegara desde "editar día". Pasar un `onDone`/retorno para volver al día.
5. **"Hecho"/"Cancelar" en editar día vuelven a Plan sin posición** (`planScreen.js` → `openEditDay`) — `renderPlan` repinta desde arriba; se pierde scroll y el día que se editaba. Preservar ancla/scroll al día.
6. **Filtros de Ejercicios se reinician** (`exercisesScreen.js`) — `state` es local a cada `renderExercises`; volver a la pantalla pierde músculo/equipo/búsqueda. Persistir el filtro fuera del render.
7. **Sub-pantallas no actualizan `current` ni chrome** (`planScreen.js`, `exercisesScreen.js`) — el tab activo señala una pantalla que no se está viendo; pulsar el mismo tab no "vuelve", re-renderiza. Encaminar sub-pantallas por un mecanismo que conserve estado de chrome.
8. **Overlay de descanso puede quedar huérfano** (`trainScreen.js` → `startRestTimer`) — anclado a `document.body`; solo se limpia vía `cancelRestTimer()`. Los caminos por gesto/cierre no garantizan la limpieza. Anclar a la pantalla o limpiar en un único punto de salida.
9. **Inconsistencia de "volver" entre pantallas** — Plan/Ejercicios tienen botón explícito (Hecho/Cancelar), Progreso/Ajustes no tienen sub-pantallas, Entrenar usa "Salir sin guardar". No hay un patrón único ni affordance de retorno homogéneo.

</details>

<details>
<summary>Details</summary>

## Ausencia total de integración con el historial (back/gesto Android)

En toda la carpeta `src/` no hay una sola referencia a `history.pushState`, `popstate`, `hashchange` ni `location`. La navegación es puramente en memoria: `main.js` guarda `let current = 'train'` y `navigate(tabId)` reescribe `root`. Las sub-pantallas ni siquiera tocan `current`.

Consecuencia en una PWA instalada en Android (que es el target declarado del proyecto): el gesto de "volver" del sistema no tiene nada que interceptar, así que el sistema aplica su comportamiento por defecto — minimizar o cerrar la app. El usuario que está en el overlay de descanso, o editando un día, o en "Nuevo ejercicio", y hace el gesto natural de "atrás", no cierra el modal ni cancela la edición: se sale de Hypro. Este es el hallazgo de mayor impacto porque afecta a todos los sub-flujos a la vez y rompe el reflejo de navegación más básico de la plataforma.

Sugerencia concreta: introducir una pila de navegación mínima sobre la History API. Cada apertura de sub-pantalla/overlay hace `history.pushState({view})`, y un único listener de `popstate` decide qué cerrar (primero overlays, luego sub-pantallas, luego tabs). Con eso el gesto atrás cierra el descanso → cierra el modal → vuelve a la tab, en ese orden, antes de considerar salir de la app.

## "Nuevo" plan: destructivo, sin confirmación y con retorno ambiguo

`planScreen.js` → `openNewPlan`. El botón "Nuevo" (visible en la cabecera cuando ya hay plan activo) lleva a un formulario que al pulsar "Crear plan" hace:

```js
const plan = await app.repo.savePlan({ ..., isActive: true }, app.userId);
await app.repo.setActivePlan(plan.id, app.userId);
```

De dónde parto: Plan, con un plan activo que puede tener días y ejercicios montados. A dónde voy: formulario de nuevo plan. A dónde vuelvo: `renderPlan`, que ahora muestra el plan nuevo vacío. El plan anterior deja de ser el activo sin que en ningún momento se pregunte "esto reemplaza tu plan actual, ¿seguro?". No es un borrado físico (el plan viejo sigue en base de datos), pero desde la UI el usuario no tiene forma de recuperarlo: no hay lista de planes ni forma de reactivar el anterior. Efectivamente es destructivo a ojos del usuario. ("Cancelar" sí vuelve limpio sin crear nada.)

Sugerencia: antes de `setActivePlan`, si ya existe un plan activo, pedir confirmación explícita ("Crear un plan nuevo reemplazará tu plan activo. ¿Continuar?"). Idealmente, además, no perder el acceso al plan anterior.

## Borrar ejercicio del día con ✕: sin confirmación

`planScreen.js` → `openEditDay` → `paintExercises`. Cada ejercicio del día tiene:

```js
h('button', { class: 'btn btn-danger btn-sm', onClick: async () => {
  await app.repo.deletePlanExercise(pe.id); paintExercises();
} }, '✕'),
```

El borrado es inmediato, sin diálogo ni "deshacer". El retorno sí es correcto (repinta solo `exWrap` vía `paintExercises` y mantiene la pantalla de edición del día, no escupe fuera), pero la acción destructiva no tiene red de seguridad. En una pantalla táctil con botones pequeños, un toque accidental en ✕ borra la configuración de series/reps/peso/descanso de ese ejercicio sin vuelta atrás.

Sugerencia: confirmación ligera antes de borrar, o borrado optimista con toast "Ejercicio quitado · Deshacer" durante unos segundos.

## Crear ejercicio propio desde "editar día": se pierde el contexto de origen

Éste es el caso de "retorno al punto de origen" más claro que pide el criterio estricto. Hay dos rutas para llegar a "Nuevo ejercicio":

`exercisesScreen.js` → `openNewExercise(app, paint)`. Al guardar o cancelar hace siempre `renderExercises(root, app)`:

```js
onClick: async () => { ...; renderExercises(root, app); }   // Guardar
onClick: () => renderExercises(root, app)                    // Cancelar
```

Hoy sólo se invoca desde la propia pantalla de Ejercicios, así que ese retorno es coherente. Pero el flujo natural que describe el criterio —estar montando un día en Plan, darte cuenta de que falta un ejercicio, crearlo y volver al día— no está soportado: `openEditDay` sólo ofrece un `<select>` con los ejercicios existentes, sin atajo "crear uno nuevo". Si se añadiera ese atajo (que es lo lógico), tal como está `openNewExercise` te dejaría escupido en la lista de Ejercicios, no de vuelta en el día que estabas construyendo, y encima habrías perdido lo que llevaras escrito en el formulario de "añadir ejercicio al día".

Sugerencia: parametrizar `openNewExercise` con un callback de retorno (`onCreated`/`onDone`) en vez de asumir `renderExercises`. Desde Ejercicios, el retorno sería `renderExercises`; desde editar día, el retorno sería `openEditDay(root, app, plan, day)` con el ejercicio recién creado ya preseleccionado en el picker.

## "Hecho" y "Cancelar" en editar día: vuelven a Plan pero no al día

`planScreen.js` → `openEditDay`. El botón "Hecho" hace `renderPlan(root, app)`. También el "Guardar nombre" del día se queda en la propia pantalla (bien), pero al salir con "Hecho":

De dónde parto: la tarjeta del "Día N" dentro de la lista de Plan (que puede estar más abajo si hay varios días). A dónde voy: editor del día. A dónde vuelvo: `renderPlan` reconstruido desde arriba, con `window.scroll` intacto sólo por casualidad (nadie lo resetea aquí, pero el DOM se recrea entero, así que la posición relativa al día editado se pierde en la práctica). El usuario que editaba el "Día 3" de un plan de 5 días vuelve al principio de la lista y tiene que buscar de nuevo dónde estaba.

Además no hay un botón "Cancelar" en el editor de día equivalente al de otros formularios: sólo "Hecho". Como los cambios de ejercicios se guardan al vuelo (añadir/borrar impactan ya en base de datos), "Hecho" y un hipotético "Cancelar" harían lo mismo, pero la ausencia de un affordance de salida explícito distinto de "Hecho" es inconsistente con `openNewPlan`/`openNewExercise`, que sí tienen "Cancelar".

Sugerencia: al volver de `openEditDay`, hacer scroll/anclar a la tarjeta del día editado (por `day.id`) en vez de repintar desde arriba sin más.

## Filtros de Ejercicios: estado local que se reinicia en cada render

`exercisesScreen.js`. El estado de filtros vive dentro de la función de render:

```js
export async function renderExercises(root, app) {
  ...
  const state = { muscle: '', equipment: '', q: '' };
```

Cada vez que se re-renderiza la pantalla (al volver de crear un ejercicio, al cambiar de tab y regresar, o tras importar datos) `state` se crea de cero. El usuario que filtró por "Pecho / Mancuerna" y buscó "press", crea un ejercicio propio, y al volver encuentra la lista sin filtros y con el scroll arriba. Es pérdida de contexto de registro: no vuelve al subconjunto que estaba mirando.

Sugerencia: elevar el estado de filtros fuera del render (módulo o `app`-scoped) de modo que persista mientras la sesión de la app siga viva, y re-aplicar `search.value`/`select.value` al pintar.

## Sub-pantallas que no actualizan el chrome ni `current`

`openNewPlan`, `openEditDay` (planScreen) y `openNewExercise` (exercisesScreen) pintan sobre `root` sin llamar a `navigate()` ni actualizar `current`. Efectos de navegación:

- La tabbar sigue resaltando la tab de origen mientras se ve una pantalla distinta, lo cual está bien visualmente pero significa que **pulsar la misma tab no "cancela y vuelve"**, sino que dispara `navigate()` y re-renderiza la pantalla base — un camino de escape no intencionado que sí funciona por accidente pero sin descartar cambios de forma controlada.
- Pulsar **otra** tab desde una sub-pantalla (p.ej. estás en "editar día" y tocas "Progreso") funciona porque `navigate()` reescribe `root`, pero el trabajo en curso (formulario de añadir ejercicio a medio rellenar) se pierde sin aviso.

`navigate()` sí cancela el rest timer, pero como las sub-pantallas no pasan por ahí al abrirse/cerrarse, toda la coherencia depende de que cada botón haga lo correcto a mano.

Sugerencia: encaminar la apertura de sub-pantallas por un mecanismo común que registre el retorno y el estado de chrome, en lugar de que cada una escriba en `root` por su cuenta.

## Overlays: anclaje a body y limpieza dependiente de un único camino

`trainScreen.js`. El overlay de descanso (`startRestTimer`) y la celebración de PR (`celebratePR`) se hacen `document.body.appendChild(overlay)`. El de PR se autolimpia por timeout y por click, sin problema. El de descanso vive hasta que alguien llame a `cancelRestTimer()`, que se hace bien en: cambiar de tab (`navigate`), reentrar a Entrenar (`renderTrain`), "Terminar sesión", "Salir sin guardar", "Saltar descanso" y fin del timer.

El hueco: como está anclado a `body` y no a la pantalla, cualquier camino de salida que **no** pase por esos botones ni por `navigate()` deja el overlay colgando por encima de todo. El gesto atrás de Android (que no está interceptado, ver primer hallazgo) es justo uno de esos caminos: no dispara `cancelRestTimer`, así que si el sistema no descarga la vista, el overlay puede quedar tapando la pantalla. Es "likely" más que "confirmed" porque depende de cómo el WebView trate el gesto, pero el diseño (limpieza acoplada a botones concretos en vez de a un único punto de salida) es frágil.

Sugerencia: centralizar la limpieza de overlays en el mismo punto que maneje el `popstate`, de modo que "cerrar overlay" sea siempre el primer paso del back y no dependa de que el usuario use el botón correcto.

</details>

<details>
<summary>Ficheros revisados</summary>

- `src/main.js` — router por tabs (`navigate`), `current`, `renderChrome`. Sin History API.
- `src/ui/screens/trainScreen.js` — sesión activa, overlays de descanso/PR, salidas "Terminar"/"Salir sin guardar".
- `src/ui/screens/planScreen.js` — `openNewPlan` (destructivo), `openEditDay` (retorno sin ancla, ✕ sin confirmar).
- `src/ui/screens/exercisesScreen.js` — `openNewExercise` (retorno fijo a lista), filtros en estado local.
- `src/ui/screens/settingsScreen.js` — sin sub-navegación; export/import repinta la propia pantalla (coherente).
- `src/ui/screens/progressScreen.js` — sólo lectura, sin sub-navegación (nada que objetar en retorno).
- `src/ui/dom.js` — `h`/`clear`/`toast`; confirma render por reemplazo de DOM, sin modales gestionados.

Diff completo: no aplica (revisión de estado actual, no de PR).

</details>
