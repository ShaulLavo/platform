# Plan 014: Characterization tests for the `packages/tree` path store and `getVisibleRows`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat ace313f -- packages/tree/src`
> (Note: `ace313f` **is** HEAD, so a `SHA..HEAD` range would be empty and prove
> nothing. The form above compares the working tree against the commit and will
> show uncommitted drift.) If any in-scope file has changed, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (adds tests only — no production code changes)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

`packages/tree` is 20,065 lines and has **9 test cases total** — 6 in
`src/utils/tests/controller.test.ts` and 3 in `src/components/FileTree.test.tsx`.
The path store, which is 7,749 lines across 19 files and holds the chunked
prefix-sum bookkeeping that decides _which row is at index N_, has **zero**
direct coverage.

The practical consequence: a count-bookkeeping regression does not fail a test.
It surfaces as "the file tree scrolls to the wrong row sometimes" during a
hand-driven browser session, which is the most expensive possible way to find a
bug.

**This plan is a gate.** `plans/039-filetreeview-controller-split.md` is an
L-effort, HIGH-risk refactor of a 3,555-line component, and its entire safety
argument is "the tests still pass." Right now that argument is worth almost
nothing. This plan is what makes 039 safe to attempt.

This plan adds tests only. It changes no production code. If you find a bug
while writing these tests, **that is a success** — record it, write the test to
document the _actual_ behavior (that is what characterization means), and report
it. Do not fix it here.

## Current state

### What exists

```bash
find packages/tree -name "*.test.*" | grep -v node_modules
```

→ exactly two files:

- `packages/tree/src/utils/tests/controller.test.ts` — 6 `it()` blocks
- `packages/tree/src/components/FileTree.test.tsx` — 3 `it()` blocks

### The existing test's shape — model on this

`packages/tree/src/utils/tests/controller.test.ts:1-25`:

```ts
import { describe, expect, it, vi } from 'vitest'

import { FileTreeController } from '@workspace/tree/utils/model/FileTreeController'
import { computeFileTreeLayout } from '@workspace/tree/utils/model/layout'
import { renameFileTreePaths } from '@workspace/tree/utils/renameFileTreePaths'
import { computeFileTreeRowElementAttributes } from '@workspace/tree/utils/render/rowAttributes'
import type { FileTreeVisibleRow } from '@workspace/tree/utils/model/publicTypes'

describe('FileTreeController', () => {
  it('tracks selection, search, drag/drop, and rename state', () => {
    const onDropComplete = vi.fn()
    const onRename = vi.fn()
    const controller = new FileTreeController({
      dragAndDrop: { onDropComplete },
      initialExpansion: 'open',
      paths: ['src/', 'src/a.ts', 'src/b.ts', 'lib/'],
      renaming: { onRename },
    })

    controller.getItem('src/a.ts')?.select()
    expect(controller.getSelectedPaths()).toEqual(['src/a.ts'])
```

Two things to copy: imports use the `@workspace/tree/...` alias (not relative
paths), and the controller is constructed directly with a plain `paths` array.
**That constructor is your whole test harness** — you do not need to render
anything, mount a DOM, or touch Preact.

### The function under test

`packages/tree/src/utils/model/FileTreeController.ts:498`:

```ts
  public getVisibleRows(start: number, end: number): readonly FileTreeVisibleRow[] {
    if (end < start || this.#visibleCount === 0) {
      return []
    }

    const boundedStart = Math.max(0, start)
    const boundedEnd = Math.min(this.#visibleCount - 1, end)
    if (boundedEnd < boundedStart) {
      return []
    }

    const boundedLength = boundedEnd - boundedStart + 1
    if (
      this.#searchVisibleIndices == null &&
      !this.#hasFullProjection &&
      boundedEnd >= this.#projectionPaths.length &&
      boundedLength <= CONTEXT_VISIBLE_ROW_RANGE_LIMIT
    ) {
      const rows: FileTreeVisibleRow[] = []
      for (let index = boundedStart; index <= boundedEnd; index += 1) {
        const context = this.#store.getVisibleRowContext(index)
        if (context == null) {
          break
        }

        rows.push(this.#createVisibleRowFromContext(context))
      }
      return rows
    }

    if (!this.#hasFullProjection && boundedEnd >= this.#projectionPaths.length) {
      this.#ensureFullProjection()
    }
```

**This is the crux of the plan.** There are (at least) three distinct code paths
producing visible rows:

1. the **lazy context path** — taken when there is no search filter, no full
   projection has been built, the requested range runs past the materialized
   projection, and the range is under `CONTEXT_VISIBLE_ROW_RANGE_LIMIT`
