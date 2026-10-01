# Editar y borrar una serie registrada durante el entrenamiento (A1)

El cambio permite editar o borrar una serie ya confirmada dentro de la sesión activa, algo que hasta ahora era inmutable. La pieza central es la coherencia del récord personal: una nueva función pura `bestPRFromSets` recorre todo el historial del ejercicio y `appService.recomputePR` la usa para recalcular (o borrar) el PR tras cada edición/borrado, de modo que el récord nunca queda congelado en una marca que ya no existe. `reconcileSetPRFlags` reconstruye el flag `isPR` de cada serie para que la UI pinte el trofeo en la serie correcta. En la vista, cada fila confirmada guarda su `setId` y muestra botones ✎/🗑 que operan in-place sin abrir sub-pantalla.

La coherencia del PR al editar/borrar es sólida en lo esencial: no he encontrado ningún camino en que `recomputePR` deje el PR apuntando a una serie inexistente, ni en que `reconcileSetPRFlags` deje todas las series con `isPR=false` (el PR siempre se construye a partir de una serie real, que por tanto siempre casa consigo misma). El achievedAt se propaga de forma consistente (`buildPR` copia `loggedAt`→`achievedAt` y `reconcile` compara contra `loggedAt`), así que la sospecha de desajuste de nombres de campo queda descartada.

Watch for:
- **(likely)** Divergencia de política de empate: `logSet`/`isTiePR` refresca el PR a la fecha **más reciente**; `bestPRFromSets` se queda con la **más antigua**. Cualquier edición/borrado posterior —aunque sea de otra serie— hace saltar la fecha del PR hacia atrás y puede mover el trofeo a otra fila.
- **(confirmed)** `isWarmup` es mutable en la capa de servicio pero `volume.js` y el criterio de "sesión válida" (`setCount>0`) no filtran warmup, mientras que el PR sí lo excluye: una serie convertida en calentamiento desaparece del récord pero sigue contando como volumen efectivo y como trabajo válido de la sesión.
- **(confirmed)** Editar una serie al alza hasta batir el récord recalcula el PR pero **no** dispara `celebratePR`: subir el PR editando no se celebra, a diferencia de registrarlo.

**Verdict**: NEEDS_CHANGES

<details>
<summary>Issues (7)</summary>

1. **Política de empate incoherente (newest vs oldest)** — `isTiePR` fija `achievedAt` a la serie más reciente; `bestPRFromSets` a la más antigua. Decidir una única política y aplicarla en ambos sitios, o documentar que cualquier recompute normaliza a "la más antigua" y aceptar el salto de fecha.
2. **`isWarmup` rompe la coherencia volumen/validez vs PR** — una serie marcada warmup se excluye del PR pero sigue sumando a volumen y a `setCount`. Alinear los tres criterios: o `volume.js` y la validez de sesión filtran warmup, o se documenta explícitamente que warmup solo afecta al PR.
3. **Editar al alza no celebra récord** — `confirm()` en modo edición solo hace `row.classList.toggle('pr', …)`. Si el PR recomputado supera al anterior, lanzar `celebratePR` (o decidir deliberadamente no hacerlo y anotarlo).
4. **Trofeo duplicado ante empate exacto 1RM + timestamp** — si dos series comparten `estimated1RM` y `loggedAt` idéntico (backup restaurado, logging programático), `reconcileSetPRFlags` marca `isPR=true` en ambas. Desempatar por `id` para marcar una sola.
5. **Sesión fantasma persistente si se cierra sin Terminar/Salir** — tras borrar todas las series, la sesión queda con `setCount=0` y solo se descarta en Finish/Exit vía `discardSessionIfEmpty`. Si la app se cierra antes, la fila queda en `db.sessions` y en los exports. Considerar descartar en `removeSet` cuando `sessionEmptied`.
6. **`lastEntered` no se resetea al borrar una fila** — "repetir última serie" en filas hermanas puede sugerir los valores de una serie ya borrada. Menor, UX.
7. **`editSet` early-return llama `repo.getPR(null, userId)`** — cuando el set no existe, consulta un PR con `exerciseId=null`. Inofensivo pero devuelve algo semánticamente raro; mejor devolver `pr: null`.

