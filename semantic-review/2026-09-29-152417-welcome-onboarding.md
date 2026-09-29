# Welcome/onboarding screen: navigation and return-flow review

The change adds an onboarding screen shown when the user has no active plan. Instead of the near-empty Entrenar tab, `navigate()` intercepts `train` when `getActivePlan` returns falsy and renders `renderWelcome` with a CTA that calls `navigate('plan')`. The screen is drawn directly on `root` like a tab body, not as a nav layer.

Watch for: one real gap — the tabbar shows "Entrenar" as active while the welcome (not the Entrenar screen) is visible (confirmed, low/cosmetic). The core flow — return from Plan, re-showing welcome if the plan isn't created, back-gesture behavior, and i18n keys — is coherent and loop-free.

**Verdict**: APPROVED

## High-level view

The plan check runs on every `navigate('train')` via `await app.repo.getActivePlan`, so the welcome/Entrenar decision is always recomputed from current state. There's no cached flag, which is what makes the return flow safe: create the plan and go back to Entrenar → real screen; skip creation and tap Entrenar → welcome again. Both are correct and there's no loop, because the CTA only ever navigates to `plan` (never re-enters `train` on its own).

The welcome intentionally registers no nav layer, and that's the right call: `navigate()` calls `clearLayers()` on entry, and the welcome is a top-level tab body, not a sub-screen. The Android back gesture from welcome behaves exactly like back from any other top-level tab (empty layer stack → natural back), so nothing weird happens.

`renderWelcome` doesn't itself cancel the rest timer or clear layers, but it doesn't need to: `navigate()` already runs `cancelRestTimer()` and `clearLayers()` before every render, welcome included. The one incoherence is purely visual: the chrome highlights the Entrenar tab while showing onboarding content.

<details>
<summary>Issues (2)</summary>

1. **Active-tab vs. content mismatch** — With welcome shown, the tabbar marks "Entrenar" active but the body is onboarding, not the Entrenar screen. Cosmetic; acceptable for an empty-state, but note it's a slight incoherence. Optionally suppress the active highlight while in welcome state.
2. **Unused i18n key** — `welcome.title` exists in `es.js` but is never used by `welcomeScreen.js` (the hero builds the name from `APP.name`). Harmless; remove or leave as-is.

</details>

<details>
<summary>Details</summary>

### Active-tab highlight while showing welcome

`renderChrome()` sets the active class from `current`, and `navigate('train')` sets `current = 'train'` before the plan check and the welcome return. So the tabbar shows Entrenar active while the welcome body is on screen (confirmed, `main.js` `navigate` sets `current` then returns early after `renderWelcome`). For an empty-state this is the conventional and least-surprising choice — the user did land on the Entrenar tab, they just have no plan yet — so it's defensible. If you want strict coherence, you could skip the active highlight when the welcome is showing, but that adds state for little gain.

### Return flow and re-showing the welcome (no loop)

The plan gate is `if (tabId === 'train' && !(await app.repo.getActivePlan(app.userId)))`, evaluated fresh on every navigation to `train`. This makes the two return paths correct without any extra bookkeeping (confirmed):

- Create plan in Plan → `planScreen` `save()` persists then `popLayer()`/re-renders; tapping Entrenar re-runs `navigate('train')`, `getActivePlan` now returns the plan, and the real Entrenar screen renders.
- Skip creation → tapping Entrenar re-runs the same check, still no plan, welcome shows again. This is the intended behavior.

There's no loop risk: the CTA's only action is `navigate('plan')`, which never routes back into `train`. Welcome never navigates to itself, and it registers no layer, so back-then-forward can't wedge it into an inconsistent state.

### Back gesture and the nav layer stack

`renderWelcome` deliberately does not call `pushLayer`, unlike sub-screens in `planScreen` (the day editor / create-plan sub-screen push layers). That's correct here: welcome is a top-level tab body, not a sub-screen you should be able to "close" with back. Because `navigate()` calls `clearLayers()` before rendering welcome, the stack is empty while welcome is visible. A back gesture then hits `popstate` with an empty stack → the listener lets the back proceed naturally (same as pressing back on any top-level tab). So the gesture does nothing surprising — it behaves identically to back from a normal empty tab. Confirmed against `nav.js` (`initNav` pushes one base state; empty-stack popstate is a no-op that lets the browser back run).

### Timer/layer cleanup on entry

`renderWelcome` doesn't clear the rest timer or layers itself, but `navigate()` runs `cancelRestTimer()` and `clearLayers()` at the top of every call, before the welcome branch. So entering welcome from a mid-workout Entrenar screen (timer running) or from a sub-screen (layer open) is already cleaned up. No action needed. Note this coupling: the safety depends on `navigate()` doing the cleanup, so if welcome is ever rendered from somewhere other than `navigate()`, the cleanup would be missed — but no such path exists today.

### i18n keys

All keys used by `welcomeScreen.js` — `welcome.subtitle`, `welcome.pitch`, `welcome.feature1`, `welcome.feature2`, `welcome.feature3`, `welcome.cta` — exist in `es.js` (confirmed). `welcome.title` is defined but unused. `t()` falls back to the key string if a key is missing, so a future typo would render visibly rather than crash.

</details>

<details>
<summary>File map</summary>

- `src/ui/screens/welcomeScreen.js` (new) — `renderWelcome(root, app, onStart)`; hero + pitch card + CTA button. No layer push (correct for a tab-level body).
- `src/main.js` — `navigate()` intercepts `train` with no active plan and renders welcome, returning before the normal tab render; cleanup (`cancelRestTimer`/`clearLayers`) runs before the branch.
- `src/i18n/es.js` — `welcome.*` keys; all used ones present, `welcome.title` unused.
- `src/ui/styles.css` — `.welcome-*` classes (not reviewed per request).

</details>