2. the **full-projection path** — taken after `#ensureFullProjection()`
3. the **search path** — taken when `#searchVisibleIndices != null`

All three must produce **identical rows for identical state**. Nothing today
asserts that. That equivalence is the single most valuable property this plan
can pin down, because it is exactly what a refactor will break silently.

Also note the `break` inside the lazy loop: if `getVisibleRowContext` returns
`null` mid-range, the function returns a **short array** rather than throwing.
Whether that is correct is not your problem — characterize it.

### The path store

`packages/tree/src/utils/path-store/` — 19 files, 7,749 lines. Largest:

| file              | lines |
| ----------------- | ----- |
| `builder.ts`      | 1064  |
| `canonical.ts`    | 1024  |
| `store.ts`        | 978   |
| `projection.ts`   | 929   |
| `static-store.ts` | 877   |
| `scheduler.ts`    | 562   |
| `cleanup.ts`      | 413   |
| `events.ts`       | 402   |
| `child-index.ts`  | 304   |

### ⚠️ Do NOT test these three files

`static-store.ts` (877), `scheduler.ts` (562), and `cleanup.ts` (413) are
scheduled for **deletion** by `plans/022-delete-unreachable-code.md` — they were
audited as unreachable. Writing 1,850 lines' worth of tests for code that is
about to be deleted is pure waste, and worse, it would make plan 022 look like
it is breaking tests.

**Before you write a single test, confirm reachability:**

```bash
cd /Users/shaul/Desktop/D/platform
grep -rn "StaticPathStore\|createPathStoreScheduler" packages/tree/src apps/web/src --include="*.ts" --include="*.tsx" | grep -v "path-store/static-store.ts\|path-store/scheduler.ts"
```

If that returns only comments or nothing, those modules are dead — skip them.
Concentrate on `store.ts`, `projection.ts`, `builder.ts`, `canonical.ts`,
`child-index.ts`, and `visible-tree-projection.ts`, which are live.

### Test runner

`packages/tree/package.json`:

```json
  "test": "vitest run --project node --project dom",
  "test:browser": "vitest run --project browser",
  "typecheck": "tsgo --noEmit",
```

**Plain `vitest`, NOT `bun --bun vitest`.** `AGENTS.md`: "Apps run under Bun:
`bun --bun vitest`. Runtime-neutral `packages/*` run plain `vitest`."
`packages/tree` is runtime-neutral.

Put your tests in the **`node` project**. They are pure logic over a data
structure; they need no DOM.

**Do not use the `browser` project.** `AGENTS.md` and this repo's own history
record that the browser vitest runner can hang at the RUN banner. Nothing in
this plan needs it.

### Conventions to honor

Quoted from `AGENTS.md`, because the executor has not read it:

> - Tests run on Vitest.
> - Runtime-neutral `packages/*` run plain `vitest`.
> - Use these environments, in this order of preference: real browser,
>   happy-dom, never jsdom.
> - Shared test code lives under `test/`.
> - Put shared builders in `test/factories/`.
> - Do not redefine per-file factories.
> - Avoid import-time nondeterminism, such as `Math.random()` at module scope.
>   Use deterministic or seedable ids.
> - Delete obsolete tests instead of preserving old behavior.
> - Keep nesting depth to 3 or less. Use guard clauses and early returns.

The nondeterminism rule is load-bearing here: your fuzz loop **must be
seeded**, and a failure must be reproducible from the seed printed in the
failure message. A flaky fuzz test that cannot be replayed is worse than no
fuzz test.

## Commands you will need

| Purpose        | Command                                                                                | Expected on success |
| -------------- | -------------------------------------------------------------------------------------- | ------------------- |
| Tree tests     | `cd packages/tree && bun run test`                                                     | all pass            |
| Single file    | `cd packages/tree && bunx vitest run --project node src/utils/path-store/tests/<file>` | passes              |
| Tree typecheck | `cd packages/tree && bun run typecheck`                                                | exit 0              |
| Tree lint      | `cd packages/tree && bun run lint`                                                     | exit 0              |
| Tree format    | `cd packages/tree && bun run format`                                                   | exit 0              |

**Do not use `bun run verify` (root) as a gate for this plan.** It currently
fails at `format:check` on `apps/web/src/features/settings/hooks/use-setting-inspection.ts`,
which is unrelated uncommitted work in the operator's tree. Gate on the
`packages/tree` commands above. If you want a repo-wide signal, run
`bun run --filter tree typecheck && bun run --filter tree test`.

Record the baseline first: `cd packages/tree && bun run test 2>&1 | tail -5` →
expect 9 tests passing across 2 files.

