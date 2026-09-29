# Hypro — revisión de comportamiento y diseño (código completo)

Hypro es una PWA offline-first (vanilla JS + Vite + Dexie/IndexedDB) para registrar entrenamientos de hipertrofia, con arquitectura en tres capas limpias (ui → domain/appService → data/repository). La separación de responsabilidades es sólida: el dominio es puro y testeable, el repositorio es el único que habla con Dexie, y `appService` es la única puerta con estado que usa la UI. Esta revisión se centra en la corrección de la lógica de negocio y en cómo el flujo real de uso (sesiones a medias, edición del plan, zonas horarias, backups) puede romper suposiciones del dominio.

El hallazgo de fondo que atraviesa varias áreas: **el "avance del plan" (semana efectiva, día que toca, cierre de semana para el aviso de estancamiento) se calcula a partir de `countSessions`, que cuenta TODAS las filas de `sessions`, incluidas las que se crean al pulsar "Empezar" y nunca se terminan.** En una app donde una sesión se materializa en cuanto tocas "Empezar sesión", esto tiene consecuencias en cadena.

**Watch for:**
- **[crítico, confirmado]** Cada "Empezar sesión" crea una fila de `sessions` que ya cuenta como día realizado, aunque no se registre ni una serie ni se termine. Abrir Entrenar por curiosidad avanza el plan.
- **[crítico, confirmado]** El aviso de estancamiento (RB-4) compara contra el PR *vigente*, pero el PR se actualiza en vivo al registrar cada serie; el PR que bate la marca esta semana se convierte en el listón contra el que se compara, así que un ejercicio en el que baten récord puede aparecer como "sin progreso".
- **[importante, confirmado]** `importAll` no valida el contenido del fichero: un JSON con claves reconocibles pero datos corruptos vacía la base de datos y la rellena con basura, sin round-trip seguro.
- **[importante, confirmado]** Cambiar `daysPerWeek` o borrar/recrear el plan reinterpreta retroactivamente el historial: las sesiones ya guardadas conservan su `effectiveWeek`/`dayNumber`, pero `countSessions` recalcula la posición con el nuevo divisor, dejando cabecera y datos incoherentes.
- **[importante, confirmado]** El "día que toca" usa `days.find(d => d.order === dayInWeek)`; si los `order` de `planDays` no son 1..N contiguos (posible al editar), cae siempre al primer día.

**Verdict**: NEEDS_CHANGES

## High-level view

El corazón de la app —la semana efectiva que solo avanza al entrenar— es correcto como función pura (`effectiveWeek.js` está bien y bien testeado), pero su entrada en producción es `countSessions(planId)`, que cuenta filas de sesión sin exigir que estén terminadas ni que tengan series. Como `startSession` inserta la fila al pulsar "Empezar", el contador avanza con sesiones fantasma. Todo lo que se deriva de ese contador (cabecera "Semana X · Día N", `dayNumber` guardado en la sesión, racha, cierre de semana) hereda el problema.

El aviso de estancamiento tiene un defecto de temporalidad independiente: su especificación dice comparar el mejor 1RM de la semana con "el PR que había ANTES de la semana", pero lee `listPRs()`, que ya incluye los PRs batidos durante esa misma semana porque `logSet` los persiste en el acto. El resultado es que la comparación se hace contra un listón que la propia semana ya subió.

La detección de PR es correcta salvo un matiz de diseño: usa `>` estricto, de modo que igualar tu 1RM no cuenta como récord (coherente con los tests) pero tampoco refresca la fecha, y una serie con más peso pero mismo 1RM estimado no se registra. Es una decisión defendible, pero conviene que sea explícita.

La integridad de datos es razonable dentro de una sola pestaña, pero `countAllSets` carga toda la tabla `loggedSets` en memoria para filtrar por sesión (no escala y es frágil si hay series huérfanas), y el import/export no valida ni versiona los datos que restaura pese a ser una operación destructiva. No hay `userId` en `loggedSets`, lo que obliga a ese filtrado por sesiones y complica el futuro multi-tenant que el código dice preparar.

