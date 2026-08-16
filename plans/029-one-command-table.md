# Plan 029: One command table — `defineCommand({ id, title, icon, keys, when, run })`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report —
> do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
>
> ```bash
> cd /Users/shaul/Desktop/D/platform
> git diff --stat ace313f..HEAD -- apps/web/src/keymap apps/web/src/components/command-palette apps/web/src/features/menus docs/vscode-keymap-development.md
> git status --porcelain -- apps/web/src/keymap apps/web/src/components/command-palette apps/web/src/features/menus docs/vscode-keymap-development.md
> ```
>
> **Both must print nothing.** The second command matters as much as the first:
> at `ace313f` the repository has substantial _uncommitted_ work in other trees
> (`apps/web/src/features/settings/`, `packages/contracts/`, `plans/`), and a
> commit-to-commit diff would not see it. In-scope paths were clean when this
> plan was written.
>
> If any in-scope file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/018-stale-closure-commands.md` (must be DONE first — see
  Step 0). **At the time this plan was written 018 was still `TODO` in
  `plans/README.md` and its bug was still present in the code.** Step 0 gives a
  decidable check; if it still says 018 has not landed, stop there.
- **Category**: architecture
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

One command's identity is currently written down in **six** hand-maintained
tables across two directory trees. To add or rename a single command you edit
four to six files in lockstep, and nothing checks the copies against each other.

This is measurably the highest-churn cluster in the repository. Re-derived from
`git log` at `ace313f` over `apps/web/src/keymap/`:

- 63 commits touch `apps/web/src/keymap/`
- 60 of them touch at least one of `commands.ts` / `command-registry.ts` /
  `default-bindings.ts` / `types.ts`
- **33 touch two or more of those four**
- **11 touch all four**

The drift the split produces is already real and already shipped:

1. **13 commands have no title anywhere.** `workspace.newSession`,
   `workspace.nextSession`, `workspace.previousSession`,
   `workspace.toggleSessionRail` and the nine `workspace.jumpToSession{1..9}`
   ids ship a keybinding and a handler but no registry spec. `active-bindings.ts`
   has a comment conceding it (quoted below).
2. **Two stale-closure toggle bugs** (`toggleWallpaper`, `toggleDiffViewMode`)
   were possible because a command's inputs are assembled by hand in a 30-field
   context literal a long way from the command that reads them. That is plan
   018, the tactical fix; this is the structural one.

What improves: a command becomes **one object in one array**. The union type,
the palette registry, the default binding table, the palette gating sets, the
icon map and the dispatch map all become _projections_ of that array.
`typeof` derives what was hand-maintained. Adding a command is one edit.

**The verification story is the spine of this plan.**
`apps/web/src/keymap/tests/keymap.test.ts` is 805 lines that already assert every
projection from the outside; if the table is right it passes unchanged. Step 1
adds a byte-exact JSON snapshot of the derived binding table, re-compared at the
end, so "behaviour preserved" is a `diff` result, not a judgement call.

This closes **theme T1** from `plans/README.md` ("Parallel hand-maintained
representations of one truth… a second representation must be _derived_, never
_maintained_"). It unblocks plan 042 (the keybindings editor needs titles for
every bindable command — which is exactly what the 13 spec-less commands lack)
and direction D3 (command-palette provider registry).

## Current state

### The six tables

| #   | File                                                               | What it holds                                                                                                                                                                 | Line    |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | `apps/web/src/keymap/types.ts`                                     | `WorkspaceCommandId` — a hand-written union of **44 string literals** plus the `SessionJumpCommandId` template type. Must be edited before a command can exist anywhere else. | 23      |
| 2   | `apps/web/src/keymap/command-registry.ts`                          | `workspaceCommandSpecs` (40 entries) + `editorCommandSpecs` (80 entries): title / description / category / vscodeCommandIds, keyed by the same ids.                           | 17, 198 |
| 3   | `apps/web/src/keymap/commands.ts`                                  | `workspaceCommandHandlers` — a third table keyed by the same ids. The module imports from six features at lines 3–53.                                                         | 219     |
| 4   | `apps/web/src/keymap/default-bindings.ts`                          | `defaultBindingSpecs` — 84 commands' keys plus 10 no-op reservations.                                                                                                         | 126     |
| 5   | `apps/web/src/components/command-palette/command-palette-data.ts`  | Four `ReadonlySet<PlatformCommandId>` policy tables, in a UI folder, read back out by `features/menus/utils/resolve.ts:4`.                                                    | 5       |
| 6   | `apps/web/src/components/command-palette/command-palette-icon.tsx` | `COMMAND_ICONS` — 60 command ids → phosphor icons, also under `components/`.                                                                                                  | 50      |

### Measured facts (verified at `ace313f` — do not re-derive, but do re-check if the drift check shows changes)

- `WorkspaceCommandId` has 44 literal members + the `SessionJumpCommandId`
  template = **53 concrete workspace command ids**.
- `workspaceCommandSpecs` covers **40** of them. The 13 without a spec are the
  four named session commands and the nine jump ids.
- Every one of the 53 has a handler (44 written out, 9 spread in from
  `sessionJumpHandlers()`).
- `editorCommandSpecs` has **80** entries; `platformCommandSpecs` has **120**.
- `defaultBindingSpecs` produces **105 bindings on linux, 122 on mac, 103 on
  windows**.
- `commandKeyBindings(defaultPlatformKeyBindings('linux'), {}, 'linux')` returns
  **90 rows**.
- Exactly **13** command-carrying bindings lack `meta` on every platform — the
  session commands. (9 no-op bindings on linux/windows, 10 on mac, also lack it,
  correctly: they have no command.)
- `COMMAND_ICONS` has **60** entries.
- `argsSchema`, `commandFamily` and `commandKind` on `CommandSpec` are **written
  but never read** anywhere in the repo (`rg -n "argsSchema|commandFamily|commandKind"`
  returns only their declarations and assignments).
- `aliases` is **read** (`command-palette-utils.ts:267,460`) but never set on any
  platform command. Keep the field; do not delete the read path.
- `commandPaletteItems(platformCommandSpecs, defaultPlatformKeyBindings('linux'))`
  returns **116** rows (120 specs minus the 4 hidden). This number must not change
  — see Test plan #4.

### ⚠️ Baseline: the repo is NOT green at `ace313f`, and three of these facts change what you run

Measured at `ace313f`, in-scope paths clean but other trees dirty:

| Gate                                                                                               | State at `ace313f`                                                                                                                       | Consequence for you                                                     |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `cd apps/web && bun run typecheck`                                                                 | **exit 0**                                                                                                                               | usable as an absolute gate                                              |
| `cd apps/web && bun run lint`                                                                      | **exit 0** (warnings only)                                                                                                               | usable as an absolute gate                                              |
| `cd apps/web && bun run format:check`                                                              | **exit 1** — `src/features/settings/hooks/use-setting-inspection.ts` is unformatted, pre-existing uncommitted WIP unrelated to this plan | `bun run verify` at the root **cannot** exit 0. Do not "fix" that file. |
| `cd apps/web && bun --bun vitest run src/keymap src/components/command-palette src/features/menus` | all pass (keymap alone: 3 files, 59 tests)                                                                                               | this is your real parity gate                                           |

Two rules follow, and they override the generic advice elsewhere in this file:

1. **Never run `bun run format` (in `apps/web` or at the root).** `oxfmt --write .`
   rewrites every file under the workspace, including the unrelated dirty WIP,
   which silently contaminates your diff. Format only the files you touched, by
   explicit path — Step 11 gives the exact command.
2. **`bun run verify` is a baseline comparison, not a pass/fail.** Capture its
   output at Step 0 and require _no new failures_, not exit 0.

### Excerpts

`apps/web/src/keymap/types.ts:13-25` and `:66-72`:

```ts
export const SESSION_JUMP_POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

export type SessionJumpPosition = (typeof SESSION_JUMP_POSITIONS)[number]

export type SessionJumpCommandId = `workspace.jumpToSession${SessionJumpPosition}`

export function sessionJumpCommandId(position: SessionJumpPosition): SessionJumpCommandId {
  return `workspace.jumpToSession${position}`
}

export type WorkspaceCommandId = SessionJumpCommandId | 'workspace.newSession'
```

```ts
  | 'workspace.setDarkTheme'
  | 'workspace.setSystemTheme'
  | 'workspace.toggleWallpaper'

export type EditorPlatformCommandId = `editor.${EditorCommandId}`

export type PlatformCommandId = WorkspaceCommandId | EditorPlatformCommandId
```

`apps/web/src/keymap/command-registry.ts:5-23`:

```ts
export type CommandSpec<Id extends PlatformCommandId = PlatformCommandId> = {
  readonly aliases?: readonly string[]
  readonly commandFamily?: 'appearance' | 'editor' | 'workspace'
  readonly commandKind?: 'editor' | 'workspace'
  readonly id: Id
  readonly title: string
  readonly category: string
  readonly description?: string
  readonly vscodeCommandIds?: readonly string[]
  readonly argsSchema?: unknown
}

