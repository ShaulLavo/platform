# Plan 006: Characterization tests for the workbench panel-state model

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 445a97d..HEAD -- apps/web/src/features/workbench/utils/workbench-panels.ts`
> If that file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition (the function signatures or clamp bounds may have moved).

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (adds tests only; touches no production code)
- **Depends on**: none (lands cleaner once 001 runs tests in CI, but not blocked by it)
- **Category**: tests
- **Planned at**: commit `445a97d`, 2026-06-18

## Why this matters

`apps/web/src/features/workbench/utils/workbench-panels.ts` is the pure model
for the workbench's panel/tab state: opening, closing, renaming, reordering, and
selecting editor tabs; switching sidebar/bottom tabs; resizing the sidebar and
bottom panels; and normalizing persisted state. It is imported by ~10 modules
(`sidebar-panel.tsx`, `bottom-panel.tsx`, `code-panel.tsx`,
`editor-workspace-state.tsx`, `editor-commands.ts`, the keymap, and others) and
encodes fiddly logic with no dedicated test: which tab becomes active after you
close the active one, insertion-index clamping on reorder, and min/max clamping
on resize/normalize. The only workbench test today is a component test
(`components/tests/editor-tab-bar.test.tsx`); the model functions are exercised
only incidentally through `features/editor/tests/editor-state.test.ts`.

These are pure, synchronous, React-free functions — the cheapest, safest things
in the codebase to lock down. Characterizing their current behavior creates a
regression net for the active-tab-after-close and clamp logic before any future
refactor of the tab system (HEAD already rewrote it once in
`445a97d "refactor: simplify editor tab system"`).

## Current state

The module exports these pure functions (file: `apps/web/src/features/workbench/utils/workbench-panels.ts`). Behavior to characterize, with the exact rules as written today:

- `createDefaultWorkbenchPanels()` (line 25) → `activeBottomTab: 'terminal'`, `activeSidebarTab: 'files'`, `bottomHeight: 240`, `sidebarWidth: 300`, `editorTabs: []`, `activeEditorTabId: null`.
- `openEditorPathInWorkbenchPanels(panels, path)` (line 63) — if a tab with that `path` exists, returns `selectEditorTabInWorkbenchPanels` (selects it, adds no tab); otherwise appends a new tab (via `createEditorTabRecord(path)`) and makes it active.
- `closeEditorTabInWorkbenchPanels(panels, tabId)` (line 75) — removes the tab by id; the next active id comes from `activeEditorTabIdAfterClose` (line 186): if the closed tab was the active one, the new active is `nextTabs[min(closedIndex, nextTabs.length - 1)]?.id ?? null`; otherwise it is normalized to keep the current active (or first tab). Returns `panels` unchanged if the id is absent.
- `closeEditorPathInWorkbenchPanels(panels, path)` (line 87) — removes **all** tabs matching `path`; unchanged if none matched.
- `renameEditorPathInWorkbenchPanels(panels, from, to)` (line 98) — rewrites `path` on matching tabs; unchanged if none matched.
- `reorderEditorTabInWorkbenchPanels(panels, tabId, targetIndex)` (line 115) — moves a tab; `targetIndex` is clamped via `clampedInsertionIndex` (line 218) to `[0, length]`; unchanged if id absent or `sourceIndex === targetIndex`.
- `selectEditorTabInWorkbenchPanels(panels, tabId)` (line 132) — sets active; unchanged if id absent or already active (referential identity: returns the **same** `panels` object).
- `setWorkbenchSidebarTab` (line 139) / `setWorkbenchBottomTab` (line 148) — set the active sidebar/bottom tab; return the same object when unchanged.
- `resizeWorkbenchSidebar(panels, w)` (line 157) — clamps to `[MIN_SIDEBAR_WIDTH=220, MAX_SIDEBAR_WIDTH=520]`; same object when unchanged.
- `resizeWorkbenchBottom(panels, h)` (line 164) — clamps to `[MIN_BOTTOM_HEIGHT=140, MAX_BOTTOM_HEIGHT=480]`; same object when unchanged.
- `normalizeWorkbenchPanels(panels)` (line 171) — clamps `bottomHeight`/`sidebarWidth` and normalizes `activeEditorTabId` (line 204: keep current if it still exists, else first tab id, else null).

Constants (top of file): `DEFAULT_SIDEBAR_WIDTH=300`, `DEFAULT_BOTTOM_HEIGHT=240`, `MIN_SIDEBAR_WIDTH=220`, `MAX_SIDEBAR_WIDTH=520`, `MIN_BOTTOM_HEIGHT=140`, `MAX_BOTTOM_HEIGHT=480`.

**Important about ids:** tabs get their `id` from `createEditorTabRecord(path)` (imported from `@/components/workspace/editor-tabs/utils/editor-tab-model`), which generates a non-deterministic id. **Tests must read ids from the returned panels — never hardcode an id.** Build state by calling the real `open…` function and capture `panels.editorTabs[i].id`.

### Test pattern to follow

Model the new test on `apps/web/src/features/editor/tests/editor-state.test.ts`, which tests this same area with plain Vitest:

```ts
import { describe, expect, it } from 'vitest'

