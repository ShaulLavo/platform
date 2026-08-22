# Plan 036: Reconcile the in-repo tree fork with Pierre upstream by hand

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. Do not use `git cherry-pick`, copy an upstream
> directory wholesale, restore the submodule, or add an upstream remote to this repository. Inspect
> each upstream patch and reimplement the applicable behavior in the local architecture and style.
>
> This plan is a hard prerequisite for resuming Plan 039 or starting Plan 051. Once every done
> criterion is verified, delete this file and remove its row from `plans/README.md`; provenance and
> the apply/skip/defer ledger remain in `packages/tree/UPSTREAM.md`.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat b60c88de..HEAD -- packages/tree plans/039-filetreeview-controller-split.md plans/051-migrate-tree-internals-to-react.md
> git diff --stat -- packages/tree plans/039-filetreeview-controller-split.md plans/051-migrate-tree-internals-to-react.md
> ```
>
> At the authored-at SHA, `packages/tree` is clean and Plan 039 has completed Steps 0–2 only. Any
> active source change under `packages/tree` is a STOP condition until its owner reconciles it.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `b60c88de`, 2026-08-22

## Why this matters

`packages/tree` is not an independently authored implementation. Commit `ed75f3c5` copied a fork of
Pierre's `@pierre/trees` and `@pierre/path-store` into this repository, then removed the submodule.
The copy has since diverged substantially and has no durable upstream ledger, license file, or
notice file, so blindly comparing today's same-named files would either lose local behavior or miss
upstream correctness fixes.

This plan establishes exact provenance, restores the upstream license/notice, audits every relevant
upstream tree/path-store change since the imported base, and hand-applies only behavior that fits the
local product and repository rules. It must land before the remaining Preact split and React
migration so those refactors start from the reconciled behavior rather than making later patch
translation harder.

## Provenance and audited upstream range

The source facts established at plan-writing time are:

| Fact                                            | Value                                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Original submodule URL                          | `https://github.com/ShaulLavo/pierre.git`                                    |
| Original submodule branch                       | `codex/tree-drag-selection`                                                  |
| Imported fork commit                            | `89a601652175d1a79d3bd991b71ee6b9022a2884` (`Fix tree drag selection state`) |
| Imported fork's merge base with Pierre          | `af02e6ddbb4a9d327581942682493bcdf687857f`                                   |
| Upstream repository                             | `https://github.com/pierrecomputer/pierre`                                   |
| Upstream head audited while authoring           | `55a941914056af44c78c4ba607b37130f189fb70` (2026-08-20)                      |
| Current published Trees version while authoring | `1.0.0-beta.6`                                                               |

The original values are recoverable from local history:

```bash
git show ed75f3c5^:.gitmodules
git ls-tree ed75f3c5^ packages/pierre
git show --stat --summary ed75f3c5
```

Expected: `.gitmodules` names the fork/branch, the tree entry is `89a601652175...`, and `ed75f3c5`
is the in-repo copy commit.

### Upstream-to-local path map

Use this map when translating patches. Local moves and deletions are intentional; do not recreate
upstream layout or barrels.

| Pierre path                                  | Local path                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `packages/trees/src/render/FileTreeView.tsx` | `packages/tree/src/components/FileTreeView.tsx`                                               |
| `packages/trees/src/render/FileTree.ts`      | `packages/tree/src/utils/render/FileTree.ts`                                                  |
| `packages/trees/src/render/*.ts`             | `packages/tree/src/utils/render/*.ts`                                                         |
| `packages/trees/src/model/*.ts`              | `packages/tree/src/utils/model/*.ts`                                                          |
| `packages/trees/src/components/*.tsx`        | `packages/tree/src/components/*.tsx`                                                          |
| `packages/trees/src/utils/*.ts`              | `packages/tree/src/utils/*.ts`                                                                |
| `packages/path-store/src/*.ts`               | `packages/tree/src/utils/path-store/*.ts`                                                     |
| upstream `packages/trees/test/**`            | the matching local `components/*.test.tsx`, `*.browser.tsx`, or `utils/tests/*.test.ts` suite |
| upstream `packages/path-store/test/**`       | `packages/tree/src/utils/path-store/tests/**`                                                 |