En la pantalla de entrenar, el rest timer y el cálculo de `restTakenSeconds` funcionan, pero el timer vive fuera del ciclo de vida de la vista: si navegas de pestaña mientras descansas, el intervalo sigue corriendo y puede sonar/vibrar sobre otra pantalla. El descanso "real" se mide por-ejercicio con un handle que se reinicia en cada recarga de la vista, así que la primera serie tras reabrir nunca aporta muestra y algunos descansos se pierden o se cuentan cruzados entre ejercicios.

Las fechas se manejan casi siempre en hora local (correcto para "día de calendario"), pero hay dos sitios que mezclan UTC y local (`gymStartDate` se guarda como medianoche local convertida a ISO, y el `dayOfYear` de la frase diaria usa una resta directa de fechas), lo que produce desajustes de un día en ciertos husos y en el cambio de horario.

<details>
<summary>Issues (14)</summary>

1. **Sesiones fantasma avanzan el plan** — `startSession` crea la fila al pulsar "Empezar" y `countSessions` la cuenta aunque no tenga series ni `finishedAt`. Contar solo sesiones con al menos una serie registrada, o no persistir la sesión hasta la primera serie / usar `finishedAt` como criterio de "sesión hecha".
2. **Plateau compara contra PR ya actualizado** — `weeklyPlateaus` lee `listPRs()` que incluye PRs batidos durante la semana en curso; un récord de esta semana enmascara el progreso. Capturar el PR previo a la semana (por fecha `achievedAt < inicio de la semana`) o calcular el mejor histórico excluyendo las series de la semana evaluada.
3. **Cierre de semana mal disparado** — `weeklyPlateaus` toma siempre la `effectiveWeek` más alta con sesiones, que es la semana EN CURSO, no la recién cerrada; avisa de "estancamiento" a media semana. Evaluar la última semana COMPLETA (`done % dpw === 0`) o la anterior a la actual.
4. **Import sin validación destruye datos** — `importAll` limpia todas las tablas antes de validar; un JSON parseable pero inválido deja la base vacía. Validar `meta.dataVersion` y forma de los arrays antes de `clear()`, e idealmente hacer backup previo dentro de la misma transacción.
5. **Editar plan/daysPerWeek reinterpreta el historial** — la posición se recalcula con `countSessions` y el nuevo `daysPerWeek`, mientras las sesiones guardan su `effectiveWeek`/`dayNumber` antiguo. Anclar el conteo a las sesiones del plan activo y recalcular posición desde `planStartDate` o versionar el plan al cambiar días.
6. **`day.order` no contiguo cae al día 1** — `days.find(d => d.order === dayInWeek)` asume `order` = 1..N sin huecos; tras editar/borrar días puede fallar. Indexar por posición ordenada (`days[dayInWeek-1]`) en vez de por `order`.
7. **`countAllSets` carga toda la tabla** — trae `loggedSets.toArray()` completo a memoria para filtrar por sesiones del usuario. Añadir `userId` a `loggedSets` e indexarlo, o contar por sesión con `where('sessionId').anyOf(ids)`.
8. **`loggedSets` sin `userId`** — rompe la promesa multi-tenant del contrato y obliga al filtrado costoso anterior. Añadir `userId` al registrar la serie.
9. **Rest timer fuera del ciclo de vida de la vista** — el `setInterval` sigue si cambias de pestaña; suena/vibra sobre otra pantalla y puede duplicarse. Cancelar el intervalo al navegar (guardar el handle y limpiarlo en `navigate`/`clear`).
10. **`restTakenSeconds` cruzado / perdido** — el handle `restHandle.last` se reinicia por recarga de vista y es por-ejercicio dentro de la card; descansos entre series de distinto ejercicio o tras reabrir no se miden bien. Rastrear el timestamp de la última serie a nivel de sesión persistida (`loggedAt` de la serie previa) en vez de en memoria de la vista.
11. **PR por igualdad no refresca fecha** — `isNewPR` usa `>` estricto: igualar tu 1RM no cuenta ni actualiza `achievedAt`. Si es intencional, documentarlo; si no, decidir política de empate (p. ej. actualizar fecha al igualar).
12. **Timezone en `gymStartDate` y `dayOfYear`** — `new Date(gymStart.value).toISOString()` interpreta el `<input type=date>` como UTC-medianoche y `dailyQuote` resta fechas sin normalizar; ambos pueden desfasar un día. Construir la fecha en local y calcular día del año con `Date.UTC` normalizado.
13. **Sesiones abandonadas contaminan duración y racha** — `restAndDurationStats` ignora las sin `finishedAt` (bien), pero la racha (`sessionDates` = todos los `startedAt`) y `countAllSessions` sí las cuentan. Unificar el criterio de "sesión válida" en todo el código.
14. **`reconcileSeedIcons` empareja por nombre** — si el usuario renombró un ejercicio semilla (no hay UI para ello hoy, pero el modelo lo permite) el emparejamiento por `name` falla silenciosamente. Emparejar por una clave estable (p. ej. `seedKey`) en vez de por nombre visible.