const workspaceCommandSpecs = [
  workspaceCommand(
    'workspace.showQuickAccess',
    'Quick Open',
    'Search workspace files and quick actions.',
    ['workbench.action.quickOpen'],
  ),
```

`apps/web/src/keymap/commands.ts:219-233`:

```ts
const workspaceCommandHandlers: Partial<Record<WorkspaceCommandId, WorkspaceCommandHandler>> = {
  ...sessionJumpHandlers(),
  'workspace.newSession': (context) => runSessionCommand(context, startScopedSessionDraft),
  'workspace.nextSession': sessionTraversalHandler('next'),
  'workspace.previousSession': sessionTraversalHandler('previous'),
  'workspace.toggleSessionRail': (context) =>
    runSessionCommand(context, () => {
      context.setChatModePanels(
        setChatModeSessionRailOpen(context.chatModePanels, !context.chatModePanels.sessionRailOpen),
      )

      return true
    }),
  'workspace.closeCurrentTab': ({ activeTabId, requestCloseTab }) =>
    closeSelectedTab(activeTabId, requestCloseTab),
```

Note the type is `Partial<Record<…>>`: **a workspace command with no handler
compiles today.** The new table makes `run` required, which is a real new
guarantee.

`apps/web/src/components/command-palette/command-palette-data.ts:5-41` — the four
policy sets, verbatim:

```ts
export const paletteModeCommands: ReadonlySet<PlatformCommandId> = new Set([
  'workspace.gotoSymbol',
  'workspace.quickOpenView',
  'workspace.selectColorMode',
  'workspace.selectColorTheme',
  'workspace.showAllEditors',
  'workspace.showCommandPalette',
  'workspace.showQuickAccess',
])

export const selectedFileCommands: ReadonlySet<PlatformCommandId> = new Set([
  'workspace.closeCurrentTab',
  'workspace.compareWithSaved',
  'workspace.openFileAtHead',
  'workspace.gotoSymbol',
  'workspace.revertFile',
  'workspace.saveFile',
])

export const hiddenCommandPaletteCommands: ReadonlySet<PlatformCommandId> = new Set([
  'workspace.setDarkTheme',
  'workspace.setLightTheme',
  'workspace.setSystemTheme',
  'workspace.showCommandPalette',
])

export const workspaceOptionalCommands: ReadonlySet<PlatformCommandId> = new Set([
  'workspace.openFilePicker',
  'workspace.selectColorMode',
  'workspace.selectColorTheme',
  'workspace.setDarkTheme',
  'workspace.setLightTheme',
  'workspace.setSystemTheme',
  'workspace.showCommandPalette',
  'workspace.showSettings',
  'workspace.toggleWallpaper',
])
```

`apps/web/src/components/command-palette/command-palette-utils.ts:288-300` — the
gate those sets feed:

```ts
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
```

`apps/web/src/keymap/active-bindings.ts:291-306` — the drift comment this plan
retires:

```ts
/**
 * The registry and the default table each know commands the other does not —
 * the session commands ship a binding without a palette entry — so a command is
 * real if either one names it.
 */
function knownCommands(defaults: readonly PlatformKeyBinding[]): ReadonlySet<string> {
  const known = new Set<string>(platformCommandSpecs.map((spec) => spec.id))

  for (const binding of defaults) {
    if (!binding.command) continue

    known.add(binding.command)
  }

  return known
}
```

`apps/web/src/keymap/default-bindings.ts:112-124` and `:147-151`:

```ts
function noOpBinding(
  hotkey: RegisterableHotkey,
  options: Omit<DefaultBindingSpec, 'command' | 'hotkey'>,
): DefaultBindingSpec {
  return {
    command: null,
    hotkey,
    pane: 'any',
    preventDefault: true,
    stopPropagation: true,
    ...options,
  }
}
```

```ts
  // TODO(electron): Bind these desktop/window-level VS Code defaults once
  // Platform can own shortcuts outside the browser sandbox.
  noOpBinding('Control+Tab', {
    vscodeCommandId: 'workbench.action.quickOpenPreviousEditor',
  }),
```

### ⚠️ The ten no-op chords are DELIBERATE. Do not "implement" them.

`default-bindings.ts` reserves exactly **ten** browser-hostile chords with
`command: null` — they swallow the key so the browser cannot act on it, and
dispatch nothing:

```
Control+Tab   Control+Q   Mod+Alt+Tab (mac only)   Mod+Shift+T   Mod+J
Mod+1         Mod+2       Mod+3                    Mod+W         F12 (pane: 'editor')
```

The rule is stated at `default-bindings.ts:147-148` (`TODO(electron)`), and two
tests lock it in:

- `apps/web/src/keymap/tests/keymap.test.ts:526` — `'reserves browser-hostile
desktop defaults as no-ops'`
- `apps/web/src/keymap/tests/keymap.test.ts:584` — `'does not bind browser tab
switching keys to pane focus commands'`

An earlier audit raised "`noOpBinding` swallows nine VS Code default keys" as a
bug; adversarial verification killed it as the only finding of 58 rejected
outright. **Binding `Mod+1` to `workspace.focusFirstEditorGroup` — or any of the
other nine — would fail both tests. That is by design.** Carry all ten across
unchanged, with the `TODO(electron)` comment.

### Conventions that apply (from `/Users/shaul/Desktop/D/platform/AGENTS.md` — the executor has not read this file)

> - Group by feature, then by kind:
>   - `components/` — React render components only (`.tsx`)
>   - `hooks/` — `use-*` hooks
>   - `utils/` — pure, stateless, non-React code only. No stores, no
>     module-level mutable state, no subscriptions, nothing that imports React
>   - `tests/` — feature tests
> - Do not create empty folders.
> - Import exact files through `@/`. Do not add barrel `index.ts` files.
> - Barrel files are allowed only at package entry points such as
>   `packages/*/src/index.ts` that back the package's `"."` export. Do not add
>   feature, folder, or utility barrels.

> - Keep nesting depth to 3 or less.
> - Use guard clauses and early returns. Keep the happy path shallow.
> - In loops, use inverted conditions with `continue` instead of wrapping the
>   body in `if`.
> - Do not use `else` after an early return.
> - Never use nested ternaries. Split the logic into `if` statements or a named
>   helper.

> - One component per file. Do not export multiple components from one component
>   file.
> - Avoid manual React memoization. Do not add `memo`, `useMemo`, or
>   `useCallback` for ordinary render values or callbacks. Use them only for
>   measured performance issues, required stable identity, or correctness. Add a
>   short reason when you do.

> ## Greenfield, No Backward Compatibility
>
> - This project is greenfield and not live: no releases, no external users, no
>   data anyone needs migrated.
> - No backward compatibility shims, no legacy aliases, no deprecation windows.
>   Update every call site in the same pass.

> - Do not repeat the folder name in file or symbol names.
> - When removing a redundant prefix, rename the file, exports, and all call
>   sites in one pass.
> - Delete obsolete tests instead of preserving old behavior.
> - Remove duplicate code aggressively.

> - Never throw `new Error`. Create errors with `createError` from `evlog` — in
>   practice through the feature's `structured-errors.ts` wrapper.
> - Logging is wide-event style (evlog). Always prefer wide logs: enrich the one
>   event per operation/request with more fields instead of emitting extra narrow
>   log lines.

> - A dev server is always running. Never spin up your own server to test or
>   verify changes — reuse the running one.

> - Import `{ test, expect }` from `apps/web/test/fixtures.ts`, not from
>   `vitest`, for app tests.
> - Do not `mock.module` or `vi.mock` our server, client, or feature modules.
> - Shared test code lives under `test/`.

Two more facts you need:

- Path alias: `@/*` → `apps/web/src/*` (declared in both `apps/web/tsconfig.json`
  and `apps/web/vite.config.ts`).
- A precedent for a non-component module importing phosphor icon _components_
  already exists: `apps/web/src/features/workbench/utils/titlebar-menu.ts:1-14`
  imports `ChatCircleIcon`, `MoonIcon`, `SunIcon` etc. from
  `@phosphor-icons/react`. Putting `icon:` on a command table entry is
  consistent with that.

## Commands you will need

| Purpose                      | Command                                                              | Expected on success                                                        |
| ---------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Web typecheck                | `cd apps/web && bun run typecheck`                                   | exit 0                                                                     |
| Web lint                     | `cd apps/web && bun run lint`                                        | exit 0 (warnings are allowed; errors are not)                              |
| Format the files you touched | `cd apps/web && bunx oxfmt --write <paths…>`                         | exit 0, rewrites in place. **Never `bun run format`** — see Baseline above |
| Keymap tests only            | `cd apps/web && bun --bun vitest run src/keymap`                     | 3 files, 59 tests pass (before your change)                                |
| Palette tests only           | `cd apps/web && bun --bun vitest run src/components/command-palette` | all pass                                                                   |
| Menus tests only             | `cd apps/web && bun --bun vitest run src/features/menus`             | all pass                                                                   |
| Web tests (node + dom)       | `cd apps/web && bun run test`                                        | all pass                                                                   |
| Full verify                  | `bun run verify` (repo root)                                         | **compare against the Step 0 baseline** — it does not exit 0 at `ace313f`  |
| Dev server                   | **already running at `http://localhost:5173`** — never start one     | —                                                                          |

`bun run verify` at the root is
`bun run typecheck && bun run lint && bun run format:check && bun run test`, run
across every workspace. `format:check` already fails on unrelated WIP (Baseline
above), so `verify` short-circuits before its test phase. That is why Step 11
runs the four workspace-level gates individually instead.

A note on the vitest invocations: `bun --bun vitest run <path>` is correct here
even though `apps/web`'s own `test` script passes `--project node --project dom`.
The third project (`browser`) only includes `src/**/*.browser.tsx`, and none of
the paths in this plan match it, so it contributes no work. Verified: the keymap
run above completes in ~9s.

## Scope

**In scope** (the only files you may modify or create):

Created:

- `apps/web/src/keymap/define-command.ts`
- `apps/web/src/keymap/workspace-commands.ts`
- `apps/web/src/keymap/editor-commands.ts`
- `apps/web/src/keymap/table.ts`
- `apps/web/src/keymap/tests/command-table.test.ts`

Rewritten (each becomes a projection of the table):

- `apps/web/src/keymap/types.ts`
- `apps/web/src/keymap/command-registry.ts`
- `apps/web/src/keymap/default-bindings.ts`
- `apps/web/src/keymap/commands.ts`
- `apps/web/src/keymap/active-bindings.ts` (one function + its comment only)
- `apps/web/src/components/command-palette/command-palette-data.ts`
- `apps/web/src/components/command-palette/command-palette-icon.tsx`
- `apps/web/src/components/command-palette/command-palette-utils.ts`
  (`commandDisabledReason` only)

Doc:

- `docs/vscode-keymap-development.md` (one bullet — Step 11)

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/keymap/tests/keymap.test.ts` — **the 805-line gate.** It must
  pass byte-for-byte unchanged. If you feel the urge to edit it, the table is
  wrong. See STOP conditions.
- `apps/web/src/keymap/tests/session-commands.test.ts` and
  `use-app-keymap.test.tsx` — likewise unchanged. `session-commands.test.ts:18`
  imports `SESSION_JUMP_POSITIONS, sessionJumpCommandId` from `'../types'`; the
  design below deliberately leaves those two exports in `types.ts` so this
  import keeps working.
- All existing tests under `apps/web/src/components/command-palette/tests/` —
  unchanged. `command-palette-utils.test.ts:35` and `:89` assert exact command
  _ranking order_, which depends on `platformCommandSpecs` order. Preserving
  that order is a hard requirement (Step 3).
- The ten no-op chords' behaviour. Reserve them, do not implement them.
- `apps/web/src/keymap/editor-keymap.ts` and `use-app-keymap.ts` — the
  editor-bridge and the document listener. Neither reads the tables; leave them.
- `apps/web/src/keymap/active-bindings.ts` beyond `knownCommands()`. The
  collision/shadowing resolution is intricate, heavily tested, and orthogonal.
- `packages/contracts/src/settings/` — `keybindingOverridesSchema` is keyed by
  free-form strings on purpose; the client validates against known commands.
- `apps/web/src/features/menus/**` — `resolve.ts` and `shortcut.ts` consume the
  projections through their existing exports, which are preserved. No change
  needed; if one becomes necessary, that is a STOP condition.
- The keybindings **editor** — that is plan 042.
- `viewPaletteItems` / `colorModePaletteItems` in `command-palette-data.ts`.
  They duplicate command titles and descriptions in slightly different words
  (e.g. `'Sessions, chat, and tools in the chat layout.'` vs the registry's
  `'Show sessions, chat, and tools in the chat layout.'`). Collapsing them is a
  seventh table and a _behaviour_ change to the Views list. Deliberately
  deferred; note it, do not do it.
- `apps/web/src/components/command-palette/view-groups.tsx:5,22` — it imports
  `workspaceOptionalCommands` from `command-palette-data.ts` and calls `.has()`
  on it. That is exactly why Step 9 _derives_ that export instead of deleting it:
  keep the name and the `ReadonlySet<PlatformCommandId>` shape, and this file
  needs no edit. If you find yourself editing it, you deleted an export you were
  supposed to keep.
- `apps/web/src/components/command-palette/content.tsx:4,105` — imports
  `platformCommandSpecs` and feeds it to `commandPaletteItems`. Leave it on the
  spec projection; do not "improve" it to consume `platformCommands` directly.
  Same for `apps/web/src/features/menus/utils/resolve.ts:5,144`
  (`platformCommandSpec`).
- `apps/web/src/features/settings/components/widgets/chord-recorder.tsx:4` — a
  runtime import of `@/keymap/active-bindings`, which after this plan transitively
  pulls the whole command table (and therefore six feature modules) into the
  settings widget bundle. That is a real consequence and it is accepted here; do
  not restructure anything to avoid it, and do not touch this file. Also: this
  file is _not_ in the drift-check paths and belongs to another tree's dirty WIP.
- `apps/web/src/features/settings/hooks/use-setting-inspection.ts` and every other
  uncommitted file listed by `git status --porcelain` at Step 0. They are someone
  else's in-flight work. Do not format them, do not fix their lint warnings, do
  not stage them.
- Adding, removing or renaming any command. This plan moves 133 command
  definitions; it invents none. The only new _data_ is a title + description for
  the 13 session commands.
- Splitting the table per feature (`features/chat-mode/commands.ts`, etc.).
  Deliberately deferred — see Maintenance notes for why.

## Git workflow

Per the operator rule in `plans/README.md`: **all work happens on `main`** — no
new branches, worktrees, commits, pushes, or PRs unless the operator explicitly
asks.

Conventional commits, lowercase descriptive subject. Real examples from
`git log`:

```
refactor(orchestration): the server prepares a session's worktree (M-C)
fix(address): bound the URL, and stop escaping slashes in ?tabs=
```

Suggested subject for this work:

```
refactor(keymap): one command table, and every other table derives from it
```

Commit per numbered step is fine and preferable — the codebase typechecks at the
end of every step below.

## The target design

### Layering (acyclic — read this before writing any code)

```
define-command.ts          types + defineCommand/defineEditorCommand. Imports
   │                       only: FocusArea (type), Icon (type),
   │                       RegisterableHotkey (type), EditorCommandId (type),
   │                       and the feature types WorkspaceCommandContext needs.
   ├──────────────┐
   ▼              ▼
workspace-        editor-
commands.ts       commands.ts
   └──────┬───────┘
          ▼
       table.ts             platformCommands + every lookup/projection helper
          ▼
       types.ts             binding + event types; `import type` only from
          │                 workspace-commands.ts for WorkspaceCommandId
          ▼
command-registry.ts, default-bindings.ts, commands.ts, active-bindings.ts,
command-palette-*, features/menus/*
```

**The one deliberate near-cycle**: `types.ts` does
`import type { WorkspaceCommandId } from './workspace-commands'`, while
`workspace-commands.ts` does
`import { SESSION_JUMP_POSITIONS, sessionJumpCommandId } from './types'`. The
first is `import type` and is erased at compile time, so there is no runtime
cycle. This is intentional: it keeps `SESSION_JUMP_POSITIONS` where
`session-commands.test.ts` already imports it from, at zero test churn. Add a
one-line comment on the `types.ts` import saying so.

### `PlatformCommandId` — what is derived and what is not

```ts
// types.ts, after
import type { WorkspaceCommandId } from './workspace-commands'

export type EditorPlatformCommandId = `editor.${EditorCommandId}`
export type PlatformCommandId = WorkspaceCommandId | EditorPlatformCommandId
export type { WorkspaceCommandId }
```

- `WorkspaceCommandId` becomes `(typeof workspaceCommands)[number]['id']` — the
  hand-maintained 44-member union **disappears**. This is the defect.
- `EditorPlatformCommandId` stays `` `editor.${EditorCommandId}` ``. It is
  _already_ derived — from `@singapor/core`, which is the correct source of
  truth for editor command ids — and it is deliberately **wider** than the 80
  editor commands in the table. Narrowing it would be a behaviour change with
  no upside. Do not touch it.

### `define-command.ts`

```ts
import type { EditorCommandId } from '@singapor/core'
import type { Icon } from '@phosphor-icons/react'
import type { RegisterableHotkey } from '@tanstack/react-hotkeys'

import type { FocusArea } from '@/components/workspace/focus/providers/focus-state'
// …plus the type-only imports WorkspaceCommandContext needs — move them
// verbatim from the top of commands.ts.

export type CommandPlatformName = 'linux' | 'mac' | 'windows'

/**
 * What has to be true before a command can run. `commandDisabledReason` is a
 * lookup on this and nothing else — it replaces the `selectedFileCommands` and
 * `workspaceOptionalCommands` sets.
 */
export type CommandRequirement = 'file' | 'nothing' | 'workspace'

/** One default key for a command. `vscodeCommandId` is per key, not per command. */
export type CommandKeyDefault = {
  readonly hotkey: RegisterableHotkey
  readonly pane?: FocusArea | 'any'
  readonly platforms?: readonly CommandPlatformName[]
  readonly preventDefault?: boolean
  readonly stopPropagation?: boolean
  readonly vscodeCommandId?: string
}

/** Moved verbatim from commands.ts:55-82. */
export type WorkspaceCommandContext = {
  /* …30 fields, unchanged… */
}

type CommandBase<Id extends string> = {
  readonly id: Id
  readonly title: string
  readonly description?: string
  readonly category: string
  /** Never set today; read by the palette's keyword builder. Kept as a hook. */
  readonly aliases?: readonly string[]
  readonly vscodeCommandIds?: readonly string[]
  readonly icon?: Icon
  readonly keys?: readonly CommandKeyDefault[]
  readonly requires: CommandRequirement
  /** Running it only switches palette mode, so the palette stays open. */
  readonly keepsPaletteOpen?: boolean
  /** Not offered in the `>` command list. */
  readonly hiddenInPalette?: boolean
}

export type WorkspaceCommand<Id extends string = string> = CommandBase<Id> & {
  readonly kind: 'workspace'
  readonly run: (context: WorkspaceCommandContext) => boolean | void
}

export type EditorCommand<Id extends string = string> = CommandBase<Id> & {
  readonly kind: 'editor'
}

export type PlatformCommand = EditorCommand | WorkspaceCommand

export function defineCommand<const Id extends `workspace.${string}`>(
  command: Omit<WorkspaceCommand<Id>, 'kind'>,
): WorkspaceCommand<Id> {
  return { ...command, kind: 'workspace' }
}

export function defineEditorCommand<const Id extends EditorCommandId>(
  command: Omit<EditorCommand<`editor.${Id}`>, 'category' | 'id' | 'kind' | 'requires'> & {
    readonly id: Id
  },
): EditorCommand<`editor.${Id}`> {
  return {
    ...command,
    category: 'Editor',
    id: `editor.${command.id}`,
    kind: 'editor',
    requires: 'file',
  }
}
```

Notes the executor must honour:

- `run` is **required** on workspace commands. That is the point: today
  `workspaceCommandHandlers` is `Partial<Record<…>>` and a missing handler
  compiles.
- `const Id` type parameters are what keep the id literal types alive so
  `(typeof workspaceCommands)[number]['id']` is a union of literals and not
  `string`. If your TypeScript rejects `const` type parameters, drop the `const`
  and verify the derived union is still literal (Step 4's check catches it).
- `defineEditorCommand` takes the **bare** `EditorCommandId` and prefixes it, so
  editor ids stay constrained to what `@singapor/core` actually implements —
  exactly what `editorCommand()` does today at `command-registry.ts:394-407`.
- `argsSchema`, `commandFamily` and `commandKind` are **not** carried over. They
  are written but never read (verified). Deleting them is house style.

### `workspace-commands.ts` — the 53 workspace entries

Order matters. Build it as:

```ts
export const workspaceCommands = [
  ...workspaceCommandsInRegistryOrder, // the 40 that have specs today, IN THE
  // ORDER command-registry.ts lists them
  ...sessionCommands(), // the 13 spec-less ones, appended LAST
]
```

**Why registry order, and why sessions last**: `command-palette-utils.ts:186`
settles fuzzy-match ties by _registry position_
(`compareRankedCommandItems` → `left.order`), and
`command-palette-utils.test.ts:35` and `:89` assert exact result orders
(`['workspace.selectColorMode', 'workspace.selectColorTheme']`). The 13 session
commands are `hiddenInPalette`, so `commandPaletteItems` filters them out
_before_ indexing — appending them at the end cannot shift any surviving index.
Inserting them anywhere else in the array is still safe for the same reason, but
appending makes the `spec-order.json` diff trivially reviewable.

Five worked examples covering every shape you will meet:

```ts
// 1. Plain workspace command, no keys, no icon.
;(defineCommand({
  category: 'Workspace',
  description: 'Move keyboard focus to the Git panel.',
  id: 'workspace.focusGit',
  requires: 'workspace',
  run: ({ setFocusArea, setWorkbenchPanels, workbenchPanels }) => {
    setWorkbenchPanels(setWorkbenchSidebarTab(workbenchPanels, 'git'))
    setFocusArea('git')
    return true
  },
}),
  // 2. Two default keys, an icon, palette-mode, workspace-optional, hidden.
  //    Key order is the order default-bindings.ts lists them: Mod+Shift+P, then F1.
  defineCommand({
    category: 'Workspace',
    description: 'Search and run workspace or editor commands.',
    hiddenInPalette: true,
    icon: CommandIcon,
    id: 'workspace.showCommandPalette',
    keepsPaletteOpen: true,
    keys: [
      {
        hotkey: 'Mod+Shift+P',
        pane: 'any',
        preventDefault: true,
        stopPropagation: true,
        vscodeCommandId: 'workbench.action.showCommands',
      },
      {
        hotkey: 'F1',
        pane: 'any',
        preventDefault: true,
        stopPropagation: true,
        vscodeCommandId: 'workbench.action.showCommands',
      },
    ],
    requires: 'nothing',
    run: ({ showCommandPalette }) => {
      showCommandPalette('>')
      return true
    },
    title: 'Show command palette',
    vscodeCommandIds: ['workbench.action.showCommands'],
  }),
  // 3. Appearance category (no vscodeCommandIds at all — appearanceCommand() never
  //    set the field, and the projection must keep it absent).
  defineCommand({
    category: 'Appearance',
    description: 'Show or hide the background image or video.',
    icon: ImageIcon,
    id: 'workspace.toggleWallpaper',
    requires: 'nothing',
    run: ({ setWallpaperEnabled, wallpaperEnabled }) => {
      // Through the settings write path, not a store setter. The command and the
      // settings page are two front doors onto one value; if they wrote to
      // different places they would disagree the first time either was used.
      setWallpaperEnabled(!wallpaperEnabled)
      return true
    },
    title: 'Toggle wallpaper',
  }),
  // 4. File-gated command.
  defineCommand({
    category: 'Workspace',
    description: 'Save the active editor.',
    icon: FloppyDiskIcon,
    id: 'workspace.saveFile',
    keys: [
      {
        hotkey: 'Mod+S',
        pane: 'any',
        preventDefault: true,
        vscodeCommandId: 'workbench.action.files.save',
      },
    ],
    requires: 'file',
    run: ({ activeFilePath, documentStore, queryClient }) =>
      runFileLifecycle(activeFilePath, () =>
        saveSelectedEditorDocument(documentStore, queryClient, activeFilePath),
      ),
    title: 'Save',
    vscodeCommandIds: ['workbench.action.files.save'],
  }),
  // 5. The nine generated jump commands. Titles are NEW — these have none today.
  function sessionJumpCommands() {
    return SESSION_JUMP_POSITIONS.map((position) =>
      defineCommand({
        category: 'Workspace',
        description: `Put session ${position} in the rail on the stage.`,
        hiddenInPalette: true,
        id: sessionJumpCommandId(position),
        keys: [{ hotkey: `Mod+Alt+${position}`, pane: 'any', preventDefault: true }],
        requires: 'workspace',
        run: (context) => runSessionCommand(context, () => jumpToSession(position)),
        title: `Go to session ${position}`,
      }),
    )
  })
```

The helper functions the handlers use — `runSessionCommand`,
`sessionTraversalHandler`, `closeSelectedTab`, `runFileLifecycle`,
`revertSelectedEditorDocument`, `reportCommandError` — move here verbatim from
`commands.ts:195-217` and `:453-483`.

**Which of the `commands.ts:1-53` imports move with them.** Do not guess: the
handlers and helpers reference exactly these value imports, so these move to
`workspace-commands.ts`.

```
compareSavedDocumentId          @/features/editor/compare-saved-document
shareableAddress                @/features/address/state/storage
openEditorPathInWorkbenchPanels @/features/workbench/utils/workbench-panels
jumpToSession, selectAdjacentSession, startScopedSessionDraft
                                @/features/chat-mode/state/session-commands
setChatModeSessionRailOpen      @/features/chat-mode/utils/panels
fileBackedEditorPath, saveAllEditorDocuments, saveSelectedEditorDocument
                                @/features/editor/editor-save
nextEditorDiffViewMode          @/features/editor/utils/diff-view-mode
useSessionIsolationStore        @/features/chat-mode/state/session-isolation-store
setWorkbenchBottomTab, setWorkbenchSidebarTab
                                @/features/workbench/utils/workbench-panels
reportError, toClientError      @/lib/client-error-taxonomy
setFileSnapshotQueryData        @/lib/file-snapshot-query-cache
toggledWorkspaceUiMode          @/lib/ui-mode
fetchFile                       @/lib/file-server
SESSION_JUMP_POSITIONS, sessionJumpCommandId   ./types
```

Everything else on `commands.ts:1-53` stays: `useCallback`, `useFocus`,
`useTheme`, `useEditorCommands`, `useOpenFileAtRef`, `useEditorDocumentStoreApi`,
`useEditorWorkspaceStoreApi`, `useSettings`, `useSettingsActions`,
`useQueryClient`, `DEFAULT_SETTING_VALUES`, `log`,
`activeEditorPathForWorkbenchPanels`, `activeEditorTabForWorkbenchPanels`,
`editorCommandIdFromPlatform`, and the type-only imports the hook signature and
`PlatformCommandDispatch` need. The type-only imports that
`WorkspaceCommandContext` needs move to `define-command.ts` (Step 2), not here.

The mechanical check that you split it right is `bun run lint`: oxlint reports
unused imports, so a symbol left behind in `commands.ts` shows up as a warning
there rather than as a silent leftover.

**Carry every existing comment across, attached to the entry it explains.** In
particular `commands.ts:195-198` (why session traversal is chat-mode only),
`:260-272` (why `copyAddress` goes through `shareableAddress`), `:273-274`
(history is the browser's), `:283-285` and `:292-294` (chat vs terminal reveal),
`:306-308` (isolated session arms the next send), `:389-391` (settings work with
no folder), `:416-418` and `:436-439` (the two settings write paths), and
`default-bindings.ts:194-195` (why session keys sit under `Mod+Alt`),
`:327-330` (why the app owns `Mod+[` / `Mod+]`), `:333-334` (why `Mod+\`),
`:337-338` (why Duplicate Selection is palette-only), `:342` (VS Code subword
motion), `:350` (Shift+Alt+F canonicalisation) and `:408-410` (the Tab TODO).
These comments are the most valuable thing in these files.

### The three per-command policy fields — exact assignments

`requires: 'nothing'` — the nine ids currently in `workspaceOptionalCommands`:
`openFilePicker`, `selectColorMode`, `selectColorTheme`, `setDarkTheme`,
`setLightTheme`, `setSystemTheme`, `showCommandPalette`, `showSettings`,
`toggleWallpaper`.

`requires: 'file'` — the six ids currently in `selectedFileCommands`:
`closeCurrentTab`, `compareWithSaved`, `openFileAtHead`, `gotoSymbol`,
`revertFile`, `saveFile`. Plus **every** editor command (set automatically by
`defineEditorCommand`).

`requires: 'workspace'` — every other workspace command, including all 13
session commands.

`keepsPaletteOpen: true` — the seven ids currently in `paletteModeCommands`:
`gotoSymbol`, `quickOpenView`, `selectColorMode`, `selectColorTheme`,
`showAllEditors`, `showCommandPalette`, `showQuickAccess`.

`hiddenInPalette: true` — the four ids currently in
`hiddenCommandPaletteCommands` (`setDarkTheme`, `setLightTheme`,
`setSystemTheme`, `showCommandPalette`) **plus all 13 session commands**.

> **Why the session commands are hidden.** Giving them titles is the win; giving
> them palette rows is a product change this plan does not make. Their handlers
> return `false` outside chat mode (`runSessionCommand`), and `requires` has no
> "chat mode" state to model, so a visible row would look enabled and do nothing
> in the workbench — and nine near-identical "Go to session N" rows would bury
> the list. Hiding them keeps the palette byte-identical, which is what makes
> the whole refactor verifiable. Surfacing them needs a chat-mode availability
> rule; that belongs with plan 042 / direction D3.

### `table.ts`

```ts
export const platformCommands: readonly PlatformCommand[] = [
  ...workspaceCommands,
  ...editorCommands,
]

const byId = new Map(platformCommands.map((command) => [command.id, command]))

export function platformCommand(id: PlatformCommandId): PlatformCommand | null {
  return byId.get(id) ?? null
}

export function commandIcon(id: PlatformCommandId): Icon | null { … }

// The three policy projections Step 9 re-exports from command-palette-data.ts.
// Names there must stay `paletteModeCommands` / `hiddenCommandPaletteCommands` /
// `workspaceOptionalCommands`, because view-groups.tsx and
// command-palette-utils.ts import those exact names.
export const paletteModeCommandIds: ReadonlySet<PlatformCommandId> = idsWhere((c) => c.keepsPaletteOpen === true)
export const hiddenPaletteCommandIds: ReadonlySet<PlatformCommandId> = idsWhere((c) => c.hiddenInPalette === true)
export const workspaceOptionalCommandIds: ReadonlySet<PlatformCommandId> = idsWhere((c) => c.requires === 'nothing')

/**
 * `EditorPlatformCommandId` is wider than the editor half of the table — it
 * covers every command `@singapor/core` implements, registered here or not — so
 * an unregistered `editor.*` id keeps the file gate it had when this was
 * `isEditorPlatformCommandId(command)`.
 */
export function commandRequirement(id: PlatformCommandId): CommandRequirement {
  const command = byId.get(id)
  if (command) return command.requires
  if (id.startsWith('editor.')) return 'file'

  return 'workspace'
}
```

That fallback is not decorative: `commandDisabledReason` today file-gates _any_
`editor.*` id via `isEditorPlatformCommandId`, including the ~40 core editor
commands with no spec. Dropping it is a silent behaviour change.

### `commandDisabledReason` after

```ts
export function commandDisabledReason(command: PlatformCommandId, context: CommandDisabledContext) {
  const requires = commandRequirement(command)
  if (requires === 'nothing') return null
  if (!context.hasWorkspace) return 'No workspace open.'
  if (requires === 'workspace') return null

  return fileBackedPath(context.activeFilePath) ? null : 'No file-backed surface is active.'
}
```

The two message strings must stay byte-identical — `keymap.test.ts:657,669` and
`command-palette-utils.test.ts:129,144` assert them literally.

### `default-bindings.ts` after

```ts
export function defaultPlatformKeyBindings(
  platform: PlatformName = detectPlatform(),
): readonly PlatformKeyBinding[] {
  return [
    ...platformCommands.flatMap((command) => commandBindings(command, platform)),
    ...reservedBrowserChords.flatMap((chord) => reservedBinding(chord, platform)),
  ]
}
```

`reservedBrowserChords` is a plain 10-entry array in this file — the ten no-op
chords have no command, so they cannot live in the command table. Keep
`noOpBinding`'s defaults (`command: null`, `pane: 'any'`, `preventDefault: true`,
`stopPropagation: true`, overridable by the entry) and keep the `TODO(electron)`
comment above the array.

Everything `bindingForPlatform` does today — `normalizeRegisterableHotkey`,
`commandHotkeyMeta`, `pane: spec.pane ?? 'any'`, `source: 'default'` — is
unchanged; only where the specs come from changes.

## Steps

### Step 0: Preconditions

1. Run both drift-check commands from the header. Both must print nothing.
2. Confirm plan 018 has landed. The linter answers this exactly — the stale
   closure is precisely what `react-hooks(exhaustive-deps)` reports:

   ```bash
   cd /Users/shaul/Desktop/D/platform/apps/web && bun run lint 2>&1 | grep 'src/keymap/commands.ts'
   ```

   - **If this prints a line containing `has missing dependencies` and any of
     `wallpaperEnabled` / `setWallpaperEnabled` / `diffViewMode` /
     `setDiffViewMode`, plan 018 has NOT landed. STOP and report that.** That is
     the state at `ace313f`, where the exact output was:

     ```
     src/keymap/commands.ts:151:9: warning react-hooks(exhaustive-deps): React Hook useCallback has missing dependencies: 'setWallpaperEnabled', 'wallpaperEnabled', 'setDiffViewMode', and 'diffViewMode'
     ```

   - **If it prints nothing, 018 has landed** (either by completing the dep array
     or by moving the reads inside the callback). Proceed.

   This plan preserves whatever 018 produced; it does not fix that bug, and it
   moves the very code 018 edits.

3. Record the pre-existing baseline, so you can tell your breakage from the
   repo's:

   ```bash
   mkdir -p /tmp/keymap-parity
   cd /Users/shaul/Desktop/D/platform
   git status --porcelain > /tmp/keymap-parity/baseline-status.txt
   cd /Users/shaul/Desktop/D/platform/apps/web
   # Only the file names — oxfmt also prints per-run timings, which would make a
   # raw diff noisy.
   bun run format:check 2>&1 | grep -E '^(src|scripts|test)/' | sed 's/ (.*//' | sort \
     > /tmp/keymap-parity/baseline-format.txt
   cat /tmp/keymap-parity/baseline-format.txt
   bun run test > /tmp/keymap-parity/baseline-test.txt 2>&1; echo "web test exit=$?"
   ```

   At `ace313f` `baseline-format.txt` contains exactly one line:
   `src/features/settings/hooks/use-setting-inspection.ts`. If it names any file
   under `src/keymap/` or `src/components/command-palette/`, STOP — an in-scope
   file is already unformatted and the drift check missed it. Keep
   `baseline-test.txt`; Step 11 diffs against it.

4. Confirm the gate suite is green _before_ you change anything:

   ```bash
   cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run src/keymap src/components/command-palette src/features/menus
   ```

   Expect all pass. If anything is already red, STOP — you cannot use a red
   suite as a parity gate.

**Verify**: both drift checks print nothing; the lint probe in (2) prints nothing;
`baseline-format.txt` names only the settings WIP file; the suite in (4) passes.

### Step 1: Capture the parity baseline

Write this file **outside the repository** (the repo must stay clean; a scratch
file committed by accident is worse than no scratch file):

```bash
mkdir -p /tmp/keymap-parity
cat > /tmp/keymap-parity/dump.ts <<'TS'
const stage = process.argv[2] ?? 'before'
const root = '/Users/shaul/Desktop/D/platform/apps/web/src/keymap/'

const { defaultPlatformKeyBindings } = await import(`${root}default-bindings.ts`)
const { commandKeyBindings } = await import(`${root}active-bindings.ts`)
const { platformCommandSpecs } = await import(`${root}command-registry.ts`)

// Sorted keys so a reordered object literal is not a diff. `commandFamily` and
// `commandKind` are dropped because this refactor deletes them (write-only
// fields), and an empty `vscodeCommandIds` is dropped because the projection
// omits the key instead of emitting `[]`.
const DROP = new Set(['commandFamily', 'commandKind'])
const norm = (value) => {
  if (Array.isArray(value)) return value.map(norm)
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const key of Object.keys(value).sort()) {
    if (DROP.has(key)) continue
    if (key === 'vscodeCommandIds' && Array.isArray(value[key]) && value[key].length === 0) continue
    out[key] = norm(value[key])
  }
  return out
}

const platforms = ['linux', 'mac', 'windows']
const bindings = Object.fromEntries(
  platforms.map((p) => [
    p,
    defaultPlatformKeyBindings(p)
      .map(norm)
      .toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  ]),
)
const rows = Object.fromEntries(
  platforms.map((p) => [
    p,
    commandKeyBindings(defaultPlatformKeyBindings(p), {}, p)
      .map(norm)
      .toSorted((a, b) => String(a.command).localeCompare(String(b.command))),
  ]),
)
const specs = platformCommandSpecs
  .map(norm)
  .toSorted((a, b) => String(a.id).localeCompare(String(b.id)))
const order = platformCommandSpecs.map((spec) => spec.id)

const out = `/tmp/keymap-parity/${stage}`
await Bun.write(`${out}-bindings.json`, JSON.stringify(bindings, null, 2))
await Bun.write(`${out}-rows.json`, JSON.stringify(rows, null, 2))
await Bun.write(`${out}-specs.json`, JSON.stringify(specs, null, 2))
await Bun.write(`${out}-order.json`, JSON.stringify(order, null, 2))
console.log(
  'bindings',
  platforms.map((p) => `${p}=${bindings[p].length}`).join(' '),
  '| rows linux =',
  rows.linux.length,
  '| specs =',
  specs.length,
)
TS

cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun /tmp/keymap-parity/dump.ts before
```

**Verify**: it prints exactly

```
bindings linux=105 mac=122 windows=103 | rows linux = 90 | specs = 120
```

If any number differs, the code has drifted from this plan — STOP.

(Both scripts in this step were executed against `ace313f` and produce exactly
the outputs quoted here. `dump.ts` is deliberately untyped JS in a `.ts` file; it
lives outside the repo so `tsgo` never sees it, and `bun` does not typecheck.
Do not "fix" its implicit `any`s, and do not move it into the repo.)

Also capture the source-order key extraction, which is what stops you
mis-ordering a command's multiple defaults (a real hazard:
`editor.editor.action.insertCursorAbove` has three bindings written at
`default-bindings.ts:356`, `:368` and `:380`, and they must stay in that order):

```bash
cat > /tmp/keymap-parity/keys.py <<'PY'
import re, collections
src = open('/Users/shaul/Desktop/D/platform/apps/web/src/keymap/default-bindings.ts').read()
body = src.split('const defaultBindingSpecs = [', 1)[1]
calls = []
for m in re.finditer(r'\b(workspaceBinding|editorBinding|noOpBinding)\(', body):
    start, depth, j = m.end(), 1, m.end()
    while depth:
        if body[j] == '(': depth += 1
        elif body[j] == ')': depth -= 1
        j += 1
    calls.append((m.group(1), body[start:j - 1]))
def split_args(s):
    out, depth, cur, instr = [], 0, '', None
    for ch in s:
        if instr:
            cur += ch
            if ch == instr: instr = None
            continue
        if ch in '\'"`': instr, cur = ch, cur + ch; continue
        if ch in '([{': depth += 1
        if ch in ')]}': depth -= 1
        if ch == ',' and depth == 0: out.append(cur.strip()); cur = ''; continue
        cur += ch
    if cur.strip(): out.append(cur.strip())
    return out
per, reserved = collections.OrderedDict(), []
for kind, argstr in calls:
    args = split_args(argstr)
    if kind == 'noOpBinding':
        reserved.append((args[0], ' '.join((args[1] if len(args) > 1 else '{}').split())))
        continue
    vsc, opts = None, '{}'
    for a in args[2:]:
        if a.startswith("'"): vsc = a.strip("'")
        elif a.startswith('{'): opts = ' '.join(a.split())
    per.setdefault(args[1].strip("'"), []).append((args[0], vsc, opts))
for cmd, keys in per.items():
    print(cmd)
    for k in keys: print('   ', k)
print('\nRESERVED (%d):' % len(reserved))
for r in reserved: print('   ', r)
PY

python3 /tmp/keymap-parity/keys.py > /tmp/keymap-parity/keys-by-command.txt
head -3 /tmp/keymap-parity/keys-by-command.txt
grep -c '^[a-z]' /tmp/keymap-parity/keys-by-command.txt
```

**Verify**: `keys-by-command.txt` exists, its first line is
`workspace.showCommandPalette` followed by `Mod+Shift+P` then `F1`, the file ends
with `RESERVED (10):`, and `grep -c` prints **84** (the commands with default
keys; the nine session jumps are generated by `sessionJumpBindings()` above the
array and are not in this listing — their key is `Mod+Alt+${position}`,
`pane: 'any'`, `preventDefault: true`). Note the file records the **prefixed**
command id (`editor.editor.action.goToReferences`); see Step 4 trap 0 before
copying any of these onto a `defineEditorCommand` entry.

Use this file as the source of truth when filling in each command's `keys`.

### Step 2: Add `define-command.ts`

Create `apps/web/src/keymap/define-command.ts` with the types and two factories
from "The target design". Move `WorkspaceCommandContext` here verbatim from
`commands.ts:55-82` (keep its JSDoc and field order) and export it. Nothing
imports this file yet.

**Verify**: `cd apps/web && bun run typecheck` → exit 0.

### Step 3: Add `workspace-commands.ts`

Create `apps/web/src/keymap/workspace-commands.ts`. For each of the 40 commands
in `command-registry.ts`'s `workspaceCommandSpecs`, **in that exact order**,
write one `defineCommand({…})` entry merging:

- `title`, `description`, `category`, `vscodeCommandIds` from
  `command-registry.ts` (`category: 'Workspace'` from `workspaceCommand()`,
  `category: 'Appearance'` from `appearanceCommand()`; appearance commands get
  **no** `vscodeCommandIds` key at all)
- `keys` from `/tmp/keymap-parity/keys-by-command.txt`, in listed order
- `icon` from `command-palette-icon.tsx`'s `COMMAND_ICONS` (29 of the 60 entries
  are workspace commands; commands not listed there get no `icon`)
- `requires` / `keepsPaletteOpen` / `hiddenInPalette` from the exact assignments
  above
- `run` from `commands.ts`'s `workspaceCommandHandlers`, moved verbatim

Then append the 13 session commands (four named + nine generated), all with
`hiddenInPalette: true` and `requires: 'workspace'`. New titles/descriptions —
use these, so the diff is predictable:

| id                            | title                 | description                                       |
| ----------------------------- | --------------------- | ------------------------------------------------- |
| `workspace.newSession`        | `New session`         | `Start a new chat session in the active project.` |
| `workspace.nextSession`       | `Next session`        | `Move to the next session in the rail.`           |
| `workspace.previousSession`   | `Previous session`    | `Move to the previous session in the rail.`       |
| `workspace.toggleSessionRail` | `Toggle session rail` | `Show or hide the list of sessions.`              |
| `workspace.jumpToSession{N}`  | `Go to session {N}`   | `Put session {N} in the rail on the stage.`       |

Move the handler helpers (`runSessionCommand`, `sessionTraversalHandler`,
`closeSelectedTab`, `runFileLifecycle`, `revertSelectedEditorDocument`,
`reportCommandError`) and the feature imports here. Export:

```ts
export const workspaceCommands = [ … ]
export type WorkspaceCommandId = (typeof workspaceCommands)[number]['id']
```

`sessionJumpHandlers()` and `sessionJumpBindings()` disappear — the generated
jump entries replace both.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun run typecheck
```

exit 0. Then confirm the derived id union is literal, not `string`:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun -e "
const m = await import('./src/keymap/workspace-commands.ts')
const ids = m.workspaceCommands.map((c) => c.id)
console.log('count', ids.length, 'unique', new Set(ids).size)
"
```

Expect `count 53 unique 53`.

**This same command is also the DOM-less import smoke test, and this is the
earliest point it can be run — run it here, not later.** `workspace-commands.ts`
now imports six feature modules, and the `node` vitest project (which runs
`keymap.test.ts` and `session-commands.test.ts`) has no `window`, `document` or
`localStorage`. Ground truth at `ace313f`: `commands.ts` — which imports that same
feature set plus React — imports cleanly under `bun --bun` with no DOM, so a
throw here is new breakage introduced by what you moved, not a pre-existing
condition. If it throws on a module-scope DOM access, **STOP and report which
module and which access**; the fix is to move that access out of module scope,
not to restructure the table. Discovering this at Step 8 instead would mean 133
transcribed entries built on a broken foundation.

### Step 4: Add `editor-commands.ts`

Create `apps/web/src/keymap/editor-commands.ts` with one
`defineEditorCommand({…})` per entry in `editorCommandSpecs`, **in that exact
order**, merging `title` + `vscodeCommandIds` from the registry, `keys` from
`keys-by-command.txt`, and `icon` from `COMMAND_ICONS` (31 editor entries).

Three traps:

0. **`defineEditorCommand` takes the BARE id; every source table you are copying
   from uses the PREFIXED id.** Many editor commands are themselves named
   `editor.action.*`, so their platform id carries `editor.` twice. Concretely:

   | Source table                                                                    | What it says                          | What `defineEditorCommand({ id })` takes      |
   | ------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------- |
   | `editorCommandSpecs` (`editorCommand('editor.action.goToReferences', …)`)       | `editor.action.goToReferences`        | `editor.action.goToReferences` (already bare) |
   | `keys-by-command.txt`                                                           | `editor.editor.action.goToReferences` | `editor.action.goToReferences`                |
   | `COMMAND_ICONS`                                                                 | `'editor.editor.action.blockComment'` | `editor.action.blockComment`                  |
   | `default-bindings.ts` `editorBinding(…, 'editor.editor.action.indentLines', …)` | `editor.editor.action.indentLines`    | `editor.action.indentLines`                   |
   | plain ones (`editorCommand('undo', …)`)                                         | `undo` / `editor.undo`                | `undo`                                        |

   Strip exactly one leading `editor.` when copying a key or icon across; strip
   none when copying from `editorCommandSpecs`, which already passes the bare id.
   Getting this wrong produces `editor.editor.editor.action.*`, which typecheck
   catches (`EditorCommandId` is closed) — but only after you have written all 80.
   Check the first three entries against `bun run typecheck` before writing the
   rest.

1. **Per-key `vscodeCommandId` is not the command's first alias.** Eight
   bindings deliberately differ — verified:

   | key                        | command                  | binding's `vscodeCommandId` | command's `vscodeCommandIds`                           |
   | -------------------------- | ------------------------ | --------------------------- | ------------------------------------------------------ |
   | `Alt+ArrowRight`           | `editor.cursorWordRight` | `cursorWordEndRight`        | `['cursorWordRight','cursorWordEndRight']`             |
   | `Control+ArrowRight`       | `editor.cursorWordRight` | `cursorWordEndRight`        | same                                                   |
   | `Alt+Shift+ArrowRight`     | `editor.selectWordRight` | `cursorWordEndRightSelect`  | `['cursorWordRightSelect','cursorWordEndRightSelect']` |
   | `Control+Shift+ArrowRight` | `editor.selectWordRight` | `cursorWordEndRightSelect`  | same                                                   |
   | `Control+A`                | `editor.cursorLineStart` | `cursorLineStart`           | `['cursorHome','cursorLineStart']`                     |
   | `Control+E`                | `editor.cursorLineEnd`   | `cursorLineEnd`             | `['cursorEnd','cursorLineEnd']`                        |
   | `Control+Shift+A`          | `editor.selectLineStart` | `cursorLineStartSelect`     | `['cursorHomeSelect','cursorLineStartSelect']`         |
   | `Control+Shift+E`          | `editor.selectLineEnd`   | `cursorLineEndSelect`       | `['cursorEndSelect','cursorLineEndSelect']`            |

   Do **not** derive `CommandKeyDefault.vscodeCommandId` from the command's alias
   list. `keymap.test.ts:476` asserts the alias lists and `:602` asserts binding
   ids; deriving breaks the second.

2. **Every editor key defaults to `pane: 'editor'`** (that is what
   `editorBinding()` does). Set it explicitly on each key entry, or default it
   in `defineEditorCommand` — either is fine as long as the parity dump matches.

Export `export const editorCommands = [ … ]`.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun run typecheck && bun --bun -e "
const m = await import('./src/keymap/editor-commands.ts')
const ids = m.editorCommands.map((c) => c.id)
console.log('count', ids.length, 'unique', new Set(ids).size)
console.log('double-prefixed:', ids.filter((id) => id.startsWith('editor.editor.editor.')))
"
```

Expect `count 80 unique 80` and `double-prefixed: []`. (`editor.editor.action.*`
is _correct_ and expected for the ~30 commands whose bare id is `editor.action.*`;
only a third `editor.` is the trap-0 bug.)

### Step 5: Add `table.ts` and rewire `types.ts`

Create `apps/web/src/keymap/table.ts` per the design (`platformCommands`, the
`byId` map, `platformCommand`, `commandIcon`, `commandRequirement`, and the id
sets `paletteModeCommandIds` / `hiddenPaletteCommandIds` /
`workspaceOptionalCommandIds` derived from the three policy fields).

Then rewrite `apps/web/src/keymap/types.ts`:

- **Delete** the 44-member `WorkspaceCommandId` union.
- **Keep** `SESSION_JUMP_POSITIONS`, `SessionJumpPosition`,
  `SessionJumpCommandId` and `sessionJumpCommandId` exactly where they are —
  `session-commands.test.ts:18` and `workspace-commands.ts` both import them
  from here.
- Add `import type { WorkspaceCommandId } from './workspace-commands'` with a
  one-line comment explaining that it is `import type` on purpose (erased, so no
  runtime cycle), and re-export it.
- Leave `EditorPlatformCommandId`, `PlatformCommandId`, `KeyBindingSource`,
  `PlatformKeyBinding`, `KeyBindingKeyboardEvent`, `ParsedPlatformKeyBinding`
  and `CommandKeyBinding` unchanged.

**Verify**: `cd apps/web && bun run typecheck` → exit 0. This is the step where a
typo in any of the 53 ids surfaces: every consumer of `PlatformCommandId` is now
checked against the table. If typecheck reports an `editor.*` id used somewhere
but absent from the table, **STOP and report it** — do not widen the type.

### Step 6: Project `command-registry.ts`

Replace `workspaceCommandSpecs`, `editorCommandSpecs`, `workspaceCommand()`,
`appearanceCommand()` and `editorCommand()` with:

```ts
export const platformCommandSpecs: readonly CommandSpec[] = platformCommands.map(commandSpec)
```

where `commandSpec` picks `{ aliases, category, description, id, title, vscodeCommandIds }`
and omits any key the table entry does not carry. Drop `argsSchema`,
`commandFamily` and `commandKind` from `CommandSpec` (write-only, verified).
`platformCommandSpec()` and `commandHotkeyMeta()` keep their exact signatures and
bodies.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun run typecheck && bun --bun vitest run src/keymap
```

Both green. `keymap.test.ts`'s `describe('command registry')` block (lines
402–500) is the meaningful part here.

### Step 7: Project `default-bindings.ts`

Rewrite as described. Keep `DefaultBindingSpec`-equivalent behaviour:
`specMatchesPlatform`, `normalizeRegisterableHotkey`, `commandHotkeyMeta`,
`pane ?? 'any'`, `source: 'default'`. Add `reservedBrowserChords` (the ten
entries, with the `TODO(electron)` comment above them). Delete
`workspaceBinding`, `editorBinding`, `sessionJumpBindings`, `noOpBinding` and
`defaultBindingSpecs`.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run src/keymap
cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun /tmp/keymap-parity/dump.ts after
diff /tmp/keymap-parity/before-rows.json /tmp/keymap-parity/after-rows.json && echo "ROWS IDENTICAL"
diff /tmp/keymap-parity/before-bindings.json /tmp/keymap-parity/after-bindings.json > /tmp/keymap-parity/bindings.diff; \
  grep -c '^[<>]' /tmp/keymap-parity/bindings.diff
```

Expected:

- `keymap.test.ts` fully green.
- `ROWS IDENTICAL` — `before-rows.json` and `after-rows.json` must be
  **byte-identical**. This is the artifact that pins per-command key _order_
  (`defaultKeys: ['Mod+Shift+P', 'F1']`) and the `firstKeys` selection. Any diff
  here means a command's keys are in the wrong order — fix it before moving on.
- The bindings diff contains **only added `meta` blocks on the 13 session
  bindings**, on all three platforms. Read `/tmp/keymap-parity/bindings.diff` and
  confirm every `>` line is inside a `"meta": { … }` object belonging to
  `workspace.newSession`, `nextSession`, `previousSession`, `toggleSessionRail`
  or `jumpToSession{1..9}`, and there are no `<` lines at all. Anything else is a
  STOP condition.

### Step 8: Project the dispatch map in `commands.ts`

`commands.ts` keeps only: the `usePlatformCommandDispatch` hook (exactly as plan
018 left it), `dispatchWorkspaceCommand`, `workspaceCommandIdFromPlatform` and
`noop`. `dispatchWorkspaceCommand` now looks the command up in the table:

```ts
function dispatchWorkspaceCommand(command: WorkspaceCommandId, context: WorkspaceCommandContext) {
  const entry = platformCommand(command)
  if (!entry || entry.kind !== 'workspace') return false

  const handled = entry.run(context) ?? true

  log.info({ action: 'workspace.command', area: 'command', command, handled })
  return handled
}
```

The `log.info` call is unchanged — one wide event per dispatch, per AGENTS.md's
logging rule. Do not add extra log lines.

Delete `WorkspaceCommandHandler`, `workspaceCommandHandlers`,
`sessionJumpHandlers`, `sessionTraversalHandler`, `runSessionCommand`,
`closeSelectedTab`, `runFileLifecycle`, `revertSelectedEditorDocument` and
`reportCommandError` from this file (they now live in `workspace-commands.ts`),
along with every import only they used. `WorkspaceCommandContext` is now imported
from `define-command.ts`.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun run typecheck && bun run lint && bun run test
```

`typecheck` and `lint` exit 0. `bun run test` must show **no failure that is not
already in `/tmp/keymap-parity/baseline-test.txt`** from Step 0 — the app suite
covers trees with unrelated uncommitted work, so compare, do not demand zero.

`lint` matters most here: `.oxlintrc.json` runs the React Compiler plugin with
`preserve-manual-memoization`, `immutability`, `purity` and `globals` at `error`,
and this step edits a hook. Note that oxlint exits 0 on warnings — read the
output, do not trust the exit code alone. In particular, the
`react-hooks(exhaustive-deps)` line for `src/keymap/commands.ts` must still be
absent (Step 0 established that plan 018 removed it); if your edit brings it
back, you reintroduced the stale closure.

Also re-confirm the whole table imports cleanly outside a DOM — you checked
`workspace-commands.ts` at Step 3, but `command-registry.ts` and
`default-bindings.ts` only started pulling the feature graph at Steps 6–7:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun -e "const m = await import('./src/keymap/table.ts'); console.log('OK', m.platformCommands.length)"
```

Expect `OK 133`. If this throws on a module-scope `window`/`document`/
`localStorage` access, report which module — the fix is to move that access out
of module scope, not to restructure the table.

### Step 9: Project the palette tables

1. `command-palette-data.ts`: replace the four hand-written sets with three
   derived ones — `paletteModeCommands`, `hiddenCommandPaletteCommands`,
   `workspaceOptionalCommands` — built from `table.ts`. **Delete
   `selectedFileCommands` entirely**: after Step 9.2 its only consumer is gone,
   and a dead export is exactly what this plan exists to remove. Leave
   `viewPaletteItems` and `colorModePaletteItems` untouched.
2. `command-palette-utils.ts`: rewrite `commandDisabledReason` as the
   `commandRequirement` lookup shown above; drop the now-unused
   `selectedFileCommands` and `workspaceOptionalCommands` imports and the
   `isEditorPlatformCommandId` import if nothing else in the file uses it.
   `isCommandDisabled`, `commandPaletteItemDisabledReason`, `fileBackedPath` and
   `commandKeepsPaletteOpen` keep their signatures.
3. `command-palette-icon.tsx`: delete `COMMAND_ICONS` and the 38 phosphor
   imports it needed; call `commandIcon(command)` from `table.ts`. The component
   body keeps its fallback to `CommandCategoryIcon` and the comment at lines
   47–49 (reword "Anything not listed" → "Anything without an `icon` on its
   table entry").

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run src/components/command-palette src/features/menus src/keymap
cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun /tmp/keymap-parity/dump.ts after
diff /tmp/keymap-parity/before-specs.json /tmp/keymap-parity/after-specs.json
diff /tmp/keymap-parity/before-order.json /tmp/keymap-parity/after-order.json
cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun -e "
const { commandPaletteItems } = await import('./src/components/command-palette/command-palette-utils.ts')
const { platformCommandSpecs } = await import('./src/keymap/command-registry.ts')
const { defaultPlatformKeyBindings } = await import('./src/keymap/default-bindings.ts')
const items = commandPaletteItems(platformCommandSpecs, defaultPlatformKeyBindings('linux'))
const leaked = items.map((i) => i.id).filter((id) => /Session|jumpToSession/.test(id) && id !== 'workspace.newIsolatedSession')
console.log('palette items', items.length, '| leaked session rows', JSON.stringify(leaked))
"
```

Expected:

- All three suites green.
- The `dump.ts after` line reprints
  `bindings linux=105 mac=122 windows=103 | rows linux = 90 | specs = 133` —
  note **133**, not 120: the 13 session commands now have specs. The three
  binding/row numbers are unchanged.
- The `specs` diff shows **only 13 added objects** (the session commands).
  Nothing removed, nothing changed. (The dump script already normalises away the
  deleted `commandFamily`/`commandKind` fields and empty `vscodeCommandIds`
  arrays, so those are not diffs.)
- The `order` diff shows **only 13 ids appended at the end**. If any existing id
  moved, the palette ranking tests will already have failed — STOP.
- **`palette items 116 | leaked session rows []`.** This is the negative check:
  the spec list grew by 13 and the palette list did _not_, which is the whole
  justification for `hiddenInPalette` on the session commands. 116 is the count
  measured at `ace313f`. Any other number means a `hiddenInPalette` flag is
  missing or misplaced — STOP.

### Step 10: Retire the drift comment in `active-bindings.ts`

`knownCommands()` merges registry ids with binding ids because the two tables
disagreed. They no longer can: every command with a binding is in the table, and
the ten reserved chords have `command: null`. Replace the function and its
comment:

```ts
/** The table is the only place a command exists, so it is the only list to check. */
function knownCommands(): ReadonlySet<string> {
  return new Set(platformCommands.map((command) => command.id))
}
```

Update its one call site in `appliedOverrides` (drop the `defaults` argument if
it becomes unused there — check whether `appliedOverrides` still needs
`defaults` for anything else; at `ace313f` it does not). Change **nothing else**
in this file.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run src/keymap
```

Green — in particular `keymap.test.ts:106` (`'applies an override for a command
only the default table names'`, which overrides `workspace.newSession`) and
`:118` (`'ignores an override for a command this build does not have'`). The
first now passes because `newSession` is in the registry rather than because the
binding table names it; the assertion is unchanged and still correct.

### Step 11: Tests, docs, and the final gate

1. Add `apps/web/src/keymap/tests/command-table.test.ts` (see Test plan).
2. Update `docs/vscode-keymap-development.md` line 28. Replace:

   > - `command-registry.ts` is the command metadata source for command palette
   >   rows, shortcut labels, and VS Code command aliases.

   with:

   > - `workspace-commands.ts` and `editor-commands.ts` are the one command
   >   table. `command-registry.ts`, `default-bindings.ts`, the palette gating
   >   sets and the icon map are all projections of it.

   Change nothing else in that document — it already carries a
   `STATUS: 🟡 NEEDS UPDATE` banner and a full refresh is out of scope.

3. Format **only the files you touched** — `bun run format` (`oxfmt --write .`)
   would rewrite the unrelated dirty WIP under `apps/web/src/features/settings/`
   and silently widen your diff:

   ```bash
   cd /Users/shaul/Desktop/D/platform/apps/web && bunx oxfmt --write \
     src/keymap/define-command.ts src/keymap/workspace-commands.ts \
     src/keymap/editor-commands.ts src/keymap/table.ts src/keymap/types.ts \
     src/keymap/command-registry.ts src/keymap/default-bindings.ts \
     src/keymap/commands.ts src/keymap/active-bindings.ts \
     src/keymap/tests/command-table.test.ts \
     src/components/command-palette/command-palette-data.ts \
     src/components/command-palette/command-palette-icon.tsx \
     src/components/command-palette/command-palette-utils.ts
   ```

4. The final gate. `bun run verify` at the root **cannot exit 0** at this commit
   (`format:check` fails on pre-existing WIP — see Baseline), so run the four
   workspace gates directly and compare against Step 0:

   ```bash
   cd /Users/shaul/Desktop/D/platform/apps/web
   bun run typecheck                                  # must exit 0
   bun run lint                                       # must exit 0, no new warnings in src/keymap or src/components/command-palette
   bun run format:check 2>&1 | grep -E '^(src|scripts|test)/' | sed 's/ (.*//' | sort \
     > /tmp/keymap-parity/after-format.txt
   diff /tmp/keymap-parity/baseline-format.txt /tmp/keymap-parity/after-format.txt   # must be empty
   bun run test > /tmp/keymap-parity/after-test.txt 2>&1
   ```

   `diff` on the format output empty means you neither introduced an unformatted
   file nor reformatted someone else's. `after-test.txt` must contain no failure
   absent from `baseline-test.txt`.

5. Manual check in the **already-running** dev server at
   `http://localhost:5173` (AGENTS.md: never start your own):
   - `Mod+Shift+P` opens the command palette; typing `color` shows _Choose color
     mode_ first, then _Choose color theme_.
   - The palette command list shows icons, not a wall of category glyphs.
   - **No** `Go to session N` / `New session` rows appear in the `>` list.
   - With no folder open, _Settings_ and _Toggle wallpaper_ are enabled while
     _Save_ is greyed out with `No workspace open.`
   - `Mod+1` still does nothing (and does not switch browser tabs).
   - `Mod+Alt+N` still starts a session in chat mode.

**Verify**: typecheck exits 0; the `format:check` diff in (4) is empty;
`after-test.txt` has no failure absent from `baseline-test.txt`; and

```bash
cd /Users/shaul/Desktop/D/platform && diff /tmp/keymap-parity/baseline-status.txt <(git status --porcelain)
```

shows **only** the In-scope files as added/modified lines. (Do not expect
`git status --porcelain` to be empty or to list only your files — the repo
already had ~24 dirty paths at Step 0. The diff against the baseline is the check.)

## Test plan

**The existing suite is the gate.** 805 lines in `keymap.test.ts`, 186 in
`command-palette-utils.test.ts`, plus `command-list-order.test.tsx` and the menus
tests, all asserting the projections from the outside. They must pass
**unchanged**. If one needs editing, the table is wrong.

**Four new tests**, in a new file
`apps/web/src/keymap/tests/command-table.test.ts`. Model it structurally on
`apps/web/src/keymap/tests/keymap.test.ts` (same directory, same
`import { describe, expect, it } from 'vitest'` style — that file is a pure-logic
node-project test with no server or React involvement, so the
`apps/web/test/fixtures.ts` harness is not needed; `command-palette-utils.test.ts`
uses `fixtures.ts` and is the pattern to follow only if you end up rendering
anything, which you should not).

1. **`every command id appears exactly once`** — build a `Set` from
   `platformCommands.map((c) => c.id)` and assert `size === platformCommands.length`
   and `platformCommands.length === 133`. Why: `byId` is a `Map`, so a duplicated
   id silently wins and the loser's `run` becomes unreachable. Nothing else
   catches this.
2. **`an unregistered editor command still needs a file-backed surface`** —
   assert `commandRequirement('editor.someUnregisteredCommand' as PlatformCommandId)`
   is `'file'`, and that
   `commandDisabledReason('editor.someUnregisteredCommand', { activeFilePath: null, hasWorkspace: true })`
   is `'No file-backed surface is active.'`. Why: this pins the
   `isEditorPlatformCommandId` fallback that the `requires` lookup replaces —
   the one behaviour in `commandDisabledReason` that is _not_ covered by the
   table.
3. **`the browser-hostile chords stay reserved`** — from
   `defaultPlatformKeyBindings('mac')`, filter `binding.command === null` and
   assert there are exactly 10, and that their `keys` (after normalisation)
   cover all ten chords, each with `preventDefault: true` and
   `stopPropagation: true`. On `'linux'` assert exactly 9 (`Mod+Alt+Tab` is
   mac-only). Why: `keymap.test.ts:526` and `:584` check five of them
   individually; nothing asserts the _count_, so a chord dropped during the
   move would pass today's suite. (Measured at `ace313f`: mac 10, linux 9,
   windows 9 bindings with `command: null`.)
4. **`giving the session commands specs does not put them in the palette`** —
   the negative that everything else in this plan takes on faith. Assert both
   halves in one test:

   - `platformCommandSpecs` has **133** entries and includes
     `workspace.newSession` and `workspace.jumpToSession1` (the loosening
     worked — they have titles now, which is what plan 042 needs);
   - `commandPaletteItems(platformCommandSpecs, defaultPlatformKeyBindings('linux'))`
     still has **116** entries and contains **no** id matching
     `/^workspace\.(new|next|previous)Session$|^workspace\.toggleSessionRail$|^workspace\.jumpToSession\d$/`
     (the tightening held).

   116 is the count measured at `ace313f` (120 specs − 4 hidden), and after this
   plan it is 133 − 17. Why this test and not just the manual dev-server check:
   the spec count and the palette count move in opposite directions here, and
   nothing else in the suite pins either one. Without it, a forgotten
   `hiddenInPalette` ships nine "Go to session N" rows and every existing test
   still passes. It needs `commandPaletteItems`, so it imports from
   `@/components/command-palette/command-palette-utils` — the same cross-import
   `keymap.test.ts:3` already makes, so it stays a `node`-project `.test.ts`.

No test is added for the 13 new session titles' exact wording —
`keymap.test.ts`'s existing `commandHotkeyMeta` coverage plus the parity dump
cover their presence, and asserting the strings is a spelling test.

Verification: `cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run src/keymap/tests/command-table.test.ts`
→ 4 passed. Then `bun run test` → no failure absent from
`/tmp/keymap-parity/baseline-test.txt`, with every pre-existing test file
byte-unchanged.

## Done criteria

Machine-checkable. ALL must hold:

All `git` commands below assume the work is **uncommitted on `main`** (per Git
workflow), so they compare the working tree, not `HEAD`. If you committed per
step, substitute `git diff --stat ace313f..HEAD -- <path>`.

- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] `cd apps/web && bun run lint` exits 0 **and** prints no
      `react-hooks(exhaustive-deps)` warning for `src/keymap/commands.ts`
