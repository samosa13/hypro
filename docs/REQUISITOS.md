# Requisitos — Hypro

Versión 1.0 · Documento vivo.

Cada requisito tiene un identificador (`RF` funcional, `RNF` no funcional) y la
**fase** en la que se entrega (1 = MVP, 2 = inteligencia, 3 = producto).

## 1. Requisitos funcionales

### Librería de ejercicios

| ID | Fase | Requisito |
|----|------|-----------|
| RF-01 | 1 | La app incluye un catálogo precargado de ejercicios de máquina, mancuerna, barra, polea y peso corporal. |
| RF-02 | 1 | Cada ejercicio muestra un **icono** identificativo además del nombre. |
| RF-03 | 1 | Los ejercicios se pueden filtrar por grupo muscular y por tipo de equipo, y buscar por nombre. |
| RF-04 | 1 | El usuario puede **crear ejercicios propios** (nombre, grupo muscular, equipo, icono). |

### Planes y días

| ID | Fase | Requisito |
|----|------|-----------|
| RF-10 | 1 | El usuario indica cuántas veces por semana entrena (1..7). |
| RF-11 | 1 | Cada día del plan tiene un **nombre libre** ("Full Body", "Empuje"...). |
| RF-12 | 1 | El usuario selecciona los ejercicios que componen cada día y su orden de ejecución. |
| RF-12b | 2 | El selector de ejercicios al editar un día ofrece **búsqueda por nombre, filtro por grupo muscular e icono por ejercicio** (A4), en lugar de un desplegable plano. Al elegir uno se configuran series/rango de reps/peso/descanso en el sitio. |
| RF-13 | 1 | Por cada ejercicio del día se configura: nº de series (por defecto 3, configurable), reps objetivo, peso objetivo y descanso. |
| RF-14 | 1 | El usuario puede **modificar un día** (añadir/quitar/reordenar ejercicios, renombrar) en cualquier momento **sin perder el historial** ya registrado. |
| RF-15 | 3 | El usuario puede tener **varios planes** y activar uno. |
| RF-16 | 3 | La app puede incorporar **planes prediseñados** (PPL, Upper/Lower, full-body) distribuibles/vendibles. |

### Entrenamiento (el loop)

| ID | Fase | Requisito |
|----|------|-----------|
| RF-20 | 1 | Al entrenar, la cabecera muestra `Semana XX · Día N de M`. |
| RF-21 | 1 | Por cada ejercicio se registra **peso y reps por serie**. |
| RF-21b | 2 | Una serie ya registrada se puede **editar o borrar** durante la sesión (A1). Al hacerlo, el **PR se recalcula** desde todo el historial del ejercicio (nunca queda congelado en una marca que ya no existe) y, si al editar al alza se bate récord, se **celebra** igual que al registrar. Borrar la única serie de una sesión la descarta (deja de ser válida). |
| RF-22b | 2 | **Historial por ejercicio** (A2): desde la ficha de un ejercicio se abre una vista con la **evolución del 1RM estimado** (gráfica de línea por sesión) + lista de sesiones con su mejor serie y nº de series. Solo lectura; vuelve a su origen con atrás/Hecho. |
| RF-22 | 1 | Antes/durante cada ejercicio se muestra el **récord personal con su fecha** y lo hecho la última vez. |
| RF-23 | 1 | Al terminar una serie, el usuario lanza un **cronómetro de descanso** configurable. |
| RF-24 | 1 | El cronómetro emite un **bip de aviso** a falta de N segundos (por defecto 10) y avisa al terminar. |
| RF-25 | 1 | El descanso por defecto es global y **configurable por ejercicio**. |
| RF-26 | 1 | Al registrar una serie, si supera el récord, la app lo detecta y lanza una **celebración** (visual + vibración + sonido). |
| RF-27 | 1 | Se guarda la **fecha/hora exacta** de cada serie registrada. |
| RF-28 | 2 | Se registra el **descanso real** tomado entre series (medido por el cronómetro). |

### Progreso e inteligencia

