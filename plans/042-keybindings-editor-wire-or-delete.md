# Plan 042: Wire the keybindings editor or delete it

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report —
> do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **This plan has two mutually exclusive branches.** Step 0 decides which one you
> run. Do **not** run both, and do **not** run half of Option A. Leaving the
> editor half-wired is worse than either endpoint.
>
> **Drift check (run first)**:
>
> ```bash
> cd /Users/shaul/Desktop/D/platform
> git diff --stat ace313f..HEAD -- apps/web/src/keymap apps/web/src/features/settings packages/contracts/src/settings
> ```
>
> If any in-scope file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition. **Plan 029 is a dependency and it rewrites
> `apps/web/src/keymap/` heavily, so this diff is expected to be large.** What
> matters is that the specific symbols quoted below still exist with the same
> shapes — 029 explicitly promises to leave `CommandKeyBinding` and the
> `active-bindings.ts` resolution API unchanged.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: `plans/029-one-command-table.md` (not a hard blocker, but much
  cheaper after — see "Why 029 first")
- **Category**: dead-code
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

`apps/web/src/keymap/active-bindings.ts` contains a **complete, tested backend
for a keybindings editor** — effective-binding resolution, per-command default
lists, user-vs-default attribution, and shadow attribution that names which
command stole a chord from which. Roughly 170 lines of source, covered by 107
lines of tests. **It has zero production callers.** Its only importer in the
entire repository is `apps/web/src/keymap/tests/keymap.test.ts`.

