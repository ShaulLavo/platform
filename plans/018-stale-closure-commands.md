# Plan 018: Fix `toggleWallpaper` and `toggleDiffViewMode` reading frozen settings

> **⚠️ CORRECTION — this plan's premise was wrong. Read this before anything below.**
>
> An executor ran Step 1, could not reproduce the bug, and stopped. It was right.
>
> The plan claims the incomplete dependency array freezes `diffViewMode` and
> `wallpaperEnabled` in a stale closure. **It does not**, because
> `openFileAtRef` — which _is_ in the array — is not stable.
> `apps/web/src/features/git/hooks/use-open-file-at-ref.ts:21` returns a bare
> `async function openFileAtRef(...)` with no `useCallback` wrapper, so it gets a
> fresh identity on every render. That changes the dependency array every render,
> so the `useCallback` **never holds**, the callback is rebuilt every render, and
> both settings values are captured fresh. The toggles work.
>
> The author of this plan read the dependency array and reasoned from it without
> running the toggle. Step 1 existed precisely to catch that, and did.
>
> **What is actually true, and is still worth fixing — as a different, smaller job:**
>
> 1. The `useCallback` at `commands.ts:124` is **inert**: a memo that never
>    memoizes, because one of its own dependencies defeats it every render.
>    `AGENTS.md` says to use `useCallback` "only for measured performance issues,
>    required stable identity, or correctness". This qualifies as none of them.
>    Deleting it is the honest change.
> 2. The dependency array **is** genuinely incomplete — `diffViewMode`,
>    `wallpaperEnabled`, `setDiffViewMode`, `setWallpaperEnabled` and `setSetting`
>    are all absent. Harmless today, but it is a **latent bug armed by a future
>    fix**: the day someone wraps `openFileAtRef` in a `useCallback` — an obvious,
>    well-intentioned cleanup — the memo starts holding and the stale-closure bug
>    this plan describes becomes real, with no test to catch it.
>
> So the rescoped job is: **delete the inert `useCallback`, or complete its
> dependency array — and add the regression tests below either way.** The tests
> in the test plan are still correct and still worth writing; they pin behavior
> that is currently right by accident. Case 4 (the toggle reflects an
> externally-changed setting) is the one that would fail if the memo ever starts
> holding.
>
> Everything below describes the mechanism accurately; only its claimed
> _consequence_ is wrong. Read "Why this matters" as a description of the trap,
> not of a live defect.

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat ace313f..HEAD -- apps/web/src/keymap`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpt against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

Two commands are one-way switches. `workspace.toggleWallpaper` and
`workspace.toggleDiffViewMode` each read a settings value out of a stale
closure, so they compute "the opposite of whatever the value was when the
component first mounted" rather than "the opposite of the current value."

Concretely: `workbench.wallpaper.enabled` defaults to enabled. The first
invocation reads `true` and writes `false` — correct. The second invocation reads
the _same captured_ `true` and writes `false` again. The wallpaper never comes
back without a reload. `toggleDiffViewMode` has the identical shape.

Neither command has any test coverage.

What makes this worth a plan rather than a one-line dep-array edit: **the React
Compiler is enabled in this repo and it does not save you here.** The oxlint
config at `.oxlintrc.json` runs `oxc-plugin-react-compiler` with
`preserve-manual-memoization` set to `error`. Because this `useCallback` carries
a hand-written dependency array, the compiler preserves it as authored instead of
inferring the correct one — so the incomplete array ships. The lint gate that
looks like it would catch this is precisely the mechanism that lets it through.

## Current state

`apps/web/src/keymap/commands.ts:86-176`, `usePlatformCommandDispatch`.

The two settings values, read from a hook at lines 100–108:

```ts
const settings = useSettings()
const { setSetting } = useSettingsActions()
const diffViewMode =
  settings.data?.values['editor.diff.viewMode'] ?? DEFAULT_SETTING_VALUES['editor.diff.viewMode']
const setDiffViewMode = (mode: EditorDiffViewMode) => setSetting('editor.diff.viewMode', mode)
const wallpaperEnabled =
  settings.data?.values['workbench.wallpaper.enabled'] ??
  DEFAULT_SETTING_VALUES['workbench.wallpaper.enabled']
const setWallpaperEnabled = (enabled: boolean) => setSetting('workbench.wallpaper.enabled', enabled)
```

They are passed into the command context inside the returned `useCallback`
(lines ~123–159):

```ts
      const workspace = workspaceStore.getState()
      return dispatchWorkspaceCommand(workspaceCommand, {
        ...
        diffViewMode,
        ...
        setDiffViewMode,
        ...
        setWallpaperEnabled,
        ...
        uiMode: workspace.uiMode,
        wallpaperEnabled,
        workbenchPanels: workspace.workbenchPanels,
      })
