# Calendar screen for viewing and retroactively logging past sessions (F3)

A new "Calendario" tab renders a Monday→Sunday monthly grid of trained days (colored by each session's real `startedAt`), lets the user open a read-only detail of any trained day, and lets them log a past/today day set by set with no rest timer. Logging routes through the existing domain methods `canLogPastSession` (barrier) and `logPastSession` (persist), weights are converted to kg via `displayToKg`, and each sub-screen registers a nav layer so Android back returns to the calendar. The screen reads `listValidSessions` as its only source of truth, so it never invents a parallel week model.

Watch for: a stale-closure repaint bug in the "add extra set" button that renumbers the wrong set (confirmed); the `blocked` CSS class and `calendar.futureBlocked`/`calendar.pickExercise` i18n keys are defined but never used (confirmed); and a double-detail quirk where a day with two sessions renders both under the same date but only one plan-day name can be meaningful (possible, minor).

**Verdict**: APPROVED

## High-level view

The month grid is correct. The Monday-first offset uses `(first.getDay() + 6) % 7`, day keys are built by hand as `YYYY-MM-DD` from local year/month/day (matching how `dateKey` derives keys from a session's local `startedAt`), so trained/today classification lines up with no off-by-one. The noon-sealing helper (`sealedISO` → local 12:00) is the right call: it keeps the day stable when converted to a UTC ISO string and sits comfortably inside the barrier's "end of today" window, so today is loggable and any future day is rejected.

Future logging is blocked where it matters — at the domain barrier — not in the UI. Every empty-day click calls `canLogPastSession` and bails on `!ok`, and `logPastSession` re-checks the same barrier and throws, which the save handler catches and surfaces as a toast. There is no click path that reaches `logPastSession` without passing the barrier first. The `.cal-day.blocked` style and the `calendar.futureBlocked` fallback string are leftovers from an earlier "grey out the future" idea that the barrier-driven approach made unnecessary.

The log flow collects sets correctly: empty rows return `null` from `getData()` and are skipped, surviving rows are renumbered contiguously via a running counter, weight is converted to kg only in the `weight_reps` branch, and the three tracking types each emit the right null-shaped payload. The one defect is in the per-exercise "add set" button, which derives the new set number from a live DOM count captured in a closure, producing a wrong `setNumber` label after rows are deleted — cosmetic only, because `save()` renumbers from scratch anyway.

Navigation layers are balanced. Each of the three sub-screens (detail, log, empty-day) pushes exactly one layer after appending to root, and every exit path — done, cancel, save-success, and the Android back gesture — removes exactly one. Month prev/next correctly does *not* push a layer, because the calendar is the tab's base view and tab switches call `clearLayers()`.

<details>
<summary>Issues (4)</summary>

1. **Stale set-number in "add set"** — `calendarScreen.js:266` computes the new row's `setNumber` from `exSets.querySelectorAll('.set-row').length + 1` captured when the card was painted; after deleting rows this labels the extra set wrong. Harmless (save renumbers), but fix by tracking a per-exercise counter if the label matters.
2. **Unused `blocked` styling** — `.cal-day.blocked` (`styles.css`) and the `calendar.futureBlocked` string are never applied/used in the render loop; either wire them to future-day cells or drop them.
3. **Unused i18n key `calendar.pickExercise`** — defined in `es.js` but never referenced in `calendarScreen.js`; remove or use.
4. **Two-sessions-same-day detail** — `renderSessionDetail` renders every session for the day (good) but the empty-day log path can't target a day that already has a session, so a second same-day session can only arrive via live training; detail display is fine, just confirm the grouping-by-exercise reads naturally when two plan days land on one date.

</details>

<details>
<summary>Details</summary>

### Month grid: offset, day→date mapping, and the noon seal

The leading blank count is `const lead = (first.getDay() + 6) % 7` (`calendarScreen.js:94`). `getDay()` returns 0=Sunday..6=Saturday; the `+6 % 7` rotation maps Monday→0 … Sunday→6, which matches the weekday header order `['Mon'..'Sun']`. `daysInMonth` uses the day-0-of-next-month trick (`new Date(year, month+1, 0).getDate()`), correct for every month including leap February.

Day classification is consistent with the session index because both sides derive keys the same way. Sessions are bucketed with `dateKey(s.startedAt)` (`calendarScreen.js:65`), and `dateKey` builds `YYYY-MM-DD` from local `getFullYear/getMonth/getDate`. The grid builds the same string by hand for each day (`calendarScreen.js:101`). A session whose `startedAt` is stored in UTC lands on the day the user actually trained in their own timezone, and the grid cell for that local day matches. No off-by-one.

The `sealedISO` helper (`calendarScreen.js:31`) returns `new Date(year, month, day, 12, 0, 0).toISOString()` — local noon. Sealing at midnight would risk a day shift when serialized to UTC for users west of GMT (local 00:00 → previous-day 23:00Z) or east (→ next-day); noon gives a ±12h margin, far more than any real offset, so the ISO string's date component always reflects the intended day. Noon also sits inside the barrier's acceptance window for today, so "log today" works.

### The barrier and the future: blocked at the domain, not the UI

Empty-day clicks compute `iso = sealedISO(...)` and gate on `await app.canLogPastSession(plan, iso)` (`calendarScreen.js:116-120`). `canLogPastSession` (`appService.js`) rejects when `when > endOfToday` (today at 23:59:59.999). For a future day, noon of that day exceeds end-of-today → `{ok:false}` → the handler toasts and returns without opening the log screen. For today, noon ≤ end-of-today → allowed. The same barrier runs again inside `logPastSession` and throws on failure, and `save()` wraps the call in try/catch and toasts `err.message` (`calendarScreen.js:292-298`). So there are two independent gates and no path to `logPastSession` that skips them.

Future cells are not visually distinguished (the loop never adds the `blocked` class), so a user can tap a future date and get a toast rejection rather than seeing it greyed out. The barrier makes that safe, but it leaves `.cal-day.blocked` and `calendar.futureBlocked` as dead declarations.

### Log flow: collection, skip, renumber, unit, tracking

`save()` walks `rows`, calls `getData()` on each, skips `null`, and assigns `setNumber: n` from a running counter incremented only for surviving rows (`calendarScreen.js:285-290`). This guarantees contiguous 1..n numbering regardless of which rows were left empty or deleted — the per-row label is only decorative.

`getData()` in `buildSetRow` (`calendarScreen.js:349-369`) branches on tracking: `time` emits `{weight:null, reps:null, durationSeconds:d}` and skips when `d<=0`; `reps_only` emits `{weight:null, reps:r}` and skips when `r<=0`; `weight_reps` emits `{weight: displayToKg(w, unit), reps:r}` and skips when `r<=0`. Weight is converted to kg exactly once, only in the branch that has a weight, matching the canonical-kg storage rule. The payload shape (`{exercise, weight, reps, durationSeconds, isWarmup, rir}`) is exactly what `logPastSession` forwards to `logSet`, which itself coerces non-finite numbers to null — so passing `null` for the unused dimensions is handled downstream.

The "add extra set" handler is the one real defect:

```js
onClick: () => addRow(exSets.querySelectorAll('.set-row').length + 1)
```

`addRow(setNumber)` uses `setNumber` only for the visible `.setno` label. The count is read live at click time, so after the user deletes a row (which calls `el.remove()`), the next "add set" reuses a number that may already be shown on another row. It never affects persistence because `save()` renumbers. Low severity; fix with a monotonic per-card counter if the label is user-visible enough to matter.

### Navigation layers: push/pop balance

The pattern matches the rest of the codebase (`exercisesScreen`, `planScreen`, `exerciseHistoryScreen`): append the sub-screen to `root`, then `pushLayer(() => renderCalendar(root, app, calView))` as the last line. Three sub-screens each push once:

- detail → `pushLayer` at `calendarScreen.js:182`, popped by the Done button's `back()` at `:143`.
- log → `pushLayer` at `:304`, popped by cancel (`:276`), by save-success (`:294`), or the back gesture.
- empty-day (no plan days) → `pushLayer` inside `finishBack` at `:378`, popped by its Done at `:375`.

Button paths call `popLayer()` (which does `stack.pop()` + `history.back()` to consume the pushed state) and then re-render the calendar. The Android back path is handled entirely inside `nav.js`'s `popstate` listener: it pops the stack and invokes the layer's `close` (which re-renders the calendar) — the button's own `popLayer` is not involved there, so there's no double-pop. Every push has exactly one matching pop on every exit path; no leaks, no double-push.

Month prev/next (`goMonth`, `calendarScreen.js:71-76`) deliberately re-calls `renderCalendar` without pushing a layer. Correct: the calendar is the tab's base layer (layer depth 0), and `navigate()` in `main.js` calls `clearLayers()` on every tab switch, so changing months must not grow the stack — otherwise back would step through month history instead of leaving the tab. Confirmed `main.js:navigate` calls both `cancelRestTimer()` and `clearLayers()` before rendering.

### Data integrity: single source of truth

The grid is built from `app.repo.listValidSessions(app.userId)` filtered to the active plan (`calendarScreen.js:61`), the same source the effective-week aggregates (`weeklyVolume`, `weeklyPlateaus`, `currentWeekPlanDayIds`) use. The calendar only groups those sessions by local day for display; it computes nothing about weeks and persists nothing of its own. Logging goes exclusively through `logPastSession`, which seals the session with the chosen date and lets position be derived from chronological order (Opción A). So the calendar stays consistent with the "N sessions = 1 week" model and cannot drift from it.

</details>

<details>
<summary>Files changed</summary>

- `src/ui/screens/calendarScreen.js` (NEW) — month grid, session detail sub-screen, log-past sub-screen, and a non-persisting `buildSetRow` collector.
- `src/main.js` — import `renderCalendar` and register the `calendar` tab (icon `ex_crunch`).
- `src/i18n/es.js` — `nav.calendar` + `calendar.*` block (two keys unused: `calendar.futureBlocked` fallback is referenced but `calendar.pickExercise` is not).
- `src/ui/styles.css` — `.cal-*` grid/weekday/day/legend styles (`.cal-day.blocked` unused).

Full diff: `git -C "<repo>" diff` plus untracked `src/ui/screens/calendarScreen.js`.

</details>