import {
  createDefaultWorkbenchPanels,
  openEditorPathInWorkbenchPanels,
} from '@/features/workbench/utils/workbench-panels'
```

Plain `vitest` imports are correct here (these are pure functions — no server, no client, no provider tree, so the `apps/web/test/fixtures.ts` harness is not needed).

## Commands you will need

| Purpose           | Command                                                                  | Expected         |
| ----------------- | ------------------------------------------------------------------------ | ---------------- |
| Run the new test  | `bun --bun vitest run --project node workbench-panels` (from `apps/web`) | all pass         |
| Run web tests     | `bun run --filter web test` (from repo root)                             | exit 0, all pass |
| Typecheck         | `bun run --filter web typecheck` (from repo root)                        | exit 0           |
| Lint the new file | `bun run --filter web lint` (from repo root)                             | exit 0           |

Run repo-level commands from `/Users/shaul/Desktop/D/platform`; the `vitest` filter form from `apps/web`. If the test lands in the `dom` project instead of `node` (depends on the repo's vitest project globs), use `--project dom`. Confirm which project picks it up in step 1.

## Suggested executor toolkit

- The `never-nester` skill / AGENTS.md control-flow rules apply to test code too: guard clauses, no nesting past depth 3, no `else` after return.

## Scope

**In scope** (create only):

- `apps/web/src/features/workbench/utils/tests/workbench-panels.test.ts`

**Out of scope** (do NOT modify):

- `apps/web/src/features/workbench/utils/workbench-panels.ts` itself. This is a **characterization** plan: capture behavior **as it is**, including anything that looks odd. If a function looks buggy, write a test that documents the current behavior and note the suspicion in your report — do **not** "fix" it here.
- `editor-tab-model.ts` and any other production module.
- The existing `editor-tab-bar.test.tsx` and `editor-state.test.ts`.

## Git workflow

- **Work directly on `main`. Do NOT create a branch, worktree, or PR.** (Operator rule: everything happens on `main`.)
- Commit style: conventional commits — e.g. `test(workbench): characterize panel-state model`. **Only commit if the operator asked; otherwise leave for review.**
- Do NOT push.

## Steps

### Step 1: Create the test file with the first happy-path case

Create `apps/web/src/features/workbench/utils/tests/workbench-panels.test.ts`. Start with the default-state and open cases to confirm the file is picked up by a test project:

```ts
import { describe, expect, it } from 'vitest'

import {
  closeEditorTabInWorkbenchPanels,
  createDefaultWorkbenchPanels,
  openEditorPathInWorkbenchPanels,
  reorderEditorTabInWorkbenchPanels,
  resizeWorkbenchSidebar,
} from '@/features/workbench/utils/workbench-panels'