</details>

<details>
<summary>Details</summary>

## Divergencia de política de empate: la fecha del PR salta hacia atrás

Las dos rutas que fijan `achievedAt` ante un empate de 1RM no coinciden. En logging normal, `logSet` detecta `isTiePR` y refresca el récord a la fecha de la serie recién hecha:

```js
} else if (tiePR) {
  pr = await repo.savePR({ ...currentPR, achievedAt: set.loggedAt }); // la MÁS reciente
}
```

`bestPRFromSets`, en cambio, ante empate se queda con la más antigua:

```js
(Math.abs(rm - best.estimated1RM) < 1e-6 && new Date(s.loggedAt) < new Date(best.achievedAt))
```

La consecuencia: supón 50×5 el lunes (PR, achievedAt=lunes) y 50×5 el miércoles (empate → `isTiePR` mueve achievedAt=miércoles). La cabecera del ejercicio muestra "miércoles". Si el viernes el usuario edita o borra *cualquier* serie de ese ejercicio, `recomputePR` recorre el historial y `bestPRFromSets` devuelve achievedAt=lunes. La fecha del PR salta del miércoles al lunes sin que el usuario haya tocado ninguna de las dos series de empate. Además `reconcileSetPRFlags` mueve el trofeo de la serie del miércoles a la del lunes.

No es corrupción —el valor del PR (peso/reps/1RM) es idéntico— pero sí una incoherencia observable y difícil de explicar al usuario. El flag `isPR` ya nacía inconsistente en el camino de empate (`logSet` marca la serie-empate con `isPR:false` aunque el PR apunte a su fecha), y el recompute lo "cura" hacia la política antigua. Conviene unificar: elegir una sola regla de desempate y usarla tanto en `isTiePR` como en `bestPRFromSets`.

## `isWarmup`: excluido del PR, incluido en volumen y validez

`editSet` admite `isWarmup` en el patch, y `bestPRFromSets` lo respeta saltándose esas series. Pero el resto del dominio no:

- `volume.js` (`volumeByMuscle`) cuenta **todas** las series de la sesión sin mirar `isWarmup`; una serie de calentamiento suma volumen efectivo igual que una de trabajo.
- La "sesión válida" se define como `setCount>0`, y `editSet` no toca `setCount`. Una serie que pasa a warmup sigue sosteniendo la validez de la sesión.

El resultado es que una misma serie puede estar fuera del récord pero dentro del volumen y de la validez. Hoy la UI de `setRow` no expone ningún toggle de warmup, así que el camino es inalcanzable desde la pantalla; la incoherencia vive en la capa de servicio y en los tests. Pero el feature la introduce como deuda latente: en cuanto se añada el toggle (el parámetro ya está cableado), el comportamiento será contradictorio. Decidir ya qué significa "warmup" de forma transversal evita tener que migrar datos después.

## Edición que bate récord: sin celebración

En modo edición, `confirm()` corta antes del bloque de celebración:

```js
if (setId) {
  const { pr } = await app.editSet(setId, { weight: w, reps: r });
  row.classList.toggle('pr', isThisThePR(pr, w, r));
  toConfirmedUI();
  toast(t('train.setUpdated'));
  return;              // nunca llega a celebratePR
}
```

Si el usuario corrige una serie al alza y con ello establece un récord nuevo (el test "editar al alza … sube PR" confirma que el PR sube a 70), la fila se repinta como PR pero no hay trofeo ni sonido. Es defendible (una corrección no es una gesta), pero es una asimetría de experiencia frente a `logSet`, que sí celebra. Merece una decisión explícita.

## Trofeo duplicado ante empate exacto de 1RM y timestamp