## Scope

**In scope** (create only):

- `packages/tree/test/factories/tree-paths.ts` — the deterministic path-list
  generator (per `AGENTS.md`, shared builders go in `test/factories/`)
- `packages/tree/src/utils/path-store/tests/*.test.ts` — path store unit tests
- `packages/tree/src/utils/tests/visible-rows.test.ts` — `getVisibleRows`
  equivalence + oracle tests
- `packages/tree/src/utils/tests/visible-rows-fuzz.test.ts` — the seeded fuzz loop

**Out of scope** (do NOT touch):

- **Any production file under `packages/tree/src/`.** This plan adds tests. If a
  test reveals a bug, characterize the real behavior and report it — do not fix
  it. Fixing here would destroy the plan's value: 039 needs a _baseline_, not an
  improved one.
- `static-store.ts`, `scheduler.ts`, `cleanup.ts` — being deleted by plan 022.
- `packages/tree/src/components/FileTreeView.tsx` — plan 039's target. Do not
  test it directly; test the controller and store beneath it. A 3,555-line
  Preact component is the wrong test surface, and 039 will restructure it
  anyway.
- The existing `controller.test.ts` and `FileTree.test.tsx` — leave both
  untouched. Add new files beside them.
- `apps/web/**`, `apps/server/**`, `packages/{ui,contracts,observability}/**`.
- Adding any new dependency. `vitest` and `expect` are all you need. If you want
  property-based testing, **hand-roll the seeded generator** rather than adding
  `fast-check` — a new dependency in a package this plan is meant to stabilize is
  a bad trade.
- The `browser` vitest project.

## Git workflow

Per the operator rule in `plans/README.md`: **all work happens on `main`** — no
new branches, worktrees, or PRs unless the operator explicitly asks.

Conventional commits. Example subject:

```
test(tree): the path store finally has an oracle to disagree with
```

Commit after Step 2 (generator + oracle), Step 4 (unit tests), and Step 5 (fuzz)
so each layer is separately revertable.

## Steps

### Step 1: Establish the baseline and confirm what is live

```bash
cd /Users/shaul/Desktop/D/platform/packages/tree
bun run test 2>&1 | tail -5
```

→ record the count (expect 9 tests, 2 files).

Then run the reachability check from "Current state" above and write down which
path-store modules are live. Read `store.ts`'s public surface and
`visible-tree-projection.ts` to learn the vocabulary — you cannot write an oracle
for a model you have not read.

**Verify**: you can name (a) the baseline test count, (b) which path-store
modules are dead, and (c) the exact public entry points you will drive.

### Step 2: Write the deterministic generator and the naive oracle

Create `packages/tree/test/factories/tree-paths.ts` exporting:

```ts
/** Deterministic 32-bit LCG. Same seed → same tree, on every machine, forever. */
export function makeRng(seed: number): () => number

/**
 * Builds a valid path list of the shape FileTreeController accepts:
 * directories end in '/', every file's ancestors are present, order is stable.
 */
export function generatePaths(
  rng: () => number,
  options?: {
    maxDepth?: number
    maxChildren?: number
    fileCount?: number
  },
): string[]

/**
 * The ORACLE: a deliberately naive, obviously-correct depth-first walk that
 * returns the visible paths in order, given the expanded-directory set.
 * Optimised for being读-obviously-right, never for speed.
 */
export function naiveVisiblePaths(paths: readonly string[], expanded: ReadonlySet<string>): string[]
```

The oracle is the heart of this plan. Write it so a reviewer can verify it by
reading, in under a minute: a plain recursive descent, no chunking, no prefix
sums, no caching. **It must not share any code with the implementation** — an
oracle that calls the thing it is testing proves nothing.

Do not use `Math.random()` anywhere. Seeds come from the test file.

**Verify**: `cd packages/tree && bun run typecheck` → exit 0. Then write one
throwaway assertion that `generatePaths(makeRng(1), ...)` returns the same array
twice, and that `makeRng(1)` and `makeRng(2)` differ.

### Step 3: Pin `getVisibleRows` against the oracle

Create `packages/tree/src/utils/tests/visible-rows.test.ts`. For a handful of
fixed, hand-written trees (not generated — you want these readable in a diff),
assert:

1. **Full range matches the oracle.** `controller.getVisibleRows(0, count - 1)`
   maps to the same path sequence as `naiveVisiblePaths`.
2. **Every window matches its slice.** For a tree of N visible rows, for every
   `(start, end)` pair in a small tree, `getVisibleRows(start, end)` equals the
   oracle's `slice(start, end + 1)`. This is the property that catches
   off-by-one prefix-sum bugs, and it is cheap on a 20-row tree.