describe('workbench panel-state model', () => {
  it('creates default panels', () => {
    expect(createDefaultWorkbenchPanels()).toMatchObject({
      activeBottomTab: 'terminal',
      activeSidebarTab: 'files',
      bottomHeight: 240,
      sidebarWidth: 300,
      editorTabs: [],
      activeEditorTabId: null,
    })
  })

  it('opens a new path as the active tab', () => {
    const panels = openEditorPathInWorkbenchPanels(createDefaultWorkbenchPanels(), '/repo/a.ts')
    expect(panels.editorTabs).toHaveLength(1)
    expect(panels.editorTabs[0]?.path).toBe('/repo/a.ts')
    expect(panels.activeEditorTabId).toBe(panels.editorTabs[0]?.id)
  })
})
```

**Verify**: `bun --bun vitest run --project node workbench-panels` (from `apps/web`) → the 2 tests pass. If "node" finds no tests, try `--project dom`. Record which project owns the file.

### Step 2: Cover the open / select / reorder / rename cases

Add tests for:

- Opening an **already-open path** returns a select (no new tab; length stays the same; that tab becomes active).
- `selectEditorTabInWorkbenchPanels` with an absent id returns the **same object** (`expect(result).toBe(panels)`); selecting the already-active tab also returns the same object.
- `reorderEditorTabInWorkbenchPanels` moves a tab to a new index; `targetIndex` beyond `length` clamps to the end; `sourceIndex === targetIndex` returns the same object; absent id returns the same object. (Build 3 tabs via `openEditorPathInWorkbenchPanels`, capture their ids, assert the resulting `editorTabs.map(t => t.path)` order.)
- `renameEditorPathInWorkbenchPanels` rewrites a matching path and is a no-op (same object) when nothing matches.

**Verify**: `bun --bun vitest run --project <node|dom> workbench-panels` → all pass.

### Step 3: Cover the active-tab-after-close logic (the subtle part)

Add tests for `closeEditorTabInWorkbenchPanels`:

- Closing the **active** middle tab → active becomes the tab now at the same index (`nextTabs[min(closedIndex, len-1)]`). With tabs `[a,b,c]`, active `b`, closing `b` → active is `c`.
- Closing the **active last** tab → active becomes the new last tab.
- Closing the **only** tab → `activeEditorTabId` becomes `null`, `editorTabs` empty.
- Closing a **non-active** tab → the active id is preserved.
- Closing an **absent** id → same object returned.

Also `closeEditorPathInWorkbenchPanels`: closing a path that is open in two tabs removes **both**; closing an absent path returns the same object.

**Verify**: `bun --bun vitest run --project <node|dom> workbench-panels` → all pass.

### Step 4: Cover resize / set-tab / normalize clamping

Add tests for:

- `resizeWorkbenchSidebar`: below 220 clamps to 220; above 520 clamps to 520; an in-range value passes through; the resulting value equal to current returns the same object.
- `resizeWorkbenchBottom`: below 140 → 140; above 480 → 480; same-value → same object.
- `setWorkbenchSidebarTab` / `setWorkbenchBottomTab`: changing returns a new object with the new tab; setting the current value returns the same object.
- `normalizeWorkbenchPanels`: out-of-range `sidebarWidth`/`bottomHeight` are clamped; an `activeEditorTabId` that no longer exists in `editorTabs` is reset to the first tab's id (or `null` when empty); a still-valid active id is preserved.

**Verify**: `bun --bun vitest run --project <node|dom> workbench-panels` → all pass.

### Step 5: Full web verification

From repo root: `bun run --filter web typecheck && bun run --filter web lint && bun run --filter web test`.

**Verify**: all exit 0; the new test file's cases are included in the test run count.

## Test plan

- New file: `apps/web/src/features/workbench/utils/tests/workbench-panels.test.ts`.
- Cases: default state; open-new; open-existing (select); select no-op identity; reorder (move, clamp, no-op, absent); rename (hit, miss); close active-middle / active-last / only / non-active / absent; close-path (multi, miss); resize sidebar/bottom (low clamp, high clamp, in-range, identity); set sidebar/bottom tab (change, identity); normalize (clamp dimensions, reset stale active id, keep valid active id). ~20 cases.
- Pattern source: `apps/web/src/features/editor/tests/editor-state.test.ts`.
- Verification: `bun run --filter web test` → all pass including the new cases.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `apps/web/src/features/workbench/utils/tests/workbench-panels.test.ts` exists
- [ ] `bun run --filter web test` exits 0 with the new cases included
- [ ] `bun run --filter web typecheck` exits 0
- [ ] `bun run --filter web lint` exits 0
- [ ] `git status` shows only the new test file added (no production files modified)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The function signatures or clamp constants in `workbench-panels.ts` differ from the "Current state" excerpts (drift since this plan was written).
- A function's actual behavior contradicts the rules described above — write the test to match **reality**, note the discrepancy in your report, and do not change production code.
- The test file is not picked up by either the `node` or `dom` vitest project (a vitest config issue) — report rather than editing the vitest config.

## Maintenance notes

- These tests pin **current** behavior, including the active-tab-after-close rule. If a future change intentionally changes that UX, the failing tests are the signal to update them deliberately — they are not load-bearing product requirements, they are a change-detector.
- When the tab system is next refactored, run this suite first as the safety net (the same role plan 002's tests play for the git service).
- A reviewer should check that no test hardcodes a tab id (ids are non-deterministic) and that "no-op" cases assert referential identity (`toBe`), since several callers rely on that identity to skip re-renders.