```

And the dependency array (lines 161–176):

```ts
    [
      documentStore,
      dispatchEditorCommand,
      queryClient,
      openFileAtRef,
      openSearchEditor,
      reopenClosedEditor,
      requestEditorFocus,
      resolvedRequestCloseTab,
      selectPreviousEditor,
      setFocusArea,
      setTheme,
      showCommandPalette,
      showSettings,
      workspaceStore,
    ],
```

**`diffViewMode`, `wallpaperEnabled`, `setDiffViewMode`, and `setWallpaperEnabled`
are all absent.** The first two are values; the second two are arrow functions
recreated every render that close over `setSetting`, which is also absent.

### Why the other context fields are fine

This is the part that makes the fix small, and you must not "fix" it too broadly.
Note line 130:

```ts
const workspace = workspaceStore.getState()
```

Everything sourced from `workspace` — `uiMode`, `workbenchPanels`,
`chatModePanels`, `rootFolder`, `openPicker`, `setUiMode`, `setChatModePanels`,
`setWorkbenchPanels` — is read **imperatively at call time** from the store API,
so it is always current. `workspaceStore` (the stable store handle) is correctly
in the dep array. That pattern is deliberate and correct; leave it alone.

The bug is specifically that the _settings_ values took the other route — a React
hook value captured in the closure — without the dep array to match.

### The two command handlers

`apps/web/src/keymap/commands.ts:416` and `:436`:

```ts
  'workspace.toggleDiffViewMode': ({ diffViewMode, setDiffViewMode }) => {
    // Through the settings write path: the command and the settings page are two
    // front doors onto one value.
    setDiffViewMode(nextEditorDiffViewMode(diffViewMode))
    return true
  },
```

```ts
  'workspace.toggleWallpaper': ({ setWallpaperEnabled, wallpaperEnabled }) => {
    // Through the settings write path, not a store setter. The command and the
    // settings page are two front doors onto one value; if they wrote to
    // different places they would disagree the first time either was used.
    setWallpaperEnabled(!wallpaperEnabled)
    return true
  },