### Authored disposition matrix

Reconfirm every entry against the live upstream head in Step 0. The SHA identifies evidence; do not
apply the commit object itself.

| Upstream change                                                                | Disposition                 | Local handling                                                                                                                                                                          |
| ------------------------------------------------------------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e58bc4b4` — preserve mid-string spaces in overflow splits                     | **APPLY**                   | Hand-port the whitespace-safe split boundary and upstream cases. Plan 051 will later move this pure logic without changing it.                                                          |
| `02d5352c` — generic file-icon remap fallback tests                            | **APPLY TESTS**             | Translate the standard/minimal icon cases into the local real-model DOM suite; change source only if a case fails.                                                                      |
| `37e7ef05` — persist the controller initial-snapshot flag across re-subscribes | **APPLY**                   | Store the lifetime flag in a ref and use a pure transition helper; do not copy upstream's mutable-holder helper verbatim.                                                               |
| `03e5a01e` — prevent a phantom self-nested directory for presorted input       | **APPLY**                   | Port the one invariant repair in the local optimized builder and add the exact directory-then-descendant regression.                                                                    |
| `6fc8db55` — ignore rename Enter/Escape during IME composition                 | **APPLY**                   | Port the `isComposing`/legacy `keyCode === 229` guard and browser behavior tests.                                                                                                       |
| `1238547a` — keep search open and allow manual collapse during search          | **APPLY WITH LOCAL POLICY** | Port controller collapse overrides and mutation remapping. Keep current close behavior for `searchBlurBehavior: 'close'`; use upstream interactive Enter/click behavior for `'retain'`. |
| `43c4783f` plus existing upstream package files — Apache-2.0 metadata          | **APPLY**                   | Add exact upstream `LICENSE.md`/`NOTICE.md`, the SPDX package field, and the durable provenance ledger.                                                                                 |
| `dee6c0bf` — `resetPaths({ preparedInput })` overload                          | **SKIP**                    | No local caller can supply prepared input without paths; adding the overload would recreate exported-but-unreachable API deleted by local policy.                                       |
| `bd16a98a` — public visible-row/navigation forwarding API                      | **SKIP**                    | Local production code uses the controller internally and has no `FileTree` consumer for these forwarders. Do not add dead public API.                                                   |
| `e5fdfa6a` — multi-color row-decoration parts                                  | **SKIP**                    | No local consumer; its arbitrary inline color also conflicts with the local theme-token rule.                                                                                           |
| `c21352d9` — flag-gated SoA count sweep                                        | **DEFER**                   | It adds a second representation and hundreds of lines with no local caller or local benchmark proof. Reconsider only as a measured path-store performance plan.                         |
| `c1e0ba8a` / `945e34cc` — shared Pierre theming integration                    | **SKIP**                    | The local theme helper had no consumer and was deleted in `ed6675fb`; do not restore dead code or add `@pierre/theming`.                                                                |
| `da82c9b7` and package-manager/build/release/docs commits                      | **REVIEW, NO PORT**         | Local equivalents already use local CSS loading/types/tooling, or affect Pierre publishing/docs rather than runtime behavior.                                                           |

## Commands you will need

| Purpose               | Command                                                                                     | Expected on success                          |
| --------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Tree typecheck        | `(cd packages/tree && bun run typecheck)`                                                   | exit 0                                       |
| Tree lint             | `(cd packages/tree && bun run lint)`                                                        | no new warning versus Step 0                 |
| Tree format           | `(cd packages/tree && bun run format:check)`                                                | exit 0                                       |
| Tree node + DOM tests | `(cd packages/tree && bun run test)`                                                        | all Step 0 tests plus new cases pass         |
| Tree browser tests    | `(cd packages/tree && bun run test:browser)`                                                | all Step 0 browser tests plus new cases pass |
| Web typecheck         | `(cd apps/web && bun run typecheck)`                                                        | exit 0                                       |
| Web workspace tests   | `(cd apps/web && bun --bun vitest run --project node --project dom src/features/workspace)` | baseline passes                              |

Use per-workspace baseline deltas; never gate on a historical absolute test count or root
`bun run verify`.

## Scope

**In scope** (the only source/config files that may change):

- `packages/tree/LICENSE.md` (create from upstream)
- `packages/tree/NOTICE.md` (create from upstream)
- `packages/tree/UPSTREAM.md` (create)
- `packages/tree/package.json` — `license` field only
- `packages/tree/src/components/OverflowText.tsx`
- `packages/tree/src/components/FileTreeView.tsx`
- `packages/tree/src/components/FileTree.test.tsx`
- `packages/tree/src/components/FileTree.browser.tsx`
- `packages/tree/src/utils/iconConfig.ts` or `utils/render/iconResolver.ts` — only if the upstream icon characterization fails
- `packages/tree/src/utils/model/FileTreeController.ts`
- `packages/tree/src/utils/path-store/builder.ts`
- `packages/tree/src/utils/path-store/tests/presorted-ingest.test.ts` (create)
- `packages/tree/src/utils/render/controllerSnapshotSubscription.ts` (create)
- `packages/tree/src/utils/render/rowClickPlan.ts`
- `packages/tree/src/utils/tests/controllerSnapshotSubscription.test.ts` (create)
- `packages/tree/src/utils/tests/overflowTextSplit.test.ts` (create)
- `packages/tree/src/utils/tests/search-interaction.test.ts` (create)
- `plans/039-filetreeview-controller-split.md` — drift/baseline reconciliation only after source gates pass
- `plans/051-migrate-tree-internals-to-react.md` — dependency/drift reconciliation only
- `plans/036-reconcile-tree-with-pierre-upstream.md` and `plans/README.md` — completion cleanup

**Out of scope**:

- The SoA path-store implementation, a second node representation, or unmeasured performance work.
- New public `FileTree` APIs, prepared-input overloads, decoration shapes, theming dependencies, SSR,
  or other upstream features with no local consumer.
- Pierre's package layout, barrels, build system, package manager, release scripts, docs app, or test
  harness.
- Replacing local source wholesale, re-adding the submodule, adding a permanent git remote, or
  cherry-picking upstream commits.
- Plan 039's remaining structural split and Plan 051's React migration/refactor.
- App behavior/source changes. `apps/web` is a verification consumer.
- The linked Editor repository.

## Git workflow

- Use the current worktree; do not create a branch or worktree unless the operator asks.
- Clone/fetch upstream only into a `mktemp -d` directory outside this repository.
- Use `apply_patch` for every local file edit. Hand-translate behavior; do not copy source trees.
- Preserve unrelated dirty work. Do not commit, push, or open a PR unless the operator asks.

## Steps

### Step 0: Fetch a disposable upstream view, verify the range, and capture baselines

From the repository root:

```bash
pierre_audit_dir=$(mktemp -d /tmp/plan-036-pierre.XXXXXX)
git clone --filter=blob:none --no-checkout https://github.com/pierrecomputer/pierre.git \
  "$pierre_audit_dir/upstream"
