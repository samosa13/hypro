# Plan de UAT (Pruebas de Aceptación de Usuario) — Hypro

Versión 1.0 · Documento vivo.

Estas pruebas las hace **el usuario** con la app real en su móvil Android. Cada una
describe el escenario, los pasos y el resultado esperado. Marca ✅/❌ y anota notas.

> Objetivo de la Fase 1: comprobar que la app sustituye a la libreta del gimnasio.

## Cómo registrar el resultado

| Campo | |
|-------|--|
| Fecha de la prueba | |
| Versión / dispositivo | |
| Resultado global | ✅ / ❌ |

---

## Fase 1 — MVP "libreta digital"

### UAT-01 · Instalar la app en Android
- **Pasos:** abrir la URL en Chrome Android → "Añadir a pantalla de inicio" → abrir el icono.
- **Esperado:** la app abre a pantalla completa, sin barra de navegador, funciona sin conexión.
- Resultado: ☐

### UAT-02 · Explorar la librería de ejercicios
- **Pasos:** entrar en "Ejercicios" → filtrar por "pierna" → filtrar por "mancuerna" → buscar "press".
- **Esperado:** aparecen ejercicios con su icono; filtros y búsqueda funcionan.
- Resultado: ☐

### UAT-03 · Crear un ejercicio propio
- **Pasos:** "Ejercicios" → añadir → nombre, grupo muscular, equipo, icono → guardar.
- **Esperado:** el ejercicio aparece en la lista y es seleccionable en un plan.
- Resultado: ☐

### UAT-04 · Crear un plan con día de nombre libre
- **Pasos:** "Plan" → nuevo → "3 veces/semana" → Día 1 nombre "Full Body" → añadir ejercicios → fijar series/reps/peso/descanso.
- **Esperado:** el día se guarda con su nombre y ejercicios en el orden elegido.
- Resultado: ☐

### UAT-05 · Editar el plan sin perder historial
- **Pasos:** entrenar y registrar algo → volver a "Plan" → cambiar ejercicios y renombrar el día → volver a "Progreso".
- **Esperado:** el plan cambia, pero el historial y los PRs anteriores siguen intactos.
- Resultado: ☐

### UAT-06 · Entrenar: cabecera de semana y día
- **Pasos:** "Entrenar".
- **Esperado:** arriba se lee `Semana XX · Día N de M` coherente con lo entrenado.
- Resultado: ☐

### UAT-07 · Registrar series (peso y reps)
- **Pasos:** en el ejercicio, meter peso y reps de cada serie y confirmarlas.
- **Esperado:** registrar una serie cuesta ≤ 2 toques; se ve lo hecho la última vez.
- Resultado: ☐

### UAT-08 · Récord personal con fecha
- **Pasos:** observar la cabecera del ejercicio antes de empezar.
- **Esperado:** muestra "PR: X reps × Y kg (fecha)".
- Resultado: ☐

### UAT-09 · Celebración de récord
- **Pasos:** registrar una serie que supere el récord.
- **Esperado:** celebración visual + vibración + sonido; queda marcada como PR.
- Resultado: ☐

### UAT-10 · Cronómetro de descanso con bip
- **Pasos:** terminar una serie → pulsar para iniciar descanso (p. ej. 90s).
- **Esperado:** cuenta atrás; bip a falta de 10s; aviso al llegar a 0.
- Resultado: ☐

### UAT-11 · Descanso configurable
- **Pasos:** cambiar el descanso por defecto en Ajustes y el descanso de un ejercicio concreto.
- **Esperado:** el cronómetro usa el valor correcto según el ejercicio.
- Resultado: ☐

### UAT-12 · Backup diario y export/import
- **Pasos:** abrir la app (genera backup del día) → Ajustes → exportar a fichero → borrar datos → importar el fichero.
- **Esperado:** los datos se restauran idénticos.
- Resultado: ☐

### UAT-13 · Persistencia offline
- **Pasos:** poner el móvil en modo avión → usar la app → cerrarla y reabrirla.
- **Esperado:** todo funciona y los datos persisten sin conexión.
- Resultado: ☐

---

## Fase 2 — Inteligencia (cuando esté disponible)

### UAT-20 · Doble métrica de tiempo
- **Esperado:** "Semana efectiva N del plan" + "Antigüedad total: X meses, N sesiones".

### UAT-21 · Semana efectiva tras ausencia
- **Pasos:** no entrenar 3-4 semanas → volver.
- **Esperado:** la semana efectiva no ha saltado; se retoma el día pendiente.

### UAT-22 · Aviso de estancamiento
- **Esperado:** al cerrar semana, avisa de ejercicios sin superar PR con la fecha del PR vigente.

### UAT-23 · Racha inteligente
- **Esperado:** descansar los días previstos no rompe la racha; abandonar sí.

### UAT-24 · Gráficas
- **Esperado:** evolución por ejercicio, asistencia, descansos reales; claras y no abrumadoras.

### UAT-25 · Frase motivadora matutina
- **Esperado:** por la mañana muestra frase; respeta que el usuario entrena de noche.

### UAT-26 · Aviso por inactividad
- **Esperado:** tras X días sin registrar, mensaje motivador al abrir (y en segundo plano si Android lo permite).
