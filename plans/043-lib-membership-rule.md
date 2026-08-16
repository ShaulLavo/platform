# Plan 043: State the `lib/` membership rule and do the pure moves only

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report — do
> not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**. Note the single `ace313f` with no `..HEAD` — the
> repo had uncommitted work in progress when this plan was written, so a
> commit-to-commit diff would report a false all-clear:
>
> ```bash
> cd /Users/shaul/Desktop/D/platform
> git diff --stat ace313f -- \
>   AGENTS.md \
>   apps/web/src/lib \
>   apps/web/src/main.tsx \
>   apps/web/src/keymap \
>   apps/web/src/components/command-palette \
>   apps/web/src/features/command-palette \
>   apps/web/src/features/editor \
>   apps/web/src/features/menus/utils/resolve.ts
> ```
>
> At `ace313f` this reports exactly two files —
> `apps/web/src/features/editor/components/editor.tsx` and
> `apps/web/src/features/editor/editor-plugins.ts` — from unrelated uncommitted
> work. Both are in-scope for a one-line import edit and both still carry the
> lines this plan cites (Step 4 verifies them). **That is the expected reading,
> not drift.**
>
> Anything _else_ in that list: compare the "Current state" excerpts against the
> live code before proceeding; on a mismatch, treat it as a STOP condition.
> **Exception**: plans 009–012 and 029 legitimately move and rewrite files listed
> above. Step 0 detects whether they have landed and tells you which destinations
> to use. That is not drift.

## Status

- **Priority**: P3
- **Effort**: S (top of the range — three file moves, one rule, one comment)
- **Risk**: LOW
- **Depends on**: land with `plans/012-features-workspace-consolidation.md` (see
  "Ordering" below). Compatible with `plans/029-one-command-table.md` having
  landed or not.
- **Category**: architecture
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

**Read this paragraph before anything else, because the obvious reading of the
problem is wrong.** `apps/web/src/lib/` is _not_ a junk drawer. It has a real,
healthy, high-fan-in core: `file-system-types.ts` is imported by 60 files,
`structured-errors.ts` by 47, `client-logging.ts` by 38, `query-keys.ts` by 36,
`path-formatters.ts` by 28. Those are exactly what an app-level shared layer
should hold, and **none of them move in this plan.**

What `lib/` lacks is a _membership rule_. Because nobody ever wrote down what
qualifies, the folder does two wrong things at once: it hosts modules with a
single consumer (`document-symbols.ts` is used only by the command palette;
`editor-performance-trace.ts` only by the editor), and it fails to attract the
things that actually are shared — so the command-enablement policy
(`commandDisabledReason`) ended up inside `components/command-palette/`, which
forces `features/menus/utils/resolve.ts` to import from a `components/` folder.
A feature depending on a UI folder is a layering inversion, and it exists purely
because there was no stated home.

After this plan: the rule is in `AGENTS.md`, the three misfiled modules are where
their consumers are, and `features/menus` no longer reaches into `components/`.
Every move is behaviour-preserving; `tsgo --build` plus the existing suite is a
complete correctness proof.