cd "$pierre_audit_dir/upstream"
git remote add imported https://github.com/ShaulLavo/pierre.git
git fetch --no-tags imported 89a601652175d1a79d3bd991b71ee6b9022a2884
upstream_head=$(git rev-parse origin/main)
import_base=$(git merge-base origin/main 89a601652175d1a79d3bd991b71ee6b9022a2884)
printf 'upstream=%s\nbase=%s\n' "$upstream_head" "$import_base"
git log --date=short --format='%H %ad %s' "$import_base".."$upstream_head" -- \
  packages/trees packages/path-store packages/tree-test-data
git diff --stat "$import_base".."$upstream_head" -- packages/trees packages/path-store
```

Expected at authored time: base `af02e6dd...`, upstream `55a941914056...`, and the functional commits
in the disposition matrix. If `origin/main` has advanced and any new commit touches
`packages/trees/src`, `packages/trees/test`, `packages/path-store/src`, or `packages/path-store/test`,
stop and report `upstream advanced: <old>..<new>` with the new commits. Reconcile this plan before
editing local code; do not silently pin the stale SHA.

Return to the local repository and capture baselines:

```bash
cd /Users/shaul/Desktop/D/platform
git status --porcelain > /tmp/plan-036-status-before.txt
(cd packages/tree && bun run typecheck) > /tmp/plan-036-tree-typecheck-before.txt 2>&1
(cd packages/tree && bun run lint) > /tmp/plan-036-tree-lint-before.txt 2>&1
(cd packages/tree && bun run test) > /tmp/plan-036-tree-test-before.txt 2>&1
(cd packages/tree && bun run test:browser) > /tmp/plan-036-tree-browser-before.txt 2>&1
(cd apps/web && bun run typecheck) > /tmp/plan-036-web-typecheck-before.txt 2>&1
(cd apps/web && bun --bun vitest run --project node --project dom src/features/workspace) \
  > /tmp/plan-036-web-tree-before.txt 2>&1