- [ ] `diff /tmp/keymap-parity/baseline-format.txt /tmp/keymap-parity/after-format.txt`
      is empty (you neither left a file unformatted nor reformatted the unrelated
      settings WIP). **Not** `bun run verify` exits 0 — it cannot, see Baseline
- [ ] `cd apps/web && bun run test` produces no failure absent from
      `/tmp/keymap-parity/baseline-test.txt`
- [ ] `git status --porcelain -- apps/web/src/keymap/tests` shows **only**
      `?? .../command-table.test.ts` — `keymap.test.ts`,
      `session-commands.test.ts` and `use-app-keymap.test.tsx` are byte-unchanged
- [ ] `git status --porcelain -- apps/web/src/components/command-palette/tests`
      is empty
- [ ] `diff /tmp/keymap-parity/before-rows.json /tmp/keymap-parity/after-rows.json`
      is empty
- [ ] `diff before-bindings.json after-bindings.json` shows only added `meta`
      objects on the 13 session bindings — no `<` lines
- [ ] `diff before-specs.json after-specs.json` shows only 13 added spec objects
- [ ] `diff before-order.json after-order.json` shows only 13 ids appended
- [ ] `grep -rn "workspaceCommandHandlers\|workspaceCommandSpecs\|editorCommandSpecs\|defaultBindingSpecs\|COMMAND_ICONS\|selectedFileCommands" apps/web/src`
      returns no matches