This closes the `lib/` half of **theme T3** in `plans/README.md` ("No shared home
for a 10-line utility → N copies"). It deliberately does **not** close the other
half — see "The prohibition" below, which you must read.

## The prohibition — do NOT consolidate the duplicated helpers

The same audit that produced this plan also observed six `basename` functions and
four `omitKey`/`withoutKey` functions in `apps/web/src`. **Consolidating them is
explicitly out of scope and explicitly rejected.** They are not copies. They have
genuinely different behaviours, and TypeScript will not catch a wrong swap
because all six `basename`s have the identical signature `(string) => string`.

The six `basename`s, verified at `ace313f`:

| Location                                                                    | Behaviour that differs                                                                  |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `apps/web/src/lib/path-formatters.ts:1` `basename`                          | splits on `/`, filters empties, **returns `'Root'`** when nothing is left               |
| `apps/web/src/features/terminal/utils/links.ts:376` `basename`              | `path.slice(path.lastIndexOf('/') + 1)` — returns `''` for `"a/"`                       |
| `apps/web/src/features/chat/lib/markdown-file-links.ts:260` `basename`      | identical to the terminal one, separately written                                       |
| `apps/web/src/features/editor/utils/file-path.ts:93` `basenameForFilePath`  | same slice **plus `.toLowerCase()`** — it feeds extension/icon lookup                   |
| `apps/web/src/lib/file-icons.ts:637` `basenameForIconPath`                  | splits/filters but **falls back to the whole path**, not `'Root'`                       |
| `apps/web/src/lib/platform/hydrate-picked-entry.ts:26` `basenameFromOsPath` | **normalises Windows `\` to `/`**, strips trailing slashes, then falls back to `'Root'` |

The four record helpers, verified at `ace313f`:

| Location                                                                               | Behaviour / signature that differs                                                                       |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/editor/state/workspace-document-service.ts:622` `omitKey`       | `Record<string, string>`; returns the **same object identity** when the key is absent; spread + `delete` |
| `apps/web/src/features/editor/state/editor-conflict-state.tsx:85` `omitKey`            | generic `<T>`; same-identity short-circuit; `Object.fromEntries` + filter                                |
| `apps/web/src/features/settings/components/widgets/record-widget.tsx:113` `withoutKey` | takes a `RecordValue`; **no short-circuit — always allocates**                                           |
| `apps/web/src/features/chat-mode/state/rail-order-store.ts:100` `withoutKey`           | `Partial<Record<TKey, string>>` with a key-type parameter; same-identity short-circuit                   |

Three of the four preserve object identity when the key is absent; one does not.
Zustand stores and React render paths care about that. `apps/web/src/lib/objects.ts`
holds exactly one function (`omitNullish`) and is **not** the right place to force
these together without per-site reasoning and tests.

**If you find yourself editing any of the ten locations in these two tables, you
have left the plan. Stop.** The only thing this plan does about them is Step 5:
add a comment recording that the divergence is deliberate.

## Ordering — read before Step 1

This plan overlaps three other plans. Step 0 resolves it mechanically; this
section explains why, so a mismatch does not read as drift.

- **`plans/012-features-workspace-consolidation.md`** moves
  `apps/web/src/components/command-palette/**` → `apps/web/src/features/command-palette/**`
  and moves `apps/web/src/lib/directory-churn.ts` →
  `apps/web/src/features/workspace/utils/directory-churn.ts`. Plan 012's Step 1
  **aborts if `apps/web/src/features/workspace/` already exists**, so this plan
  must not create that directory. Consequence: **`directory-churn.ts` is 012's
  job, not yours** (see Out of scope).
- **`plans/010-remaining-feature-folder-reorg.md`** empties the root of
  `apps/web/src/features/editor/` (its done criterion is
  `find apps/web/src/features/editor -maxdepth 1 -name "*.ts*" | wc -l` → `0`).
  Consequence: the editor-performance-trace destination in this plan is a
  subdirectory (`state/`), never the feature root.
- **`plans/029-one-command-table.md`** rewrites the _body_ of
  `commandDisabledReason` in place but does not move it. If 029 has landed the
  body will read differently from the excerpt below; the move in Step 3 is still
  valid — you are moving whatever body is there, unchanged.

## Current state

Everything you need is inlined. Line numbers are from commit `ace313f`.

### The three modules that move

**1. `apps/web/src/lib/document-symbols.ts`** (211 lines) — talks LSP over a
websocket to produce `FlatDocumentSymbol[]` for the palette's `@` mode. Every
importer is inside the command palette:

```
apps/web/src/components/command-palette/command-palette-groups-factory.tsx:2:import type { FlatDocumentSymbol } from '@/lib/document-symbols'
apps/web/src/components/command-palette/providers/actions-context.ts:7:import type { FlatDocumentSymbol } from '@/lib/document-symbols'
apps/web/src/components/command-palette/symbol-groups.tsx:1:import type { FlatDocumentSymbol } from '@/lib/document-symbols'
apps/web/src/components/command-palette/use-command-palette-symbols.ts:5:import { fetchDocumentSymbols } from '@/lib/document-symbols'
```

Its only exports are `FlatDocumentSymbol` (type) and `fetchDocumentSymbols`.
Its own imports are `@/lib/server-sockets` and `@/lib/structured-errors` — both
stay in `lib/`, so the move creates no new cross-layer edge.

**2. `apps/web/src/lib/editor-performance-trace.ts`** (421 lines) — a URL-driven
dev instrument. Four importers, all editor or the app entry:

```
apps/web/src/features/editor/components/editor.tsx:24:import { editorPerformanceLayoutVariant } from '@/lib/editor-performance-trace'
apps/web/src/features/editor/editor-plugins.ts:55:import { editorPerformanceFeatureDisabled } from '@/lib/editor-performance-trace'
apps/web/src/features/editor/hooks/use-scroll-persistence-plugin.ts:5:import { editorPerformanceFeatureDisabled } from '@/lib/editor-performance-trace'
apps/web/src/main.tsx:23:import { installEditorPerformanceTraceFromUrl } from '@/lib/editor-performance-trace.ts'
```

Note `main.tsx` spells the specifier **with a `.ts` extension**; the other three
do not. Both forms resolve. Keep each site's existing form when you rewrite it.

It is not `utils/`-eligible. `AGENTS.md` says `utils/` is "pure, stateless,
non-React code only. No stores, no module-level mutable state, no subscriptions".
This file has all three disqualifiers:

```
apps/web/src/lib/editor-performance-trace.ts:76:let disabledFeatureSet: ReadonlySet<string> | null = null
apps/web/src/lib/editor-performance-trace.ts:140:  window.addEventListener('scroll', recordInputEvent, { capture: true, passive: true })
apps/web/src/lib/editor-performance-trace.ts:215:    const observer = new PerformanceObserver((list) => {
```

Its four exports (`EditorPerformanceLayoutVariant`,
`installEditorPerformanceTraceFromUrl`, `editorPerformanceFeatureDisabled`,
`editorPerformanceLayoutVariant`) are at lines 74, 78, 93, 97. **Export names do
not change in this plan** — only the file path.

**3. `commandDisabledReason` and its three companions**, currently inside
`apps/web/src/components/command-palette/command-palette-utils.ts` (485 lines).
Lines 272–309 verbatim:

```ts
export type CommandDisabledContext = {
  readonly activeFilePath: string | null
  readonly hasWorkspace: boolean
}

export function commandPaletteItemDisabledReason(
  item: CommandPaletteItem,
  context: CommandDisabledContext,
) {
  return commandDisabledReason(item.command.command, context)
}

export function isCommandDisabled(command: PlatformCommandId, context: CommandDisabledContext) {
  return commandDisabledReason(command, context) !== null
}

export function commandDisabledReason(command: PlatformCommandId, context: CommandDisabledContext) {
  if (workspaceOptionalCommands.has(command)) return null
  if (!context.hasWorkspace) return 'No workspace open.'

  if (selectedFileCommands.has(command)) {
    return fileBackedPath(context.activeFilePath) ? null : 'No file-backed surface is active.'
  }
  if (isEditorPlatformCommandId(command)) {
    return fileBackedPath(context.activeFilePath) ? null : 'No file-backed surface is active.'
  }

  return null
}

export function fileBackedPath(path: string | null) {
  if (!path) return null
  if (parseSearchBufferDocumentId(path)) return null
  if (parseCompareSavedDocumentId(path)) return null
  if (parseRefDocumentId(path)) return null

  return path
}
```

The layering violation this creates, verbatim from
`apps/web/src/features/menus/utils/resolve.ts:3-4`:

```ts
import type { CommandDisabledContext } from '@/components/command-palette/command-palette-utils'
import { commandDisabledReason } from '@/components/command-palette/command-palette-utils'
```

Every consumer of the four symbols at `ace313f`:

| Symbol                   | Consumers                                                                                                                                                                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commandDisabledReason`  | `features/menus/utils/resolve.ts:4,145`; `keymap/tests/keymap.test.ts:3,653,659,665`; `features/editor/utils/tests/text-menu.test.ts:3,72,80`; `components/command-palette/tests/command-palette-utils.test.ts:4,125,131,140,146,152`; and `command-palette-utils.ts` itself (lines 281, 285) |
| `isCommandDisabled`      | `components/command-palette/content.tsx:34,165,196`                                                                                                                                                                                                                                           |
| `fileBackedPath`         | `components/command-palette/use-command-palette-symbols.ts:10,24`; `components/command-palette/tests/command-palette-utils.test.ts:7,160,161,162`; and `command-palette-utils.ts` itself (293, 296)                                                                                           |
| `CommandDisabledContext` | `features/menus/utils/resolve.ts:3,14`; and `command-palette-utils.ts` itself                                                                                                                                                                                                                 |

`commandPaletteItemDisabledReason` takes a `CommandPaletteItem` and is palette
UI — **it stays in `command-palette-utils.ts`.**

Why `keymap/` is the destination: `apps/web/src/keymap/` already owns the command
registry (`command-registry.ts`), the id unions (`types.ts`), and the
editor-command predicate (`editor-keymap.ts`) that `commandDisabledReason`
already calls. `keymap/` already imports from both `@/features/*` and
`@/components/*` (e.g. `keymap/commands.ts:3-9`, `keymap/types.ts:1`), so nothing
new is introduced. And two of the four external consumers of
`commandDisabledReason` are already `keymap/tests/*`. There is no import cycle:
`command-palette-data.ts` imports only types (`@/keymap/types` and
`./command-palette-types`), and the three document-id parsers import only
`@/lib/path-formatters`.

`keymap/` contents today: `active-bindings.ts`, `command-registry.ts`,
`commands.ts`, `default-bindings.ts`, `editor-keymap.ts`, `types.ts`,
`use-app-keymap.ts`, `tests/`.

### One finding in the audit was wrong — do not act on it

The audit claimed `apps/web/src/lib/instance-id.ts` has a single consumer
(`features/workbench/components/web-wallpaper.tsx`) and should move into
`features/workbench`. **That is false and `instance-id.ts` stays in `lib/`.** The
audit's grep only matched `@/lib/instance-id` and missed two _relative_ imports
from inside `lib/` itself:

```
apps/web/src/lib/client.ts:5:import { clientInstanceId, instanceHeaderName } from './instance-id'
apps/web/src/lib/client-logging.ts:6:import { clientInstanceId, instanceQueryParam } from './instance-id'
apps/web/src/features/workbench/components/web-wallpaper.tsx:14:import { clientInstanceId, instanceHeaderName } from '@/lib/instance-id'
```

`client.ts` and `client-logging.ts` are two of the highest-fan-in modules in the
folder, and `instanceHeaderName` is half of a contract with the server
(`apps/server/src/observability/logging.ts:77` reads `x-client-instance`;
`apps/server/src/app.ts:138` allow-lists it). It is core infrastructure with three
consumers across two areas. Leave it.

### The rules that apply, quoted verbatim from `AGENTS.md`

`AGENTS.md` lives at the repo root; `CLAUDE.md` is a symlink to it, so editing
`AGENTS.md` updates both.

> ## Code Organization
>
> - Group by feature, then by kind:
>   - `components/` — React render components only (`.tsx`)
>   - `hooks/` — `use-*` hooks
>   - `providers/` — context providers and `*-context.ts` modules
>   - `state/` — optional home for stores and other stateful modules. Co-locating a store next to its provider is fine too
>   - `utils/` — pure, stateless, non-React code only. No stores, no module-level mutable state, no subscriptions, nothing that imports React
>   - `tests/` — feature tests
> - Do not create empty folders.
> - Import exact files through `@/`. Do not add barrel `index.ts` files.
> - Barrel files are allowed only at package entry points such as `packages/*/src/index.ts` that back the package's `"."` export. Do not add feature, folder, or utility barrels.

> ## Greenfield, No Backward Compatibility
>
> - This project is greenfield and not live: no releases, no external users, no data anyone needs migrated.
> - No backward compatibility shims, no legacy aliases, no deprecation windows. Update every call site in the same pass.

> ## Naming And Refactors
>
> - Do not repeat the folder name in file or symbol names. In `workspace/`, prefer `sidebar.tsx`, not `workspace-sidebar.tsx`.
> - When removing a redundant prefix, rename the file, exports, and all call sites in one pass.
> - Delete obsolete tests instead of preserving old behavior.
> - Remove duplicate code aggressively.

Consequences you must honour:

- **No re-export shims.** Do not leave `export { x } from '...'` behind in the old
  file. Update every call site in the same pass.
- **No barrel.** Do not add an `index.ts` anywhere.
- **Rename files, not exported symbols.** `installEditorPerformanceTraceFromUrl`
  keeps its name even though it now lives in `features/editor/`. Renaming
  exported symbols would widen the diff past what `tsgo` can prove and is a
  separate concern (plans 009–012 own symbol naming).
- "Remove duplicate code aggressively" is the rule an executor will be tempted to
  apply to the `basename`/`omitKey` tables above. It does not apply there — see
  "The prohibition". This plan adds a comment saying so precisely because that
  temptation is predictable.

## Commands you will need

| Purpose                      | Command                                                                                                                                                                                   | Expected on success                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Typecheck (web)              | `cd /Users/shaul/Desktop/D/platform/apps/web && bun run typecheck`                                                                                                                        | exit 0, **no output at all** past the `$ tsgo --build` echo              |
| Tests (web)                  | `cd /Users/shaul/Desktop/D/platform/apps/web && bun run test`                                                                                                                             | `Test Files 244 passed (244)` / `Tests 1764 passed (1764)`               |
| Targeted tests               | `cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run --project node --project dom src/keymap src/components/command-palette src/features/menus src/features/editor/utils` | exit 0, all pass                                                         |
| Lint (web)                   | `cd /Users/shaul/Desktop/D/platform/apps/web && bun run lint`                                                                                                                             | exit 0 (it prints ~7 pre-existing **warnings**; warnings do not fail it) |
| Format the files you touched | `cd /Users/shaul/Desktop/D/platform/apps/web && bunx oxfmt --write <paths>`                                                                                                               | exit 0                                                                   |
| Full verify                  | `cd /Users/shaul/Desktop/D/platform && bun run verify`                                                                                                                                    | see the baseline note below — **it does not exit 0 today**               |

`bun run verify` = `typecheck && lint && format:check && test` across all
workspaces. Run it once at the end, not per step.

### Baseline at `ace313f` — measured, not assumed

The repo had 59 dirty entries (unrelated settings work-in-progress) when this plan
was written. These are the numbers you are held to:

| Gate                    | Baseline result                                                                  |
| ----------------------- | -------------------------------------------------------------------------------- |
| `apps/web` typecheck    | **green**, silent                                                                |
| `apps/web` test         | **green** — 244 files, 1764 tests                                                |
| `apps/web` lint         | **green** (warnings only)                                                        |
| `apps/web` format:check | **RED** — `src/features/settings/hooks/use-setting-inspection.ts` is unformatted |
| root `bun run verify`   | **RED**, for exactly that one reason                                             |

Consequences you must honour:

- **Do not "fix" `src/features/settings/hooks/use-setting-inspection.ts`.** It is
  out of scope. It was already unformatted before you started.
- **Never run `bun run format` (`oxfmt --write .`)** in `apps/web` or at the repo
  root. It rewrites every unformatted file in the tree, including that one and any
  other WIP, and blows your diff past the in-scope list. Format only the files you
  touched, by path: `bunx oxfmt --write src/keymap/command-enablement.ts ...`.
- Your final gate is therefore **not** "verify exits 0". It is: typecheck green,
  test green at 1764, lint green, and `format:check` red on _that one file and
  nothing else_. Step 6 spells out how to check that.

Re-measure the test baseline yourself before Step 1 rather than trusting the table
— if it does not read 1764, the tree has drifted and the "identical count" gate
below means _identical to what you measured_:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun run test 2>&1 | tail -5
```

A dev server is already running at <http://localhost:5173>. **Never start your
own** — `AGENTS.md` forbids it. You do not need the browser for this plan; the
moves are compile-time only.

## Scope

**In scope** (the only files you may modify or move):

- `AGENTS.md` — Step 1, the rule (this is the headline deliverable)
- `apps/web/src/lib/document-symbols.ts` → moved (Step 2)
- `apps/web/src/lib/editor-performance-trace.ts` → moved (Step 4)
- `apps/web/src/keymap/command-enablement.ts` → **created** (Step 3)
- `apps/web/src/keymap/tests/command-enablement.test.ts` → **created** (Step 3)
- `apps/web/src/components/command-palette/command-palette-utils.ts` — delete the
  four moved symbols, add one import (Step 3)
- Import-specifier-only edits in exactly these files:
  - `apps/web/src/components/command-palette/command-palette-groups-factory.tsx`
  - `apps/web/src/components/command-palette/providers/actions-context.ts`
  - `apps/web/src/components/command-palette/symbol-groups.tsx`
  - `apps/web/src/components/command-palette/use-command-palette-symbols.ts`
  - `apps/web/src/components/command-palette/content.tsx`
  - `apps/web/src/components/command-palette/tests/command-palette-utils.test.ts`
  - `apps/web/src/features/menus/utils/resolve.ts`
  - `apps/web/src/features/editor/utils/tests/text-menu.test.ts`
  - `apps/web/src/features/editor/components/editor.tsx`
  - `apps/web/src/features/editor/editor-plugins.ts`
  - `apps/web/src/features/editor/hooks/use-scroll-persistence-plugin.ts`
  - `apps/web/src/keymap/tests/keymap.test.ts`
  - `apps/web/src/main.tsx`
- `apps/web/src/lib/path-formatters.ts` — one doc comment (Step 5)
- `apps/web/src/lib/objects.ts` — one doc comment (Step 5)
- `plans/README.md` — status row

**Out of scope** (do NOT touch, even though they look related):

- **`apps/web/src/lib/directory-churn.ts`.** It genuinely has one consumer, but
  `plans/012-features-workspace-consolidation.md` Step 4 already moves it to
  `apps/web/src/features/workspace/utils/directory-churn.ts`, and plan 012's
  Step 1 **aborts if `apps/web/src/features/workspace/` already exists**. Moving
  it here would block 012. If 012 has already landed, the file is already gone
  from `lib/` and there is nothing to do.
- **`apps/web/src/lib/instance-id.ts`.** The audit was wrong about it — see
  "One finding in the audit was wrong" above. It has three consumers, two of them
  inside `lib/` via relative imports.
- **The ten `basename` / `omitKey` sites** in "The prohibition". Four distinct
  behaviours, identical signatures; TypeScript cannot catch a wrong swap.
- **`apps/web/src/lib/objects.ts`'s `omitNullish` function body.** It has one
  consumer (`lib/file-server.ts:14`) but that consumer is inside `lib/` — the
  rule you are writing explicitly allows lib-internal helpers. Comment only.
- **`apps/web/src/lib/workspace-cache.ts`, `workspace-path.ts`,
  `workspace-event-model.ts`, `coalesced-log.ts`.** Plan 012 owns all four.
- **The 59 already-dirty files in the working tree** (unrelated settings work).
  In particular `apps/web/src/features/settings/hooks/use-setting-inspection.ts`
  fails `format:check` _before you start_. Leave it alone.
- **`apps/web/src/features/editor/utils/text-menu.ts:46`** — a prose comment that
  names `commandDisabledReason`. It is not an import; the symbol name does not
  change; do not edit it.
- **Every other file in `apps/web/src/lib/`** — 34 of the 36 root-level modules
  are legitimately shared infrastructure. If you move a `lib/` file that is not
  `document-symbols.ts` or `editor-performance-trace.ts`, stop.
- **The body of `commandDisabledReason`.** You are moving it byte-for-byte. Plan
  029 rewrites it; that is 029's job.
- **`commandPaletteItemDisabledReason`** — palette UI, stays.
- **Any exported symbol rename.** Files move; names do not.
- **`docs/web-code-layout.md`** — it does not exist at `ace313f`; plan 009
  creates it. Step 1 has a conditional for the case where 009 landed first.
- **`packages/editor-*`** — symlinks to a sibling checkout, never in scope.

## Git workflow

**All work happens on `main`** — no new branches, worktrees, commits, pushes, or
PRs unless the operator explicitly asks. Commit only if the operator asked for
commits.

Conventional commits, lowercase descriptive subject. Real examples from
`git log`:

```
refactor(orchestration): the server prepares a session's worktree (M-C)
fix(address): bound the URL, and stop escaping slashes in ?tabs=
```

Suggested subject for this plan:

```
refactor(lib): state the membership rule and move the single-consumer modules
```

Use `git mv` for every file move so history follows the file.

## Steps

### Step 0: Detect which world you are in

Two destinations in this plan depend on whether plan 012 has landed.

```bash
cd /Users/shaul/Desktop/D/platform
test -d apps/web/src/features/command-palette && echo "PALETTE=features" || echo "PALETTE=components"
test -f apps/web/src/lib/directory-churn.ts && echo "012 not landed" || echo "012 landed"
test -f docs/web-code-layout.md && echo "009 landed" || echo "009 not landed"
ls apps/web/src/keymap/
find apps/web/src/lib -maxdepth 1 -name '*.ts' | wc -l          # → 36 at ace313f
# save the pre-existing dirt so Step 6 can subtract it
git status --short | sort > /tmp/043-status-baseline.txt
wc -l < /tmp/043-status-baseline.txt                             # → 59 at ace313f
```

Also confirm the three document-id modules that Step 3a imports still live where
this plan says (plans 010/011 move files inside `features/`):

```bash
ls apps/web/src/features/editor/compare-saved-document.ts \
   apps/web/src/features/git/ref-document.ts \
   apps/web/src/features/search/search-buffer-document.ts
```

If any is missing, find its new path with
`grep -rn "export function parseCompareSavedDocumentId\|export function parseRefDocumentId\|export function parseSearchBufferDocumentId" apps/web/src`
and use that path in Step 3a. Do not invent one.

Record the palette directory as `$PALETTE_DIR`:

- `apps/web/src/components/command-palette` if plan 012 has **not** landed (the
  state at `ace313f` — this is the expected case)
- `apps/web/src/features/command-palette` if it has

Everywhere below that says `<PALETTE>` , substitute that path; everywhere an
import specifier says `@/components/command-palette/...`, substitute
`@/features/command-palette/...` in the "012 landed" world.

**Verify**: `apps/web/src/keymap/` exists and contains `command-registry.ts`,
`types.ts`, `editor-keymap.ts`, and a `tests/` directory. It does **not** contain
`command-enablement.ts`. If `command-enablement.ts` already exists, this plan has
already been executed — STOP and report.

### Step 1: Write the membership rule into `AGENTS.md`

Open `/Users/shaul/Desktop/D/platform/AGENTS.md`. Find the `## Code Organization`
section (it starts at line 3). Its last bullet today is:

```markdown
- Barrel files are allowed only at package entry points such as `packages/*/src/index.ts` that back the package's `"."` export. Do not add feature, folder, or utility barrels.
```

Append these four bullets immediately after it, inside the same section:

```markdown
- `apps/web/src/lib/` is the app-level shared layer. It is not a kind directory and it is not a junk drawer. **A module belongs in `lib/` only if two or more consumers outside `lib/` import it** — counting `features/*` (each feature counts once), `components/`, `hooks/`, `keymap/`, and `main.tsx` — **or if it is a dependency of a `lib/` module that qualifies.** A module with a single outside consumer lives inside that consumer instead.
- The rule runs both ways. When a `lib/` module drops to one consumer, move it into that consumer. When a feature-local module gains a second feature consumer, move it up to `lib/` in the same pass — do not import across features to reach it.
- `lib/` sits below `features/`: a `lib/` module should not import from `@/features/*`. Shared policy that genuinely needs feature knowledge belongs in the layer that already owns the domain — command enablement lives in `keymap/`, next to the command registry, not in `lib/` and not in `components/`.
- Two implementations of the same-sounding helper are not automatically duplicates. Before merging them, diff their _behaviour_ — the six `basename` variants in `apps/web/src` have three different empty-path fallbacks (`'Root'`, `''`, and the whole path) and one of them lowercases its result, yet all six share the signature `(string) => string`, so a wrong merge typechecks. Merge only with a test per call site, or leave a comment saying why they differ.
```

**If Step 0 reported "009 landed"**, also append the first bullet (only the first)
to `docs/web-code-layout.md`, next to its existing note that `lib/` is not a kind
directory. If 009 has not landed, skip that — plan 009 will pick the rule up from
`AGENTS.md`.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform
grep -c "two or more consumers outside" AGENTS.md     # → 1
grep -n "not a kind directory" AGENTS.md              # → one hit, inside ## Code Organization
awk '/^## Control Flow/{exit} /^- /{n++} END{print n}' AGENTS.md   # → 8 (was 4)
```

`AGENTS.md` is Markdown and is not covered by `oxfmt`; no formatter runs on it.

### Step 2: Move `document-symbols.ts` into the command palette

Destination is the palette folder **root**, not a `hooks/`/`state/`/`utils/`
subfolder: the folder already keeps its non-component `.ts` modules at the root
(`command-palette-data.ts`, `command-palette-types.ts`, `goto-line-target.ts`),
and this module is neither pure (it opens a websocket) nor a hook. Do not rename
it — `document-symbols.ts` inside `command-palette/` does not repeat the folder
name.

```bash
cd /Users/shaul/Desktop/D/platform
git mv apps/web/src/lib/document-symbols.ts <PALETTE>/document-symbols.ts
```

The file's own two imports (`@/lib/server-sockets`, `@/lib/structured-errors`)
stay exactly as they are — both modules remain in `lib/`.

Update the four importers. Use the _relative_ form for siblings inside the
palette folder, matching what those files already do for other palette modules
(e.g. `use-command-palette-symbols.ts:10` already writes
`from './command-palette-utils'`):

| File                                             | Old                             | New                          |
| ------------------------------------------------ | ------------------------------- | ---------------------------- |
| `<PALETTE>/command-palette-groups-factory.tsx:2` | `from '@/lib/document-symbols'` | `from './document-symbols'`  |
| `<PALETTE>/symbol-groups.tsx:1`                  | `from '@/lib/document-symbols'` | `from './document-symbols'`  |
| `<PALETTE>/use-command-palette-symbols.ts:5`     | `from '@/lib/document-symbols'` | `from './document-symbols'`  |
| `<PALETTE>/providers/actions-context.ts:7`       | `from '@/lib/document-symbols'` | `from '../document-symbols'` |

Note the last one is one directory deeper.

Leave `apps/web/src/lib/query-keys.ts:51` alone — `all: ['document-symbols']` is
a query-key string, not an import.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform
grep -rn "lib/document-symbols" apps/web/src   # → no matches
cd apps/web && bun run typecheck               # → exit 0
```

### Step 3: Move command enablement into `keymap/`

**3a. Create `apps/web/src/keymap/command-enablement.ts`.** Move — do not copy —
`CommandDisabledContext`, `isCommandDisabled`, `commandDisabledReason` and
`fileBackedPath` out of `<PALETTE>/command-palette-utils.ts` (lines 272–309 at
`ace313f`; if plan 029 has landed, take whatever the current bodies are). The new
file, with its imports resolved:

```ts
import { parseCompareSavedDocumentId } from '@/features/editor/compare-saved-document'
import { parseRefDocumentId } from '@/features/git/ref-document'
import { parseSearchBufferDocumentId } from '@/features/search/search-buffer-document'
import { isEditorPlatformCommandId } from '@/keymap/editor-keymap'
import type { PlatformCommandId } from '@/keymap/types'

import {
  selectedFileCommands,
  workspaceOptionalCommands,
} from '@/components/command-palette/command-palette-data'

// ...the four moved declarations, bodies unchanged...
```

- Substitute `@/features/command-palette/command-palette-data` if Step 0 said
  `PALETTE=features`, and substitute the three document-id paths with whatever
  Step 0's `ls` / fallback `grep` reported.
- No cycle is created. Verified at `ace313f`: `command-palette-data.ts` imports
  only `@/keymap/types` (type-only) and `./command-palette-types`;
  `keymap/editor-keymap.ts` imports only `@singapor/core` and `./types`.
- **If plan 029 has landed**, `commandDisabledReason` no longer reads
  `selectedFileCommands` / `workspaceOptionalCommands` — it reads a
  `commandRequirement` lookup from `@/keymap/table.ts`. In that case drop the
  `command-palette-data` import block entirely and carry over whatever imports
  the current body needs. Do not reintroduce the old body.
- Add a one-line header comment: `// What has to be true before a command can run — shared by the palette, the menus, and the keymap tests.`
  (If 029 landed, `keymap/table.ts` may already carry a similar comment; keep
  yours to one line and do not duplicate 029's prose.)

**3b. Fix `<PALETTE>/command-palette-utils.ts`.** Delete the four declarations.
`commandPaletteItemDisabledReason` (lines 277–282) **stays** and now needs an
import:

```ts
import { commandDisabledReason, type CommandDisabledContext } from '@/keymap/command-enablement'
```

Then remove any import that is now unused. At `ace313f` that means:

- `selectedFileCommands` and `workspaceOptionalCommands` from the
  `'./command-palette-data'` block (lines 18–24) — check first that nothing else
  in the file uses them; `paletteModeCommands`, `hiddenCommandPaletteCommands`
  and `colorModePaletteItems` from that same block are still used, so shrink the
  block rather than deleting it.
- `isEditorPlatformCommandId` from `'@/keymap/editor-keymap'` (line 13) — check
  first; delete the line only if the grep below returns nothing.
- `parseSearchBufferDocumentId` (line 4), `parseCompareSavedDocumentId` (line 1),
  `parseRefDocumentId` (line 2) — same check. Note lines 3–7 import three symbols
  from `@/features/search/search-buffer-document`; only
  `parseSearchBufferDocumentId` may become unused.

```bash
cd /Users/shaul/Desktop/D/platform/apps/web/src
grep -n "isEditorPlatformCommandId\|parseSearchBufferDocumentId\|parseCompareSavedDocumentId\|parseRefDocumentId\|selectedFileCommands\|workspaceOptionalCommands" \
  components/command-palette/command-palette-utils.ts
```

`oxlint` will flag any unused import you miss, so the lint gate in Step 6 is the
backstop — but do the grep anyway.

**3c. Update the five external call sites.**

| File                                                           | Change                                                                                                                                         |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/menus/utils/resolve.ts:3-4`             | both lines → `import { commandDisabledReason, type CommandDisabledContext } from '@/keymap/command-enablement'` (one line replaces two)        |
| `<PALETTE>/content.tsx:34`                                     | remove `isCommandDisabled` from the `command-palette-utils` import list; add `import { isCommandDisabled } from '@/keymap/command-enablement'` |
| `<PALETTE>/use-command-palette-symbols.ts:10`                  | `import { fileBackedPath } from './command-palette-utils'` → `import { fileBackedPath } from '@/keymap/command-enablement'`                    |
| `apps/web/src/keymap/tests/keymap.test.ts:3`                   | `from '@/components/command-palette/command-palette-utils'` → `from '@/keymap/command-enablement'`                                             |
| `apps/web/src/features/editor/utils/tests/text-menu.test.ts:3` | same rewrite                                                                                                                                   |

**3d. Move the three enablement tests.** `<PALETTE>/tests/command-palette-utils.test.ts`
currently holds three tests that belong with the moved code — lines 123–163 at
`ace313f`: `'workspace commands require a workspace unless explicitly optional'`,
`'selected-file commands require a file-backed active editor'`, and
`'file-backed paths exclude transient search buffers'`. Cut them into a new file
`apps/web/src/keymap/tests/command-enablement.test.ts`:

```ts
import { commandDisabledReason, fileBackedPath } from '@/keymap/command-enablement'
import { searchBufferDocumentId } from '@/features/search/search-buffer-document'
import { expect, test } from '../../../test/fixtures'

// ...the three tests, bodies unchanged...
```

`AGENTS.md`: "Import `{ test, expect }` from `apps/web/test/fixtures.ts`, not from
`vitest`, for app tests." From `apps/web/src/keymap/tests/` the relative path is
`'../../../test/fixtures'` (the source file used `'../../../../test/fixtures'`
from one level deeper — count the `../` again yourself rather than copying).

Then in `<PALETTE>/tests/command-palette-utils.test.ts`, drop
`commandDisabledReason` and `fileBackedPath` from the import block (lines 3–13)
and drop the now-unused `searchBufferDocumentId` import **only if** no remaining
test in that file uses it — at `ace313f` line 166 still does, so it stays.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform
# the layering violation is gone
grep -rn "command-palette" apps/web/src/features/menus/    # → no matches
# nothing outside the palette folder imports from command-palette-utils any more
grep -rn "command-palette-utils" apps/web/src/keymap apps/web/src/features \
  --exclude-dir=command-palette                             # → no matches
# the four symbols are declared exactly once, in keymap/
grep -rn "export function commandDisabledReason\|export function isCommandDisabled\|export function fileBackedPath\|export type CommandDisabledContext" apps/web/src
# → exactly four hits, all in apps/web/src/keymap/command-enablement.ts
cd apps/web && bun run typecheck                            # → exit 0
bun --bun vitest run --project node --project dom src/keymap src/components/command-palette src/features/menus src/features/editor/utils
```

Expected: all pass. The three moved tests now report under
`src/keymap/tests/command-enablement.test.ts`; the total test count across those
paths is unchanged.

### Step 4: Move `editor-performance-trace.ts` into `features/editor/state/`

Destination is `apps/web/src/features/editor/state/performance-trace.ts`.

- `state/`, not `utils/`, because of the module-level `let`, the window listeners
  and the `PerformanceObserver` quoted in "Current state".
- `state/`, not the feature root, because plan 010's done criterion is that
  `features/editor/` has zero root-level `.ts*` files.
- `performance-trace.ts`, not `editor-performance-trace.ts`, because of the
  `AGENTS.md` rule "Do not repeat the folder name in file or symbol names".

```bash
cd /Users/shaul/Desktop/D/platform
git mv apps/web/src/lib/editor-performance-trace.ts \
       apps/web/src/features/editor/state/performance-trace.ts
```

Update the four importers. **Keep each site's existing specifier style** — three
have no extension, `main.tsx` has `.ts`:

| File                                                                    | Old                                   | New                                              |
| ----------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------ |
| `apps/web/src/features/editor/components/editor.tsx:24`                 | `'@/lib/editor-performance-trace'`    | `'@/features/editor/state/performance-trace'`    |
| `apps/web/src/features/editor/editor-plugins.ts:55`                     | `'@/lib/editor-performance-trace'`    | `'@/features/editor/state/performance-trace'`    |
| `apps/web/src/features/editor/hooks/use-scroll-persistence-plugin.ts:5` | `'@/lib/editor-performance-trace'`    | `'@/features/editor/state/performance-trace'`    |
| `apps/web/src/main.tsx:23`                                              | `'@/lib/editor-performance-trace.ts'` | `'@/features/editor/state/performance-trace.ts'` |

Export names are unchanged: `installEditorPerformanceTraceFromUrl`,
`editorPerformanceFeatureDisabled`, `editorPerformanceLayoutVariant`,
`EditorPerformanceLayoutVariant`.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform
grep -rn "lib/editor-performance-trace" apps/web/src   # → no matches
grep -rn "editorPerfTrace" apps/web/src apps/web/scripts | head
cd apps/web && bun run typecheck                       # → exit 0
```

The second grep is informational: the URL parameter names (`editorPerfTrace`,
`editorPerfDisable`, `editorPerfLayout`) are string literals inside the moved
file and are read by `apps/web/scripts/*.mjs` benchmarks via the browser URL, not
by import. **Do not change any of those strings** — the benchmarks pass them as
query params and a rename silently disables the instrument.

### Step 5: Record why the `basename` / `omitKey` variants are not merged

Two comments, nothing else. This is the counterweight to the `AGENTS.md` rule
"Remove duplicate code aggressively", which would otherwise send the next agent
straight into a silent behaviour change.

Prepend to `apps/web/src/lib/path-formatters.ts`, above `export function basename`:

```ts
/**
 * Last path segment, falling back to `'Root'` for an empty or `/`-only path.
 *
 * Five other `basename`-shaped helpers exist in this app and they are NOT
 * copies — do not merge them into this one. They differ in ways this signature
 * cannot express: `features/editor/utils/file-path.ts` lowercases (it feeds
 * extension lookup), `lib/file-icons.ts` falls back to the whole path,
 * `lib/platform/hydrate-picked-entry.ts` normalises Windows separators, and
 * `features/terminal/utils/links.ts` + `features/chat/lib/markdown-file-links.ts`
 * return `''` rather than `'Root'`. Every one of them is `(string) => string`,
 * so a wrong swap typechecks and ships.
 */
```

Append to `apps/web/src/lib/objects.ts`, below `omitNullish`:

```ts
/*
 * No `omitKey` here on purpose. The four record-minus-one-key helpers in the app
 * (`features/editor/state/workspace-document-service.ts`,
 * `features/editor/state/editor-conflict-state.tsx`,
 * `features/settings/components/widgets/record-widget.tsx`,
 * `features/chat-mode/state/rail-order-store.ts`) use two different generic
 * signatures, and three of the four return the *same object identity* when the
 * key is absent while the fourth always allocates. Store subscribers depend on
 * that. Unifying them needs a test per call site, not a shared helper.
 */
```

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web
bunx oxfmt --write src/lib/path-formatters.ts src/lib/objects.ts
bun run lint                       # → exit 0 (warnings only)
git diff --stat src/lib/path-formatters.ts src/lib/objects.ts
```

Expected: only additions, no line of executable code changed.

### Step 6: Final gates and index update

Format only what you touched — `bun run format` is banned here, see "Baseline".
Pass the paths explicitly (substitute `components/command-palette` →
`features/command-palette` if Step 0 said `PALETTE=features`):

```bash
cd /Users/shaul/Desktop/D/platform/apps/web
bunx oxfmt --write \
  src/keymap/command-enablement.ts \
  src/keymap/tests/command-enablement.test.ts \
  src/keymap/tests/keymap.test.ts \
  src/components/command-palette/command-palette-utils.ts \
  src/components/command-palette/content.tsx \
  src/components/command-palette/document-symbols.ts \
  src/components/command-palette/command-palette-groups-factory.tsx \
  src/components/command-palette/symbol-groups.tsx \
  src/components/command-palette/use-command-palette-symbols.ts \
  src/components/command-palette/providers/actions-context.ts \
  src/components/command-palette/tests/command-palette-utils.test.ts \
  src/features/menus/utils/resolve.ts \
  src/features/editor/state/performance-trace.ts \
  src/features/editor/components/editor.tsx \
  src/features/editor/editor-plugins.ts \
  src/features/editor/hooks/use-scroll-persistence-plugin.ts \
  src/features/editor/utils/tests/text-menu.test.ts \
  src/lib/path-formatters.ts \
  src/lib/objects.ts \
  src/main.tsx
```

Then:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web
bun run typecheck          # → silent
bun run lint               # → exit 0
bun run test 2>&1 | tail -5   # → 244 files / 1764 tests passed (your Step-0 numbers)
bun run format:check 2>&1 | grep -E '^src/|^Format issues'
```

`format:check` must list **exactly one** file —
`src/features/settings/hooks/use-setting-inspection.ts`, the pre-existing failure
from Step 0. If it names any file you touched, format that file and re-run. If it
lists zero files, someone reformatted the settings WIP; that is an out-of-scope
edit — revert it.

Then confirm the diff added nothing unexpected, by subtracting the Step 0 baseline
(**run this before you commit anything** — committing empties `git status`):

```bash
cd /Users/shaul/Desktop/D/platform && git status --short | sort | comm -13 /tmp/043-status-baseline.txt -
```

Expected: only "In scope" entries — the two `R` renames from `git mv`, the two new
`keymap/` files, the edited importers, and `AGENTS.md`. `plans/README.md` was
already dirty at Step 0 so `comm` hides it; verify its row separately with
`grep '^| 043' plans/README.md`. Anything else in the `comm` output is an
out-of-scope edit — revert it.

Finally, set this plan's row in `plans/README.md` (line 96 at `ace313f`,
`| 043 | ... | TODO |`) from `TODO` to `DONE`.

## Test plan

**No new test cases.** This plan is behaviour-preserving by construction: three
files move, four symbols relocate with their bodies unchanged, and two comments
are added. Writing new tests for a move would test the module system, not the
app.

The existing suite is the gate, and it is a real one:

- `apps/web/src/keymap/tests/keymap.test.ts` — 805 lines; asserts
  `commandDisabledReason` directly at lines 653, 659, 665.
- `apps/web/src/components/command-palette/tests/command-palette-utils.test.ts` —
  asserts `commandDisabledReason` (lines 125–156) and `fileBackedPath`
  (lines 159–163). Step 3d moves exactly those three tests to
  `apps/web/src/keymap/tests/command-enablement.test.ts` with bodies unchanged.
- `apps/web/src/features/editor/utils/tests/text-menu.test.ts:72,80` — asserts
  menu items are gated by `commandDisabledReason`, which is precisely the
  layering edge this plan rewires.
- `tsgo --build` proves every import specifier resolves. For a pure move that is
  a complete correctness proof for everything except the two comments.

**Migrated test file**: `apps/web/src/keymap/tests/command-enablement.test.ts`
(3 tests, all cut from `command-palette-utils.test.ts`). Model its header on
`apps/web/src/features/editor/utils/tests/text-menu.test.ts`, which uses the same
`import { expect, test } from '<relative>/test/fixtures'` form. The `node` vitest
project globs `src/**/*.test.ts`, so the new path is picked up with no config
change.

**The opposite case — commands that stay _enabled_.** This plan could plausibly
break enablement in either direction, so check both survive: the migrated
`'workspace commands require a workspace unless explicitly optional'` asserts a
disabled reason _and_ a `null` for `workspace.showCommandPalette`, and
`text-menu.test.ts:80` asserts `commandDisabledReason('workspace.showCommandPalette', …)`
is `null`. Both must still pass; a wrong `command-palette-data` import in Step 3a
(e.g. swapping `selectedFileCommands` for `workspaceOptionalCommands`) typechecks
and would only show up here.

`commandPaletteItemDisabledReason` keeps no direct test after Step 3d. It is a
one-line delegate; its only failure mode is the new import in Step 3b, which
`tsgo --build` catches.

Verification: `cd apps/web && bun run test` → all pass, **total count identical to
your Step-0 baseline** — 1764 at `ace313f` (three tests moved between files, none
added or removed).

## Done criteria

Machine-checkable. ALL must hold:

All run from `/Users/shaul/Desktop/D/platform` unless noted.

- [ ] `cd apps/web && bun run typecheck` — silent
- [ ] `cd apps/web && bun run lint` — exit 0
- [ ] `cd apps/web && bun run test` — passes, total count equals your Step-0 baseline (1764 at `ace313f`)
- [ ] `cd apps/web && bun run format:check` — fails on `src/features/settings/hooks/use-setting-inspection.ts` **and no other file** (the pre-existing baseline failure; see "Baseline")
- [ ] `grep -c "two or more consumers outside" AGENTS.md` → `1`
- [ ] `awk '/^## Control Flow/{exit} /^- /{n++} END{print n}' AGENTS.md` → `8` (was `4`)
- [ ] `grep -rn "lib/document-symbols" apps/web/src` → no matches
- [ ] `grep -rn "lib/editor-performance-trace" apps/web/src` → no matches
- [ ] `grep -rn "command-palette" apps/web/src/features/menus/` → no matches
- [ ] `test -f apps/web/src/keymap/command-enablement.ts` → true
- [ ] `test -f apps/web/src/keymap/tests/command-enablement.test.ts` → true
- [ ] `test -f apps/web/src/lib/instance-id.ts` → **true** (it must NOT have moved)
- [ ] `test -f apps/web/src/lib/directory-churn.ts` → unchanged from what Step 0 reported
- [ ] `find apps/web/src/lib -maxdepth 1 -name '*.ts' | wc -l` → `34` (was `36`; exactly two modules left)
- [ ] `git diff --name-only ace313f -- apps/web/src/features/terminal apps/web/src/features/chat apps/web/src/lib/file-icons.ts apps/web/src/lib/platform apps/web/src/features/chat-mode apps/web/src/features/settings/components/widgets apps/web/src/features/editor/state/workspace-document-service.ts apps/web/src/features/editor/state/editor-conflict-state.tsx apps/web/src/features/editor/utils/file-path.ts` → no matches (the ten `basename`/`omitKey` sites are untouched)
- [ ] `grep -rn "^export .* from " apps/web/src/lib apps/web/src/keymap apps/web/src/components/command-palette` → no matches (no re-export shims left behind)
- [ ] `grep -rn "export function commandDisabledReason\|export function isCommandDisabled\|export function fileBackedPath\|export type CommandDisabledContext" apps/web/src` → exactly 4 hits, all in `apps/web/src/keymap/command-enablement.ts`
- [ ] `git status --short | sort | comm -13 /tmp/043-status-baseline.txt -` lists only "In scope" files, and no `index.ts` among them (no new barrels)
- [ ] `plans/README.md` row 043 reads `DONE`

## STOP conditions

Stop and report back — do not improvise — if:

- **`apps/web/src/keymap/command-enablement.ts` already exists** at Step 0. Plan
  029 creates `keymap/table.ts`, not this file, so the only explanation is that
  this plan already ran. Do not merge into it blind.
- **`apps/web/src/features/workspace/` does not exist and you are tempted to
  create it.** You are about to break plan 012's Step 1 precondition. The only
  reason to create it is moving `directory-churn.ts`, which is out of scope.
- **Removing an import from `command-palette-utils.ts` in Step 3b breaks the
  typecheck**, meaning a symbol you thought was only used by the moved code is
  used elsewhere in the file. Re-run the grep, keep the import, and note it.
- **`keymap.test.ts` fails after Step 3.** That file is plan 029's 805-line
  correctness gate and this plan only changes one import line in it. A failure
  means a body changed when it should not have — revert Step 3 and report.
- **You find yourself editing a `basename` or `omitKey` body**, or adding
  `omitKey` to `lib/objects.ts`. Full stop; re-read "The prohibition".
- **You are about to run `bun run format` / `oxfmt --write .`** to make
  `format:check` pass, or about to reformat
  `src/features/settings/hooks/use-setting-inspection.ts`. That file is somebody
  else's uncommitted work and its format failure predates you. Format only your
  own files, by path.
- **Your Step-0 test baseline is not 1764 passing tests**, or the tree has more
  than the two expected uncommitted in-scope files. Report the numbers you got
  and wait — the "identical count" gate is meaningless against a moving tree.
- **You find yourself moving a `lib/` file other than `document-symbols.ts` or
  `editor-performance-trace.ts`.** The rule you are writing is a rule for future
  work, not a licence to apply it repo-wide in this pass.
  `find apps/web/src/lib -maxdepth 1 -name '*.ts' | wc -l` must read exactly `34`
  when you finish (`36` at Step 0, minus these two).
- **The assumption "`keymap/` may import from `components/` and `features/`" is
  false** — i.e. a lint rule or `tsconfig` path restriction rejects
  `keymap/command-enablement.ts`'s imports. At `ace313f` `keymap/commands.ts:3-9`
  and `keymap/types.ts:1` already do exactly this, so this should not happen; if
  it does, the layering has changed and the destination needs rethinking.
- **A verification fails twice** after one reasonable fix attempt.

## Maintenance notes

For whoever owns this next:

- **What a reviewer should scrutinize**: (1) that
  `keymap/command-enablement.ts`'s four bodies are byte-identical to what left
  `command-palette-utils.ts` — a "while I'm here" simplification here would be
  invisible in review and would change which menu items grey out; (2) that no
  re-export shim was left in `command-palette-utils.ts` or in `lib/`; (3) that
  `apps/web/src/lib/instance-id.ts` is still in `lib/`.
- **Interaction with plan 029**: 029 rewrites `commandDisabledReason` to read a
  `commandRequirement` from `keymap/table.ts`. If 029 lands after this plan, its
  Step 9.2 target moves from `command-palette-utils.ts` to
  `keymap/command-enablement.ts`, and at that point the file may collapse into
  `table.ts` entirely. That is a fine outcome — the point of this plan is that
  the policy is in `keymap/`, not which file inside `keymap/`.
- **Interaction with plan 012**: 012 moves `components/command-palette/` →
  `features/command-palette/`. After this plan the palette folder gains
  `document-symbols.ts` (one more file in that move) and loses four exports from
  `command-palette-utils.ts`. Neither changes 012's mechanics. 012's Step 4 table
  still owns `directory-churn.ts`.
- **Interaction with plan 010**: 010 empties `features/editor/`'s root. This plan
  adds `features/editor/state/performance-trace.ts`, which is already in a
  subdirectory, so 010's file table needs no new row.
- **Deliberately deferred, with reasons**:
  - Consolidating the six `basename`s and four `omitKey`s — see "The
    prohibition". Step 5 records the reason in the code so it is not re-litigated.
  - Enforcing the membership rule mechanically (an oxlint `no-restricted-imports`
    rule banning `@/features/*` from `lib/`). Worth doing, but it only becomes
    true after plan 012 removes `lib/workspace-cache.ts`, which imports from four
    features today (`lib/workspace-cache.ts:2-22`). Follow-up once 012 lands.
  - Auditing the other 34 `lib/` modules against the new rule. A full sweep is a
    separate pass and should reuse plan 012's Step 1 fan-in measurement loop.
- **The rule's failure mode to watch for**: "two or more consumers" is easy to
  game by counting test files, or two files inside the same feature — hence "each
  feature counts once". A module imported five times inside `features/editor/`
  still belongs to `features/editor/`.
