# Plan 003: Defer editor initialization for never-revealed tabs (cold-until-first-reveal)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f88800a..HEAD -- apps/web/src/features/workbench docs/editor-tab-lifecycle-performance.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches tab-switching UX; mitigated by keep-alive-after-first-reveal and browser tests)
- **Depends on**: none (001 recommended first so the suite gates regressions)
- **Category**: perf
- **Planned at**: commit `f88800a`, 2026-06-12

## Why this matters

Hidden, never-activated editor tabs are fully alive today: each one loads its
document, runs a full tree-sitter parse, mounts 13 virtualized rows at zero
height, and registers token highlight ranges into the page-global CSS Highlight
registry — all while invisible. A measured session (2026-06-11) showed three
never-clicked tabs contributing ~120 highlight ranges and each paying a
full-document parse at workspace restore. Startup cost scales linearly with
restored tab count. This plan implements the maintainer's documented candidate
fix #3 from `docs/editor-tab-lifecycle-performance.md`: defer editor creation
until a tab is first revealed, then keep it alive. Never-clicked restored tabs
stop paying parse/highlight costs entirely.

## Current state

Read `docs/editor-tab-lifecycle-performance.md` in full before starting — it is
the root-cause analysis this plan executes against, including measurements and
constraints. Its two hard constraints, quoted:

> - **No blind unmounting.** Keep-alive is valuable: editor instances hold undo
>   history, scroll, selection, folds; instant tab switching matters.
> - **No blind mount-everything either** (status quo): startup cost scales with
>   restored tab count (full parse each), and the shared highlight registry
>   accumulates ranges for invisible content.
>
> A smart policy probably distinguishes "never revealed" (cold — defer
> everything) from "previously revealed" (warm — keep alive).

The relevant code:

- `apps/web/src/features/workbench/components/window-frame.tsx` — maps over ALL surfaces of a window and mounts a `SurfaceHost` per tab; only the active one is visible.
- `apps/web/src/features/workbench/components/surface-host.tsx` — renders the surface even when invisible. Excerpt (planning-time state):

  ```tsx
  export const SurfaceHost = memo(function SurfaceHost({
    active, surface, surfaceRenderers, visible, windowId,
  }: SurfaceHostProps) {
    if (!visible && surface.rendererLifecycle === 'unmount-when-not-expanded') return null

    const Renderer = surfaceRendererFor(surfaceRenderers, surface.type)

    return (
      <div
        aria-hidden={visible ? undefined : true}
        className={cn(
          'absolute inset-0 min-h-0 min-w-0 overflow-hidden',
          visible ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0',
        )}
        ...
  ```

  Note the existing escape hatch: surfaces with `rendererLifecycle: 'unmount-when-not-expanded'` already return `null` when not visible — but that is _unmount-on-hide_ (loses state on every hide), which violates the keep-alive constraint for editors. You are adding a third behavior: **defer-until-first-reveal, then keep alive**.

- `apps/web/src/features/workbench/utils/surface-renderer-registry.ts` — maps `surface.type` to renderer components. Editor surfaces have `surface.type === 'file-editor'` or `'diff'` (see `apps/web/src/features/workbench/utils/editor-surface-layout.ts:167,177` for the type checks used elsewhere).
- Repo conventions (from `AGENTS.md`): guard clauses/early returns, nesting ≤3, one component per file, hooks in `hooks/`, pure helpers in `utils/`, no `useMemo`/`memo` without a measured reason (existing `memo` in `surface-host.tsx` carries its reason as a comment — keep it). Browser tests live as `*.browser.tsx` and run via the `browser` Vitest project under plain Node (NOT `--bun`).

## Commands you will need

| Purpose               | Command (from `apps/web/`)                                        | Expected on success                                             |
| --------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| Unit/dom tests        | `bun --bun vitest run --project node --project dom`               | all pass                                                        |
| Browser tests         | `bunx vitest run --project browser`                               | all pass (plain Node — `--bun` breaks Playwright orchestration) |
| Targeted browser test | `bunx vitest run --project browser src/features/workbench/tests/` | all pass                                                        |
| Typecheck             | `bun run typecheck`                                               | exit 0                                                          |
| Lint                  | `bun run lint`                                                    | exit 0                                                          |

## Scope

**In scope**:

- `apps/web/src/features/workbench/components/surface-host.tsx`
- `apps/web/src/features/workbench/components/window-frame.tsx` (only if reveal-tracking must live at the window level)
- A new hook or small state module for "has this surface ever been revealed", e.g. `apps/web/src/features/workbench/hooks/use-surface-reveal.ts` or `apps/web/src/features/workbench/state/` (follow the folder conventions above)
- New/updated tests under `apps/web/src/features/workbench/tests/`

**Out of scope** (do NOT touch):

- Anything under `packages/editor-*` or `node_modules/@singapor/*` — the virtualizer's ≥1-row clamp and highlight registration (candidate fixes #1 and #2 in the doc) are **Editor-repo changes**, explicitly not this plan.
- `surface.rendererLifecycle` semantics for non-editor surfaces (terminal, tool panes) — terminals hold live PTY sessions; changing their lifecycle is dangerous and unrelated.
- Workspace restore/persistence formats (`apps/web/src/lib/workspace-cache.ts`, tiling persistence) — cold tabs must restore from the same serialized state, unchanged.
- The tiling engine (`packages/tiling`, `features/tiling-surface-manager`).

## Git workflow

- Branch: `advisor/003-cold-hidden-editor-tabs`
- Commit style: conventional commits, e.g. `perf(workbench): defer editor init until first reveal`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the dependency assumption (spike, ~30 min, read-only)

