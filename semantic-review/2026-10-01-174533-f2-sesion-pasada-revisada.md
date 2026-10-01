# Barrera de integridad para registro de sesión pasada (F2 revisada — Opción A)

La revisión anterior marcó dos bloqueantes: (1) insertar una sesión con fecha pasada reordenaba las ventanas semanales de `weeklyVolume`/`weeklyPlateaus` y recolocaba qué sesiones caían en qué semana; (2) `effectiveWeek`/`dayNumber` persistidos divergían del orden por fecha. Esta tanda adopta la Opción A: el orden cronológico (`listValidSessions` ordenado por `startedAt`+`id`) pasa a ser la única fuente de verdad de la posición, se deja de persistir `effectiveWeek`/`dayNumber`, los agregados dejan de ordenar por su cuenta, y se añade `canLogPastSession` como barrera que debería impedir cargar un entreno en una semana ya cerrada.

El bloqueante #2 queda resuelto (confirmed): nadie lee los campos persistidos y ya no se escriben. El bloqueante #1 NO queda resuelto (confirmed): la barrera que debía hacer imposible el descuadre usa el umbral equivocado (`laterCount >= dpw`) y deja pasar cargas que expulsan una sesión de una semana ya cerrada y reescriben su contenido. Verificado con harness ejecutable.