```

Every command must exit 0 except unchanged lint warnings recorded in the snapshot. If not, stop;
this plan needs a trustworthy behavior baseline.

### Step 1: Restore licensing and write the durable upstream ledger

Using `apply_patch`:

1. Add `packages/tree/LICENSE.md` byte-for-byte from `origin/main:packages/trees/LICENSE.md`.
2. Add `packages/tree/NOTICE.md` byte-for-byte from `origin/main:packages/trees/NOTICE.md`, including
   the `headless-tree/core` attribution and MIT notice.
3. Add `"license": "Apache-2.0"` to `packages/tree/package.json`.
4. Create `packages/tree/UPSTREAM.md` containing both repository URLs; imported fork SHA, merge base,
   audited upstream SHA/date, and local copy commit; the path map; the complete disposition matrix;
   the future audit procedure; and the intentional post-051 React divergence.

**Verify**:

```bash
diff -u <(git -C "$pierre_audit_dir/upstream" show origin/main:packages/trees/LICENSE.md) packages/tree/LICENSE.md
diff -u <(git -C "$pierre_audit_dir/upstream" show origin/main:packages/trees/NOTICE.md) packages/tree/NOTICE.md
rg -n '"license": "Apache-2.0"' packages/tree/package.json
rg -n '89a601652175|af02e6ddbb4a|55a941914056|pierrecomputer/pierre|ShaulLavo/pierre' packages/tree/UPSTREAM.md
```

Expected: both diffs are empty and every provenance value is present.

### Step 2: Hand-port the four isolated correctness fixes with tests first

Apply each substep separately and run its focused gate before continuing.

#### 2a. Repair the presorted directory-prefix invariant (`03e5a01e`)

Create `utils/path-store/tests/presorted-ingest.test.ts` using the real `PathStore`/builder pattern
from `store-visible-count.test.ts`. Characterize a presorted explicit directory immediately followed
by its descendant, including nested and sibling variants. Assert the canonical list contains each
path exactly once and never contains a self-nested path such as `src/src/`.

In `utils/path-store/builder.ts`, hand-port the invariant from upstream: after creating the trailing
explicit directory segment in `appendPresortedPaths`, advance `segmentStart` past the leaf slash
before updating `cachedDirPrefix`. Preserve local packed node storage and optimized loops.

**Verify**: `(cd packages/tree && bun run test -- src/utils/path-store/tests/presorted-ingest.test.ts)` → all new cases pass.

#### 2b. Persist controller snapshot state across re-subscriptions (`37e7ef05`)

Create a pure helper in `utils/render/controllerSnapshotSubscription.ts` that accepts the previous
boolean and returns `{ hasSeenInitialSnapshot: true, shouldBumpRevision: boolean }`. It must not
import React, mutate an argument, or own module state. Test the first observation (`false`) and every
later observation (`true`) in `utils/tests/controllerSnapshotSubscription.test.ts`.

In `FileTreeView.tsx`, store the boolean in a component-lifetime `useRef`, outside the subscription
effect. On every controller emission, run the pure transition, update the ref, and bump the
controller revision only when the result says so. Delete the effect-local `let`.

**Verify**:

```bash
(cd packages/tree && bun run test -- src/utils/tests/controllerSnapshotSubscription.test.ts)
(cd packages/tree && bun run test)
```

#### 2c. Protect inline rename during IME composition (`6fc8db55`)

Add behavior coverage before the source edit. Dispatch rename keydown events with
`isComposing: true` and the legacy `keyCode: 229` fallback. Enter/Escape must leave rename active;
equivalent non-composing keys must still commit/cancel. Prefer the real browser path in
`FileTree.browser.tsx`.

In the active-rename branch of `handleTreeKeyDown`, hand-port the upstream guard before Enter/Escape
handling. Preserve branch order and event propagation for non-composing keys.

**Verify**: `(cd packages/tree && bun run test:browser)` → baseline plus IME cases pass.

#### 2d. Preserve whitespace splits and lock icon fallbacks (`e58bc4b4`, `02d5352c`)

Add upstream's whitespace cases to `utils/tests/overflowTextSplit.test.ts`, importing the current
split functions from `components/OverflowText.tsx`. Hand-port the nearest non-whitespace boundary
selection using guard clauses and depth ≤3. Cover center splitting, extension fallback, consecutive
spaces, leading/trailing whitespace, and all-whitespace input.

Extend `FileTree.test.tsx` with real-model tests for `remap['file-tree-icon-file']` under both
`set: 'standard'` and `set: 'minimal'`: unknown extensions use the remap; a known TypeScript file
keeps its standard built-in icon but uses the remap in minimal mode. Change icon source only if an
upstream characterization fails.

**Verify**:

```bash
(cd packages/tree && bun run test)
(cd packages/tree && bun run test:browser)
```

### Step 3: Reconcile upstream interactive search with the local close/retain policy (`1238547a`)

This is a semantic merge, not a literal patch. In `FileTreeController.ts`, hand-port upstream's
search-collapse state machine:

- own a `Set<string>` of directories manually collapsed during an active non-empty search;
- toggle the override when a searched directory is manually collapsed/expanded;
- apply overrides after computing search expansion while keeping the directory and ancestors visible;
- clear overrides when search becomes null/empty;
- prune nonexistent/non-directory entries;
- remap overrides through add/remove/move/batch mutations;
- preserve current focus when it remains visible after a search-time mutation.

Translate upstream code to local structured errors, path helpers, naming, and never-nester style.

In the view/row-click policy:

- `'retain'`: Enter selects the focused result and keeps search open; row clicks keep search open.
- `'close'`: preserve current Enter/click closure behavior.
- Escape explicitly closes in both modes.
- Manual collapse stays collapsed while the query changes, survives mutation remapping, and resets
  when the search session ends.

Update `rowClickPlan.ts` to accept the explicit close/retain policy. Add table-driven policy and
controller mutation/collapse tests in `utils/tests/search-interaction.test.ts`; extend the browser
test for Enter, click, Escape, and focus in both modes.

**Verify**:

```bash
(cd packages/tree && bun run typecheck)
(cd packages/tree && bun run lint)
(cd packages/tree && bun run test)
(cd packages/tree && bun run test:browser)
```

Expected: exit 0, no new lint warning, and both local policies are pinned.

### Step 4: Finish the ledger and reconcile the dependent plans

Update `packages/tree/UPSTREAM.md` with the actual audited head and final dispositions. Every
functional tree/path-store source/test commit in the fetched range must be applied, already-local,
skipped, deferred, or irrelevant, with a local reason. Do not use a vague "misc commits" bucket.

Reconcile Plan 039's drift note, stale line references, and baseline-delta gates against the changed
source while preserving completed Steps 0–2 and remaining extraction order. Reconcile Plan 051 to
require the upstream ledger and the post-upstream Plan 039 shape. Do not execute either plan.

**Verify**:

```bash
rg -n "e58bc4b4|02d5352c|37e7ef05|03e5a01e|6fc8db55|1238547a|43c4783f|dee6c0bf|bd16a98a|e5fdfa6a|c21352d9|c1e0ba8a|945e34cc|da82c9b7" packages/tree/UPSTREAM.md
rg -n "Plan 036|UPSTREAM.md|upstream" plans/039-filetreeview-controller-split.md plans/051-migrate-tree-internals-to-react.md
```

### Step 5: Run final scoped gates and clean up the completed plan

```bash
(cd packages/tree && bun run typecheck)
(cd packages/tree && bun run lint)
(cd packages/tree && bun run format:check)
(cd packages/tree && bun run test)
(cd packages/tree && bun run test:browser)
(cd apps/web && bun run typecheck)
(cd apps/web && bun --bun vitest run --project node --project dom src/features/workspace)
git diff --check
git status --short
```

Compare every result to Step 0. No previously passing scoped test may fail and no new warning may
appear. Compare status with `/tmp/plan-036-status-before.txt`; preserve unrelated work and ensure
every newly changed file is in Scope. Then delete this plan and remove its index row.

## Test plan

- Presorted ingestion: explicit directory followed by descendants/siblings never creates a
  self-nested phantom directory.
- Controller subscription: only the genuine initial snapshot is suppressed; the first emission
  after re-subscribe bumps revision.
- Rename keyboard: composing and legacy-IME Enter/Escape do not commit/cancel; normal keys do.
- Overflow splits: whitespace remains visible at center/fallback seams, including degenerate input.
- Icon fallback: generic remap behavior under standard/minimal icon sets.
- Search: manual collapse, query update, mutation remap, policy-specific Enter/click, Escape, focus,
  and end-of-session cleanup.
- Existing tree DOM/browser and workspace suites remain unchanged behavior gates.

All totals are baseline deltas captured in Step 0; no absolute count is a completion gate.

## Done criteria

ALL must hold:

- [ ] Imported fork SHA, merge base, and latest upstream head are independently verified.
- [ ] `LICENSE.md` and `NOTICE.md` exactly match upstream; package metadata says `Apache-2.0`.
- [ ] `UPSTREAM.md` records provenance, path mapping, last audited SHA/date, and every disposition.
- [ ] Presorted-directory, snapshot re-subscribe, IME rename, overflow whitespace, icon fallback,
      and interactive-search behaviors have local regression tests and pass.
- [ ] No upstream public API, theming dependency, SSR path, SoA representation, build tooling, or
      package layout was copied without a local consumer and explicit scope.
- [ ] Plans 039 and 051 are reconciled but were not executed early.
- [ ] Tree typecheck, lint, format, node/DOM tests, and browser tests match or improve Step 0.
- [ ] Web typecheck and focused workspace tests match Step 0.
- [ ] `git diff --check` passes and no out-of-scope/unrelated change was overwritten.
- [ ] This plan and its index row are deleted after completion.

## STOP conditions

Stop and report; do not improvise if:

- Upstream advanced beyond `55a941914056...` with a new tree/path-store source or test commit.
- The imported fork no longer resolves to merge base `af02e6dd...`.
- Local `packages/tree` has active overlapping source changes.
- An applicable patch depends on an upstream subsystem that local cleanup deleted.
- A change requires copying a whole upstream file, cherry-picking, restoring the submodule, adding a
  permanent remote, or adopting Pierre's package/build layout.
- Search reconciliation cannot preserve both explicitly documented local policies.
- The SoA optimization appears attractive without a local benchmark and separate design review.
- A source fix requires a new public API or app-source change.
- A gate fails twice after one reasonable in-scope correction.
- Completion requires a source/config file outside Scope.

## Maintenance notes

- Future upstream reviews start from the `last audited upstream SHA` in `UPSTREAM.md`, not the 2026
  import base. Fetch to a temporary clone, inspect path-limited commits, and update the ledger.
- After Plan 051, same-named upstream Preact files will no longer be structurally comparable. Review
  behavior/tests first, then translate into local React component/hook boundaries.
- Deferred SoA work requires a local benchmark proving the current representation is the bottleneck
  and a decision on whether a second representation deserves to exist.
- Keep upstream license and notice files intact when reorganizing the package.
