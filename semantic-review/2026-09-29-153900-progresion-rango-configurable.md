# Configurable target rep-range per plan-exercise for the progression coach

The double-progression coach previously hard-coded an 8–12 rep window for everyone, so a strength trainee working at 6 reps was nudged toward 12. This change gives each plan-exercise its own `repMin`/`repMax`. Two pure helpers (`deriveRepRange`, `normalizeRepRange`) are added to `progression.js`; a non-destructive bootstrap migration (`reconcilePlanExerciseRanges`) backfills the range on legacy plan-exercises from their `targetReps`; the add-exercise form swaps its single "reps" input for min/max; and `suggestionFor` now feeds the per-exercise range into `suggestNext`. `repMin`/`repMax` are stored as free fields with no index, deliberately avoiding a Dexie schema bump. 61 tests pass and the build is clean.

Watch for:
- **(confirmed)** `targetReps` and the new range can drift apart. A trainee at 6 reps whose legacy `targetReps` was 12 migrates to a range of `{min:10,max:14}`, and the no-history suggestion / train-screen prefill will still push 12 — the exact failure this feature set out to kill, for users who had already tuned `targetReps` down but left it high.
- **(confirmed)** The range is write-once from the UI: there is no edit form for an existing plan-exercise's range. To change it you delete and re-add.
- **(possible)** The migration runs a full table scan of `planExercises` (all users) on every single bootstrap, even once nothing is left to migrate.

**Verdict**: NEEDS_CHANGES

## High-level view

The migration is correctly non-destructive and idempotent. It only writes plan-exercises where `repMin`/`repMax` are missing, copies the record with the two new fields, and leaves everything else untouched. Storing the fields without an index means no Dexie version bump is needed — Dexie stores arbitrary properties on records regardless of the declared schema, so this is sound. The guard `pe.repMin > 0 && pe.repMax > 0` is the idempotency key and it holds because `deriveRepRange` never produces a zero.

The weakest point is the relationship between the legacy `targetReps` and the new `[repMin, repMax]`. For freshly-added exercises the form derives `targetReps` from the range center, so they always agree. But migration goes the other way (range from `targetReps`), and there is no ongoing invariant tying them together afterward. `targetReps` still independently drives two things: the no-history branch of `suggestNext` and the set prefill in the train screen. Whenever `targetReps` sits outside the stored range, those two paths contradict the range the coach claims to respect.

The navigation of the Plan screen is intact. The add-exercise form was restructured (three `grid2` rows instead of two) but the layer push/pop flow, the back button, the `scrollToDayId` return, and the delete-exercise path are all unchanged. There was never a per-exercise edit form, so the form change could not have broken a return path that didn't exist.

The degenerate `min == max` range is handled correctly by `suggestNext` and has a dedicated label branch, though it is untested.

The full-scan `listAllPlanExercises` is fine for a single-user local PWA but is the one piece that would need rethinking under the multi-tenant/backend future the repository contract explicitly anticipates.

<details>
<summary>Issues (5)</summary>

1. **targetReps can fall outside the migrated range** — After migration (or after any future `targetReps` edit), `targetReps` is not clamped to `[repMin, repMax]`. The no-history suggestion and the train-screen prefill read raw `targetReps`, so they can sit outside — and above — the coach's own range, reproducing the "pushed to 12" bug for users who had lowered `targetReps` but whose legacy value was high. Clamp `targetReps` into the range at migration time, or clamp the no-history/prefill reps against the range at read time.
2. **No edit path for an existing range** — `repMin`/`repMax` can only be set when adding an exercise; changing them requires delete + re-add, which loses the exercise's `order` position and is a jarring UX for a "configurable per exercise" feature. Consider making the plan-exercise row editable.
3. **Migration full-scans on every bootstrap** — `reconcilePlanExerciseRanges` loads all plans, all planDays, and all planExercises on every launch even when there is nothing left to migrate. Harmless at local scale but pure waste; a cheap "any plan-exercise missing a range?" short-circuit would avoid it.
4. **`min == max` degenerate range is untested** — `suggestNext` behaves correctly when `min == max` (at the cap it bumps weight and resets reps to that single value) and `repRangeLabel` has a branch for it, but no test locks either in. Add one.
5. **`listAllPlanExercises` won't survive multi-tenant** — the full scan of `planExercises` plus in-memory filtering ignores `userId` at the query level. Fine for now; flag for the eventual `cloudRepository.js`.

</details>

<details>
<summary>Details</summary>

### targetReps drifts out of the range it's supposed to live in

This is the one behavioral defect. The feature's stated goal is that the coach stop pushing a 6-rep trainee toward 12. The `suggestNext` path now honors that through `repRange`. But two other paths still read `targetReps` raw, and nothing guarantees `targetReps ∈ [repMin, repMax]` after migration.

For a **newly added** exercise the form keeps them consistent:

```js
const range = normalizeRepRange(repMin.value, repMax.value);
// ...
targetReps: Math.round((range.min + range.max) / 2),   // always inside [min,max]
```

For a **migrated legacy** exercise the derivation is the inverse — range centered on `targetReps` — so `targetReps` also lands inside, *as long as the user never touched `targetReps` independently*. The problem is the realistic migration case this feature targets: a user trained at 6 reps but whose plan still carried `targetReps: 12` (the old default they never bothered to lower, since the coach ignored it anyway). Migration produces:

```
deriveRepRange(12) → { min: 10, max: 14 }
```

