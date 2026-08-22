# Plan 053: Collapse `@workspace/tree` to its consumed API and delete unreachable residue

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. This repository deletes completed plans: once
> every done criterion is verified, delete this file and remove its row from `plans/README.md` in the
> same change.
>
> **Mandatory prerequisites**: Plans 036, 039, 051, and 052 must be complete, in that order. This
> plan deliberately runs after the product wiring so "unused" means "not part of the file navigator
> we chose," rather than letting a cleanup tool make product decisions.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 5afe83d1..HEAD -- packages/tree apps/web/src/features/workspace apps/web/src/features/git/utils/status-entries-for-tree.ts apps/web/src/keymap apps/web/src/lib/file-icons.ts
> git diff --stat -- packages/tree apps/web/src/features/workspace apps/web/src/features/git/utils/status-entries-for-tree.ts apps/web/src/keymap apps/web/src/lib/file-icons.ts
> ```
>
> Large committed drift from all prerequisites is expected. Regenerate every inventory in Step 0.
> Any uncommitted overlap not owned by this plan is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 052 complete (which itself depends on 036, 039, and 051)
- **Category**: tech-debt
- **Planned at**: commit `5afe83d1`, 2026-08-22

## Why this matters

`@workspace/tree` is a private package with one application consumer, yet its manifest exposes
wildcard subpaths for every component, hook, utility, model, path-store, and renderer module. The app
therefore imports implementation files directly, and same-file helpers/constants/types remain
exported even when nothing outside their module can name them.

Plan 052 first turns every desired high-level capability into a real product consumer: search,
focus/reveal/scroll, selection and item handles, batched mutations, mutation events, git patches,
drag/drop, rename, composition, icons, density, lifecycle, and prepared-input reuse. This plan then
creates one reviewed root entry point, internalizes live implementation details, and deletes only
the residue that has neither a caller nor a deliberate future role.

## Current state and authored evidence

At the planned-at commit, `packages/tree/package.json` has no root export and exposes:

```json
"./components/*"
"./hooks/*"
"./styles/*"
"./utils/*"
"./utils/model/*"
"./utils/path-store/*"
"./utils/render/*"
```

The package tsconfig maps both `@/*` and `@workspace/tree/*` to its own source, so internal code and
tests look like outside consumers. After this plan, package internals use exact `@/…` files; only
code outside the package imports `@workspace/tree`.

At the authored pre-052 shape, scoped production Knip reports 16 unused value-export groups and 7
unused type-export groups, concentrated in overflow text, CSS wrappers, model/layout/virtualization,
path-store helpers, prepared input, rename helpers, and render/web-component code. Plans
036/039/051/052 change that list. It is evidence that the wildcard surface hides residue, not a
delete manifest.

Commit `ed6675fb` is the repository precedent: delete truly unreachable implementations, remove
exports that widen a contract for no reason, and let typecheck/tests identify real callers. Do not
repeat removals that commit already completed.

## Retention and deletion policy

Classify every live candidate into exactly one bucket before editing:

| Bucket                                       | Action                                                     |
| -------------------------------------------- | ---------------------------------------------------------- |
| Outside consumer after Plan 052              | Export through `src/index.ts` and keep tested              |
| High-level tree capability wired by Plan 052 | Keep even if a particular method is reached indirectly     |
| Deliberate future fast path                  | Keep only the prepared/presorted input API described below |
| Package-internal cross-file symbol           | Keep exact module export, but do not root-export it        |
| Same-file helper/type                        | Remove `export`, keep implementation                       |
| Zero caller + removed/superseded purpose     | Delete implementation and obsolete tests/types             |
| Uncertain/dynamic                            | Stop and report; do not delete                             |

Do not retain an API solely because Pierre exports it. Do not delete a root entry solely because
Knip's `--include-entry-exports` audit mode says an intentional public symbol is unused.

### Deliberate future exception: presorted input

Plan 052 consumes `prepareFileTreeInput` for cached remount/reset work but intentionally does not use
`preparePresortedFileTreeInput`, because `TreeModel.paths` has no comparator-order guarantee. Keep
and root-export the opaque `FileTreePreparedInput`, `prepareFileTreeInput`, and
`preparePresortedFileTreeInput` API. Large repositories may later prove/supply sorted input, and the
underlying optimized builder already exists. Do not add a fake current caller or weaken the
presorted invariant to make it look consumed.

No other low-level path-store, controller, renderer, DOM, layout, or split-helper API receives this
exception.

## Target package entry point

Create the one permitted package barrel at `packages/tree/src/index.ts`. The runtime allowlist is:

```text
FileTree
FileTreeModel            (alias of the imperative class; avoids colliding with the component)
getBuiltInFileIconColor
prepareFileTreeInput
preparePresortedFileTreeInput
useFileTree
```

The type allowlist is the union of types named by outside consumers after Plan 052 plus these
high-level configuration contracts:

```text
FileTreeProps
UseFileTreeResult
FileTreeOptions
FileTreePreparedInput
FileTreePublicId
FileTreeDirectoryHandle
FileTreeFileHandle
FileTreeItemHandle
FileTreeDropTarget
FileTreeDropContext
FileTreeDropResult
FileTreeRenameEvent
FileTreeRowDecorationContext
FileTreeContextMenuItem
FileTreeContextMenuOpenContext
FileTreeBatchOperation
FileTreeCompositionOptions
FileTreeDragAndDropConfig
FileTreeGitStatusPatch
FileTreeMoveOptions
FileTreeMutationEvent
FileTreeMutationEventForType
FileTreeMutationEventType
FileTreeMutationHandle
FileTreeRemoveOptions
FileTreeRenamingConfig
FileTreeResetOptions
FileTreeRowDecoration
FileTreeRowDecorationRenderer
FileTreeScrollToPathOptions
FileTreeSearchBlurBehavior
FileTreeSearchMode
FileTreeSearchSessionHandle
FileTreeSelectionChangeListener
FileTreeSortComparator
FileTreeInitialExpansion
FileTreeIcons
FileTreeBuiltInIconSet
FileTreeIconConfig
RemappedIcon
GitStatus
GitStatusEntry
```

Remove an allowlist type if Step 0 proves it is neither named by a consumer nor required to name a
public callback/configuration shape. Add a type only when a real outside consumer from Plan 052
names it. Do not root-export controller classes, path-store classes/types, renderer/root helpers,
DOM/shadow-root helpers, split helpers, constants, sprite names, layout/virtualization shapes, or
internal state types.

## Commands you will need

| Purpose             | Command                                                                                                                       | Expected on success                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Tree typecheck      | `(cd packages/tree && bun run typecheck)`                                                                                     | exit 0                              |
| Tree lint           | `(cd packages/tree && bun run lint)`                                                                                          | no new warning versus Step 0        |
| Tree format         | `(cd packages/tree && bun run format:check)`                                                                                  | exit 0                              |
| Tree tests          | `(cd packages/tree && bun run test)`                                                                                          | baseline plus entry-point test pass |
| Tree browser tests  | `(cd packages/tree && bun run test:browser)`                                                                                  | baseline passes                     |
| Web typecheck       | `(cd apps/web && bun run typecheck)`                                                                                          | exit 0                              |
| Web workspace tests | `(cd apps/web && bun --bun vitest run --project node --project dom src/features/workspace src/features/workbench src/keymap)` | baseline passes                     |
| Unused exports      | `bunx knip --workspace @workspace/tree --production --exports --reporter compact --no-progress --no-config-hints`             | exit 0, no non-entry finding        |
| Unused files        | `bunx knip --workspace @workspace/tree --production --files --reporter compact --no-progress --no-config-hints`               | exit 0, no unused production file   |

Normal Knip ignores intentional root entry exports. Use `--include-entry-exports` only for the Step 0
audit and disposition ledger, not as a zero-warning completion gate.

## Suggested executor toolkit

- Read and apply `/Users/shaul/.agents/skills/never-nester/SKILL.md` before editing.
- Use `rg`, TypeScript typecheck, and scoped Knip as complementary evidence. Knip does not report
  unused class methods reliably and does not know product intent.

## Scope

**In scope**:

- `packages/tree/package.json`
- `packages/tree/tsconfig.json`
- `packages/tree/src/index.ts` (create)
- `packages/tree/src/**/*.ts` and `packages/tree/src/**/*.tsx`, only for import specifiers, export
  visibility, and candidates classified by this plan
- `packages/tree/src/tests/public-api.test.ts` (create; follow the post-051 test location if moved)
- every outside `@workspace/tree/*` consumer found in Step 0 under `apps/web/src`, including the
  workspace, workbench, keymap, git status, and file-icons files touched by Plan 052
- `packages/tree/UPSTREAM.md`, API-boundary note only
- this plan and `plans/README.md`

**Out of scope**:

- New behavior, UI, styling, settings, commands, or capability wiring; Plan 052 owns those.
- Reworking React runtime ownership, FileTreeView/controller decomposition, or path-store algorithms.
- Deleting high-level capabilities wired by Plan 052 or the deliberate prepared/presorted future path.
- Compatibility subpaths, aliases, deprecations, or migration windows. Update all greenfield callers
  in one pass.
- Pierre upstream reconciliation beyond documenting the local boundary.
- The linked Editor repository.

## Git workflow

- Use the current worktree. Do not create a branch/worktree, commit, push, or open a PR unless the
  operator asks.
- Preserve unrelated dirty work. Use `apply_patch` for edits.
- Never run Knip with `--fix`; each removal needs a recorded disposition.

## Steps

### Step 0: Capture the final consumer/export/file inventories

Verify all prerequisites and their final gates, then run:

```bash
git status --porcelain > /tmp/plan-053-status-before.txt
rg -n "from ['\"]@workspace/tree(?:/[^'\"]*)?['\"]" apps packages \
  --glob '*.{ts,tsx}' --glob '!packages/tree/**' > /tmp/plan-053-consumers-before.txt
bunx knip --workspace @workspace/tree --production --exports --include-entry-exports \
  --reporter compact --no-progress --no-config-hints --no-exit-code \
  > /tmp/plan-053-exports-before.txt
bunx knip --workspace @workspace/tree --production --files \
  --reporter compact --no-progress --no-config-hints --no-exit-code \
  > /tmp/plan-053-files-before.txt
(cd packages/tree && bun run typecheck) > /tmp/plan-053-tree-typecheck-before.txt 2>&1
(cd packages/tree && bun run lint) > /tmp/plan-053-tree-lint-before.txt 2>&1
(cd packages/tree && bun run test) > /tmp/plan-053-tree-test-before.txt 2>&1
(cd packages/tree && bun run test:browser) > /tmp/plan-053-tree-browser-before.txt 2>&1
(cd apps/web && bun run typecheck) > /tmp/plan-053-web-typecheck-before.txt 2>&1
(cd apps/web && bun --bun vitest run --project node --project dom src/features/workspace src/features/workbench src/keymap) \
  > /tmp/plan-053-web-tests-before.txt 2>&1
```

All typecheck/test commands must pass; lint may have only recorded existing warnings. If an outside
consumer exists beyond the reconciled web workspace, stop and update Scope/allowlist first.

### Step 1: Write the per-symbol disposition ledger

For every live Knip finding and every no-caller public member of `FileTreeModel`,
`FileTreeController`, and `PathStore`, record temporarily:

```text
symbol | defining file | all callers | bucket | keep/internalize/delete reason
```

Verify each delete with a repository-wide exact-symbol search and typecheck after removal. Treat
tests as evidence of behavior, not automatically as a production consumer: a test that is the only
caller of a removed unreachable API is deleted with that API. Controller/path-store members used by
the high-level model/view remain internal engine code.

**Verify**: every candidate has one policy-backed disposition; none says only "Knip reports it."

### Step 2: Create the root entry point and remove wildcard subpaths

1. Create `src/index.ts` with exact named re-exports matching the reconciled allowlists. Alias the
   imperative class to `FileTreeModel`; do not rename its internal class/file here.
2. Replace the package manifest export map with only `".": "./src/index.ts"`.
3. Move every outside consumer to `@workspace/tree` root imports.
4. Move package-internal/test imports to exact `@/…` files, except the new public API test.
5. Remove `@workspace/tree/*` from the tree tsconfig paths after the source search is empty.
6. Add no compatibility subpath or second barrel.

**Verify**:

```bash
rg -n "from ['\"]@workspace/tree/" apps packages --glob '*.{ts,tsx}'
rg -n '"\./[^\"]+"\s*:' packages/tree/package.json
rg -n '"@workspace/tree/\*"' packages/tree/tsconfig.json
(cd packages/tree && bun run typecheck)
(cd apps/web && bun run typecheck)
```

Expected: searches print nothing; typechecks pass.

### Step 3: Internalize live implementation and delete proven residue

Work the Step 1 ledger one item at a time:

- same-file caller -> remove `export` only;
- cross-file package caller -> keep exact-module export/import through `@/…`;
- root allowlist/high-level capability -> keep;
- zero caller plus removed/superseded purpose -> delete implementation, private types, and obsolete
  tests;
- uncertainty -> stop.

Delete any remaining post-051 hydration/renderer-injection residue, superseded layout pipeline,
obsolete aliases/constants, or helpers for removed features when and only when live searches prove
zero callers. Keep prepared/presorted input and the engine supporting it. Do not redesign code just
to reduce Knip output.

After each behavior-bearing deletion, run its focused tests and tree typecheck. Follow never-nester
rules in any function edited beyond an `export` modifier/import.

**Verify**: normal scoped Knip exports/files commands, tree typecheck, and tree tests all exit 0 with
no finding/regression.

### Step 4: Lock the public entry point and upstream divergence

Create `public-api.test.ts`. Import `* as treePackage` from `@workspace/tree` and assert sorted
runtime keys are exactly:

```text
FileTree
FileTreeModel
getBuiltInFileIconColor
prepareFileTreeInput
preparePresortedFileTreeInput
useFileTree
```

Import every final allowlist type from the root in type positions so package typecheck proves it is
nameable. Do not import internal subpaths in this test.

Update `UPSTREAM.md`: Pierre behavior is reviewed/ported manually; local consumers use the root
allowlist, and upstream subpath/public additions are not mirrored without a local decision.

**Verify**:

```bash
(cd packages/tree && bun run test -- src/tests/public-api.test.ts)
(cd packages/tree && bun run typecheck)
```

### Step 5: Run final gates and remove the completed plan

Run every command in "Commands you will need", then:

```bash
rg -n "from ['\"]@workspace/tree/" apps packages --glob '*.{ts,tsx}'
git diff --check
git status --short
```

Expected: all gates pass without baseline regression/new lint warning, the deep-import search is
empty, and only in-scope files differ. Delete this plan and its index row.

## Test plan

- Root runtime/type allowlist test.
- All Plan 052 capability/integration tests remain unchanged and green.
- Delete a test only with the unreachable API it alone preserves; never weaken behavior assertions.
- Tree/app typecheck proves every caller migrated in one pass.
- Knip proves no non-entry export/file residue remains.

## Done criteria

- [ ] Plans 036/039/051/052 and their final gates are complete/green.
- [ ] Manifest exports only `.` to `src/index.ts`; no compatibility subpath exists.
- [ ] Outside consumers import only `@workspace/tree`; internals import exact `@/…`; self-package
      wildcard alias is gone.
- [ ] Runtime entry keys match the six-name allowlist exactly.
- [ ] Root types expose only real Plan 052 capabilities plus the deliberate prepared-input future path.
- [ ] No controller, path-store, renderer, DOM, split-helper, layout, or state internals are public.
- [ ] Scoped normal Knip reports no unused non-entry export/type or production file.
- [ ] All tree/web typecheck, lint, format, node/DOM/browser, and focused integration gates pass.
- [ ] `UPSTREAM.md` records the intentional local API boundary.
- [ ] `git diff --check` passes; unrelated dirty work is untouched.
- [ ] This completed plan and its index row are deleted.

## STOP conditions

Stop and report; do not improvise if:

- Plan 052 capability wiring is incomplete or red.
- A proposed deletion has a caller, dynamic access, high-level Plan 052 role, or prepared-input role.
- Another outside workspace consumes a deep subpath not covered by Scope.
- Narrowing exports breaks tooling that exact root/internal imports cannot fix.
- Knip contradicts TypeScript or repository searches; re-derive instead of forcing green.
- An import/export-only step changes runtime behavior or breaks a behavior test.
- Completion requires UI/behavior/style/performance changes or files outside Scope.
- A verification gate fails twice after one reasonable in-scope correction.

## Maintenance notes

- `src/index.ts` is the API review boundary. New exports require a real consumer or an explicit
  high-level/future decision; never restore wildcard subpaths for convenience.
- `--include-entry-exports` is an audit view. Normal scoped Knip is the internal cleanliness gate.
- Keep controller/path-store internal. Prefer a narrow `FileTreeModel` domain action when a future
  app feature needs capability.
- Keep the presorted-input contract strict. Wire it only after the app proves comparator-compatible
  ordering and benchmarks the improvement.
- Future Pierre reviews port behavior through `UPSTREAM.md`; upstream export additions do not widen
  this package automatically.