```

The handlers themselves are correct — they are pure functions of their context.
The defect is entirely in how the context is built. Do not edit these two
handlers.

### The lint configuration that is relevant

`.oxlintrc.json`:

```json
  "jsPlugins": ["oxc-plugin-react-compiler/eslint"],
  "rules": {
    "react/exhaustive-deps": "warn",
    "oxc-react-compiler/preserve-manual-memoization": "error",
```

Note `react/exhaustive-deps` is `"warn"`, not `"error"` — which is why the
missing dependencies never failed a build.

### Conventions to honor

From `AGENTS.md`:

> - Avoid manual React memoization. Do not add `memo`, `useMemo`, or
>   `useCallback` for ordinary render values or callbacks. Use them only for
>   measured performance issues, required stable identity, or correctness. Add a
>   short reason when you do.
> - Use guard clauses and early returns. Keep the happy path shallow.
> - Import `{ test, expect }` from `apps/web/test/fixtures.ts`, not from
>   `vitest`, for app tests.
> - Use `render.tsx`; `renderWithProviders` mirrors the app's `main.tsx` provider
>   stack.
> - Do not `mock.module` or `vi.mock` our server, client, or feature modules.

The first rule is the one that shapes the fix: this `useCallback` needs a
justification to exist at all, and if it keeps one it needs a _correct_ array
plus a comment saying why the memo is required.

## Commands you will need

| Purpose       | Command                                          | Expected on success     |
| ------------- | ------------------------------------------------ | ----------------------- |
| Web tests     | `cd apps/web && bun run test`                    | all pass                |
| Targeted test | `cd apps/web && bun --bun vitest run src/keymap` | passes                  |
| Web typecheck | `cd apps/web && bun run typecheck`               | exit 0                  |
| Web lint      | `cd apps/web && bun run lint`                    | exit 0                  |
| Full verify   | `bun run verify` (repo root)                     | exit 0                  |
| Dev server    | **already running** — do not start one           | `http://localhost:5173` |

`AGENTS.md`: "A dev server is always running. Never spin up your own server to
test or verify changes — reuse the running one."

## Scope

**In scope**:

- `apps/web/src/keymap/commands.ts` — the `usePlatformCommandDispatch` hook only
- New tests in `apps/web/src/keymap/tests/`

**Out of scope** (do NOT touch):

- The two command handler functions at `commands.ts:416` and `:436`. They are
  correct.
- Any field sourced from `workspaceStore.getState()`. That imperative read is
  deliberate, correct, and current. Adding `workspace.uiMode` or
  `workspace.workbenchPanels` to the dep array would be wrong — those values do
  not exist at hook scope.
- `apps/web/src/keymap/command-registry.ts`, `default-bindings.ts`, `types.ts`
  — the wider command-table refactor is item 17 in `plans/README.md`, a separate
  L-effort plan. **Do not start it here.** This plan fixes a bug; it does not
  restructure the command system.
- `.oxlintrc.json`. Do not promote `react/exhaustive-deps` to `error` as part of
  this plan — that will surface unrelated warnings across the app and turn a
  small bug fix into an unbounded one. Note it as a follow-up instead.
- The settings registry, `useSettings`, or `useSettingsActions`.

## Git workflow

Per the operator rule in `plans/README.md`: **all work happens on `main`** — no
new branches, worktrees, or PRs unless the operator explicitly asks.

Conventional commits. Example subject:

```
fix(keymap): the wallpaper and diff-view toggles stop reading a frozen setting
```

One commit is appropriate; the fix and its tests belong together.

## Steps

### Step 1: Reproduce the bug

In the running app at `http://localhost:5173`, invoke the wallpaper toggle twice
(via the command palette, or its keybinding if one is bound — check
`default-bindings.ts`).

**Verify**: the wallpaper turns off on the first invocation and **does not come
back** on the second. Then reload the page and toggle once more — it now goes the
other way, confirming the value was frozen at mount rather than genuinely stuck.

Repeat for the diff view mode toggle.

If both toggles already work correctly, **stop and report** — the bug may have
been fixed since this plan was written, and Steps 2–3 would be changing working
code.

### Step 2: Fix the dependency capture

Choose **one** of these two approaches. Read `AGENTS.md`'s memoization rule
before deciding.

**Option A — complete the dependency array (smaller diff).** Add the four missing
values:

```ts
    [
      diffViewMode,
      documentStore,
      dispatchEditorCommand,
      queryClient,
      openFileAtRef,
      openSearchEditor,
      reopenClosedEditor,
      requestEditorFocus,
      resolvedRequestCloseTab,
      selectPreviousEditor,
      setFocusArea,
      setSetting,
      setTheme,
      showCommandPalette,
      showSettings,
      wallpaperEnabled,
      workspaceStore,
    ],
```

If you take this route you must also stabilize `setDiffViewMode` and
`setWallpaperEnabled`, which are recreated every render. Either inline them into
the context object (calling `setSetting` directly) or wrap each in its own
`useCallback` keyed on `setSetting`. Inlining is simpler and avoids adding two
more memos that `AGENTS.md` discourages.

Note that adding `diffViewMode` and `wallpaperEnabled` means the dispatch
callback's identity now changes whenever either setting changes. Check what
consumes `usePlatformCommandDispatch` and whether any of them put it in a dep
array of their own — if a consumer re-subscribes a keyboard listener on identity
change, that is a real (if minor) cost worth noting.

**Option B — read settings imperatively, matching the workspace pattern
(preferred if a settings snapshot reader exists).** `AGENTS.md` documents:

> Settings are read through `useSettingValue` in React, or `readSettingsMirror()`
> outside it (module scope, async generators). Do not reach into the query cache
> directly.

If `readSettingsMirror()` is callable at dispatch time, read both values inside
the callback the way `workspaceStore.getState()` already does. That removes them
from the closure entirely, keeps the dep array short and the callback identity
stable, and makes the settings path structurally identical to the workspace path
— which is the more coherent design.

**Check whether `readSettingsMirror()` is safe to call in this context before
choosing B.** If it is documented as a module-scope/async-generator escape hatch
not intended for render-adjacent code, take Option A.

Whichever you choose: if the `useCallback` survives, add a one-line comment
stating why the memo is required (`AGENTS.md`: "Add a short reason when you do").
If nothing actually requires stable identity here, deleting the `useCallback`
entirely is legitimate and is the most `AGENTS.md`-aligned outcome — but confirm
no consumer depends on the identity first.

**Verify**: `cd apps/web && bun run typecheck && bun run lint` → both exit 0. The
`preserve-manual-memoization` rule is `error`, so a malformed memo fails the lint
gate.

### Step 3: Confirm the fix in the app

Repeat Step 1's reproduction.

**Verify**: the wallpaper toggles off **and back on**, repeatedly, with no
reload. Same for the diff view mode toggle.

### Step 4: Add regression tests

See the test plan below.

**Verify**: `cd apps/web && bun --bun vitest run src/keymap` → passes, including
the new tests. Confirm the new tests **fail** against the unfixed code by
stashing your Step 2 change and re-running — a regression test that never failed
is not a regression test.

### Step 5: Full verify

```bash
cd apps/web && bun run format && bun run lint && bun run test
cd /Users/shaul/Desktop/D/platform && bun run verify
```

**Verify**: all exit 0.

## Test plan

New tests in `apps/web/src/keymap/tests/` — add to the existing
`keymap.test.ts` (805 lines) if it already renders the dispatch hook, otherwise a
new `command-dispatch.test.tsx` beside it.

Use `renderWithProviders` from `apps/web/test/render.tsx` (it mirrors the app's
`main.tsx` provider stack, which this hook needs — theme, settings, focus, and
editor stores). Import `{ test, expect }` from `apps/web/test/fixtures.ts`, not
from `vitest`. Do not mock the settings module.

Cases:

1. **`workspace.toggleWallpaper` twice returns the setting to its original
   value.** This is the regression test. Render the hook, dispatch the command,
   await the settings write, dispatch again, assert the value equals the
   starting value. It must fail before Step 2.
2. **`workspace.toggleDiffViewMode` twice returns to the original mode.** Same
   shape.
3. **A single `toggleWallpaper` flips the value** — guards against a fix that
   accidentally makes the toggle a no-op in both directions.
4. **The toggle reflects an externally-changed setting.** Change
   `workbench.wallpaper.enabled` through the settings write path (as the settings
   page would), _then_ dispatch the command, and assert it toggles from the new
   value rather than the mounted one. This is the test that actually pins the
   stale-closure semantics rather than just the double-toggle symptom.

Cases 1 and 2 catch the reported bug; case 4 catches the class of bug. Write all
four.

The existing `keymap.test.ts` is the structural pattern — model the harness on
whatever it already does to render command dispatch.

Verification: `cd apps/web && bun run test` → all pass, 4 new tests, and the
existing 805-line keymap suite unchanged.

## Done criteria

ALL must hold:

- [ ] Manual check: wallpaper toggles off and back on repeatedly with no reload
- [ ] Manual check: diff view mode toggles back and forth repeatedly
- [ ] 4 new tests exist and pass; cases 1 and 2 confirmed to fail against the
      unfixed code
- [ ] Either the dep array includes every value the callback closes over, or the
      values are read imperatively inside it — no closed-over settings value is
      missing from the array
- [ ] If a `useCallback` remains, it carries a one-line comment justifying it
- [ ] `cd apps/web && bun run lint` exits 0 (the `preserve-manual-memoization`
      rule is `error`)
- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] `bun run verify` exits 0 from the repo root
- [ ] `git diff --name-only` shows only `apps/web/src/keymap/commands.ts` and the
      test file