</details>

<details>
<summary>Details</summary>

### Sesiones fantasma: el plan avanza sin entrenar

`effectiveWeek.js` es correcto y está bien cubierto por tests: `currentPosition(done, dpw)` calcula semana y día con aritmética entera limpia, y `positionForNewSession` documenta bien que la sesión "ocupa" el hueco anterior a sumarse. El problema no está en la función pura sino en qué se le pasa como `sessionsDone`.

En `appService.startSession`:

```js
const sessionsDone = await repo.countSessions(plan.id);
const { effectiveWeek, dayNumber } = positionForNewSession(sessionsDone, plan.daysPerWeek);
return repo.startSession({ planId: plan.id, planDayId: planDay.id, effectiveWeek, dayNumber }, userId);
```

Y `repo.countSessions` cuenta filas sin más:

```js
async countSessions(planId) { return db.sessions.where('planId').equals(planId).count(); }
```

`startSession` (repositorio) inserta la fila inmediatamente con `finishedAt: null`. En la UI, `trainScreen.start()` llama a `app.startSession(...)` en cuanto pulsas "▶ Empezar sesión", antes de registrar ninguna serie. Consecuencia: si un día abres Entrenar, pulsas Empezar y sales sin hacer nada, ya has "consumido" un día del plan. La cabecera de la próxima vez mostrará Día 2, la sesión fantasma queda con `effectiveWeek`/`dayNumber` reales, y el contador global de sesiones sube. En una PWA de gimnasio esto pasará: la gente abre la app en la máquina, se distrae, cierra.

El arreglo correcto depende del criterio de "sesión hecha". Lo más limpio: contar solo sesiones con al menos una serie (`loggedSets`), o solo las que tienen `finishedAt`. Alternativamente, no crear la fila de sesión hasta la primera serie confirmada. Cualquiera de las tres cierra el agujero; la primera es la más fiel a "un día cuenta cuando entrenas".

### Aviso de estancamiento: se compara contra un listón que la semana ya subió

El comentario de `weeklyPlateaus` y la doc de `plateau.js` son explícitos: se compara el mejor 1RM de la semana con "el récord vigente (el que había ANTES de la semana)". Pero el código lee el PR actual:

```js
const prs = await repo.listPRs(userId);
const prByExercise = Object.fromEntries(prs.map((p) => [p.exerciseId, { estimated1RM: p.estimated1RM, achievedAt: p.achievedAt }]));
```

`logSet` actualiza `personalRecords` en el momento en que registras una serie que bate marca. Así que cuando `weeklyPlateaus` corre (al pintar Progreso), el PR "vigente" de un ejercicio en el que batiste récord esta semana **ya es el de esta semana**. `findPlateaus` compara `best.rm <= pr.estimated1RM`: como `best.rm` es justamente el que generó ese PR, la comparación da igualdad y el ejercicio se marca como estancado. Es decir: el caso en el que más progresaste puede mostrarse como "sin superar récord". Es lo contrario de lo que la regla pretende.

Para arreglarlo hay que reconstruir el PR *previo a la semana evaluada*: filtrar los PRs cuya `achievedAt` sea anterior al inicio de esa semana, o recalcular el mejor 1RM histórico de cada ejercicio excluyendo las series de la semana que se está evaluando.

Hay un segundo defecto de temporalidad en la misma función: elige la semana a evaluar como

```js
const week = Math.max(...planSessions.map((s) => s.effectiveWeek));
```