- [ ] `grep -n "'workspace\." apps/web/src/keymap/types.ts` returns no matches
      (the hand-written union is gone)
- [ ] `grep -rn "argsSchema\|commandFamily\|commandKind" apps/web/src` returns no
      matches
- [ ] `apps/web/src/keymap/table.ts` exports `platformCommands` with 133 entries
      (53 workspace + 80 editor)
- [ ] `defaultPlatformKeyBindings('mac')` still contains exactly 10 bindings with
      `command: null`; `'linux'` and `'windows'` exactly 9
- [ ] `commandPaletteItems(platformCommandSpecs, defaultPlatformKeyBindings('linux'))`
      still returns **116** items and no session command id (Step 9's probe)
- [ ] 4 new tests exist and pass
- [ ] `diff /tmp/keymap-parity/baseline-status.txt <(git status --porcelain)`
      adds only In-scope files — the repo already had ~24 unrelated dirty paths
      at Step 0, so a non-empty `git status` is expected and not a failure
- [ ] Nothing under `/tmp/keymap-parity` is inside the repository
- [ ] `plans/README.md` status row for 029 updated

## STOP conditions

Stop and report back (do not improvise) if:

- **Plan 018 has not landed** (Step 0's lint probe still names
  `wallpaperEnabled` / `diffViewMode` as missing deps of the `useCallback` in
  `usePlatformCommandDispatch`). This plan moves the code 018 fixes; doing them
  in the wrong order means resolving the same conflict twice, and the
  stale-closure bug would be silently carried into the new table. **This was the
  state at `ace313f`, so expect to stop here unless 018 landed in between.**
- **You are tempted to make `bun run verify` exit 0**, or to run
  `bun run format`, or to touch
  `apps/web/src/features/settings/hooks/use-setting-inspection.ts`. The root
  verify gate is red before you start, on unrelated uncommitted work. Fixing it
  is someone else's change and pollutes yours. Compare to the Step 0 baseline
  instead.
- **You are about to edit `keymap.test.ts`.** It is the gate. A failing
  assertion there means the table is wrong, not the test. The one exception you
  might be tempted by is the comment at `:107-108` ("The session commands ship a
  binding without a command-palette spec") which becomes historically inaccurate
  — leave it; a stale comment is not worth breaking the "unchanged" guarantee,
  and Step 10's comment covers the same ground.
- **The reserved-chord count is not 10** (mac) / **9** (linux, windows) after
  Step 7, or `keymap.test.ts:526` / `:584` fail. Those ten no-ops are
  deliberate — see the boxed warning above. Never "implement" one to make a test
  pass.
- **The palette command count is not 116** after Step 9, or a session command id
  appears in `commandPaletteItems(...)`. The 13 session commands gain specs and
  must not gain rows; a mismatch means a `hiddenInPalette` flag is missing.
  Do **not** fix it by filtering session ids somewhere in the palette — fix the
  table entry.
- **`workspace-commands.ts` throws on import outside a DOM** (Step 3's probe), or
  a circular-import error appears once `command-registry.ts` starts importing
  `table.ts` (Step 6). `command-registry.ts` is imported at runtime by
  `active-bindings.ts`, `content.tsx`, `features/menus/utils/resolve.ts` and
  (transitively) `features/settings/.../chord-recorder.tsx`; giving it a
  dependency on six feature modules is the riskiest structural consequence of
  this plan. Report the cycle — do not break it by adding a barrel or a lazy
  `require`.
- **`before-rows.json` and `after-rows.json` differ.** That means a command's
  `keys` are in the wrong order. Re-derive from
  `/tmp/keymap-parity/keys-by-command.txt` rather than guessing; if you cannot
  reconcile it after one attempt, report the diff.
- **The bindings diff contains any `<` line, or a `>` line outside a session
  command's `meta`.** Something changed that should not have.
- **`before-order.json` and `after-order.json` differ anywhere but the tail.**
  `command-palette-utils.test.ts:35` and `:89` assert exact ranking order that
  depends on registry position; a reorder is a user-visible palette change.
- **Typecheck reports an `editor.*` command id used in the app but missing from
  `editor-commands.ts`.** Report the id. Do not widen `EditorPlatformCommandId`
  and do not invent a table entry for a command nobody specified.
- **`bun run typecheck` in `apps/web` takes more than roughly twice as long as
  it did at Step 0.** A 133-entry generic table can blow up inference. If it
  does, report the timing — the fallback is to annotate `workspaceCommands` and
  `editorCommands` with explicit tuple types, but do not attempt that
  unprompted.
- **`bun --bun -e "await import('./src/keymap/table.ts')"` throws** because a
  feature module touches `window`/`document`/`localStorage` at module scope. The
  node vitest project has no DOM, so `keymap.test.ts` would start failing for a
  reason unrelated to this refactor. Report the module and the access.
- **Any file outside the In-scope list needs to change** — especially anything
  under `apps/web/src/features/menus/` or `packages/contracts/`. The projections
  are supposed to preserve every existing export signature; if one does not, say
  which and why.
- **A workspace command turns out to have no handler** (i.e. `run` cannot be
  filled in because `workspaceCommandHandlers` never had an entry for it). At
  `ace313f` all 53 have one; if that has drifted, report which command.

## Maintenance notes

- **What this does not fix, and why.** The finding that motivated this plan also
  wanted `defineCommand` tables to live _per feature_
  (`features/chat-mode/commands.ts`, `features/editor/commands.ts`, …) so the
  core stops importing every feature. This plan deliberately keeps one table
  under `keymap/`, for two reasons. First, the import direction does not
  actually invert: something must reference all the tables to concatenate them,
  so `keymap/table.ts` would import the same six features that `commands.ts`
  imports today — the only alternative is a runtime `register()` with
  side-effect imports, which is worse (tree-shaking hazards, order-dependent
  test isolation) and which `AGENTS.md`'s no-barrels rule discourages. Second,
  plans 010 and 012 (Phase 4) move those very feature folders; splitting now
  guarantees conflicts. The measurable win — six tables to one, and a command
  that cannot half-exist — is fully delivered without the split. Revisit after
  Phase 4.
- **The seventh table.** `viewPaletteItems` and `colorModePaletteItems` in
  `command-palette-data.ts` still carry their own titles and descriptions for
  eight and three commands that are already in the table, in slightly different
  words. Collapsing them changes what the Views list says, so it is a product
  decision, not a refactor. Left alone on purpose.
- **The 13 session commands are hidden, not absent.** They now have titles,
  which is what plan 042 (keybindings editor) needs — every bindable command
  must be nameable in that UI. Whoever surfaces them in the palette needs a
  fourth `CommandRequirement` (chat mode) or an availability predicate; today
  `runSessionCommand` returns `false` outside chat mode and the palette has no
  way to know that.
- **What a reviewer should scrutinise**, in priority order: (1) the parity diffs
  — they are the actual proof, and they are cheap to re-run; (2) per-command
  `keys` ordering, because `commandShortcut`, `userKeyBinding` and
  `defaultKeys[0]` all take the _first_ binding for a command; (3) that the ten
  reserved chords survived with `command: null`; (4) that
  `commandRequirement`'s `editor.*` fallback is present, since it is the one
  piece of `commandDisabledReason` the table does not cover; (5) that every
  explanatory comment from `commands.ts` and `default-bindings.ts` landed on the
  entry it explains — those comments record _rejected alternatives_ and are the
  most easily lost thing in a move of this size.
- **What interacts with this next.** Plan 042 reads the table for titles and
  bindings. Direction D3 (multi-prefix Quick Access) reads it for icons,
  categories and gating. Anyone adding a command after this lands should touch
  exactly one file — if a change ever needs two, that is the regression to
  report.
- **`aliases` is a read path with no writers.** `commandKeywords` and
  `platformCommandPaletteItem` consume it; nothing sets it. It is kept as the
  hook for palette search synonyms. If it is still unset in six months, delete
  it along with its two readers.