Watch for: la barrera compara contra `dpw` cuando debe comparar contra las sesiones de la semana EN CURSO (`valid.length % dpw`); para dpw≥2 permite inserciones que corrompen una semana cerrada (confirmed, reproducido). `logPastSession` sigue sin ser atómico (confirmed, hallazgo #4 anterior no abordado).

**Verdict**: NEEDS_CHANGES

## High-level view

La raíz de todo es la barrera `canLogPastSession`. Su objetivo es garantizar que una sesión pasada caiga en la semana efectiva en curso y nunca reordene una semana cerrada. La regla implementada —rechazar si hay `dpw` o más sesiones con fecha posterior— es demasiado permisiva. La condición correcta es rechazar si hay más sesiones posteriores que las que ya ocupan la semana en curso (`valid.length % dpw`). Entre ambos umbrales queda una franja de fechas que la barrera acepta y que sí descuadran el troceo. Esto reabre exactamente el bloqueante #1: `weeklyVolume` y `weeklyPlateaus` vuelven a mostrar una semana cerrada con contenido distinto al real.

El troceo en sí (los `slice` de los agregados) es coherente consigo mismo una vez la lista está ordenada: `doneWeeks = floor(valid.length/dpw)` cuadra con `completedWeeks = floor(countSessions/dpw)` porque ambos cuentan las mismas sesiones válidas del plan. El troceo solo es correcto si la barrera, aguas arriba, impide inserciones que crucen el límite de una semana cerrada. Hoy no lo impide.

Quitar `effectiveWeek`/`dayNumber` es seguro: ninguna pantalla, dominio ni test los lee de la tabla `sessions`. La posición se deriva de `countSessions` (que cuenta, no lee los campos) y la adherencia persiste `plannedCount`/`doneCount`/`skippedExerciseIds`/`planDayId`, no la semana/día. El historial de adherencia futuro no se ve afectado.

El desempate por `id` es determinista y estable: `uid()` es aleatorio pero fijo por registro, así que el orden entre sesiones con el mismo `startedAt` es arbitrario pero reproducible, que es cuanto necesita el troceo. La transaccionalidad de `logPastSession` sigue pendiente (hallazgo #4 anterior): un fallo a mitad del bucle deja una sesión parcial. El flujo en vivo es idéntico: `startSession` ya no pasa posición y nadie la echa en falta.

<details>
<summary>Issues (4)</summary>

1. **Umbral de la barrera incorrecto (bloqueante — reabre el bloqueante #1)** — `canLogPastSession` rechaza con `laterCount >= dpw`, pero el límite seguro es `laterCount > (valid.length % dpw)`. Para dpw≥2 deja pasar cargas que empujan una sesión fuera de una semana ya cerrada y reescriben su volumen/estancamiento. Cambiar el umbral a `inWeek = valid.length % dpw` y rechazar si `laterCount > inWeek`.
2. **Tests de la barrera no cubren el caso que falla (recomendado)** — los dos tests nuevos (`dpw=2` todo-posterior y `dpw=3` hueco reciente) caen en zonas donde el umbral bueno y el malo coinciden, así que pasan con el bug presente. Añadir un test con `dpw=3`, semana 1 cerrada (3 sesiones) + 1 en curso, y una fecha intercalada entre las cerradas: debe rechazarse.
3. **`logPastSession` no es atómico (recomendado — hallazgo #4 anterior sin abordar)** — `startSession` + bucle `logSet` + `recomputePR` + `updateSession` son awaits sueltos sin transacción. Un fallo a mitad deja una sesión con series parciales y sin cierre/adherencia. Envolver en transacción Dexie o descartar la sesión en `catch`.
4. **`localeCompare` para el desempate (menor)** — el orden por `id` usa `String(a.id).localeCompare(String(b.id))`, sensible a locale. Para uids basta el orden de bytes (`<`/`>`); funcionalmente irrelevante hoy, pero evita dependencia del entorno.

</details>

<details>
<summary>Details</summary>

### La barrera deja pasar una carga que corrompe una semana cerrada

El modelo es: lista de sesiones válidas ordenada por `startedAt` (desempate `id`); la "semana" de la sesión en índice `i` (0-based) es `floor(i/dpw)`; la semana en curso es el bloque final parcial. Insertar una sesión con fecha `F` la coloca en el índice `p = N - laterCount`, donde `laterCount` = nº de sesiones con `startedAt > F` y `N` = total actual. Toda sesión en índice `>= p` se desplaza uno.

Para no tocar ninguna semana cerrada, la inserción debe caer en la cola en curso, es decir `p >= doneWeeks*dpw` con `doneWeeks = floor(N/dpw)`. Como `doneWeeks*dpw = N - (N mod dpw)`, la condición se reduce a:

```
laterCount <= (N mod dpw)        // inWeek = sesiones ya en la semana en curso
```

La barrera, en cambio, rechaza con `laterCount >= dpw`, es decir acepta todo `laterCount <= dpw-1`. Cuando `inWeek < dpw-1` existe una franja `inWeek < laterCount <= dpw-1` que la barrera acepta y que sí reordena una semana cerrada.

Contraejemplo reproducido (harness efímero, dpw=3): sesiones válidas con fechas hace 9, 8, 7 (semana 1 cerrada = `[S1,S2,S3]`) y hace 1 (semana 2 en curso). `N=4`, `inWeek = 4 % 3 = 1`. Se carga una sesión con `F` = hace 7,5 días (entre S2 y S3). `laterCount = 2` (S3 y S4 son posteriores). La barrera: `2 >= 3` → falso → **permite** (`check.ok === true`). Resultado tras insertar:

```
antes:   [S1, S2, S3 | S4]          semana 1 cerrada = [S1, S2, S3]
después: [S1, S2, Fnew | S3, S4]    semana 1 cerrada = [S1, S2, Fnew]
```

`doneWeeks` pasa de `floor(4/3)=1` a `floor(5/3)=1`; la semana 1 cerrada (índices 0..2) deja de ser `[S1,S2,S3]` y pasa a `[S1,S2,Fnew]`. S3 es expulsado a la cola en curso. `weeklyPlateaus` evalúa ahora una semana 1 con contenido distinto, y `weeklyVolume` recorta su ventana de semana completa sobre otras sesiones. Es el mismo descuadre que el bloqueante #1 pretendía cerrar.

Con el umbral correcto (`laterCount > inWeek` → `2 > 1` → rechazar) este caso se bloquea, y el caso legítimo que sí debe pasar (dpw=3, una sesión en vivo hoy, cargar hace 2 días: `inWeek=1`, `laterCount=1`, `1 > 1` falso → permite) sigue pasando. Fix:

```js
const inWeek = valid.length % dpw;      // sesiones ya en la semana en curso
if (laterCount > inWeek) {
  return { ok: false, reason: '…semana que ya completaste…' };
}
```

Nota sobre dpw=1: `inWeek` es siempre 0, así que el umbral correcto rechaza cualquier `F` anterior a la última sesión (cada sesión es su propia semana cerrada: cualquier intercalado reordena). Es coherente con la pregunta "¿dpw=1 bloquea casi todo lo pasado?": sí, y debe. El umbral actual (`>= 1`) coincide por casualidad con el correcto solo en dpw=1; el bug aparece en dpw≥2.

### Casos límite de la barrera

Con el umbral corregido: 0 sesiones previas → `inWeek=0`, `laterCount=0`, `0 > 0` falso → permite cualquier fecha pasada (correcto). Fecha = hoy → pasa el filtro de futuro (`endOfToday` a 23:59:59.999) y, si no hay posteriores, `laterCount=0` → permite. Fecha exactamente igual a una sesión existente → la comparación es estricta (`> when`), así que una sesión con el MISMO `startedAt` no cuenta como posterior; la nueva se coloca tras las de igual fecha (desempate por `id`) y no las saca de su semana. Coherente.

### Troceo tras Opción A: internamente coherente

`weeklyVolume` usa `doneWeeks = floor(valid.length/dpw)` y `weekSessions = valid.slice(doneWeeks*dpw)`. `weeklyPlateaus` usa `completedWeeks = floor(countSessions/dpw)` y `slice((week-1)*dpw, week*dpw)`. `valid` (filtrado al plan) y `countSessions(plan.id)` cuentan el mismo conjunto (sesiones con `setCount>0` del plan), así que `doneWeeks == completedWeeks` y los `slice` cuadran entre sí. La agrupación por fecha es correcta siempre que la lista no contenga una sesión retroactiva colada en una semana cerrada — y eso es exactamente lo que la barrera debe garantizar y hoy no garantiza. El troceo no tiene fallo propio; depende de la barrera.

### effectiveWeek/dayNumber: retirada segura

`grep` sobre `src/**` y `test/**` confirma que nadie lee esos campos de un registro de sesión. Los únicos usos son la función pura `positionForNewSession` (ya sin llamador en producción tras quitar el import; solo la referencia su propio test en `domain.test.js`, que sigue verde porque la función no cambió) y `currentPosition`/`positionLabel`, que derivan de `countSessions` (cuentan filas, no leen los campos). La adherencia que F2 persiste guarda `plannedCount`/`doneCount`/`skippedExerciseIds`/`planDayId`, no semana/día, de modo que un futuro historial de adherencia no hereda ninguna posición mentirosa. Resuelto.

### Desempate por id: determinista

`uid()` es aleatorio pero fijo por registro; el orden entre sesiones con idéntico `startedAt` es arbitrario pero estable y reproducible entre llamadas. El troceo solo necesita determinismo (que el límite de semana no baile entre renders), no un orden semántico, así que lo arbitrario no importa. El único matiz es `localeCompare` (sensible a locale); para uids el orden de bytes bastaría y evita cualquier dependencia del entorno. Menor.

### logPastSession: sigue sin ser atómico (hallazgo #4 anterior)

La secuencia es `canLogPastSession` → guard de series vacías → `repo.startSession` → bucle `logSet` → `recomputePR`+`reconcileSetPRFlags` por ejercicio → `updateSession` (cierre+adherencia). No hay transacción que la envuelva. La barrera y el guard van antes de crear la sesión, así que un rechazo no deja fantasma (bien). Pero un fallo real dentro del bucle de `logSet`, o en `recomputePR`, deja una sesión creada con series parciales y sin cierre ni adherencia — una sesión válida a medias que además entra en el troceo. El hallazgo #4 de la revisión anterior no se ha abordado. Envolver creación+series+cierre en una transacción Dexie, o capturar y borrar la sesión en `catch`.

### Flujo en vivo: intacto

`startSession` ya no calcula ni pasa `effectiveWeek`/`dayNumber`; el repo expande `{planId, planDayId}` con sus defaults. Como nadie lee esos campos, el flujo normal de entrenar es equivalente al anterior. El `startedAt = Date.now()+seq*1000` del fake repo es un artefacto de test (fuerza orden cronológico creciente para reflejar producción) y no toca el código de producción.

</details>

<details>
<summary>Mapa de ficheros</summary>

- `src/data/repository.js` — `listValidSessions` ahora ordena por `startedAt`+`id` (fuente de verdad del orden).
- `src/domain/appService.js` — `startSession`/`logPastSession` dejan de persistir `effectiveWeek`/`dayNumber`; agregados dejan de ordenar por su cuenta; nuevo `canLogPastSession` (umbral a corregir) + `logPastSession` que lo invoca.
- `test/appService.test.js` — fake repo ordena igual y genera `startedAt` crecientes.
- `test/regression.test.js` — tests F2 ajustados (dpw/fecha) + barrera (bloquea semana completada / permite hueco reciente); falta el caso de fecha intercalada entre semanas cerradas.

Diff completo: `git diff HEAD -- src/data/repository.js src/domain/appService.js test/appService.test.js test/regression.test.js`.

</details>