Esa es la semana **en curso**, no una semana cerrada. RB-4 dice "al cerrar una semana efectiva". Evaluar la semana en curso significa avisar de estancamiento a mitad de semana, cuando todavía quedan días para batir el récord. Debería evaluarse la última semana completada (cuando `sessionsDone % daysPerWeek === 0`) o la anterior a la actual.

### Detección de PR: correcta, con un empate silencioso

`estimate1RM` y `isNewPR` implementan Epley correctamente y coinciden con los tests. El único matiz de diseño: `isNewPR` usa `>` estricto, así que igualar exactamente tu 1RM estimado no es PR. Combinado con `buildPR`, que solo se construye cuando `newPR` es true, esto implica que si repites tu mejor marca la fecha del PR no se refresca. Además, dos series con el mismo 1RM estimado pero distinto peso/reps (p. ej. más peso y menos reps) se consideran equivalentes y no se registra la de más peso, que muchos usuarios percibirían como un logro. No es un bug —es coherente con la especificación de Epley— pero conviene decidir y documentar la política de empate explícitamente, porque afecta a lo que el usuario ve celebrado.

### Integridad de datos: import destructivo sin red de seguridad

`importAll` es el punto más delicado. Abre una transacción rw, hace `clear()` de las ocho tablas y luego rellena con lo que venga en `data`:

```js
await Promise.all([ db.exercises.clear(), ... db.settings.clear() ]);
if (data.exercises) await db.exercises.bulkPut(data.exercises);
...
```

No se valida `data.meta.dataVersion` (el export lo escribe, pero el import lo ignora), ni que los arrays tengan la forma esperada, ni que las claves primarias sean coherentes. Un fichero que sea JSON válido pero no un backup de Hypro —o un backup de una versión de esquema futura— vacía la base y la deja en un estado inconsistente. Como es una operación destructiva iniciada por el usuario desde Ajustes, debería: validar `meta` y la forma de los datos antes de tocar nada; rechazar versiones de datos incompatibles; e idealmente crear un backup automático dentro de la misma transacción para poder revertir. El `catch` de la UI (`toast('Fichero no válido')`) solo captura errores de parseo/transacción, no un import semánticamente basura que sí "funciona".

El round-trip export→import en sí es coherente en cuanto a tablas (exporta e importa las mismas ocho), con un detalle menor: `exportAll` no incluye la tabla `backups`, lo cual es razonable (no quieres backups dentro de backups), pero significa que restaurar un backup borra el historial de backups previos sin avisar.

### `countAllSets` y la ausencia de `userId` en `loggedSets`

`loggedSets` es la única tabla sin `userId` (ver esquema en `database.js`). Eso obliga a `countAllSets` a hacer:

```js
const sessions = await db.sessions.where('userId').equals(userId).toArray();
const ids = new Set(sessions.map((s) => s.id));
const all = await db.loggedSets.toArray();   // toda la tabla a memoria
return all.filter((s) => ids.has(s.sessionId)).length;
```

Traer toda la tabla de series a memoria para contar no escala: es la tabla que más crece (varias series por ejercicio, por sesión, durante meses). Con `userId` indexado en `loggedSets` sería un `count()` directo; sin él, al menos usar `where('sessionId').anyOf([...ids]).count()` evita materializar toda la tabla. Además, la falta de `userId` contradice el propio contrato del repositorio ("todos los métodos operan sobre un userId, multitenant-ready"): el día que haya más de un usuario local, las series no son atribuibles sin recorrer sesiones.

No hay condiciones de carrera reales dentro de una sola pestaña (IndexedDB serializa y las escrituras van una tras otra por `await`), pero sí hay una ventana teórica si se abre la app en dos pestañas: dos `startSession` concurrentes leerían el mismo `countSessions` y crearían dos sesiones con el mismo `dayNumber`. Es un caso extremo y de bajo impacto para uso personal, pero conviene tenerlo presente si algún día se sincroniza.

### Editar el plan a mitad rompe la coherencia de la posición

`savePlan` en `planScreen` permite crear un plan nuevo con otro `daysPerWeek` (y "Nuevo" lo ofrece siempre). El historial de `sessions` guarda `effectiveWeek`/`dayNumber` calculados con el `daysPerWeek` del momento, pero la posición actual se recalcula en vivo:

```js
const sessionsDone = await app.repo.countSessions(plan.id);
positionLabel(sessionsDone, plan.daysPerWeek);
```

Dos problemas concretos: (1) `countSessions(plan.id)` cuenta las sesiones de *ese* plan, así que crear un plan nuevo reinicia la semana a 1 aunque el usuario lleve meses —puede ser deseado, pero no está dicho—; (2) si en vez de crear otro plan se editara `daysPerWeek` del existente (hoy no hay UI para ello, pero el modelo lo permite y `savePlan` haría put sobre el mismo id si se pasara el id), todas las sesiones antiguas quedarían reinterpretadas con el nuevo divisor y la cabecera dejaría de cuadrar con los `dayNumber` guardados. La posición debería derivarse de forma estable: o se respeta el `effectiveWeek` de la última sesión + avance, o se recalcula desde `planStartDate` de manera consistente, pero no mezclar ambos.

Nota relacionada: la doc RB-1 dice que "`planStartDate` marca el inicio de la Semana 01", pero el código no usa `planStartDate` para nada en el cálculo de la semana efectiva —solo cuenta sesiones—. `planStartDate` se fija en `bootstrap` y no se vuelve a leer para la posición. No es un bug (la semana efectiva por conteo es justo el diferenciador), pero es una discrepancia entre doc y código que conviene alinear.

### El "día que toca" asume `order` contiguo

En `trainScreen`:

```js
const { dayInWeek } = await app.currentPosition(plan);
const todayDay = days.find((d) => d.order === dayInWeek) ?? days[0];
```

`dayInWeek` va de 1 a `daysPerWeek`. Al crear el plan, los días se generan con `order` 1..N, así que hoy casa. Pero `planScreen` ordena y muestra por `order`, y no hay garantía de que tras futuras ediciones (borrar un día, reordenar) los `order` sigan siendo 1..N contiguos. Si `dayInWeek` es 3 y no existe un día con `order === 3`, cae a `days[0]` (siempre el primero), no al tercer día de la lista. Es más robusto indexar por posición ordenada: `const ordered = [...days].sort((a,b)=>a.order-b.order); const todayDay = ordered[(dayInWeek-1) % ordered.length]`.

### Rest timer y `restTakenSeconds`: fuera del ciclo de vida de la vista

`startRestTimer` crea un overlay y un `setInterval` colgados de `document.body`, no del árbol de la pantalla. Si el usuario navega a otra pestaña mientras descansa, `renderTrain`/`navigate` hace `clear(root)` pero el intervalo sigue vivo: seguirá decrementando, sonará el bip y vibrará sobre otra pantalla, y el overlay puede quedar huérfano. Hay un `querySelector('.rest-overlay')` que elimina el overlay previo al abrir uno nuevo, pero no cancela el intervalo del anterior si se solaparan. El timer debería registrar su handle en un sitio cancelable y limpiarse al navegar.

El cálculo de descanso real:

```js
let restTaken = null;
const now = Date.now();
if (restHandle.last) restTaken = Math.round((now - restHandle.last) / 1000);
restHandle.last = now;
```

`restHandle` se crea en `exerciseCard`, o sea uno por ejercicio y por render. Efectos: la primera serie de cada ejercicio nunca tiene `restTaken` (correcto, no hay serie previa de ese ejercicio); pero si el usuario recarga la vista (termina y vuelve a entrar, cambia de pestaña y vuelve) el handle se reinicia y se pierde la referencia temporal. Y como es por-ejercicio, el descanso entre la última serie de un ejercicio y la primera del siguiente no se registra en ningún sitio. Dado que `restAndDurationStats` promedia `restTakenSeconds`, el "descanso medio entre series" que ve el usuario está sesgado hacia los descansos intra-ejercicio y omite muestras. Medir el gap desde el `loggedAt` de la última serie registrada de la sesión (dato ya persistido) daría una medida estable e independiente de recargas de vista.

### Fechas y zona horaria

La mayoría del código de fechas es correcto para "día de calendario local": `dateKey`, `daysBetween` y el `dayDiff` de `streak.js` normalizan a `Date.UTC(año,mes,día)` sobre componentes locales, lo cual es la forma correcta de contar días de calendario sin que la hora del día interfiera.