| ID | Fase | Requisito |
|----|------|-----------|
| RF-30 | 2 | La app calcula la **semana efectiva** del plan (avanza solo al entrenar, no por calendario). |
| RF-31 | 2 | La app muestra la **antigüedad total en el gimnasio** (tiempo, nº sesiones, series, PRs). |
| RF-32 | 2 | La app avisa cuando en una semana **no se ha superado/igualado el récord** de un ejercicio, indicando la fecha del récord vigente. |
| RF-33 | 2 | **Racha inteligente** que respeta los días de descanso del plan. |
| RF-34 | 2 | **Gráficas sencillas**: evolución de peso/reps por ejercicio, asistencia (faltas), descansos reales entre series y entre días. |
| RF-35 | 2 | **Sugerencia de progresión** (coach ligero): antes de cada ejercicio, propone el objetivo de hoy por doble progresión (subir reps hasta el tope del **rango configurable por ejercicio** y luego peso). No obliga, solo sugiere. |
| RF-36 | 2 | **Autorrelleno de series**: cada serie se precarga con lo hecho la última vez en ese ejercicio (fallback al objetivo del plan). |
| RF-37 | 2 | **Repetir última serie**: botón para copiar el peso×reps de la última serie confirmada a otra serie. |
| RF-38 | 2 | **Volumen semanal por grupo muscular**: nº de series por músculo en la semana en curso (métrica clave de hipertrofia). |
| RF-39 | 2 | **Nota de sesión**: campo de texto libre por sesión (sensaciones, molestias…). |

### Motivación y notificaciones

| ID | Fase | Requisito |
|----|------|-----------|
| RF-40 | 2 | **Frase motivadora diaria** mostrada a primera hora (mañana), teniendo en cuenta que el usuario entrena de noche. |
| RF-41 | 2 | **Aviso motivador por inactividad**: si pasan X días sin registrar actividad, mensaje de ánimo ("¡Hoy es tu día!"). |
| RF-42 | 2 | Las notificaciones garantizadas se disparan **al abrir la app**; en Android se intenta además en segundo plano (no garantizado). |
| RF-43 | 3 | Con backend, **Web Push** real para notificaciones a hora fija sin abrir la app. |

### Backup

| ID | Fase | Requisito |
|----|------|-----------|
| RF-50 | 1 | La app genera un **backup local diario**. Objetivo 00:01; si la app estaba cerrada, lo genera **al abrir** si ese día aún no existe. |
| RF-51 | 1 | El usuario puede **exportar** el backup a un fichero y **importarlo** para restaurar. |
| RF-52 | 2 | En Android se intenta el backup en segundo plano vía Periodic Background Sync. |

## 2. Requisitos no funcionales

| ID | Fase | Requisito |
|----|------|-----------|
| RNF-01 | 1 | **Offline-first**: toda la funcionalidad principal funciona sin conexión. |
| RNF-02 | 1 | **Instalable** en Android (PWA: manifest + service worker). |
| RNF-03 | 1 | **Rapidez del loop**: registrar una serie en ≤ 2 toques desde la pantalla de entrenar. |
| RNF-04 | 1 | **Legibilidad en gimnasio**: tema oscuro, números grandes, botones amplios. |
| RNF-05 | 1 | **Parametrización central**: nombre de la app y tema/colores en un único fichero (`src/config/app.config.js`). |
| RNF-06 | 1 | **Arquitectura por capas** (UI / dominio / datos) con repositorio de interfaz única. |
| RNF-07 | 1 | **Multitenant-ready**: toda entidad incluye `userId`; el dominio opera por usuario. |
| RNF-08 | 1 | **Datos portables**: export/import en JSON, propiedad del usuario. |
| RNF-09 | 3 | El salto a **nube/multiusuario** se realiza implementando `CloudRepository` sin tocar UI ni dominio. |
| RNF-10 | 3 | Empaquetable como **APK/AAB** (TWA/Bubblewrap) para Google Play sin reescribir. |
| RNF-11 | 1 | **Sin dependencias de pago** ni servicios con coste. |
| RNF-12 | 2 | La capa de dominio es **100% testeable** de forma aislada (sin UI ni IndexedDB). |

## 3. Reglas de negocio detalladas