`reconcileSetPRFlags` identifica la serie-récord por `(1RM, achievedAt)`:

```js
const isThePR = !!pr && !s.isWarmup &&
  Math.abs(estimate1RM(s.weight, s.reps) - pr.estimated1RM) < 1e-6 &&
  new Date(s.loggedAt).getTime() === new Date(pr.achievedAt).getTime();
```

Como `bestPRFromSets` construye el PR a partir de una serie real, siempre existe al menos una coincidencia: no hay riesgo de dejar todo a `false`. El borde es el contrario: si dos series distintas comparten exactamente el mismo 1RM **y** el mismo `loggedAt` al milisegundo, ambas quedan con `isPR=true` y la UI pinta dos trofeos. Vía interfaz los confirms van segundos aparte, así que no ocurre; pero un backup restaurado o logging programático pueden producir timestamps idénticos. Un desempate adicional por `id` cierra el caso.

## Sesión fantasma al vaciar todas las series

`removeSet` calcula `sessionEmptied` leyendo la sesión tras borrar, pero no la descarta:

```js
await repo.deleteLoggedSet(setId);
...
const session = await repo.getSession?.(existing.sessionId);
const sessionEmptied = session ? (session.setCount ?? 0) === 0 : false;
return { pr, sessionEmptied };
```

El borrado deja la sesión con `setCount=0`. El limpiado solo ocurre al pulsar Terminar o Salir (`discardSessionIfEmpty`). Mientras tanto, todos los contadores y rankings filtran por `setCount>0` (`countSessions`, `listValidSessions`, `countAllSessions`), así que la sesión fantasma es invisible a efectos de racha, semana efectiva y volumen. El problema es la durabilidad: si la app se cierra o se recarga antes de Terminar/Salir, la fila queda huérfana en `db.sessions` para siempre y viaja en los exports. El test "borrar la única serie vacía la sesión" documenta justo este estado (`sessionEmptied=true` y la fila sigue existiendo). Como `removeSet` ya sabe que la sesión quedó vacía, descartarla ahí mismo (o al menos documentar que el barrido es diferido) elimina la fuga.

## Navegación in-place y timer de descanso

El criterio obligatorio de navegación se respeta: editar y borrar operan sobre la propia fila (`toEditingUI`/`toConfirmedUI` solo alternan clases y `display`), sin montar sub-pantalla; la única capa que se abre es la del `confirmDialog`, autogestionada. `edit()` llama a `cancelRestTimer()`, que hace `popLayer()` solo si había timer con capa (`hadLayer`); sin descanso en curso es un no-op, así que no desincroniza la pila. El timer es un singleton de módulo, no atado a la fila, por lo que `row.remove()` no deja ningún `setInterval` colgando.

El único cabo suelto es `lastEntered`, compartido por closure entre todas las filas de la tarjeta: borrar una fila no lo resetea, así que "repetir última serie" en una fila hermana puede ofrecer los valores de la serie borrada. Es una rareza de UX, no una referencia colgante.

</details>

<details>
<summary>Ficheros cambiados</summary>

- `src/domain/personalRecord.js` — nueva función pura `bestPRFromSets` (recorre historial, ignora warmup, desempata por fecha más antigua).
- `src/domain/appService.js` — `recomputePR`, `editSet`, `removeSet`, `reconcileSetPRFlags`.
- `src/data/repository.js` — `getSession`, `getSet`, `updateLoggedSet`, `deleteLoggedSet` (decrementa setCount), `deletePR`.
- `src/ui/screens/trainScreen.js` — `setRow` guarda `setId`; botones ✎/🗑; `toEditingUI`/`toConfirmedUI`; helper `isThisThePR`.
- `src/i18n/es.js` — claves `train.editSet/deleteSet/deleteSetConfirm/setDeleted/setUpdated/saveSet`.
- `test/regression.test.js` — +4 tests de edición/borrado y recompute del PR.

Diff completo: `git diff main`.

</details>