Dos excepciones:

- `settingsScreen` guarda `gymStartDate` con `new Date(gymStart.value).toISOString()`. Un `<input type="date">` devuelve `"YYYY-MM-DD"`, que `new Date(...)` interpreta como **medianoche UTC**. Al pasar a ISO y luego mostrarse/contarse en local, en husos al oeste de UTC la fecha puede retroceder un día. Debería construirse como fecha local (`new Date(y, m-1, d)`).
- `dailyQuote` calcula el día del año con `Math.floor((now - new Date(now.getFullYear(),0,0)) / MS_DÍA)`. La resta de dos `Date` con horas distintas y el cambio de horario de verano pueden hacer que el índice salte o se repita en la frontera del día. Para una frase diaria es cosmético (peor caso: la frase cambia unas horas antes o después), pero es la misma clase de fragilidad; normalizar con `Date.UTC` lo resuelve.

### Racha y sesiones abandonadas

`currentStreak` (dominio) es correcto y está testeado. Pero la UI le pasa `sessions.map(s => s.startedAt)` — todas las sesiones, incluidas las fantasma sin series ni `finishedAt`. Igual que en la semana efectiva, una sesión abandonada cuenta como día de entreno para la racha, inflándola. `countAllSessions` (mostrado como "Sesiones" en Progreso) tiene el mismo sesgo. En cambio `restAndDurationStats` sí exige `finishedAt` para la duración. El criterio de "qué es una sesión válida" debería ser único y aplicarse en todos los cálculos (racha, contador, semana efectiva, duración).

### `reconcileSeedIcons`: emparejamiento por nombre visible

`reconcileSeedIcons` reconcilia iconos emparejando `existing.name` con `SEED_EXERCISES[].name`. Es correcto mientras los nombres semilla no cambien. Pero usa el nombre visible como clave estable, y si en el futuro se permite renombrar un ejercicio semilla (el modelo tiene `isCustom` pero nada impide editar el nombre), el emparejamiento falla en silencio y el icono deja de actualizarse. Una `seedKey` estable e inmutable sería más robusta que el nombre. Impacto bajo hoy (no hay UI de renombrado), pero es deuda latente.

</details>

<details>
<summary>Mapa de ficheros revisados</summary>

- `src/domain/effectiveWeek.js` — función pura correcta; el problema está en su alimentación (`countSessions`).
- `src/domain/personalRecord.js` — Epley y detección de PR correctos; empate por `>` estricto sin refrescar fecha.
- `src/domain/streak.js` — correcto y testeado; la UI le pasa sesiones no filtradas.
- `src/domain/plateau.js` — lógica correcta; el bug está en `appService.weeklyPlateaus` (PR vigente vs. previo, y semana en curso vs. cerrada).
- `src/domain/gymTenure.js` — cálculo de antigüedad correcto.
- `src/domain/motivation.js` — `dayOfYear` frágil ante husos/DST (cosmético).
- `src/domain/dateKey.js` — normalización de días correcta.
- `src/domain/appService.js` — orquestación; foco de los bugs de semana efectiva, plateau y conteo.
- `src/data/database.js` — esquema; falta `userId` en `loggedSets`.
- `src/data/repository.js` — `countAllSets` no escala; `importAll` destructivo sin validación; `countSessions` cuenta sesiones vacías.
- `src/ui/screens/trainScreen.js` — rest timer fuera de ciclo de vida; `restTakenSeconds` por-ejercicio/volátil; `day.order` contiguo asumido; sesión creada al pulsar Empezar.
- `src/ui/screens/planScreen.js` — crear plan nuevo reinicia posición; edición puede reinterpretar historial.
- `src/ui/screens/progressScreen.js` — usa `countSessions`/`sessionDates` sin filtrar sesiones válidas.
- `src/ui/screens/settingsScreen.js` — `gymStartDate` con desfase UTC; import sin validación previa.
- `src/main.js` — flujo de arranque correcto; `showOpeningMessage` usa `startedAt` de todas las sesiones.
- Iconos y CSS: fuera de alcance por indicación del usuario.

</details>