### RB-1 · Semana efectiva
- `planStartDate` marca el inicio de la Semana 01.
- Un día realizado incrementa el contador de días de la semana actual.
- Al completar `daysPerWeek` días, la semana efectiva pasa a la siguiente.
- La inactividad **no** hace avanzar la semana. Se retoma el día pendiente.

### RB-2 · Récord personal (PR)
- Se evalúa por ejercicio en el momento de registrar la serie.
- Criterio principal: **1RM estimado** (fórmula de Epley: `peso × (1 + reps/30)`),
  para comparar objetivamente series con distinto peso/reps.
- Si el 1RM estimado de la serie **supera** el mejor previo, es PR → celebración +
  se actualiza `personalRecords` con la fecha.
- **Política de empate (unificada, A1):** si el 1RM estimado **iguala** exactamente
  el récord vigente, NO es récord nuevo (sin celebración) y la fecha del récord
  se **mantiene en la del primer logro** (la más antigua), no se adelanta. Esto es
  coherente con el recálculo de PR al editar/borrar series (`bestPRFromSets`), de
  modo que tocar cualquier serie no "mueve" la fecha del récord hacia atrás.
- **Recálculo (A1):** al editar o borrar una serie, el PR se recomputa desde todo
  el historial del ejercicio; si no queda ninguna serie válida, se elimina el PR.

### RB-6 · Sesión válida (criterio único)
- Una sesión cuenta como día entrenado **solo si tiene al menos una serie
  registrada** (`setCount > 0`). Las sesiones "fantasma" (se pulsó Empezar y no
  se registró nada) NO cuentan para semana efectiva, racha ni contadores, y se
  descartan al salir. Este criterio es único en toda la app.

### RB-3 · Racha inteligente
- El plan define días de entrenamiento y, por diferencia, días de descanso esperados.
- La racha se mantiene mientras el hueco entre sesiones no supere el descanso
  esperado + un margen de tolerancia (1 día por defecto).
- Descansar los días previstos **no** rompe la racha.

### RB-4 · Aviso de estancamiento
- Se evalúa la **última semana efectiva COMPLETADA** (no la semana en curso): no
  tiene sentido avisar de estancamiento a media semana.
- Por cada ejercicio entrenado esa semana se compara su mejor 1RM estimado con el
  mejor 1RM **histórico ANTERIOR a esa semana** (no con el PR vigente, que ya
  incluiría lo batido durante la propia semana).
- Si no se superó ese máximo previo, se marca "sin progreso esta semana" indicando
  la fecha del récord anterior.

### RB-7 · Sugerencia de progresión (doble progresión)
- **Rango de reps configurable por ejercicio** (`repMin`/`repMax` en cada plan-ejercicio).
  Respeta a quien entrena en cualquier rango: fuerza (p. ej. 4-6), hipertrofia (8-12),
  resistencia (12-15). Ya no se asume un 8-12 fijo para todos.
- Se basa en la mejor serie (por 1RM) de la última sesión en que se hizo el ejercicio.
- Si las reps de esa serie están **por debajo del tope del rango configurado**,
  se sugiere **+1 repetición** al mismo peso.
- Si se alcanzó el tope de reps, se sugiere **subir el peso** al siguiente incremento
  realista (mancuerna 2 kg, barra/máquina 2,5 kg; pesos <20 kg suben de 1,25) y
  reiniciar las reps al **mínimo del rango**.
- Sin historial, se sugiere el objetivo del plan **acotado al rango** (nunca por encima
  del máximo, aunque el `targetReps` heredado fuera mayor). Es una sugerencia, no una imposición.
- **Migración no destructiva**: los planes antiguos (que solo tenían `targetReps`) reciben
  un rango derivado (centrado ±2, mínimo acotado a 1) al arrancar, sin tocar sus datos.

### RB-5 · Frase motivadora / entreno nocturno
- Si `trainsAtNight = true`, la frase diaria se muestra en la primera apertura de la
  franja de mañana (p. ej. 05:00–12:00), no por la noche.
- El cálculo de "días sin entrenar" usa un margen para no avisar el mismo día en que
  el usuario tiene previsto entrenar por la noche.
