# Plan de Tests — Hypro

Versión 1.0 · Documento vivo.

## 1. Estrategia

La lógica crítica vive en la **capa de dominio**, que es pura (sin UI ni IndexedDB) y
por tanto se testea de forma rápida y fiable. Ahí concentramos el esfuerzo. La UI y
la persistencia se cubren con menos tests, más de integración.

Pirámide:

```
        /\        UAT (manual, docs/PLAN_UAT.md)
       /  \       E2E ligeros (flujo entrenar)
      /----\      Integración (repositorio ↔ IndexedDB)
     /------\     Unitarios de dominio  ← el grueso
```

- **Framework:** Vitest (integra nativo con Vite, cero configuración extra, gratis).
- **Entorno IndexedDB en test:** `fake-indexeddb` para probar el repositorio sin navegador.
- **Comando:** `npm run test` (una pasada) · `npm run test:watch` (desarrollo).

## 2. Tests unitarios de dominio (prioridad alta)

### 2.1 Semana efectiva (`domain/effectiveWeek`)

| Caso | Entrada | Resultado esperado |
|------|---------|--------------------|
| UT-EW-01 | Plan 3 días, 0 sesiones | Semana 01 · Día 1 de 3 |
| UT-EW-02 | Plan 3 días, 2 sesiones esta semana | Semana 01 · Día 3 de 3 |
| UT-EW-03 | Plan 3 días, 3 sesiones | Semana 02 · Día 1 de 3 |
| UT-EW-04 | 3 sesiones y luego 1 mes sin entrenar | Sigue en Semana 02 · Día 1 (no salta semanas por calendario) |
| UT-EW-05 | Plan 4 días, 7 sesiones | Semana 02 · Día 3 de 4 |
| UT-EW-06 | daysPerWeek cambia de 3 a 4 a mitad | La semana en curso respeta el histórico ya registrado |

### 2.2 Récord personal (`domain/personalRecord`)

| Caso | Entrada | Resultado esperado |
|------|---------|--------------------|
| UT-PR-01 | Primera serie de un ejercicio | Es PR (no había récord previo) |
| UT-PR-02 | 40kg×10 tras PR de 40kg×8 | Es PR (más reps, mayor 1RM estimado) |
| UT-PR-03 | 42kg×6 tras PR de 40kg×10 | Comparar por 1RM estimado (Epley) y decidir correctamente |
| UT-PR-04 | 40kg×8 tras PR de 40kg×10 | No es PR |
| UT-PR-05 | PR nuevo | `achievedAt` guarda la fecha de la serie |
| UT-PR-06 | Cálculo Epley | `peso × (1 + reps/30)` con precisión esperada |

### 2.3 Racha inteligente (`domain/streak`)

| Caso | Entrada | Resultado esperado |
|------|---------|--------------------|
| UT-ST-01 | Entrena según plan con descansos previstos | Racha se mantiene |
| UT-ST-02 | Descansa 1 día extra (dentro de tolerancia) | Racha se mantiene |
| UT-ST-03 | Deja pasar más días de los previstos + margen | Racha se rompe |
| UT-ST-04 | Sin sesiones | Racha = 0 |

### 2.4 Antigüedad total (`domain/gymTenure`)

| Caso | Entrada | Resultado esperado |
|------|---------|--------------------|
| UT-GT-01 | gymStartDate hace 5 meses, 47 sesiones | "5 meses y N días", 47 sesiones |
| UT-GT-02 | Agregados | Cuenta correcta de series y PRs totales |

### 2.5 Aviso de estancamiento (`domain/plateau`)

| Caso | Entrada | Resultado esperado |
|------|---------|--------------------|
| UT-PL-01 | Semana sin superar PR de un ejercicio | Marca "sin progreso" con fecha del PR vigente |
| UT-PL-02 | Semana con nuevo PR | No marca estancamiento |

## 3. Tests de integración (repositorio ↔ IndexedDB)

| Caso | Descripción |
|------|-------------|
| IT-DB-01 | Crear/leer/actualizar/borrar cada entidad cumple el contrato del repositorio |
| IT-DB-02 | Export produce un JSON que Import restaura idéntico (round-trip) |
| IT-DB-03 | El backup diario no se duplica si ya existe el `dateKey` de hoy |
| IT-DB-04 | Editar un plan no altera `sessions`/`loggedSets` históricos (editar sin drama) |
| IT-DB-05 | El contrato del repositorio es el mismo que deberá cumplir `CloudRepository` |

## 4. Tests E2E ligeros (flujo real)

| Caso | Descripción |
|------|-------------|
| E2E-01 | Crear plan → añadir día "Full Body" → añadir ejercicios → entrenar → registrar series |
| E2E-02 | Registrar una serie que bate récord dispara la celebración |
| E2E-03 | Cronómetro de descanso emite bip a falta de 10s y avisa al final |
| E2E-04 | Cerrar y reabrir la app conserva todos los datos (offline) |

## 5. Criterios de "hecho"

- Todos los unitarios de dominio en verde.
- Integración de repositorio en verde, incluido el round-trip de export/import.
- Los casos E2E de Fase 1 verificados (al menos manualmente vía PLAN_UAT).
- Sin errores en consola al arrancar la PWA instalada.