Before changing anything, verify nothing depends on hidden editors being live. Search for code that reads editor/document state for **non-active** tabs:

- `grep -rn "dirty" apps/web/src/features/workbench apps/web/src/components/workspace/editor-tabs --include='*.ts*' -l` — how do tab close prompts / dirty indicators get dirty state? If they read it from a store fed by the _document layer_ (not the mounted editor component), cold tabs are safe. If a dirty dot or close-confirmation requires a mounted editor instance, that is a STOP condition.
- Check how "reveal" happens: a surface becomes visible when it becomes the window's active surface (`window.activeSurfaceId`) or when its window becomes visible. Confirm `visible` prop computation in `window-frame.tsx`.

**Verify**: write down (for your report) where dirty state and close-prompts source their data. Proceed only if they don't require a mounted editor for hidden tabs.

### Step 2: Add reveal tracking

Track "ever revealed" per surface id, locally in the workbench (not persisted): a surface counts as revealed the first time it is rendered with `visible === true`. Implementation sketch: a `useRef<Set<SurfaceId>>` (or module-level store per the repo's `state/` convention) owned by the window frame or a small hook used by `SurfaceHost`. Keep it simple — a Set and one effectless check at render time; mark revealed during render of a visible host (no `useEffect` needed to flip it before paint, but if you must use an effect, ensure the visible tab still mounts its editor in the same commit it becomes visible — no one-frame flash of placeholder for the ACTIVE tab; the active tab on startup must be treated as revealed immediately).

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Gate editor renderers on first reveal in `SurfaceHost`

For surfaces with `surface.type === 'file-editor'` or `surface.type === 'diff'` only: if the surface has never been revealed and is not currently visible, render the host `<div>` (so layout/DOM structure and drag targets stay intact — check whether tab drag/drop or hit-testing relies on host divs existing; keep the div, omit only the `<Renderer>`), with a `data-surface-cold=''` attribute and no renderer child. Once visible (or previously revealed), render `<Renderer>` exactly as today and never go back to cold. Use a guard clause, not nested conditionals.

**Verify**: `bun run typecheck && bun run lint` → exit 0. Run existing workbench tests: `bun --bun vitest run --project node --project dom src/features/workbench` → all pass. Then the full browser suite for the feature: `bunx vitest run --project browser src/features/workbench/tests/` → all pass.

### Step 4: Add a browser test for the cold/warm lifecycle

In `apps/web/src/features/workbench/tests/` add a `*.browser.tsx` test (model it on the existing `layout-renderer.browser.tsx` in the same dir — read it first for setup/fixture patterns). Cases:

1. **Cold**: open a workspace state with 3 editor tabs, 1 active → the two hidden hosts have `[data-surface-cold]` and contain no editor content DOM; the active host contains the editor.
2. **Reveal mounts**: activate a cold tab → `[data-surface-cold]` gone, editor content present, typing works (dispatch input and assert document text changes).
3. **Warm keep-alive**: switch away from the revealed tab and back → editor DOM was kept mounted while hidden (assert the host still contains editor content while hidden), and state (e.g. text typed in case 2) survives.

**Verify**: `bunx vitest run --project browser src/features/workbench/tests/` → all pass including the 3 new cases.

### Step 5: Manual measurement (before/after)

The perf doc's numbers came from a live probe. Reproduce a lighter version: with the dev app running (`bun run dev:web` from repo root), restore a session with ≥3 never-clicked tabs and confirm via DevTools that cold hosts contain no editor rows, and `CSS.highlights` entries (the `editor-shared-token-*` registries) no longer include ranges for those tabs. Record the row/range counts before vs after in your report (the doc's table is the "before").

**Verify**: cold tabs contribute 0 rows / 0 ranges (vs 13 rows / 32–47 ranges each before).

## Test plan

Covered by step 4 (three new browser cases) plus the full existing suites in step 3's verify. The structural pattern is the existing workbench browser tests in `apps/web/src/features/workbench/tests/`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd apps/web && bun run typecheck && bun run lint` exit 0
- [ ] `cd apps/web && bun --bun vitest run --project node --project dom` exits 0
- [ ] `cd apps/web && bunx vitest run --project browser` exits 0, including 3 new lifecycle cases
- [ ] A never-revealed `file-editor` surface host renders no editor DOM (asserted by the new test)
- [ ] A previously-revealed hidden surface keeps its editor DOM (asserted by the new test)
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 reveals that dirty indicators, close prompts, find-in-open-files, or LSP features require a _mounted editor component_ for hidden tabs (rather than a document-layer store).
- Restoring cursor/scroll/selection on first reveal turns out to require changes in the Editor packages (`@singapor/*`) — that crosses the repo boundary; report which API is missing.
- The active tab flashes a cold placeholder on startup or on tab switch (visible in the browser test or manually) and you cannot fix it within the reveal-tracking approach of step 2.
- Any existing browser test fails for reasons you cannot trace to your change within two fix attempts.
- `surface-host.tsx` no longer matches the excerpt in "Current state".

## Maintenance notes

- This implements candidate #3 of `docs/editor-tab-lifecycle-performance.md`. Candidates #1 (zero-height mounts zero rows) and #2 (skip highlight registration while hidden) are Editor-repo work and remain open; #4 (MRU cap on warm editors) builds on this plan's reveal tracking if many-tab sessions stay heavy. Update that doc's 🔴 status when this lands.
- Reviewer should scrutinize: the active-tab-at-startup path (must be warm immediately), and that non-editor surface types are completely unaffected.
- If a future change persists "revealed" state across reloads, reconsider: cold-on-restore is the point — persisting warmth reintroduces the startup cost.