- [ ] `.oxlintrc.json` is unmodified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's reproduction shows both toggles already working. The bug may be fixed;
  do not change working code to match a stale plan.
- Adding the missing dependencies causes a visible regression — keyboard
  handlers re-registering, a focus loss, or a render loop. That means a consumer
  depends on the dispatch callback's identity, which is a real design constraint
  this plan did not model. Report the consumer.
- `readSettingsMirror()` turns out to be unsafe or unavailable in this context
  (Option B). Fall back to Option A and say so.
- The lint gate fails with a `preserve-manual-memoization` or `immutability`
  error you cannot resolve without restructuring the hook. The React Compiler
  rules are `error`-level here and fighting them is out of scope for an S-effort
  bug fix — report the diagnostic.
- You find a **third** value in the context object that is closed over and
  missing from the dep array. Report it; fix it in the same pass only if it is
  the same shape (a settings value), and flag it if it is not.
- The fix appears to require touching `command-registry.ts`, `types.ts`, or
  `default-bindings.ts`. That is the item-17 command-table refactor and it is
  explicitly out of scope.

## Maintenance notes

- **The systemic issue behind this bug**: `react/exhaustive-deps` is `"warn"` in
  `.oxlintrc.json`, and the React Compiler's `preserve-manual-memoization` rule
  means a hand-written dep array is honored rather than corrected. Together those
  make an incomplete array invisible. Promoting `exhaustive-deps` to `"error"` is
  the durable fix and is deliberately **not** in this plan — it will surface
  warnings across the whole app and needs its own cleanup pass. Worth doing;
  worth doing separately.
- The deeper structural answer is item 17 in `plans/README.md` (one command
  table). A command's inputs would be declared alongside it rather than assembled
  by hand in a 40-field object literal, and this class of bug stops being
  possible. This plan is the tactical fix; that is the strategic one.
- A reviewer should check that no `workspace.*` field was added to the dep array
  — those come from `workspaceStore.getState()` and are correct as-is. Adding
  them would not even compile, but the _intent_ to add them is the likely
  reviewer confusion.
- Two commands with zero test coverage in a 805-line keymap suite is worth
  noting on its own: the suite covers _bindings_ thoroughly and _dispatch
  side-effects_ barely. Cases 3 and 4 above start closing that.