3. **Boundary behavior.** `getVisibleRows(0, -1)`, `(5, 2)`, `(-10, 3)`,
   `(0, 99999)` on a 10-row tree, and every call on an empty tree. Characterize
   what it _actually_ returns (the code bounds and can return `[]`); do not
   assume.
4. **The three paths agree.** This is the highest-value case. For one tree,
   obtain the same window three ways — (a) a small range before any full
   projection is built (the lazy context path), (b) the same range after forcing
   a full projection by requesting a wide range first, and (c) the same range
   with a search filter active that matches everything — and assert all three
   produce identical rows.
   You will need to discover how to force each path. `CONTEXT_VISIBLE_ROW_RANGE_LIMIT`
   gates the lazy path by range width; a range wider than the limit takes the
   full-projection path. Read the constant's value and drive both sides of it.
   **If you cannot reliably force a given path, say so and write the cases you
   can** — a partial but honest matrix beats a fabricated one.

**Verify**: `cd packages/tree && bunx vitest run --project node src/utils/tests/visible-rows.test.ts`
→ passes. If a case fails, that is a real finding: record the exact tree,
window, expected, and actual, then **write the test to assert the actual
behavior** with a `// CHARACTERIZED BUG:` comment explaining why it looks wrong.
Report it. Do not fix it.

### Step 4: Unit-test the live path-store modules

Create tests under `packages/tree/src/utils/path-store/tests/`. Target the
bookkeeping, not the plumbing:

- **`store.ts`** — visible-count maintenance across expand, collapse,
  expand-all, collapse-all. After each operation assert the store's count equals
  `naiveVisiblePaths(...).length`. This is the count invariant that, when it
  drifts, produces "scrolls to the wrong row".
- **`child-index.ts`** — parent→children mapping for a nested tree; a directory
  with no children; a file at the root.
- **`projection.ts` / `visible-tree-projection.ts`** — projection contents match
  the oracle after a sequence of expand/collapse operations.
- **`canonical.ts`** — path canonicalization: trailing slashes, duplicate
  separators, and whatever normalization it actually performs. Read it first and
  test what it does.

Keep each test small and named for the invariant it protects, not the function it
calls (`'visible count survives collapse of an expanded subtree'`, not
`'test setExpanded'`).

**Verify**: `cd packages/tree && bun run test` → all pass; count is baseline (9)
plus your new cases.

### Step 5: The seeded fuzz loop

Create `packages/tree/src/utils/tests/visible-rows-fuzz.test.ts`.

For a fixed list of seeds (e.g. 1..50 — a literal array, not a random draw):

1. `generatePaths(makeRng(seed), ...)` → a tree.
2. Construct a `FileTreeController` over it.
3. Apply a deterministic sequence of ~30 operations drawn from the same rng:
   expand, collapse, open search, clear search, rename.
4. After **every** operation, assert `getVisibleRows(0, count - 1)` matches
   `naiveVisiblePaths` for the current expanded set — and assert a few random
   sub-windows match their slices.

Requirements:

- **The failure message must print the seed and the operation index.** A fuzz
  failure nobody can replay is noise. Include enough state to reconstruct: seed,
  op index, the operation, expected vs actual around the first divergence.
- Keep the whole file under a few seconds. 50 seeds × 30 ops on small trees is
  fast; if it is slow, shrink the trees, not the seed count.
- Nesting depth ≤ 3 (`AGENTS.md`). Extract the per-operation check into a named
  helper rather than nesting loops three deep inside a `it()`.

**Verify**: `cd packages/tree && bunx vitest run --project node src/utils/tests/visible-rows-fuzz.test.ts`
→ passes. Then deliberately break the oracle (e.g. make it drop the last row),
confirm the fuzz test **fails and prints a replayable seed**, and revert. A fuzz
test never seen to fail is not known to work.

### Step 6: Full tree-package verify

```bash
cd packages/tree && bun run format && bun run lint && bun run typecheck && bun run test
```

**Verify**: all exit 0.

## Test plan

This plan _is_ the test plan. Summary of what gets created:

| File                                        | Covers                                                      |
| ------------------------------------------- | ----------------------------------------------------------- |
| `test/factories/tree-paths.ts`              | seeded generator + naive DFS oracle                         |
| `src/utils/tests/visible-rows.test.ts`      | window/slice equivalence, boundaries, three-path agreement  |
| `src/utils/path-store/tests/*.test.ts`      | count invariants, child index, projection, canonicalization |
| `src/utils/tests/visible-rows-fuzz.test.ts` | 50 seeds × ~30 ops against the oracle                       |