Now the coach's range is 10–14 — still wrong for a 6-rep trainee — and worse, `targetReps` (12) drives the no-history suggestion and the set prefill:

```js
// progression.js — no history
const r = target.targetReps ?? min;         // 12, not min
return { ..., reps: r, kind: 'plan', ... };  // "Objetivo: 12 reps"

// trainScreen.js — prefill
const prefillReps = last ? last.reps : (pe.targetReps ?? 0);  // 12
```

So the first workout after migration still prefills 12 reps. The feature quietly assumes `targetReps` was already a sensible center, but the migration exists precisely because legacy data was *not* curated. The fix is to make the range authoritative once it exists: either clamp `targetReps` into `[min,max]` inside `reconcilePlanExerciseRanges` (one extra line on the record being written), or clamp the reps read in the no-history branch and the prefill against the range. Clamping at migration is simpler and keeps the two fields honest for every downstream reader.

### Migration correctness: non-destructive, idempotent, schema-safe

The three claimed properties hold.

*Non-destructive*: the update copies the whole record and adds two fields — `toUpdate.push({ ...pe, repMin: min, repMax: max })` — so no existing field, including `targetReps`, is dropped, and `bulkPut` on the same `id` is a field-merge-by-overwrite of the full object, not a partial wipe.

*Idempotent*: the guard `if (pe.repMin > 0 && pe.repMax > 0) continue;` skips already-migrated records, and `deriveRepRange` can never yield a zero (`min` is `Math.max(1, …)`, and the invalid-input fallback is `{8,12}`), so a migrated record always re-satisfies the guard on the next run. No oscillation.

*Schema-safe*: Dexie only needs a version bump when **indexes** change; it stores arbitrary non-indexed properties on any record. `repMin`/`repMax` are never queried by range, so keeping them out of the v2 `stores(...)` declaration and off a version bump is correct, and the inline comment saying so is accurate.

One edge worth noting, not a blocker: the guard treats a legitimately migrated `{min:1, ...}` correctly (1 > 0), but a hand-crafted or future record with `repMin: 0` would be re-migrated every launch. Nothing produces `repMin: 0` today, so this is latent, not live.

### Plan-screen navigation survived the form change

The obligatory quality bar — where you start, where you go, where you return, at both the day-card and record level — is intact.

```
Plan (renderPlan)
  └─ Edit day (openEditDay)  ──pushLayer(→ renderPlan {scrollToDayId})
       ├─ add exercise   → savePlanExercise → paintExercises()   (stays in layer)
       ├─ delete exercise→ confirmDialog → deletePlanExercise → paintExercises()
       └─ Done / back gesture → popLayer → renderPlan {scrollToDayId: day.id}
```

The diff only reshuffles the add-exercise form's inner layout (weight moved up next to sets; a new rep-range `grid2` row; rest on its own row with a spacer `h('div', {})`). The layer registration, the `back` handler, the `pushLayer` return target, and the `scrollToDayId` scroll-back are all untouched. `paintExercises` still re-renders in place after add/delete. Critically, there is no per-exercise **edit** form in this screen and never was — you add or you delete — so the form restructuring had no return path to break. The meta line now routes reps through `repRangeLabel(pe)` instead of `pe.targetReps`, which is display-only.

The spacer `h('div', {})` in the rest row is a deliberate grid filler; harmless.

### Degenerate range (min == max) is handled but unlocked by tests

Feeding `{min:8, max:8}` through `suggestNext`: below the cap (`reps < 8`) it adds a rep; at or above the cap it bumps weight and resets reps to `min` (8). `repRangeLabel` collapses `min === max` to a bare `"8"`. Neither branch throws, but no test pins them, and `normalizeRepRange` explicitly permits `min == max` (e.g. `normalizeRepRange(8,8)`), so it is a reachable state through both the derive and normalize paths. Worth one test each.

### listAllPlanExercises: fine locally, a full scan by design

```js
const all = await db.planExercises.toArray();   // every plan-exercise, all users
return all.filter((pe) => dayIds.has(pe.planDayId));
```

`planExercises` carries no `userId` (it hangs off planDay → plan), so resolving ownership requires walking plans → planDays → planExercises, loading all three tables fully and filtering in memory. At single-user local scale this is negligible.

The repository header promises a future `cloudRepository.js` with identical method signatures for a multi-tenant backend. There, `toArray()` over a shared `planExercises` table is exactly the query that does not scale, and the absence of `userId` on the row means a backend can't index the ownership filter either. A note for whoever writes the cloud repository — either denormalize `userId` onto `planExercises` or express the join server-side.

</details>

<details>
<summary>Files changed</summary>

- `src/domain/progression.js` — adds `deriveRepRange` and `normalizeRepRange` pure helpers; `suggestNext` already consumed `repRange`.
- `src/domain/appService.js` — adds `reconcilePlanExerciseRanges` (bootstrap migration) and threads `repRange` through `suggestionFor`.
- `src/data/repository.js` — adds `listAllPlanExercises` (full scan + join) and `bulkPutPlanExercises`.
- `src/ui/screens/planScreen.js` — min/max inputs replace single reps input; `repRangeLabel` helper; derives `targetReps` from range center on save.
- `src/i18n/es.js` — new `plan.repRange/repMin/repMax/repRangeHint` keys; `plan.exerciseMeta` reworded.
- `test/improvements.test.js` — +6 tests for low/high ranges, `deriveRepRange`, `normalizeRepRange`.

Full diff: `git diff main` in the repo root.

</details>