Meanwhile the shipped keybindings UI is the generic `RecordWidget`: a free-text
`Input` placeholdered `Add a key` into which the user must **type a raw command
id from memory** — `workspace.saveFile`, `editor.action.commentLine` — before
they get a chord recorder. There is no command list, no human title, no default
shown, and the only conflict signal counts duplicates _within the override
record itself_, which its own comment concedes ("this widget only knows the
overrides").

The history explains it: `apps/web/src/features/settings/components/keybinding-section.tsx`
and `keybinding-row.tsx` **used to exist** and rendered exactly these rows. Both
were deleted in `689c210` ("feat(settings): a real settings system, from the
registry to the page (M-B)"), which replaced the bespoke settings sections with
the registry-driven page. The backend survived the rewrite; its UI did not, and
nothing noticed because nothing typechecks "is this exported function reachable
from `main.tsx`".

`AGENTS.md` states the rule this violates, verbatim:

> - A key is never registered inert. Register it in the same pass that wires its
>   consumer, or do not register it — a knob that writes a file nothing reads is
>   worse than no knob.

`keybindings.overrides` is not _literally_ inert — `app-command-surface.tsx`
reads it and the keymap honours it. What is inert is the machinery built to
**edit** it. The rule's spirit is the same: pick an endpoint.

This closes an instance of theme **T4** from `plans/README.md`:

> **T4 — Exported-but-unreachable surface** _(all package areas)._ … Plus the
> provider SPI's dead members and a fully-built, unwired keybindings editor.

### Why 029 first

`plans/029-one-command-table.md` gives every command a title. Today **13 of the
90 rows** `commandKeyBindings()` produces have no title anywhere in the repo —
`workspace.newSession`, `workspace.nextSession`, `workspace.previousSession`,
`workspace.toggleSessionRail` and the nine `workspace.jumpToSession{1..9}` ids
ship a keybinding and a handler but no `CommandSpec`. Wired today, those 13 rows
render a raw dotted id, which is the exact defect this plan exists to remove.
029 also introduces `commandIcon`, so after it the widget gets titles **and**
icons for free. Verified at `ace313f` with a scratch probe (numbers below).

## Current state

### Files and their roles

| File                                                                            | Role                                                                                                                                                         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/keymap/active-bindings.ts`                                        | Keymap resolution. Holds `commandKeyBindings` (the dead editor backend) alongside `resolvedPlatformKeyBindings` (live, load-bearing).                        |
| `apps/web/src/keymap/types.ts`                                                  | `CommandKeyBinding` at `:107` — "One command's effective binding, as the settings editor lists it". Exists only for the dead function.                       |
| `apps/web/src/keymap/command-registry.ts`                                       | `platformCommandSpecs` / `platformCommandSpec(id)` → `{ id, title, category, description, vscodeCommandIds }`. This is where a row's human title comes from. |
| `apps/web/src/keymap/default-bindings.ts`                                       | `defaultPlatformKeyBindings(platform?)` → the default table.                                                                                                 |
| `apps/web/src/keymap/tests/keymap.test.ts`                                      | 805 lines. `describe('commandKeyBindings')` at `:231-337` is the only caller of the dead function.                                                           |
| `apps/web/src/features/settings/hooks/use-settings-actions.ts`                  | `resetKeybinding` / `setKeybinding` — exported actions, zero callers.                                                                                        |
| `apps/web/src/features/settings/utils/patch.ts`                                 | `withKeybindingOverride` `:48` / `withoutKeybindingOverride` `:60` — reached only through those two actions.                                                 |
| `apps/web/src/features/settings/components/setting-row.tsx`                     | Dispatches `descriptor.widget` to a control. The `record` branch is what ships for `keybindings.overrides`.                                                  |
| `apps/web/src/features/settings/components/widgets/record-widget.tsx`           | The generic key/value editor. `keybindings.overrides` is its **only** consumer.                                                                              |
| `apps/web/src/features/settings/components/widgets/chord-recorder.tsx`          | Captures a chord from real keystrokes. Reused by Option A.                                                                                                   |
| `apps/web/src/features/settings/components/model-section.tsx` / `model-row.tsx` | **The structural exemplar for Option A.** A long list rendered as one settings row, reading its own values via `useSettingValue`. Copy this shape.           |
| `packages/contracts/src/settings/registry.ts`                                   | `SettingWidget` union at `:34`.                                                                                                                              |
| `packages/contracts/src/settings/keys.ts`                                       | `keybindings.overrides` descriptor at `:385`.                                                                                                                |

### Measured facts (probed at `ace313f` — re-derive only if the drift check shows keymap changes)

- `commandKeyBindings(defaultPlatformKeyBindings(p), {}, p)` returns **90 rows**
  on `linux`, **93** on `mac`, **90** on `windows`.
- **13** of those rows have no `platformCommandSpec` and therefore no title: the
  four session commands plus the nine jump ids. Same 13 on every platform.
- `platformCommandSpecs` has **120** entries.
- `keybindings.overrides` is the **only** setting in the registry with
  `widget: 'record'` (`rg -n "widget: 'record'" packages/contracts/src/settings/keys.ts`
  → exactly one hit, line 391).
- Command titles the test plan depends on, read out of `command-registry.ts`:
  `workspace.saveFile` → **"Save"**, `workspace.toggleSidebarVisibility` →
  **"Toggle Files pane"**, `workspace.togglePanel` → **"Toggle panel"**.
  `workspace.quickOpenView`'s title is **"Open view"**, _not_ "Quick open" — do
  not assume a title from an id.
- Substring searches over `` `${command} ${title} ${keys}` `` lowercased, on
  `linux` with no overrides (90 rows): `save` → 1 row (`workspace.saveFile`),
  `files pane` → 1 row (`workspace.toggleSidebarVisibility`, a **title-only**
  match — its id contains neither word), `sidebar` → 1 row (same command,
  id-only match), `mod+s` → 15 rows including `workspace.saveFile`, `zzznope` →
  0 rows.
- With `{ 'workspace.saveFile': 'Mod+B' }` on `linux`, exactly one row is
  shadowed: `workspace.toggleSidebarVisibility` ← `workspace.saveFile`.
- The settings file stores **flat, dotted setting ids** at the top level —
  `editSettingsText` calls `modify(text, [edit.key], …)` with the key as a
  single path segment. So the override lands as a top-level
  `"keybindings.overrides": { … }` member of `~/.platform/settings.json`, **not**
  nested under a `keybindings` object.

### Reachability, verified

```
$ rg -n "commandKeyBindings" --glob '!**/node_modules/**' apps packages
apps/web/src/keymap/active-bindings.ts:115:export function commandKeyBindings(
apps/web/src/keymap/tests/keymap.test.ts:7:  commandKeyBindings,
apps/web/src/keymap/tests/keymap.test.ts:232,242,258,274,290,306,322   (seven test cases)

$ rg -n "setKeybinding|resetKeybinding" --glob '!**/node_modules/**' apps packages
apps/web/src/features/settings/hooks/use-settings-actions.ts   (definitions only)
```

`isBindableHotkey` and `normalizedHotkey` (same file, `:147` and `:157`) are
**live** — `chord-recorder.tsx:4` imports both, and `appliedOverrides` uses
`isBindableHotkey` internally. Neither is in scope for deletion under either
option.

### Excerpts

**`apps/web/src/keymap/active-bindings.ts:109-140`** — the dead entry point:

```ts
/**
 * One row per command the key table can reach, read back out of the resolved
 * table rather than off the override document, so the settings editor lists
 * what is in force instead of what was asked for: a command whose key another
 * command's override took reports the key it lost and names the winner.
 */
export function commandKeyBindings(
  defaults: readonly PlatformKeyBinding[],
  overrides: KeybindingOverrides,
  platform: PlatformName = detectPlatform(),
): readonly CommandKeyBindingRow[] {
  const { bindings, shadowedBy } = keyBindingResolution(defaults, overrides, platform)
  const applied = new Map(appliedOverrides(overrides, defaults))
  const live = liveBindingsByCommand(bindings)
  const defaultKeys = defaultKeysByCommand(defaults)

  for (const command of applied.keys()) {
    if (defaultKeys.has(command)) continue

    defaultKeys.set(command, [])
  }

  return Array.from(defaultKeys, ([command, keys]) =>
    commandKeyBindingRow({
      applied,
      command,
      defaultKeys: keys,
      live: live.get(command) ?? null,
      shadowedBy: shadowedBy.get(command) ?? null,
    }),
  )
}
```

**`apps/web/src/keymap/active-bindings.ts:32-42`** — the row type and the
resolution shape that carries `shadowedBy`:

```ts
type KeyBindingResolution = {
  readonly bindings: readonly PlatformKeyBinding[]
  /** Command whose binding was dropped → the command that took the key. */
  readonly shadowedBy: ReadonlyMap<PlatformCommandId, PlatformCommandId>
}

/** A settings row: the effective binding plus the command that took its key. */
export type CommandKeyBindingRow = CommandKeyBinding & {
  /** Set only when the command has no binding left because another one won the key. */
  readonly shadowedBy: PlatformCommandId | null
}
```

**`apps/web/src/keymap/active-bindings.ts:57-63`** — the only production
consumer of the resolution, which throws `shadowedBy` away:

```ts
export function resolvedPlatformKeyBindings(
  defaults: readonly PlatformKeyBinding[],
  overrides: KeybindingOverrides,
  platform: PlatformName = detectPlatform(),
): readonly PlatformKeyBinding[] {
  return keyBindingResolution(defaults, overrides, platform).bindings
}
```

**`apps/web/src/keymap/types.ts:107-114`**:

```ts
/** One command's effective binding, as the settings editor lists it. */
export type CommandKeyBinding = {
  readonly command: PlatformCommandId
  readonly defaultKeys: readonly string[]
  /** The binding in force. `null` is an explicit unbind. */
  readonly keys: string | null
  readonly source: KeyBindingSource
}
```

**`apps/web/src/features/settings/components/setting-row.tsx:142-152`** — what
actually ships (line 130 at `ace313f`; see the drift note below):

```tsx
if (descriptor.widget === 'record') {
  return (
    <RecordWidget
      disabled={disabled}
      id={id}
      onChange={onChange as (next: Record<string, string | null>) => void}
      recorder={id === 'keybindings.overrides'}
      value={(value ?? {}) as Record<string, string | null>}
    />
  )
}
```

**`apps/web/src/features/settings/components/widgets/record-widget.tsx:86-108`** —
the "type a raw command id" entry path:

```tsx
      <div className='flex items-center gap-1'>
        <Input
          aria-label={`Add an entry to ${id}`}
          className='min-w-0 flex-1'
          disabled={disabled}
          onChange={(event) => setDraftKey(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            addEntry()
          }}
          placeholder='Add a key'
          value={draftKey}
        />
```

**`apps/web/src/features/settings/hooks/use-settings-actions.ts:128-140`** (the
current working-tree form; see drift note) — the two callerless actions:

```ts
    resetKeybinding: (command: PlatformCommandId) => {
      saveCollection(
        'keybindings.overrides',
        withoutKeybindingOverride(values()['keybindings.overrides'], command),
      )
    },
    /** `null` unbinds the command; resetting is what restores its default. */
    setKeybinding: (command: PlatformCommandId, keys: string | null) => {
      saveCollection(
        'keybindings.overrides',
        withKeybindingOverride(values()['keybindings.overrides'], command, keys),
      )
    },
```

**`apps/web/src/features/settings/utils/patch.ts:48-65`**:

```ts
export function withKeybindingOverride(
  overrides: KeybindingOverrides,
  command: string,
  keys: string | null,
): KeybindingOverrides {
  return { ...overrides, [command]: keys }
}

/**
 * Dropping the key, not writing `null` over it: `null` is an explicit unbind,
 * so only an absent key hands the command back to its default.
 */
export function withoutKeybindingOverride(
  overrides: KeybindingOverrides,
  command: string,
): KeybindingOverrides {
  return Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== command))
}
```

**`packages/contracts/src/settings/keys.ts:385-399`**:

```ts
  'keybindings.overrides': defineSetting({
    schema: keybindingOverridesSchema,
    default: {},
    // A binding can invoke any app command, which puts this on the execution
    // side of the scope rule despite looking like pure preference.
    scope: 'application',
    widget: 'record',
    category: 'Keyboard shortcuts',
    description:
      'Command id to hotkey. A missing key keeps the default; an explicit null unbinds the command.',
    // The one key that merges rather than replaces: a later layer should be able
    // to bind a command without dropping every other binding the user set.
    merge: 'record',
    keywords: ['keybinding', 'shortcut', 'hotkey', 'keymap'],
  }),
```

> ⚠️ **`merge: 'record'` on line 397 is a `SettingMerge`, not a `SettingWidget`.**
> It is load-bearing (`resolve.ts:329` reads it) and must not be touched by
> either option. Only line 391 (`widget: 'record'`) is in play.

**`packages/contracts/src/settings/registry.ts:33-45`**:

```ts
/** Which control the settings page renders. Presentation only; never affects resolution. */
export type SettingWidget =
  | 'boolean'
  | 'font'
  | 'number'
  | 'string'
  | 'multiline'
  | 'enum'
  | 'list'
  | 'record'
  | 'providers'
  | 'models'
  | 'complex'
```

**`apps/web/src/features/settings/components/model-section.tsx:26-50`** — the
shape Option A copies (a long list as one settings row, own data source, plain
`overflow-y-auto`, `EmptyRow` for the empty case):

```tsx
export function ModelSection() {
  const { data } = useQuery(providerListQueryOptions())
  const hidden = useSettingValue('models.hidden')
  const order = useSettingValue('models.order')
  const rows = modelPreferenceRows(providerModelOptions(data?.providers), { hidden, order })

  if (rows.length === 0) return <EmptyRow>No models are available yet.</EmptyRow>

  const displayed = rows.map((row) => row.ref)

  return (
    <div className='border-border flex max-h-64 w-96 flex-col overflow-y-auto rounded-md border'>
      {rows.map((row, index) => (
        <ModelRow ... />
      ))}
    </div>
  )
}
```

**The deleted original** (`git show 689c210^:apps/web/src/features/settings/components/keybinding-row.tsx`)
is the closest thing to a spec for Option A. Read it before writing Step W3 —
it already solved title fallback, the shadowed-by line, the Custom badge, and
the "an emptied field is an unbind, Reset is the way back to default" split. Do
**not** restore it verbatim: it used a raw text `Input` for the chord, which
`chord-recorder.tsx`'s own doc comment explains is the worse design.

### Drift note (read this)

This plan was written with an **uncommitted working tree** on `main` at
`ace313f`. Two of the excerpts above differ between the commit and the files on
disk:

- `use-settings-actions.ts` — at `ace313f`, `resetKeybinding` is at line **103**
  and `setKeybinding` at line **114**, and both call `save([...])` directly with
  an inline `{ key, target: 'user', value }` object. On disk they are at lines
  **128** and **135** and route through a new `saveCollection` helper. **Either
  form is fine for both options**: Option A calls them unchanged, Option B
  deletes them whole.
- `setting-row.tsx` — the `record` branch is at line **130** at `ace313f` and
  line **142** on disk; the body is byte-identical.

Everything else quoted above is identical in the commit and on disk.

### Conventions that apply (from `AGENTS.md` — the executor has not read it)

- "Group by feature, then by kind: `components/` — React render components only
  (`.tsx`) … `utils/` — pure, stateless, non-React code only."
- "One component per file. Do not export multiple components from one component
  file."
- "Keep pure helpers out of component and hook files. Move formatters,
  transforms, constants, models, and other pure reusable logic into `utils/`."
- "Import exact files through `@/`. Do not add barrel `index.ts` files."
- "Do not repeat the folder name in file or symbol names."
- "Avoid manual React memoization. Do not add `memo`, `useMemo`, or
  `useCallback` for ordinary render values or callbacks."
- "Keep nesting depth to 3 or less. Use guard clauses and early returns … In
  loops, use inverted conditions with `continue` instead of wrapping the body in
  `if`. Do not use `else` after an early return. Never use nested ternaries."
- "Style with Tailwind classes and the `@workspace/ui` primitives … Use theme
  tokens only … Never use raw Tailwind palette colors … or hex/`oklch()`
  literals." Status colours have tokens: `destructive`, `info`, `success`,
  `warning`.
- "Compose the shared primitives; do not restyle them ad-hoc or reach for a raw
  `<button>`/`<input>` when a primitive exists."
- "No backward compatibility shims, no legacy aliases, no deprecation windows.
  Update every call site in the same pass." / "Delete obsolete tests instead of
  preserving old behavior." / "Remove duplicate code aggressively."
- "Never throw `new Error`. Create errors with `createError` from `evlog`."
  (Neither option should need to create an error at all.)
- "Regenerate `docs/settings-reference.md` with `bun run settings:reference`
  after changing the registry."
- "A dev server is always running. Never spin up your own server to test or
  verify changes — reuse the running one." It is at **http://localhost:5173**.

## Commands you will need

| Purpose               | Command                                                                                                                                     | Expected on success                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Typecheck (web)       | `cd /Users/shaul/Desktop/D/platform/apps/web && bun run typecheck`                                                                          | exit 0, no errors                                                         |
| Typecheck (contracts) | `cd /Users/shaul/Desktop/D/platform/packages/contracts && bun run typecheck`                                                                | exit 0, no errors                                                         |
| Typecheck (all)       | `cd /Users/shaul/Desktop/D/platform && bun run typecheck`                                                                                   | exit 0                                                                    |
| Web tests             | `cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run --project node --project dom`                                          | all pass                                                                  |
| One web test file     | `cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run --project dom src/features/settings/tests/keybinding-section.test.tsx` | all pass                                                                  |
| Keymap tests only     | `cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run --project node src/keymap/tests/keymap.test.ts`                        | all pass                                                                  |
| Contracts tests       | `cd /Users/shaul/Desktop/D/platform/packages/contracts && bun run test`                                                                     | all pass                                                                  |
| Lint                  | `cd /Users/shaul/Desktop/D/platform && bun run lint`                                                                                        | exit 0                                                                    |
| Format check          | `cd /Users/shaul/Desktop/D/platform && bun run format:check`                                                                                | exit 0                                                                    |
| Format (fix)          | `cd /Users/shaul/Desktop/D/platform && bun run format`                                                                                      | exit 0                                                                    |
| Settings reference    | `cd /Users/shaul/Desktop/D/platform && bun run settings:reference`                                                                          | exit 0; **no diff expected** — the generated table has no `widget` column |
| Full gate             | `cd /Users/shaul/Desktop/D/platform && bun run verify`                                                                                      | exit 0                                                                    |

`bun run test` in `apps/web` runs only the `node` and `dom` projects; the
`browser` project is a separate `bun run test:browser`. **Do not add browser
tests for this work** — that runner is known to hang at the RUN banner in this
repo, and nothing here needs real paint.

## Scope

### Option A (wire) — in scope

- `packages/contracts/src/settings/registry.ts` (one union member)
- `packages/contracts/src/settings/keys.ts` (one line: `widget`)
- `apps/web/src/features/settings/components/keybinding-section.tsx` (create)
- `apps/web/src/features/settings/components/keybinding-row.tsx` (create)
- `apps/web/src/features/settings/utils/keybinding-rows.ts` (create)
- `apps/web/src/features/settings/components/setting-row.tsx` (swap one branch)
- `apps/web/src/features/settings/components/widgets/record-widget.tsx` (delete)
- `apps/web/src/features/settings/tests/record-widget.test.tsx` (delete)
- `apps/web/src/features/settings/tests/keybinding-section.test.tsx` (create)
- `apps/web/src/features/settings/utils/tests/keybinding-rows.test.ts` (create)
- `docs/settings-reference.md` — only if `bun run settings:reference` changes it

### Option B (delete) — in scope

- `apps/web/src/keymap/active-bindings.ts`
- `apps/web/src/keymap/types.ts`
- `apps/web/src/keymap/tests/keymap.test.ts`
- `apps/web/src/features/settings/hooks/use-settings-actions.ts`
- `apps/web/src/features/settings/utils/patch.ts`

### Out of scope for BOTH options (do NOT touch, even though they look related)

- `apps/web/src/features/settings/components/widgets/chord-recorder.tsx` and
  `apps/web/src/features/settings/tests/chord-recorder.test.tsx` — the recorder
  is correct and its seven tests pass unchanged in both options. Option A reuses
  it as-is; Option B leaves it serving `RecordWidget`. Do not change its props.
- `isBindableHotkey` / `normalizedHotkey` in `active-bindings.ts` — live code
  with a live importer.
- `resolvedPlatformKeyBindings`, `activePlatformKeyBindings`,
  `parsedPlatformKeyBindings`, `platformKeyBindingForKeyboardEvent` — the
  running keymap. Option B refactors `resolvedPlatformKeyBindings`'s _body_ but
  its signature and behaviour are frozen.
- `apps/web/src/components/app-command-surface.tsx` — the app's only reader of
  the overrides. Both options leave the read path alone.
- The `'record'` member of the `SettingWidget` union — a fixture registry in
  `packages/contracts/src/tests/settings-resolve.test.ts:43` uses it, and plan
  026 owns that union. Adding `'keybindings'` is enough.
- `merge: 'record'` at `keys.ts:397` — a different type entirely (see warning
  above).
- `apps/web/src/features/settings/components/model-section.tsx` /
  `model-row.tsx` / `provider-section.tsx` — read them as exemplars, change
  nothing.
- `docs/settings-registry-inventory.md`, `docs/settings-architecture-plan.md`,
  `docs/t3code-*.md` — they still cite the `keybinding-section.tsx` deleted in
  `689c210`. Stale docs, not this plan's job.
- `packages/contracts/src/tests/settings-resolve.test.ts` — its fixture registry
  has its own `widget: 'record'` at `:43`. It is a **fixture**, not the real
  registry; leave it on `'record'`. Changing it is the single most tempting
  wrong move in Step A2.
- `apps/web/src/keymap/command-registry.ts` — Option A will show 13 rows whose
  label is a raw dotted id if plan 029 has not landed. **Do not add the missing
  `CommandSpec` entries here.** That is 029's whole job, and hand-adding them
  produces a table 029 then has to reconcile. Step A1 exists to surface this
  and hand the decision back to the operator.
- `apps/web/src/keymap/types.ts` under Option A — no type there needs to change
  to wire the editor. (Option B deletes one member of it; that is B2's job.)
- `apps/web/src/features/settings/components/widgets/` beyond deleting
  `record-widget.tsx` — the other widgets are reached by other settings and a
  change there is out of this plan's blast radius.
- The `browser` vitest project and `apps/web/test:browser`.
- `packages/editor-*` — symlinks to a sibling checkout, never in scope. If
  `bun run verify` fails inside one of them, that is pre-existing; report it,
  do not fix it.

## Git workflow

**All work happens on `main`** — no new branches, worktrees, commits, pushes, or
PRs unless the operator explicitly asks. If you are told to commit, use
conventional commits with a lowercase descriptive subject. Real examples from
`git log`:

```
refactor(orchestration): the server prepares a session's worktree (M-C)
fix(address): bound the URL, and stop escaping slashes in ?tabs=
```

Suggested subjects: `feat(settings): a keybindings editor that lists the
commands` (Option A) or `refactor(keymap): drop the unwired keybindings-editor
backend` (Option B).

---

## Step 0: Get the decision — do not pick for the operator

This is a product call, not an engineering one, and the two endpoints are both
defensible.

**Option A — wire it.** Effort **M** (~2–4 h). Two new components, one pure
utils module, one contracts union member, one branch swap in `setting-row.tsx`,
and the deletion of `RecordWidget` (which loses its only consumer). Net: the app
gains a real Keyboard Shortcuts list — every command by title, its default, its
effective chord, a recorder, Unbind, Reset, and a pane-correct "Shadowed by X"
warning. Risk LOW: nothing on the keymap's live resolution path changes.

**Option B — delete it.** Effort **S–M** (~1 h). Removes ~170 lines of source
and 107 lines of test. Risk LOW-but-not-zero: it requires surgery inside
`liveKeyBindings`, which _is_ on the live path — mitigated by the ~700 remaining
lines of `keymap.test.ts`. The user keeps the free-text `RecordWidget`, so
rebinding stays possible for anyone who already knows the command ids.

**Recommendation: Option A.** Three reasons.

1. The expensive half is already built and already tested. Option A adds a view
   over a proven model; Option B throws away the proven model and leaves the
   feature at its worst version.
2. The shipped UI has **no discovery path**. A user cannot learn
   `workspace.reopenClosedEditor` from anywhere in the settings page — they must
   read the source. That is not a rough edge, it is a missing feature wearing a
   text input.
3. Option B deletes `shadowedBy`, the only thing that tells a user their new
   override just killed another command's shortcut. `RecordWidget`'s
   `conflictsFor` is explicitly a lesser substitute by its own comment
   (`record-widget.tsx:116-123`).

**If the operator told you which option, run that one. If they did not, STOP and
ask**, quoting the two paragraphs above. Do not choose.

**Verify**: you have an explicit instruction naming Option A or Option B.

---

# OPTION A — wire it

## Step A1: Check whether plan 029 has landed

Write the probe **outside the repository** (the repo must stay clean; see the
"no scratch files in repo" rule):

```bash
mkdir -p /tmp/plan-042
cat > /tmp/plan-042/probe.ts <<'TS'
const root = '/Users/shaul/Desktop/D/platform/apps/web/src/keymap/'
const { defaultPlatformKeyBindings } = await import(`${root}default-bindings.ts`)
const { commandKeyBindings } = await import(`${root}active-bindings.ts`)
const { platformCommandSpec } = await import(`${root}command-registry.ts`)
for (const p of ['linux', 'mac', 'windows']) {
  const rows = commandKeyBindings(defaultPlatformKeyBindings(p), {}, p)
  const untitled = rows.filter((r) => !platformCommandSpec(r.command))
  console.log(p, 'rows=', rows.length, 'untitled=', untitled.length)
}
TS
bun run /tmp/plan-042/probe.ts
```

**Expected after 029**: `untitled= 0` on every platform.
**At `ace313f` (029 not landed)**: `untitled= 13` on every platform.

If it prints 13, the widget will render 13 rows whose label is a raw dotted id
(the row component falls back to the id, so nothing breaks — it just looks like
the problem this plan is fixing). **STOP and report the number**; the operator
decides whether to proceed anyway or land 029 first.

If the probe errors because `commandKeyBindings` no longer exists, **STOP** —
something already executed Option B.

**Verify**: the probe prints three lines and you have recorded `untitled=` for
each. Then `rm -rf /tmp/plan-042` — and confirm `git status` still shows no new
untracked file under the repository.

## Step A2: Add the `keybindings` widget kind

In `packages/contracts/src/settings/registry.ts`, add one member to the
`SettingWidget` union (keep `'record'` — see out-of-scope):

```ts
export type SettingWidget =
  | 'boolean'
  | 'font'
  | 'number'
  | 'string'
  | 'multiline'
  | 'enum'
  | 'list'
  | 'record'
  | 'keybindings'
  | 'providers'
  | 'models'
  | 'complex'
```

In `packages/contracts/src/settings/keys.ts`, change **line 391 only**:

```diff
-    widget: 'record',
+    widget: 'keybindings',
```

Leave `merge: 'record'` on line 397 exactly as it is.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform/packages/contracts && bun run typecheck && bun run test
cd /Users/shaul/Desktop/D/platform && rg -n "widget: 'record'" packages/contracts/src/settings/keys.ts
```

→ typecheck exit 0, contracts tests pass, and the `rg` returns **no matches**.

## Step A3: Add the pure row helpers

Create `apps/web/src/features/settings/utils/keybinding-rows.ts`. Pure, no
React — that is what `utils/` is for.

```ts
import type { CommandKeyBindingRow } from '@/keymap/active-bindings'
import { platformCommandSpec } from '@/keymap/command-registry'
import type { PlatformCommandId } from '@/keymap/types'

/**
 * Rows whose command id, title or chord contains the query.
 *
 * The title is searched as well as the id because the id is exactly what the
 * user does not know — a list searchable only by id would reproduce the free
 * text box it replaces.
 */
export function matchingKeybindingRows(
  rows: readonly CommandKeyBindingRow[],
  query: string,
): readonly CommandKeyBindingRow[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return rows

  return rows.filter((row) => rowHaystack(row).includes(needle))
}

/**
 * How many other commands lost their chord to `command`.
 *
 * Read off `shadowedBy`, which the resolver computes with the pane rules
 * applied. A count taken by comparing chords directly would report a global
 * Mod+F and an editor-pane Mod+F as a conflict, and those are separate slots.
 */
export function commandsShadowedBy(
  rows: readonly CommandKeyBindingRow[],
  command: PlatformCommandId,
): number {
  return rows.filter((row) => row.shadowedBy === command).length
}

function rowHaystack(row: CommandKeyBindingRow): string {
  const title = platformCommandSpec(row.command)?.title ?? ''

  return `${row.command} ${title} ${row.keys ?? ''}`.toLowerCase()
}
```

**Verify**: `cd /Users/shaul/Desktop/D/platform/apps/web && bun run typecheck` →
exit 0.

## Step A4: Add the row component

Create `apps/web/src/features/settings/components/keybinding-row.tsx`. One
component per file; no local pure helpers.

```tsx
import { ArrowCounterClockwiseIcon, ProhibitIcon } from '@phosphor-icons/react'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

import type { CommandKeyBindingRow } from '@/keymap/active-bindings'
import { platformCommandSpec } from '@/keymap/command-registry'

import { useSettingsActions } from '../hooks/use-settings-actions'
import { ChordRecorder } from './widgets/chord-recorder'

export function KeybindingRow({
  binding,
  claimedFrom,
}: {
  binding: CommandKeyBindingRow
  /** How many other commands lost this chord to this one. */
  claimedFrom: number
}) {
  const { isSaving, resetKeybinding, setKeybinding } = useSettingsActions()
  // A command the registry carries no spec for falls back to its id, and
  // repeating the id underneath would print the same string twice.
  const spec = platformCommandSpec(binding.command)
  const title = spec?.title ?? binding.command

  return (
    <div className='border-border flex items-center gap-2 border-b px-3 py-2 last:border-b-0'>
      <div className='flex min-w-0 flex-1 flex-col'>
        <span className='text-foreground truncate text-sm'>{title}</span>
        {spec ? (
          <span className='text-muted-foreground truncate text-xs'>{binding.command}</span>
        ) : null}
        {binding.shadowedBy ? (
          // The chord is still shown beside this: together they read as "this
          // shortcut exists on paper and another command answers it".
          <span className='text-warning truncate text-xs'>
            Shadowed by {platformCommandSpec(binding.shadowedBy)?.title ?? binding.shadowedBy}
          </span>
        ) : null}
      </div>

      {binding.source === 'user' ? <Badge variant='secondary'>Custom</Badge> : null}

      <ChordRecorder
        conflictCount={claimedFrom}
        disabled={isSaving}
        id={binding.command}
        onChange={(next) => setKeybinding(binding.command, next)}
        value={binding.keys ?? ''}
      />

      {/* Unbind and Reset are different documents: `null` is "this command has
          no shortcut", an absent key is "use the default". One button cannot
          say both. */}
      <Button
        aria-label={`Unbind ${title}`}
        disabled={isSaving || binding.keys === null}
        onClick={() => setKeybinding(binding.command, null)}
        size='icon-sm'
        variant='ghost'
      >
        <ProhibitIcon />
      </Button>
      <Button
        aria-label={`Reset ${title}`}
        disabled={isSaving || binding.source !== 'user'}
        onClick={() => resetKeybinding(binding.command)}
        size='icon-sm'
        variant='ghost'
      >
        <ArrowCounterClockwiseIcon />
      </Button>
    </div>
  )
}
```

`ChordRecorder`'s existing contract, verified verbatim against
`apps/web/src/features/settings/components/widgets/chord-recorder.tsx:16-27`
(**do not change it** — adding a prop to it is out of scope, so if a prop you
want does not exist, drop the prop, not the rule):

```tsx
export function ChordRecorder({
  conflictCount, // number   → renders "N other commands use this" in text-warning
  disabled, // boolean?
  id, // string   → DOM id + aria-label `Record a shortcut for ${id}`
  onChange, // (next: string) => void
  value, // string   → '' renders as "Unassigned"
})
```

Passing `id={binding.command}` gives each row a unique DOM id and an
aria-label of `Record a shortcut for workspace.saveFile`, which is what the
tests key off.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun run typecheck
```

→ exit 0. (`apps/web/tsconfig.app.json` sets `noUnusedLocals`, so an unused
import in the new file is a hard error, not a warning.)

## Step A5: Add the section component

Create `apps/web/src/features/settings/components/keybinding-section.tsx`.
Mirrors `model-section.tsx`: reads its own value via `useSettingValue`, takes no
props, plain `overflow-y-auto` (**not** the `@workspace/ui` `ScrollArea` — it
throws in happy-dom because `getAnimations` is missing).

```tsx
import { Input } from '@workspace/ui/components/input'
import { useState } from 'react'

import { commandKeyBindings } from '@/keymap/active-bindings'
import { defaultPlatformKeyBindings } from '@/keymap/default-bindings'

import { useSettingValue } from '../hooks/use-setting-value'
import { commandsShadowedBy, matchingKeybindingRows } from '../utils/keybinding-rows'
import { EmptyRow } from './empty-row'
import { KeybindingRow } from './keybinding-row'

/**
 * Every bindable command, as the single control over `keybindings.overrides`.
 *
 * The rows are read back out of the *resolved* table rather than off the
 * override document, so the list says what is in force rather than what was
 * asked for — including a command whose chord another command's override took.
 * The search box is not optional at ~90 rows: without it the only way to reach
 * a command is to scroll a list sorted by nothing the user chose.
 */
export function KeybindingSection() {
  const overrides = useSettingValue('keybindings.overrides')
  const [query, setQuery] = useState('')
  const rows = commandKeyBindings(defaultPlatformKeyBindings(), overrides)
  const visible = matchingKeybindingRows(rows, query)

  return (
    <div className='flex w-96 flex-col gap-1'>
      <Input
        aria-label='Search keyboard shortcuts'
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder='Search commands'
        value={query}
      />
      <div className='border-border flex max-h-64 flex-col overflow-y-auto rounded-md border'>
        {visible.length === 0 ? <EmptyRow>No commands match this search.</EmptyRow> : null}
        {visible.map((row) => (
          <KeybindingRow
            binding={row}
            claimedFrom={commandsShadowedBy(rows, row.command)}
            key={row.command}
          />
        ))}
      </div>
    </div>
  )
}
```

Do **not** add `useMemo` around `commandKeyBindings(...)` — `AGENTS.md` forbids
memoization without a measured problem, and 90 rows of pure map work is not one.

**Verify**: `cd /Users/shaul/Desktop/D/platform/apps/web && bun run typecheck` →
exit 0.

## Step A6: Swap the branch in `setting-row.tsx` and delete `RecordWidget`

In `apps/web/src/features/settings/components/setting-row.tsx`:

1. Replace the whole `record` branch with:

```tsx
// Every bindable command by name. The generic record editor this replaces
// required the user to type a raw command id before it would show a recorder.
if (descriptor.widget === 'keybindings') {
  return <KeybindingSection />
}
```

2. Replace the `RecordWidget` import with `KeybindingSection`:

```diff
-import { RecordWidget } from './widgets/record-widget'
+import { KeybindingSection } from './keybinding-section'
```

Keep the import block sorted the way `oxfmt` wants it; run `bun run format` if
`format:check` complains.

3. Delete both files (they now have zero consumers — greenfield, no shims):

```bash
cd /Users/shaul/Desktop/D/platform
rm apps/web/src/features/settings/components/widgets/record-widget.tsx
rm apps/web/src/features/settings/tests/record-widget.test.tsx
```

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform
rg -n "RecordWidget|record-widget" apps packages   # → no matches
cd apps/web && bun run typecheck                   # → exit 0
```

If `rg` still finds a reference, **STOP** — something outside this plan's
inventory imports it.

**Verify the negative too** — the branch swap sits in the middle of the
`descriptor.widget` chain that every _other_ setting's control is dispatched
from, so prove the ones you did not touch still render:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run --project dom src/features/settings/tests/page.test.tsx
```

→ all pass. That file renders the whole settings page and asserts a boolean
switch, a reset, and the search; a broken `if` chain fails it.

## Step A7: Verify in the running app

The dev server is already running at **http://localhost:5173**. Do not start one.

1. Open the app, open Settings (⌘, / Ctrl+, or the command palette → "Settings").
2. Search the settings page for `shortcut`. Expect the **Keyboard shortcuts**
   category with one row titled from the registry and the id
   `keybindings.overrides` beside it.
3. The control is a search box over a bordered, scrollable list. Expect ~90 rows
   (93 on macOS). Each shows a human title, the dotted id underneath, a chord
   button, a "no entry" icon button and a counter-clockwise arrow icon button.
4. Type `save` in the section's search box → the list narrows to the Save
   commands.
5. Click the chord button on **Save** → it reads `Press a shortcut…`. Press
   `Mod+Alt+J`. The button should settle showing `Mod+Alt+J` and a `Custom`
   badge should appear on that row.
6. Confirm it reached the file. The document stores flat, dotted setting ids at
   the top level, so quote the key:
   ```bash
   jq '."keybindings.overrides"' ~/.platform/settings.json
   ```
   → prints an object containing `"workspace.saveFile": "Mod+Alt+J"`.
7. Click the counter-clockwise **Reset** button on that row → the badge
   disappears, the chord returns to `Mod+S`, and the same `jq` prints `null`
   (the whole key is gone from the file, because `saveCollection` drops a key
   whose value is back at the registry default `{}`). Seeing
   `{"workspace.saveFile": null}` instead means Reset wrote an unbind — that is
   the exact bug this row's two-button split exists to prevent, so **STOP**.
8. Now rebind **Save** to `Mod+B` (the default for **Toggle Files pane**).
   Search `files pane` → that row should now show `Shadowed by Save` in warning
   colour, and the Save row's chord button should show
   `1 other command uses this`.
9. Reset it again → `jq '."keybindings.overrides"' ~/.platform/settings.json`
   prints `null` again.

**Verify**: every numbered expectation above observed. If step 5's chord does
not persist across a page reload, **STOP** — the write path is not reaching the
server and that is out of this plan's scope to debug blind (check
`logs/$(date +%F).jsonl` for a `settings` write event first).

## Step A8: Tests, then the full gate

See "Test plan" below, then:

```bash
cd /Users/shaul/Desktop/D/platform && bun run settings:reference
git diff --stat docs/settings-reference.md
```

→ **no new change** to `docs/settings-reference.md`; the generated table has no
`widget` column, so a widget swap produces no diff. (If the file was already
dirty before you started, compare against that baseline, not against `HEAD`.)

```bash
cd /Users/shaul/Desktop/D/platform && bun run verify
```

→ exit 0.

---

# OPTION B — delete it

Run this branch **only** if the operator explicitly chose it.

## Step B1: Collapse the resolution in `active-bindings.ts`

`resolvedPlatformKeyBindings` is the only production caller of
`keyBindingResolution`, and it discards `shadowedBy`. With
`commandKeyBindings` gone, the whole two-field resolution shape goes with it.

**Delete** from `apps/web/src/keymap/active-bindings.ts`:

| Symbol                                                                         | Lines at `ace313f` |
| ------------------------------------------------------------------------------ | ------------------ |
| `KeyBindingResolution` type                                                    | 32–36              |
| `CommandKeyBindingRow` type + doc                                              | 38–42              |
| `NO_SHADOWED_COMMANDS`                                                         | 47                 |
| `commandKeyBindings` + doc                                                     | 109–140            |
| `keyBindingResolution`                                                         | 161–176            |
| `recordShadowedCommand`                                                        | 233–244            |
| `commandKeyBindingRow`                                                         | 355–386            |
| `liveBindingsByCommand`                                                        | 388–399            |
| `firstKeys`                                                                    | 401–405            |
| `defaultKeysByCommand`                                                         | 407–419            |
| the `CommandKeyBinding` member of the `import type { … } from './types'` block | 17                 |
| the `KeyBindingSource` member of that same import block                        | 19                 |

`KeyBindingSource` is easy to miss: its only use in this file is inside
`commandKeyBindingRow` (`:372`), which you are deleting. `apps/web/tsconfig.app.json`
sets `noUnusedLocals`, so leaving it in is a typecheck **error**, not a warning.
It stays exported from `types.ts` — `PlatformKeyBinding.source` (`types.ts:79`)
still uses it.

**Rewrite** `resolvedPlatformKeyBindings` to absorb the old
`keyBindingResolution` body (keep its doc comment exactly as it is):

```ts
export function resolvedPlatformKeyBindings(
  defaults: readonly PlatformKeyBinding[],
  overrides: KeybindingOverrides,
  platform: PlatformName = detectPlatform(),
): readonly PlatformKeyBinding[] {
  const entries = appliedOverrides(overrides, defaults)
  if (entries.length === 0) return defaults

  const overridden = new Set(entries.map(([command]) => command))
  const kept = defaults.filter((binding) => !binding.command || !overridden.has(binding.command))
  const bound = entries.flatMap(([command, keys]) =>
    userKeyBinding(defaults, command, keys, platform),
  )

  return liveKeyBindings(kept, bound)
}
```

**Rewrite** `liveKeyBindings` to return the array directly (keep its long
collision-policy doc comment verbatim — it documents live behaviour):

```ts
function liveKeyBindings(
  kept: readonly PlatformKeyBinding[],
  bound: readonly PlatformKeyBinding[],
): readonly PlatformKeyBinding[] {
  const bindings: PlatformKeyBinding[] = []

  for (const binding of kept) {
    if (bindingClaimingKey(bound, binding)) continue

    bindings.push(binding)
  }

  for (const [index, binding] of bound.entries()) {
    if (bindingClaimingKey(bound.slice(index + 1), binding)) continue

    bindings.push(binding)
  }

  return bindings
}
```

Note the inverted conditions with `continue` — required by the control-flow
rules quoted above.

`bindingClaimingKey`, `collidesWith`, `appliedOverrides`, `knownCommands`,
`isPlatformCommandId`, `userKeyBinding`, `rawHotkey`, `isBindableHotkey`,
`normalizedHotkey` all **stay**.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun run typecheck
```

→ it will report errors in `keymap.test.ts` (the `commandKeyBindings` import).
That is expected; Step B4 fixes it. Every **other** error is a STOP condition.

## Step B2: Delete `CommandKeyBinding`

Remove `apps/web/src/keymap/types.ts:107-114` (the type and its doc comment).
Nothing else in that file references it.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform
rg -n "CommandKeyBinding" apps packages   # → no matches
```

## Step B3: Delete the settings actions and their patch helpers

In `apps/web/src/features/settings/hooks/use-settings-actions.ts`, delete the
`resetKeybinding` and `setKeybinding` entries **and** their now-unused imports:

- `withKeybindingOverride` and `withoutKeybindingOverride` from `'../utils/patch'`
- `import type { PlatformCommandId } from '@/keymap/types'`

In `apps/web/src/features/settings/utils/patch.ts`, delete
`withKeybindingOverride` (`:48-54`) and `withoutKeybindingOverride` (`:56-65`),
including the doc comment on the second one, **and** the now-unused
`type KeybindingOverrides` member of the `from '@workspace/contracts'` import at
`:3` — those two functions are its only users in this file, and `noUnusedLocals`
makes leaving it a typecheck error. `withProviderEnabled`, `withModelHidden` and
`withMovedModel` stay.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform
rg -n "KeybindingOverride|setKeybinding|resetKeybinding" apps packages
```

→ the only remaining hits are the `KeybindingOverrides` **type**: its definition
and re-export in `packages/contracts` (`settings.ts:108`, `index.ts:479`), plus
three in `active-bindings.ts` — the import and the signatures of
`resolvedPlatformKeyBindings` and `appliedOverrides` (down from five, since
`commandKeyBindings` and `keyBindingResolution` are gone). **No hit in
`patch.ts` or `use-settings-actions.ts`.** Then:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun run typecheck
```

→ only the `keymap.test.ts` errors remain.

## Step B4: Delete the test block

In `apps/web/src/keymap/tests/keymap.test.ts`:

- Remove `commandKeyBindings,` from the import at line 7.
- Delete the entire `describe('commandKeyBindings', …)` block, lines **231–337**
  (six `it` cases: "reports the default binding until the user overrides it",
  "shows the override in force beside the defaults it replaced", "lists a command
  that only the user has bound", "reports an unbind as no keys at all", "names
  the command that took the key instead of calling a dead binding live", "marks
  the losing override when two of them name the same key", "leaves a command
  alone when only one of its two defaults is taken").

Do not adapt them to `resolvedPlatformKeyBindings` — `AGENTS.md`: "Delete
obsolete tests instead of preserving old behavior." The remaining ~700 lines
already cover the resolution path from the outside.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run --project node src/keymap/tests/keymap.test.ts
```

→ all pass, and the run reports **fewer** tests than before by exactly 7.

## Step B5: Full gate

```bash
cd /Users/shaul/Desktop/D/platform && bun run verify
```

→ exit 0.

Then confirm the app still honours overrides — this is the one behaviour Option
B could silently break. With the dev server at **http://localhost:5173**:

1. Add a **top-level** `"keybindings.overrides"` member to
   `~/.platform/settings.json` (the document is flat, dotted setting ids — it is
   not nested under a `keybindings` object), so the file reads e.g.:
   ```json
   {
     "editor.fontFamily": "GeistMono",
     "keybindings.overrides": { "workspace.saveFile": "Mod+Alt+J" }
   }
   ```
   Keep whatever keys were already there. Save the file — the server watches it,
   so no restart.
2. In the app, press `Mod+Alt+J` in an editor with unsaved changes → the file
   saves.
3. Press `Mod+S` → nothing happens (the default was replaced, not added to).
4. Remove the `"keybindings.overrides"` member again → `Mod+S` saves. This is
   the restore step: do not leave the operator's settings file modified.

**Verify**: all four observations hold.

---

## Test plan

### Option A

Two new files, with **different import discipline** — do not copy one into the
other:

- the `utils/tests/*.test.ts` file touches no server and no DOM, so it imports
  `{ describe, expect, it }` from `'vitest'`, exactly like
  `apps/web/src/keymap/tests/keymap.test.ts:1` and
  `apps/web/src/features/settings/utils/tests/humanize.test.ts`.
- the `tests/*.test.tsx` file renders a component that reads settings off the
  real in-process server, so it imports `{ expect, test }` from
  `apps/web/test/fixtures.ts` — `AGENTS.md`: "Import `{ test, expect }` from
  `apps/web/test/fixtures.ts`, not from `vitest`, for app tests."

Do **not** use `mock.module` or `vi.mock` on any of our own modules.

**`apps/web/src/features/settings/utils/tests/keybinding-rows.test.ts`** (picked
up by the `node` project, whose include is `src/**/*.test.ts`), driving the
**real** `commandKeyBindings` output so the helpers are tested against real data,
not a fixture. Pin the platform — `commandKeyBindings(defaultPlatformKeyBindings('linux'), {}, 'linux')` —
so the assertions do not depend on the machine running them:

1. `matchingKeybindingRows(rows, '')` returns the same array identity/length as
   `rows` (an empty query is not a filter).
2. `matchingKeybindingRows(rows, 'save')` returns exactly one row, and it is
   `workspace.saveFile`.
3. **A title-only match** — the case an id-only search would miss, which is the
   whole reason the title is in the haystack:
   `matchingKeybindingRows(rows, 'files pane')` returns exactly one row,
   `workspace.toggleSidebarVisibility`. Its title is "Toggle Files pane" and
   neither word appears in its id, so this fails if the title is dropped from
   `rowHaystack`. (Do **not** use `'quick open'` for this — it matches
   `workspace.showQuickAccess`, not `workspace.quickOpenView`, whose title is
   "Open view".)
4. `matchingKeybindingRows(rows, 'Mod+S')` contains `workspace.saveFile` — chord
   search. (It returns 15 rows; assert containment, not the count.)
5. `matchingKeybindingRows(rows, 'zzznope')` returns `[]`.
6. `commandsShadowedBy` counts the shadow: build rows with
   `commandKeyBindings(defaultPlatformKeyBindings('linux'), { 'workspace.saveFile': 'Mod+B' }, 'linux')`
   and assert `commandsShadowedBy(rows, 'workspace.saveFile') === 1` (it took
   `Mod+B` from `workspace.toggleSidebarVisibility`) **and the negative**,
   `commandsShadowedBy(rows, 'workspace.togglePanel') === 0` — a helper that
   counted chord equality instead of reading `shadowedBy` would over-report here.

**`apps/web/src/features/settings/tests/keybinding-section.test.tsx`** (picked up
by the `dom` project, whose include is `src/**/*.test.tsx`). Render
`<KeybindingSection />` with `renderWithProviders` from
`apps/web/test/render.tsx` (imported as `'../../../../test/render'`, the path
`page.test.tsx` uses) and take `{ expect, test }` from
`'../../../../test/fixtures'`. Destructure the `client` fixture in each test —
that is what points `getClient()` at the in-process server:

1. **Lists commands by title, not by id.** After render, a row labelled with the
   registry title for `workspace.saveFile` ("Save") is present, and its chord
   button is reachable by `getByRole('button', { name: 'Record a shortcut for workspace.saveFile' })`.
   This is the regression the whole plan exists to fix — assert it explicitly.
2. **The search box narrows the list.** Type `sidebar` into
   `getByLabelText('Search keyboard shortcuts')`, then assert
   `queryByRole('button', { name: 'Record a shortcut for workspace.saveFile' })`
   is `null` and the Toggle Files pane row is still there. (`sidebar` matches
   exactly one of the 90 rows — see "Measured facts".)
3. **Empty search result says so.** Type `zzznope` → the text
   `No commands match this search.` is present.
4. **An untouched row offers nothing to undo** — the negative of (5). Before any
   interaction, `getByRole('button', { name: 'Reset Save' })` is disabled and no
   `Custom` badge is rendered, because `binding.source` is `'default'`. Without
   this, a Reset button wired to always-enabled would still pass (5).
5. **Recording a chord writes the override through, and Reset takes it back
   out.** One test, two acts, because Reset is only enabled once the row is
   `source: 'user'`:
   - click the Save row's chord button, then `fireEvent.keyDown` on it with
     `{ altKey: true, key: 'j', metaKey: true }` (the pattern
     `chord-recorder.test.tsx` uses);
   - `await waitFor` on `fetchSettings()` and assert
     `snapshot.values['keybindings.overrides']['workspace.saveFile']` is
     `'Mod+Alt+J'`;
   - then click `getByRole('button', { name: 'Reset Save' })` and `waitFor` a
     snapshot whose `values['keybindings.overrides']` does **not** have the
     `workspace.saveFile` property. (`saveCollection` sends no value once the
     record is back at the registry default `{}`, so the key leaves the user
     file entirely.)
     This pair is what `withoutKeybindingOverride`'s doc comment exists to protect.
6. **Unbind writes `null`, not an absent key.** Click
   `getByRole('button', { name: 'Unbind Save' })` and `waitFor`
   `snapshot.values['keybindings.overrides']['workspace.saveFile']` to be
   exactly `null` (`toBeNull()`, not `toBeFalsy()` — an absent key is falsy too
   and is the _other_ document). (5) and (6) are the pair that must never
   collapse into one button.

Rendering ~90 rows per test is not free. If a case trips Vitest's 5 s default,
raise `testTimeout` for the `dom` project rather than trimming assertions —
cold-start timeouts are a known trap in this repo.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run --project node --project dom
```

→ all pass, including the 6 new node cases and 6 new dom cases, and **4 fewer**
tests from the deleted `record-widget.test.tsx` (it had exactly 4).

### Option B

**No new tests.** Option B is a pure deletion plus a behaviour-preserving
inlining of `keyBindingResolution` into its only caller. The existing suite is
the gate:

- `apps/web/src/keymap/tests/keymap.test.ts` (minus the 7 deleted cases) already
  asserts `resolvedPlatformKeyBindings` from the outside — override replacement,
  unbind, collision dropping, the no-op reservations, per-pane arbitration.
- `apps/web/src/keymap/tests/use-app-keymap.test.tsx` and
  `session-commands.test.ts` cover the wiring above it.
- `apps/web/src/features/settings/tests/page.test.tsx` covers the settings write
  path that `patch.ts` sits on.

Writing new tests for deleted code would be padding. The Step B5 manual check is
the behavioural gate for the inlining.

## Done criteria

### Option A — ALL must hold

- [ ] `cd /Users/shaul/Desktop/D/platform && bun run typecheck` exits 0
- [ ] `cd /Users/shaul/Desktop/D/platform && bun run lint` exits 0
- [ ] `cd /Users/shaul/Desktop/D/platform && bun run format:check` exits 0
- [ ] `cd /Users/shaul/Desktop/D/platform && bun run test` exits 0
- [ ] `rg -n "RecordWidget|record-widget" apps packages` → no matches
- [ ] `rg -n "widget: 'record'" packages/contracts/src/settings/keys.ts` → no matches
- [ ] `rg -n "merge: 'record'" packages/contracts/src/settings/keys.ts` → **one** match (line ~397, unchanged)
- [ ] `rg -n "commandKeyBindings" apps/web/src` shows a **production** importer
      (`keybinding-section.tsx`) in addition to the test file
- [ ] All five files marked `(create)` in "Option A — in scope" exist
      (`keybinding-section.tsx`, `keybinding-row.tsx`, `utils/keybinding-rows.ts`,
      `tests/keybinding-section.test.tsx`, `utils/tests/keybinding-rows.test.ts`);
      `record-widget.tsx` and `record-widget.test.tsx` do not
- [ ] `apps/web/src/features/settings/components/widgets/chord-recorder.tsx` is
      byte-identical to its state before this plan (`git diff -- apps/web/src/features/settings/components/widgets/chord-recorder.tsx`
      → empty)
- [ ] `apps/web/src/features/settings/tests/page.test.tsx` passes — the branch
      swap did not break the other widgets' dispatch
- [ ] `bun run settings:reference` produces no new diff in `docs/settings-reference.md`
- [ ] Step A7's nine in-app observations all hold
- [ ] No files outside the Option A in-scope list are modified (`git status`)
- [ ] `plans/README.md` row for 042 updated to DONE with "(wired)"

### Option B — ALL must hold

- [ ] `cd /Users/shaul/Desktop/D/platform && bun run verify` exits 0
- [ ] `rg -n "commandKeyBindings|CommandKeyBindingRow|CommandKeyBinding|shadowedBy|recordShadowedCommand|withKeybindingOverride|withoutKeybindingOverride|setKeybinding|resetKeybinding" apps packages` → **no matches**
- [ ] `rg -n "isBindableHotkey|normalizedHotkey" apps/web/src` → still **6** hits
      (3 in `chord-recorder.tsx` — lines 4, 55, 57 — and 3 in
      `active-bindings.ts` — the two definitions plus the use in
      `appliedOverrides`)
- [ ] `rg -n "KeyBindingSource" apps/web/src` → exactly 2 hits, both in
      `types.ts` (the definition at `:6` and `PlatformKeyBinding.source` at
      `:79`); **none** in `active-bindings.ts` — it was 5 before
- [ ] `keymap.test.ts` reports exactly 7 fewer tests than before
- [ ] Step B5's four in-app observations all hold
- [ ] No files outside the Option B in-scope list are modified (`git status`)
- [ ] `plans/README.md` row for 042 updated to DONE with "(deleted)"

## STOP conditions

Stop and report back (do not improvise) if:

- **Step 0 has no answer.** The wire/delete choice is the operator's. Do not
  default to either.
- **The Step A1 probe reports `untitled= 13`** (plan 029 has not landed). Report
  the number and let the operator decide whether 13 raw-id rows are acceptable
  for now.
- **The Step A1 probe errors because `commandKeyBindings` does not exist.**
  Option B already ran; there is nothing to wire.
- **Any code at the "Current state" line references does not match the excerpt.**
  Plan 029 rewrites `apps/web/src/keymap/` and is a dependency, so _some_ drift
  is expected — but 029 explicitly promises to leave `CommandKeyBinding` and the
  `active-bindings.ts` resolution API alone. If `commandKeyBindings`'s signature
  or `CommandKeyBindingRow`'s shape changed, stop.
- **You find a production importer of `RecordWidget` other than
  `setting-row.tsx`** (Option A step A6), or a second setting whose descriptor
  has `widget: 'record'`. The plan's premise ("keybindings is the only record
  setting") is then false.
- **Option B's Step B1 typecheck reports errors outside `keymap.test.ts`.**
  Something reaches the resolution shape that this plan did not inventory.
- **`keymap.test.ts` fails after Option B's rewrite of `liveKeyBindings`.** That
  file guards the live keymap; a failure there means the inlining changed
  behaviour. Revert `active-bindings.ts` and report.
- **Step A7 step 5's chord does not survive a page reload.** Check
  `logs/$(date +%F).jsonl` for a settings write event first; if none appears, the
  write path is broken independently of this plan.
- **Step A7 step 7: Reset leaves `{"workspace.saveFile": null}` in the file
  instead of removing the key.** Reset and Unbind have collapsed into one
  document. That is the single defect this row's two-button design exists to
  prevent — stop rather than "simplifying" it away.
- **Option A tempts you into `command-registry.ts` or `types.ts`.** If you find
  yourself about to add a `CommandSpec` so a row stops showing a raw id, or to
  widen a keymap type so a prop fits, stop: that is plan 029's work, and Step A1
  already handed the operator that decision.
- **`ChordRecorder` seems to need a new prop.** It does not — its five props are
  quoted in Step A4 and the file is out of scope for both options. Drop the prop
  from your call site instead, and if the row genuinely cannot be built without
  it, stop and report.
- **The dev server is not answering on http://localhost:5173** for Step A7 / B5.
  Do **not** start one (`AGENTS.md` forbids it). Report that the in-app checks
  could not run.
- **`bun run verify` fails inside `packages/editor-*` or any package this plan
  never touched.** Those are symlinks to a sibling checkout with independent
  work in progress. Report the failure; do not fix it and do not count it as
  yours.
- **Any verification fails twice after a reasonable fix attempt.**
- **The fix appears to require touching a file on the out-of-scope list.**

## Maintenance notes

For whoever owns this next:

- **What a reviewer should scrutinise (Option A):** the Unbind/Reset split. They
  write _different documents_ — `setKeybinding(cmd, null)` stores an explicit
  `null` meaning "this command has no shortcut"; `resetKeybinding(cmd)` removes
  the key entirely, meaning "use whatever the build ships". Collapsing them into
  one button, or making Reset write `null`, silently turns "stop overriding this"
  into "this command now has no shortcut". `withoutKeybindingOverride`'s doc
  comment and `record-widget.tsx`'s header comment both existed to defend this
  distinction; after Option A only the former remains, so the two tests in the
  test plan (cases 5 and 6) are the guard.
- **Scope tab inconsistency, deliberately not fixed.** `keybindings.overrides`
  is `application`-scoped, so only the user layer can carry it, but
  `setKeybinding`/`resetKeybinding` hardcode `target: 'user'` while every other
  control routes the page's current scope through `setSetting(id, next, scope)`.
  On the Workspace tab the row shows a disabled reason but the section's buttons
  still write to the user file. `ModelSection` has exactly the same shape for
  `models.hidden`/`models.order`. Fixing one without the other would make them
  inconsistent; fixing both is its own change. Left alone on purpose.
- **`<label htmlFor='keybindings.overrides'>` in `setting-row.tsx` now points at
  nothing** after Option A, because the section renders no element with that id.
  Same pre-existing situation as `models.hidden` → `ModelSection`. If someone
  fixes it, fix both.
- **Plan 026 (`Bind SettingWidget to its schema type`) will see `'keybindings'`
  instead of `'record'`** in the union. It should map to the same
  `keybindingOverridesSchema` the `record` widget did. `'record'` stays in the
  union for `packages/contracts/src/tests/settings-resolve.test.ts:43`'s fixture
  registry; 026 can decide whether to keep it.
- **Plan 029's parity script imports `commandKeyBindings`.** If Option B is
  chosen, that `/tmp` script stops working. 029 is a dependency of this plan so
  the ordering is safe, but do not re-run 029's before/after comparison after
  042-delete lands.
- **Documentation drift, deliberately deferred.**
  `docs/settings-registry-inventory.md:37`,
  `docs/settings-architecture-plan.md:58,1188`,
  `docs/t3code-parity-second-sweep.md:79,164,294` and
  `docs/t3code-chat-parity-gap-analysis.md:278` all still cite
  `features/settings/components/keybinding-section.tsx`, which was deleted in
  `689c210`. Option A makes those references correct again by accident (same
  path, same name). Option B makes them permanently wrong and should be followed
  by a docs pass — out of scope here because those documents are historical
  planning records, not live specs.
- **After Option A, the next obvious step is a keyboard-shortcuts _editor tab_**
  rather than a 96px-wide control inside a settings row. Ninety rows in a
  `max-h-64` scroller is a working answer, not a good one. That is a separate,
  larger piece of work and should not be smuggled into this plan.