Model all of them on `packages/tree/src/utils/tests/controller.test.ts` — same
import style (`@workspace/tree/...`), same direct-construction harness, same
`describe`/`it` shape.

**Success is not "all green."** Success is that the tests describe what the code
does today, precisely enough that plan 039 can change the code and know
immediately if behavior moved. A characterized bug is a _better_ outcome than a
clean run, because it is a bug found by a test instead of by a user.

## Done criteria

ALL must hold:

- [ ] `cd packages/tree && bun run test` exits 0, with a test count **≥ 40**
      (baseline 9 + your additions). If you land far under 40, the coverage is
      too thin to gate plan 039 — say so rather than declaring done.
- [ ] `packages/tree/test/factories/tree-paths.ts` exists and exports a seeded
      rng, a path generator, and a naive oracle that shares **no** code with the
      implementation
- [ ] `getVisibleRows` has window/slice equivalence coverage, boundary coverage,
      and a three-path agreement test (or a written explanation of which path
      could not be forced and why)
- [ ] The fuzz test runs a fixed seed list, and was **observed to fail** with a
      replayable seed when the oracle was deliberately broken
- [ ] `grep -rn "Math.random" packages/tree/test packages/tree/src/utils/path-store/tests packages/tree/src/utils/tests` → no matches
- [ ] `cd packages/tree && bun run typecheck && bun run lint && bun run format:check` → all exit 0
- [ ] `git diff --name-only` shows **only new test files and the factory** —
      zero production files under `packages/tree/src` modified
- [ ] No new dependency added to `packages/tree/package.json`
- [ ] No tests written for `static-store.ts`, `scheduler.ts`, or `cleanup.ts`
- [ ] Any characterized bug is reported with tree, window, expected, actual, and
      a `// CHARACTERIZED BUG:` comment in the test
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The reachability check shows `StaticPathStore` or `createPathStoreScheduler`
  **is** referenced from live code. Plan 022 intends to delete them; if they are
  live, that plan is wrong and both plans need re-scoping.
- You cannot construct a `FileTreeController` from a plain `paths` array the way
  `controller.test.ts:14-19` does — the harness assumption underpinning this
  whole plan would be false.
- The oracle and the implementation disagree on a **simple, hand-written** tree
  (Step 3 case 1). That is either a serious bug or a misunderstanding of the
  model on your part. Report the tree and both outputs; do not "fix" the oracle
  until you are certain which side is wrong. **Bending the oracle to match the
  implementation defeats the entire plan** — the oracle's independence is the
  only thing that makes it evidence.
- The fuzz loop fails on a seed and you cannot reproduce it by re-running that
  seed alone. Nondeterminism means the harness has leaked state between cases;
  fix the harness before trusting any result.
- Writing a test requires changing production code to make something reachable
  or injectable. Report what is untestable and why — that is itself a finding
  worth having, and it is input to plan 039's design.
- `packages/tree`'s test suite is already red before you start.
- The three-path agreement test (Step 3 case 4) shows the paths **disagree**.
  That is a significant finding and plan 039 must know about it before it starts.
  Report it prominently rather than burying it in a passing characterization.

## Maintenance notes

- **This plan gates `plans/039-filetreeview-controller-split.md`.** 039 must not
  start until this is DONE, and 039's every step should re-run this suite — not
  just its final step. Note that in 039's status row when you update the index.
- **Interaction with plan 022**: 022 deletes `static-store.ts`, `scheduler.ts`,
  and `cleanup.ts`. If you accidentally test them, 022 will appear to break
  tests. The done criteria check for this explicitly.
- A reviewer should scrutinize exactly one thing: **that the oracle is
  independent and obviously correct.** Every other test in this plan derives its
  authority from the oracle. If the oracle calls into `path-store/`, the whole
  suite is circular and worthless.
- The oracle is deliberately slow. Do not let a future contributor "optimize" it
  — add a comment saying so at the top of `naiveVisiblePaths`.
- **Deliberately deferred**: `FileTreeView.tsx` itself gets no direct tests here.
  It is Preact, 3,555 lines, and about to be restructured; testing it now would
  mean writing tests designed to be deleted. The controller and store beneath it
  are the stable surface.
- **Deliberately deferred**: `builder.ts` (1,064 lines) gets no dedicated suite
  in this plan beyond what the fuzz loop exercises indirectly. If plan 039 turns
  out to touch it, it needs its own pass first.
- If this suite ever goes red for a reason nobody understands, the seed in the
  failure message is the whole debugging story — resist any change that removes
  it.
