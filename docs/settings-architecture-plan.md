> [!IMPORTANT]
> **STATUS: ✅ SHIPPED — all eight phases complete.** Written 2026-08-12 @ `26cc58c`; open questions resolved,
> rebased onto `fda1523`, and the key inventory verified against it on 2026-08-13.
> Design plan, not yet executed.
>
> Scope is **full parity** — ~213 registry keys, ~55 of them user-visible. The
> verified per-key table is in
> [settings-registry-inventory.md](settings-registry-inventory.md).
>
> Start with [For the executor](#for-the-executor-read-in-this-order).
> [Drift](#drift-what-main-landed-first) lists what M-B already shipped (Phase 0 is
> done); [Resolved](#resolved-2026-08-12) lists the five settled decisions.

## For the executor: read in this order

This document is long because the traps are the valuable part. If you are
implementing it, read these five sections before writing any code — together they
are about 15 minutes and they cover everything that will otherwise bite you:

1. [Drift](#drift-what-main-landed-first) — what main already shipped. **Phase 0 is
   done.** Do not rebuild it.
2. [Test isolation](#test-isolation--read-this-before-writing-any-file-code) — 15
   `createApp` call sites. Get this wrong and a test run destroys the developer's
   real settings, with no healing code by policy.
3. [Secrets](#secrets) — the split must land _before_ the first settings file is
   written, or it becomes a migration.
4. [The JSON adapter](#the-json-adapter) — never write a re-serialized parse result;
   empty file means `{}`; clear the echo hash on every applied reload.
5. [Phases](#phases) — start at Phase 1.

### Two different reload questions, often confused

- **A settings _value_ changed** — someone edited `settings.json`, or another
  window saved. The file watcher picks it up and the SSE stream pushes it; no
  reload of anything. This is what the store is for, and it is verified live.
- **The _registry_ changed** — a key was added, or its schema or default moved.
  That is compiled code, not file content, so no file watcher can help: the
  registry is not in `settings.json`. The server process has to reload.

The second is not a problem in practice — `apps/server`'s dev script is
`bun --watch src/index.ts`, so the server restarts itself on any code change. It
only bites when the server is launched by hand without `--watch`, which is worth
knowing before mistaking it for a product limitation.

Then use [Registry payload](#registry-payload) as the working checklist, and
[settings-registry-inventory.md](settings-registry-inventory.md) as the per-key
source. **Apply the four corrections in Registry payload before typing `keys.ts`** —
the inventory is raw material, not a shipping list.

## Drift: what main landed first

Between writing and rebasing, `main` shipped four M-B commits that overtake parts of
this plan. Verified against `fda1523`:

| Commit                                                              | Effect on this plan                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fed42fd` the provider registry finally reads the settings document | **Phase 0 is DONE.** [app.ts:69-77](apps/server/src/app.ts:69) constructs `SettingsService`, builds the registry from `settings.read().providerInstances`, and re-reconciles on `settings.onChange`. `provider-adapter-registry.ts:414` now merges saved instances over the defaults. |
| `91d22d4` editor commands are rebindable                            | **The "editor commands stay unrebindable" deferral is DONE.** The filter is gone from `keybinding-section.tsx` and `AppRuntimeContent` resolves overrides _before_ building the editor layers.                                                                                        |
| `920af78` provider secrets stop leaving the process                 | Adds `REDACTED_SETTINGS_VALUE` and [redaction.ts](apps/server/src/settings/utils/redaction.ts). **Rewrites the [Secrets](#secrets) section — and creates a new conflict with the file store.**                                                                                        |
| `fda1523` providers section lists what is actually running          | Adds `features/settings/utils/provider-rows.ts`. Phase 7's Providers table is partly built.                                                                                                                                                                                           |

**Still true, verified at `fda1523`:** `app_settings` is still SQLite
([schema.ts:318](apps/server/src/db/schema.ts:318)) and migrations are still at v7,
so the v8 drop stands. `notifySaveError` is **still dead** —
[notify-save-error.ts:17](apps/web/src/features/settings/notify-save-error.ts:17)
still returns on `unknown` and the taxonomy still only maps `FsErrorCode`s. `models`
is still unconsumed by the picker. Everything about the registry, the layer model,
the JSON adapter, the page, and the phases from 1 onward is unaffected.

# Settings: typed registry, layered JSON store, and a settings page

This plan replaces the three-section SQLite settings document with a VS Code-shaped
settings system: a typed registry of flat dotted keys, a small layered resolver,
a JSON file per layer that is the source of truth in both directions, and a real
settings page mounted as a workbench tab.

References studied: `references/vscode/src/vs/platform/configuration/**`,
`references/vscode/src/vs/workbench/contrib/preferences/**`,
`references/t3code/apps/{web,desktop,server}` + `references/t3code/packages/contracts`.

## The load-bearing fact — now resolved

_Superseded by `fed42fd`. Kept because it explains the phase ordering._

When this plan was written, **nothing a user saved reached anything**:
`reconcile()`'s only non-test caller passed the hardcoded
`DEFAULT_PROVIDER_INSTANCES`, `models` was never read by the picker, and only
`keybindings` had a live consumer. The settings system had never been falsified by
a real consumer, so every architecture argument here rested on an untested
assumption.

`fed42fd` closed that: providers now hydrate from the document at boot and
re-reconcile on change. **Phase 0 is done — skip it.** The principle it encoded
still governs the rest: _a key is never registered inert._ Each batch in Phases 3–7
lands with its consumer wired and a test proving a saved value changes observable
behaviour. `models` is still the outstanding case (Phase 7).

## The sketch, and what survived contact with the code

The proposed stack was:

```
Settings API → Typed schema / registry → Settings store
                                          ├── User settings
                                          ├── Workspace settings
                                          ├── Folder settings
                                          └── Policy / defaults
                                               → JSON adapter
```

| Element                 | Verdict                     | Why                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings API            | **KEEP**                    | Becomes `GET /settings`, `POST /settings/write`, `GET /settings/events`, `GET/POST /settings/raw`.                                                                                                                                                                                                                                |
| Typed schema / registry | **KEEP**, as a static table | Flat dotted keys with per-entry descriptors. No runtime registration — there is no extension host.                                                                                                                                                                                                                                |
| User layer              | **KEEP**                    | `~/.platform/settings.json`.                                                                                                                                                                                                                                                                                                      |
| Workspace layer         | **KEEP**                    | `<root>/.platform/settings.json`. Scope-filtered, treated as hostile input.                                                                                                                                                                                                                                                       |
| Folder layer            | **DROP**                    | Undefined in our model. [editor-workspace-state.tsx:34](apps/web/src/features/editor/state/editor-workspace-state.tsx:34) is `rootFolder: PickedFsEntry \| null` — one root at a time, switched wholesale. With N=1, folder ≡ workspace, so the two layers can never disagree and the precedence rule between them is untestable. |
| Policy layer            | **KEEP**, re-justified      | Not for MDM (zero principals). It is the test/CI pinning lever (`PLATFORM_SETTINGS_POLICY`) and the "managed, read-only" affordance the page needs anyway.                                                                                                                                                                        |
| Defaults                | **KEEP**, not as a layer    | Defaults are `descriptor.default`, resolved by the registry, never written to disk.                                                                                                                                                                                                                                               |
| JSON adapter            | **KEEP**                    | With `jsonc-parser`'s `modify`/`applyEdits`.                                                                                                                                                                                                                                                                                      |

Net: **two file layers plus a policy post-pass over registry defaults.** The
"merge engine" is one loop over an ordered array — which is the point. Dropping
folder does not lose a capability; it deletes a code path nobody could test.

### Storage: the file is the truth, SQLite is dropped

`app_settings` ([schema.ts:318](apps/server/src/db/schema.ts:318)) goes away in
migration v8. Three reasons, in order of strength:

1. **`apps/desktop` is a second process that must read settings before the server
   is healthy.** [index.ts:132-155](apps/desktop/src/bun/index.ts:132) hardcodes
   the window frame and vibrancy, `DesktopRPC` has exactly one handler
   (`pickEntry`), and the shell has no HTTP client at all. A file is the only
   thing both processes can read. This is the argument that settles it — no
   amount of SQLite ergonomics gets the shell a window size.
2. **This is an agentic coding tool.** `cat ~/.platform/settings.json` is worth
   more here than in a normal GUI app.
3. **The greenfield rule wants it.** AGENTS.md says "delete the bad state, or
   tell the user what to delete". "Delete this file" is a one-line instruction;
   "delete this SQLite row" is not.

SQLite keeps what it is good at — the event log and projections. It should never
have held user-authored config; `app_settings` is the only key-value table in an
otherwise event-sourced database.

Explicitly rejected: **file as truth + SQLite as mirror.** It is the one option
that costs the file-watching complexity _and_ adds a reconciler, for zero
user-visible gain.

## Precedence

```
registry defaults
  → user      (~/.platform/settings.json)          all scopes
  → workspace (<root>/.platform/settings.json)     window | resource only
  → policy    (PLATFORM_SETTINGS_POLICY, applied as a post-pass)
```

Merge is **last-wins per key**, with one opt-in exception:
`keybindings.overrides` declares `merge: 'record'` so a workspace can add a
binding without erasing the user's.

Scope is a string union — `application | machine | window | resource` — enforced
**exactly once**, as a per-layer parse filter. `filterByScope(raw, allowedScopes)`
is the whole enforcement story. A key the workspace file may not set is dropped
from that layer and surfaced in the UI as "this setting cannot be applied here".

**Scope is a security boundary, not a convenience.** A cloned repo's
`.platform/settings.json` is attacker-controlled input — and note `.platform` is
in neither `.gitignore` nor `defaultIgnoredNames` ([fs/path.ts:5-16](apps/server/src/fs/path.ts:5)),
so a checked-in workspace settings file is a realistic vector. Standing rule,
enforced by a registry test over a `SERVER_CONSUMED_SETTINGS` list:

> A value that reaches **execution** — selects the binary, sets env, becomes a flag
> name, or binds a key — is `application` or `machine` scope. Never `window`.
>
> A value that reaches only **suppression** — lands as a data operand after a fixed
> flag, on a fixed binary, spawned with no shell, and can at worst hide results — may
> be `window`, but **must** carry the "also modified in `<scope>`" indicator.

The execution side covers `providers.instances` (`binaryPath`, `environment`),
`terminal.integrated.defaultProfile`/`shellArgs`/`env`, `lsp.servers`,
`chat.defaultRuntimeMode`, and `keybindings.overrides` (which can invoke arbitrary
app commands). The suppression side is `search.include`/`exclude`/`caseSensitive`/
`wholeWord`/`defaultMatchMode` — they become `rg` argv, but only ever as operands
after a fixed flag.

The two-part form is deliberate: the unqualified rule would have killed per-project
search excludes, which are the single most legitimate use of a workspace settings
file. See [Registry payload](#registry-payload) for the verification behind the split,
and why the indicator is load-bearing rather than cosmetic in an agentic tool.

## The registry

Lives in **`packages/contracts/src/settings/`**, not a new `packages/settings`.
Root [package.json:5-11](package.json:5) declares `workspaces.packages` as an
explicit list, not a glob — a new package needs a root manifest edit plus a
`bun install`, and this repo's own `//ci-link-todo` note calls that install
fragile. Extraction later is a mechanical move.

The typing idiom is a **per-entry generic**, which was verified against real
valibot 1.4.1 with `tsgo`: it compiles, preserves narrow per-key types through
`descriptorFor`, and **rejects a mistyped default at compile time**.

```ts
// packages/contracts/src/settings/registry.ts
export function defineSetting<TSchema extends v.GenericSchema>(d: {
  schema: TSchema
  default: v.InferOutput<TSchema> // ← binds to the schema, so a bad default is a type error
  scope: SettingScope
  ui: SettingWidget
  category: string
  description: string
  tags?: readonly string[]
  sensitive?: boolean // never log the value
  requiresRestart?: boolean
  visibility?: 'user' | 'advanced' | 'internal'
  merge?: 'replace' | 'record'
}): SettingDescriptor<v.InferOutput<TSchema>>
```

Two alternatives were tried and rejected on compiler evidence:

- A whole-map `const M extends Record<string, SettingDescriptor<unknown>>`
  constraint compiles `{ schema: v.boolean(), default: 3 }` **without error** —
  `default: T` binds to `unknown` at the constraint. Its "registry catches typo'd
  defaults" claim is only a runtime test.
- `Record<SettingPath<Settings>, Descriptor>` over the nested schema does not
  compile as an exhaustive table at all: `SettingPath<Settings>` resolves to
  `"keybindings" | "models" | "models.hidden" | "models.order" | "providerInstances" | \`keybindings.${string}\``,
demanding a descriptor for the intermediate node `models` and for an unbounded
  template-literal key. The only way to satisfy it is an index signature, which
  destroys the exhaustiveness guarantee that was its entire justification.

**Do not gate a phase on `expectTypeOf`.** No vitest project in this repo enables
`test.typecheck`, so those assertions are runtime no-ops that always pass. Assert
types with in-source declarations (`const _x: SettingsValues['editor.fontSize'] = 13`)
plus `@ts-expect-error` negatives, so `tsgo --noEmit` is the gate.

## The JSON adapter

`jsonc-parser@3.3.1` is a **real new dependency** of `apps/server`. It is not in
`bun.lock` (0 hits); the only copy on disk is reachable through a stale
`@react-grab/cli` artifact that appears in no manifest. Add it with an exact pin
and commit the lockfile delta.

**Read** — tolerant. Comments and trailing commas allowed. Parse errors produce a
partial object, never a throw and never an empty wipe. An invalid value falls
back to the registered default and is recorded as a field on the request's wide
event. Per-key fallback, not per-document: today one corrupt row 500s the entire
document ([service.ts:68-96](apps/server/src/settings/service.ts:68)), which also
kills keybindings for the running app.

**Empty or whitespace-only content is a valid empty document (`{}`), not a parse
error.** This is the single most common outcome of a crashed editor save, and
under the refuse-to-write rule below it would otherwise deadlock writes forever.

**Write** — minimal edits via `modify` + `applyEdits`, temp-file-then-rename
(copy [fs/write.ts:12-31](apps/server/src/fs/write.ts:12), including the dotted
temp name), serialized through a per-path promise chain.

> **Never write a re-serialized parse result.** `v.object` drops unknown entries
> from its output, so a read → `v.parse` → strip → `JSON.stringify` loop silently
> deletes any key written by another build. The current contract explicitly
> promises the opposite ([settings.ts:28-35](packages/contracts/src/settings.ts:28)):
> "an entry for a driver this build cannot load still round-trips through a save
> untouched." Edit the file's _text_, or mutate the raw parsed object — never the
> validated value.

**Writing a value equal to the default deletes the key from the file.** That is
what keeps settings.json short and keeps defaults live across builds.

**Refuse all writes when the target file has parse errors** — a typed
`settings.FILE_MALFORMED` (409) whose `fix` names the resolved absolute path and
the parse offset. Read-tolerance and write-refusal are complementary halves of one
rule; shipping only one gives either data loss or a frozen settings file. Pair it
with `settings.reset` (below), which must work by unlinking rather than rewriting,
or a malformed file is unrecoverable from inside the app.

**`revision` is a content hash of the file's bytes** (reuse `textFileVersion`'s
shape from [fs/version.ts:10](apps/server/src/fs/version.ts:10)), not a counter.
`SettingsFileLayer.write()` re-hashes immediately before the rename and throws
`settings.REVISION_STALE` if it moved since the read. A counter cannot detect a
hand-edit landing between the store's read and its rename — and
[fs/write.ts:33-40](apps/server/src/fs/write.ts:33) already solves exactly this
with `baseVersion`/`expectedMtimeMs`.

**Watch** — the settings feature owns its watcher. Not `FileChangeHub`: its root
is `/` in dev but a `mkdtemp` dir in every test, so settings could not reuse it.
Watch both the file and its parent directory (atomic-rename saves are invisible
otherwise), debounce 100ms, ignore our own `.settings.json.<uuid>.tmp` files, and
**filter the dir-watch callback on `filename === basename(filePath)`** — `~/.platform`
already hosts `fonts/` and `lsp/`, so an LSP install would otherwise wake the
settings watcher.

**Echo suppression**: suppress a reload when the file's hash matches our last
write — then **clear `lastWrittenVersion` on every applied reload**, so a hash
only ever suppresses the single next event. Without that, this happens: UI writes
`fontSize: 20` → user hand-edits to 22 → user hits undo, restoring the exact
bytes → hash still matches → reload suppressed forever, app serves 22 while the
file says 20, and the log says `echoSuppressed: true` as if intentional.

## Push

A dedicated `GET /settings/events` SSE route over the existing `toSse`
([sse.ts:15-38](apps/server/src/sse.ts:15)). Not the orchestration WS — that
bumps `ORCHESTRATION_WS_PROTOCOL_VERSION` and trips the skew detector.

The push channel is not optional. Theme has **working cross-tab sync today**
([theme-provider.tsx:137](apps/web/src/components/theme-provider.tsx:137)), and
moving theme to a server document deletes that mechanism.
`refetchOnWindowFocus` does not replace it — it never fires for a visible-but-
unfocused second window, and `PLATFORM_DESKTOP_SHARED_DEV` makes
desktop-window-plus-browser-tab an everyday configuration.

## API surface

Five routes. All GET/POST — CORS allows exactly `GET/POST/OPTIONS`
([app.ts:93](apps/server/src/app.ts:93)), so PUT/PATCH/DELETE fail preflight.

| Route                       | Returns                           | Notes                                                                                                           |
| --------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `GET /settings`             | `SettingsSnapshot`                | Resolved values + per-layer `raw` for `inspect()` + `revision` + diagnostics. Never carries `sensitive` values. |
| `POST /settings/write`      | `SettingsSnapshot`                | `{ edits: [{ key, value?, target }], baseRevision? }`. Omitted `value` = reset.                                 |
| `GET /settings/events`      | SSE                               | `toSse(store.changes(signal), { event: () => 'settings', heartbeatMs: 15_000 })`.                               |
| `GET /settings/raw?target=` | `{ text, revision, parseErrors }` | The JSON escape hatch. Safe only because secrets live elsewhere.                                                |
| `POST /settings/raw`        | `SettingsSnapshot`                | Whole-text replace. Refuses on parse errors, same as a keyed write.                                             |

**Keep the body unvalidated at the route.** The reason documented at today's
[routes.ts:10-15](apps/server/src/settings/routes.ts:10) still holds: Elysia collapses
any body-schema failure into its generic `VALIDATION` code, which would strip the
typed `settings.*` error with its own status, `why`, and `fix`. Validate in the store.

Error catalog (extends the existing `defineErrorCatalog('settings', …)`; drop
`STORED_SECTION_INVALID`, there are no rows any more):

| Code                | Status | When                                                                            |
| ------------------- | ------ | ------------------------------------------------------------------------------- |
| `WRITE_INVALID`     | 400    | Value failed the key's schema.                                                  |
| `UNKNOWN_KEY`       | 400    | Write only — reads retain unknown keys.                                         |
| `SCOPE_NOT_ALLOWED` | 400    | Key's scope forbids the target layer.                                           |
| `FILE_MALFORMED`    | 409    | Target has parse errors. `fix` names the absolute path and offset.              |
| `REVISION_STALE`    | 409    | File changed between read and rename.                                           |
| `POLICY_CONTROLLED` | 403    | Policy owns this key; the write is refused, not silently dropped.               |
| `FILE_PATH_UNSET`   | 500    | No settings path supplied — an un-threaded `createApp`, failing loudly at boot. |

Never `throw new Error` (AGENTS.md).

## Feature file tree

Per AGENTS.md group-by-kind. `api.ts` stays at the feature root, matching
`features/git/api.ts` — `lib/` is not one of the kind folders, and only
`features/chat/lib` uses it.

```
apps/web/src/features/settings/
  api.ts                     fetchSnapshot / write / raw
  settings-document.ts       the `settings:` synthetic id + parse/format
  components/
    page.tsx                 header + nav + list
    category-nav.tsx         left rail
    settings-list.tsx        filtered rows, no virtualization in v1
    setting-row.tsx          label, description, indicator, control slot
    row-actions.tsx          reset / copy id / copy as JSON / edit in JSON
    scope-tabs.tsx           User | Workspace (no Folder)
    diagnostics-banner.tsx   unknown / dropped / invalid, with actions
    folderless-shell.tsx     first-run frame: close control + Open folder
    widgets/                 one file each: boolean, number, string, multiline,
                             enum, list, record, path, keybinding-recorder,
                             provider-instance, complex-link
  hooks/
    use-settings.ts          the snapshot query
    use-setting-value.ts     per-key selector — the only read outside the feature
    use-settings-stream.ts   SSE, drops its own echo
    use-settings-search.ts   fuzzyRank over the registry
  providers/
    settings-write-provider.tsx   ONE hoisted mutation, narrow domain actions
  state/
    draft-store.ts           in-flight edit authoritative until blur
    category-selection.ts    survives tab switch (only the active tab mounts)
  utils/
    categories.ts  humanize.ts  query-keys.ts  notify-save-error.ts
  tests/
```

Deleted in the same pass: `panel.tsx`, `components/{model-,provider-,keybinding-}section.tsx`,
`components/empty-row.tsx`, `utils/patch.ts`, and `tests/dialog.test.tsx` — obsolete
tests get deleted, not adapted (AGENTS.md).

## Reads on the client

Back reads with a **per-key selector**, not a single query-cache object. Every
design that reads settings through one `['settings','snapshot']` entry makes
`setQueryData` re-render every consumer app-wide — editor, terminal, wallpaper,
tree, chat — on every settings change. One opacity-slider drag becomes a full-app
re-render per commit.

Two requirements:

- `useSettingValue(key)` subscribes to that key only (`select:` on the query, or a
  `useSyncExternalStore` store).
- Re-resolution must **reuse the previous object when a key's value is deep-equal**,
  so unchanged object-valued keys keep identity across a file reload. Concretely:
  when exactly one layer contributes a `merge: 'record'` key, return that layer's
  object by reference rather than allocating a spread.

This is not premature: [app-command-surface.tsx:41-46](apps/web/src/components/app-command-surface.tsx:41)
carries the comment _"Stable identity: the menu store and the keymap effect both
diff by reference."_ A fresh `keybindings` object on every slider tick re-registers
the entire binding table.

Measure it: drag a slider, count renders, before and after.

## Commands are a second writer

This is the hole that would otherwise ship broken on day one. These already mutate
state that becomes a setting, and none of them go through the settings write path:

| Command                                                       | Location                                                                                                 | Becomes                         |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `workspace.setDarkTheme` / `setLightTheme` / `setSystemTheme` | [commands.ts:358-369](apps/web/src/keymap/commands.ts:358)                                               | `workbench.colorTheme`          |
| `workspace.toggleDiffViewMode`                                | [commands.ts:370](apps/web/src/keymap/commands.ts:370)                                                   | `editor.diff.viewMode`          |
| `workspace.toggleUiMode`                                      | [commands.ts:384](apps/web/src/keymap/commands.ts:384)                                                   | `workbench.uiMode`              |
| `workspace.toggleWallpaper`                                   | [commands.ts:388](apps/web/src/keymap/commands.ts:388)                                                   | `workbench.wallpaper.enabled`   |
| `color ` / `theme ` palette modes                             | [command-palette-utils.ts:304-305](apps/web/src/components/command-palette/command-palette-utils.ts:304) | `workbench.editor.colorTheme.*` |

Each is rewired to call the same `setSetting` action the page uses; the command
context loses `setTheme`/`setDiffViewMode`/`setUiMode`/`setWallpaperHidden`.

`editor.action.toggleWordWrap` is the hard one: it is handled **inside the editor
package** (`Editor.ts:420` via `commandRouter.ts:57`, bound `Alt+Z` at
[default-bindings.ts:330](apps/web/src/keymap/default-bindings.ts:330)) and flips
editor-internal state with no callback out. An `editor.wordWrap` setting can never
observe it. Either intercept the command id in the app keymap layer before
`editorKeymapLayersFromPlatform` builds the layer, **or** drop the key from the
registry. Do not ship both — Alt+Z flipping one editor while the page shows the
old value, and the next write silently undoing it, is worse than no setting.

## How a value actually reaches its consumer

The part every settings design under-specifies. Three traces, end to end, chosen
because each exercises a different application mechanism.

### 1. Theme — a paint-blocking key with cross-tab sync

```
click → draft-store (authoritative until blur) → debounce 200ms
     → POST /settings/write { key: 'workbench.colorTheme', value: 'dark', target: 'user' }
     → validate against descriptor schema
     → scope check: application, target user → OK
     → jsonc.modify + applyEdits on ~/.platform/settings.json
     → re-hash, temp+rename (0600 preserved)
     → store invalidates → resolve → emit change
     ├── HTTP response: snapshot → written into the query cache
     └── SSE /settings/events → other tabs and the desktop window
                              → this tab drops it, hash matches its own write
     → boot-mirror writer updates localStorage FROM THE SERVER SNAPSHOT (never optimistically)
     → applier writes the `dark` class onto documentElement
```

The applier is **not** a React effect near the root. React runs child effects before
parent effects, so a root-level effect lands _after_ descendants that read computed
styles — and `readTerminalTheme` ([terminal-theme.ts:42](apps/web/src/features/terminal/terminal-theme.ts:42))
snapshots computed CSS variables at terminal construction. Apply at module scope in
`main.tsx` beside `applyNativeVibrancy`; the React path is a correction, not the
primary one.

Next cold boot reads the mirror synchronously before `createRoot`, so there is no
flash. This trace replaces the `storage`-event sync at
[theme-provider.tsx:137](apps/web/src/components/theme-provider.tsx:137) — SSE does
the job it was doing, which is why dropping the push channel was not an option.

### 2. Editor font size — a live passthrough, and its awkward sibling

Same write path. The read side is where the interesting distinction lives:

```
useSettingValue('editor.fontSize')   ← per-key selector, not the whole snapshot
     → write --editor-font-size on documentElement
     → editor re-lays out from CSS, no remount, no editor-package change
```

That works because editor typography already comes from CSS
([globals.css:533](packages/ui/src/styles/globals.css:533) reads `--font-mono`), so
the setting rides an existing channel. **`editor.tabSize` cannot do this.** It is
captured in the `Editor` constructor with no `setTabSize`, and the React wrapper does
not re-sync it — so it needs a new editor-package setter or a remount of every open
editor.

Two keys, one namespace, adjacent in the UI, and an order of magnitude apart in cost.
That is why the key table carries a `wiring` column and why PLUMBING vs NEW FEATURE
is marked per key rather than per batch.

### 3. Provider instance — already built, and what is still missing

`fed42fd` shipped the server half:

```
POST /settings → SettingsService.update → settings.onChange
     → registry.reconcile(mergeProviderInstanceConfigs(DEFAULT_PROVIDER_INSTANCES, saved))
     → diffs, disposes, reorders, serializes via reconcileChain
```

Two gaps remain, both in Phase 7:

- **The client never learns.** The composer's provider list comes from
  `['providers','list']` with a 60s `staleTime`. A settings write must invalidate it —
  either the write response carries a `providersChanged` flag or the settings SSE
  frame triggers it. Without this, disabling a provider leaves it in the picker for
  up to a minute.
- **In-flight sessions are unhandled.** `reconcile()` disposes adapters, and
  threads/sessions route by `providerInstanceId`. Disabling a provider mid-stream is
  a live-session failure with no defined behaviour. Pick one and test it: reconcile
  refuses to dispose an adapter with live sessions, or the turn fails with a typed
  error the chat surface renders.

## The settings page

A synthetic `settings:` editor tab, following the `search-buffer:` convention
([search-buffer-document.ts:3](apps/web/src/features/search/search-buffer-document.ts:3)).
`openEditorPathInWorkbenchPanels` dedupes by path
([workbench-panels.ts:57-67](apps/web/src/features/workbench/utils/workbench-panels.ts:57)),
so the tab is a singleton for free, and `pathForWorkspace` drops it so it is not
persisted across reloads.

The dialog's stated justification — _"neither layout owns the other's tab strip"_
([dialog.tsx:12-15](apps/web/src/features/settings/components/dialog.tsx:12)) — is
factually stale: chat mode renders the same `CodePanel` over the same
`workbenchPanels` ([tool-pane.tsx:49-59](apps/web/src/features/chat-mode/components/tool-pane.tsx:49)).

**The folderless case needs a real shell.** With no folder open,
[app-workspace.tsx:59-63](apps/web/src/features/workbench/components/app-workspace.tsx:59)
renders `EmptyWorkspace` and there is no tab strip at all — so a settings surface
that replaces it has no close button and no "Choose folder" affordance. This
matters because first-run provider configuration happens exactly there, which is
why `workspace.showSettings` is in `workspaceOptionalCommands`. Render
`SettingsPage` in a minimal frame with an explicit close control and keep an
"Open folder" action in the header.

Layout, adapted from `settingsEditor2.ts`:

- Header: search box, scope tabs, filter menu, "Open Settings (JSON)".
- Left: category rail derived from `descriptor.category` — **not** from key
  prefixes at runtime (that invents categories nobody chose) and **not** VS Code's
  `tocData` glob table, whose `getMatchingSettings` deletes each match from a
  shared pool so an earlier broad glob steals from a later specific one.
- Right: plain rendered list of rows.

**Scope tabs: User and Workspace only.** No Folder tab. Workspace is enabled and
gated on `rootFolder !== null` — it is real from the storage phase onward, so
shipping it disabled with a "no server-side scoping yet" tooltip would be false
the day it ships.

**No virtualization in v1.** The page shows ~55 user-visible rows (the verified
inventory settles this — the rest are `advanced`/`internal`). `useVirtualizer` at that
scale buys nothing while costing a React-Compiler lint escape, the loss of
auto-memoization in that component, and a dependency on the `browser` Vitest
project that has hung at the RUN banner before. Revisit past ~300 rows; if it
comes back, verify with Playwright against `:5173`, not `--project browser`.

**Search reuses `fuzzyRank`** (`FuzzyRankTarget = { label, keywords?, path? }`
maps cleanly onto a descriptor). Settings then rank like the command palette, with
zero new matching code. Counts and the filtered list come from **one pass**, and
counts are computed only while a query is active.

**An in-flight edit is authoritative until blur.** Without this, the echo of your
own save clobbers what you are typing — VS Code's `settingsEditor2.ts:1712-1768`
defers refresh while a row is focused for exactly this reason.

**JSON escape hatch: dedicated `GET/POST /settings/raw?target=` routes**, not an
`/fs` file tab. The fs route only works today by coincidence —
[index.ts:16-17](apps/server/src/index.ts:16) makes the fs root `/` in dev, so
`~/.platform/settings.json` happens to fall inside it, while tests put it under a
temp root. Dedicated routes are transport-independent, testable in-process, and let
the server refuse a save into a broken document with the same typed error.

**Diagnostics need a surface.** Dropped keys, unknown keys, and scope-violating
keys are invisible otherwise — the same silent-drop failure `appliedOverrides`
already has ([active-bindings.ts:283-284](apps/web/src/keymap/active-bindings.ts:283)),
reproduced at the document level. A banner on the page: N unknown, N dropped by
scope, N invalid, each with "reveal in settings.json" and "remove". Ship
**"Remove unknown settings"** as the GC for renamed keys.

**Import / export / reset-all** ship with the page. `docs/editor-parity-gap-matrix.md:510`
already tracks them as missing, a file store makes export nearly free, and
`settings.reset` is the recovery action for the malformed-file deadlock. Note
reset must clear the file **and** the boot mirror **and** both layout localStorage
paths (`platform.workspace-state.v16.workbenchLayout` and
`platform.resizable-layout.chat-mode`) — clearing one leaves chat mode stuck.

## Boot-critical keys

Theme is read synchronously at module init
([theme-provider.tsx:67](apps/web/src/components/theme-provider.tsx:67)), as is the
editor color theme ([editor-color-theme-store.ts:345](apps/web/src/features/editor/state/editor-color-theme-store.ts:345)).
An HTTP fetch there is a guaranteed flash of wrong theme.

A single `platform.settings-boot-mirror.v1` localStorage key holds the last-known
values for exactly the boot-critical keys. It is a **cache, not a layer**: never
authority after hydration, written **only from a server-sourced snapshot** (never
from an optimistic value, or a failed write leaves the wrong value to survive the
next reload), and **validated per key** — whole-document `v.safeParse` fails the
moment any key is added or removed, which would make every deploy's first cold
boot flash defaults.

Apply it **before `createRoot().render`**, at module scope in `main.tsx` beside
`applyNativeVibrancy` and `loadDefaultNerdFont`: write the theme class and the four
`--surface-*` custom properties onto `documentElement`. React-level sync is a
_correction_, not the primary path. This matters because React runs child effects
before parent effects, so a provider-owned effect near the root applies the
material knobs _after_ descendants that read computed styles —
`readTerminalTheme` ([terminal-theme.ts:42](apps/web/src/features/terminal/terminal-theme.ts:42))
snapshots computed CSS variables at terminal construction.

## Home directory consolidation

**Decision: consolidate onto `~/.platform/` now** (maintainer's call, 2026-08-12),
in Phase 2, before the settings file is created. Doing it later is a second sweep
over the same files.

Today local state is split across two directories for no reason, and
[attachments/store.ts:31-34](apps/server/src/attachments/store.ts:31) already
claims — falsely — that it all sits under one. Seven sites, verified with
`rg -n "platform-file-picker"` and `rg -n "'\.platform'"`:

| Now                                                                                                                    | After                               |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `~/.platform-file-picker/fs-metadata.sqlite` ([db/client.ts:9](apps/server/src/db/client.ts:9))                        | `~/.platform/fs-metadata.sqlite`    |
| `~/.platform-file-picker/app-save-markers.json` ([fs/app-save-marker.ts:22](apps/server/src/fs/app-save-marker.ts:22)) | `~/.platform/app-save-markers.json` |
| `~/.platform-file-picker/attachments` ([attachments/store.ts:36](apps/server/src/attachments/store.ts:36))             | `~/.platform/attachments`           |
| `~/.platform-file-picker/provider-status` ([provider/status-cache.ts:35](apps/server/src/provider/status-cache.ts:35)) | `~/.platform/provider-status`       |
| `~/.platform/fonts` ([fonts/service.ts:41](apps/server/src/fonts/service.ts:41))                                       | unchanged                           |
| `~/.platform/lsp` ([lsp/installers.ts:39](apps/server/src/lsp/installers.ts:39))                                       | unchanged                           |
| —                                                                                                                      | `~/.platform/settings.json` (new)   |

Plus the assertion in
[attachments/tests/store.test.ts:43](apps/server/src/attachments/tests/store.test.ts:43).

**Introduce `apps/server/src/home.ts`** exporting `platformHomePath(...segments)`,
and route all seven through it. Six independent `path.join(homedir(), …)` calls is
how the split happened; a single helper is what stops it recurring — and the
settings file becomes the seventh caller rather than the third convention.

Per the greenfield rule: **no migration code.** The old directory is not read, not
moved, not healed. Tell the user to delete it:

```bash
rm -rf ~/.platform-file-picker
```

Note this discards the local fs-metadata SQLite DB (rebuilt on demand), cached
attachments, and provider status caches. Nothing there is authored by the user.
`FS_METADATA_DB` still overrides the DB path and must also be registered in
`turbo.json` `globalPassThroughEnv`, which it is not today.

## Desktop

**Decision: `window.*` lives in the same document**, at `machine` scope
(maintainer's lean, confirmed 2026-08-12). One file, one reset, one schema. t3code's
separate `DesktopAppSettings` is not worth copying — their own two-store split costs
them ~100 lines of partial-failure rollback.

The kind split that matters is _within_ window state, not across files:

- **Preferences** — `window.defaultWidth`, `window.defaultHeight`,
  `window.titleBarStyle`, `window.nativeVibrancy`. These go in the document at
  `machine` scope: user-file-only, never synced, and a cloned repo's workspace file
  must never resize or re-chrome your window.
- **Restored state** — where you actually left the window last time. This is _not a
  setting_ and does not go in `settings.json`; it would churn the file on every
  window drag and turn "reset settings" into "lose your window". If we want it later
  it belongs with the other session state, not here.

`window.nativeVibrancy` ships **read-only with a reason**: it is deliberately forced
off at [index.ts:132-155](apps/desktop/src/bun/index.ts:132) with a measured 5.5MB
CPU memcpy per paint under CEF OSR. A live toggle would be a performance trap.

`apps/desktop/src/bun/settings.ts` reads `~/.platform/settings.json`
synchronously at startup (honoring the same `PLATFORM_SETTINGS_FILE` env override
it already forwards to `spawnServer`), parses with the same registry, and applies
`window.*` before `new BrowserWindow`. Runtime changes need a new
`applyWindowSettings` request on `DesktopRPC`, or the keys are marked
`requiresRestart` and say so in the UI. Add a test that the shell and the server
resolve the same defaults from the same registry.

## Secrets

**Rewritten after `920af78`.** The env editor ships (maintainer's call), and main
already built the wire half of the protection — better than what this plan had
specified. But it also surfaced a conflict this plan must resolve before the file
store lands.

### What main already shipped

[redaction.ts](apps/server/src/settings/utils/redaction.ts) masks every non-empty
provider env value as `REDACTED_SETTINGS_VALUE` on the way out, and
`restoreRedactedSecrets` puts the stored value back when a write sends the mask
unchanged — matched by instance id **and** variable name, never by position. An
empty value stays empty, so "not set" and "set to something I am not showing you"
stay distinguishable. Both routes are covered:
`GET` returns `readForClient()`, `POST` returns `redactSettings(...)`.

That design is correct and this plan adopts it as-is. It also retires the "not for
credentials" warning I had proposed — the decision on main is that credentials _do_
belong there, and are protected rather than discouraged.

### The conflict the file store creates

Redaction protects the **wire**. It does nothing for the **disk**, and three things
in this plan hand the disk back to the channel redaction was built to close:

1. **`GET /settings/raw`** serves the file's real bytes. That is the entire secret
   set, over exactly the HTTP path `920af78` closed, behind nothing but an origin
   check.
2. **"Open Settings (JSON)"** opens that file as an editor tab — secrets rendered on
   screen, and into any screenshot or screen share.
3. **Export** (added by this plan) writes a copy of the file. An export shared with
   a teammate is a credential leak.

Plus the standing property: this is an agentic tool, so the agent can `cat` the file
straight into a model context.

### Resolution: sensitive values do not live in the settings file

`sensitive: true` values are **stored in a sibling file the settings layer never
holds** — `~/.platform/secrets.json`, mode `0600`. The settings document holds only
the variable _name_ and a presence marker; the value resolves through the secret
store at spawn time.

This is not extra ceremony — it is what makes the rest of the plan safe:

- `/settings/raw` and the JSON tab become servable, because the file has no secrets
  in it.
- Export/import becomes safe by construction rather than by a filter someone has to
  remember.
- The file becomes genuinely hand-editable and genuinely `cat`-able, which was one of
  the three arguments for choosing a file over SQLite in the first place.
- `restoreRedactedSecrets`'s id+name matching maps onto the secret store's keying
  unchanged.

**This changes where values land, not whether the env editor ships.** It stays in
v1. It is a Phase 2 concern — the split must exist _before_ the first settings file
is written, because moving secrets out of a file that already has them is a
migration, and there is no migration code.

### The secret store, specified

`apps/server/src/settings/secrets.ts`. Deliberately dumber than the settings store:
no layers, no registry, no watcher, no SSE, no scope filter. It is a flat
string→string map behind two functions.

```ts
/** Opaque, stable, and derived from the same pair redaction.ts already matches on. */
type SecretRef = `provider.${string}.env.${string}`   // instanceId, variable name

readSecrets(): Map<SecretRef, string>
writeSecrets(edits: ReadonlyMap<SecretRef, string | null>): void   // null deletes
```

**File**: `~/.platform/secrets.json` via `platformHomePath('secrets.json')`, mode
`0600` on create, same temp+rename write as the settings file — with the temp file
also `0600`, or the rename silently widens permissions. Plain JSON, not JSONC: this
file is never hand-edited, so comment preservation buys nothing.

**Keying reuses what already exists.** `restoreRedactedSecrets` matches on
`(providerInstanceId, variable.name)` — _"never by position: an editor that reorders
or removes rows would otherwise restore a secret onto the wrong variable."_
`SecretRef` is that same pair, flattened. So the protocol main shipped needs no
change; only its backing storage moves from the settings document to this map.

**What the settings document holds instead**: the variable _name_ and nothing else.
An env row is `{ name: 'ANTHROPIC_API_KEY' }` — presence is the marker, so "set" vs
"not set" stays legible in the file without the value being there. This matches the
existing empty-vs-mask distinction rather than adding a third state.

**Resolution happens at spawn**, in the driver, not in the settings read path. The
settings snapshot never carries secret values in any layer, at any point, which is
what makes the raw routes and export safe by construction rather than by filtering.

**Deliberately excluded** — the honest limits of this design, worth stating so nobody
mistakes it for more than it is:

- Not encrypted at rest. `0600` in `$HOME` is the same protection an SSH private key
  gets, and matching the OS keychain is a separate project.
- Not synced, not exported, not in the workspace layer, ever.
- No rotation, no expiry, no audit log.

If a real keychain integration lands later, it replaces the two functions above and
nothing else moves — which is the point of keeping the interface this narrow.

### Still required regardless

- The descriptor carries `sensitive: true`. The wide event logs setting **ids**,
  counts, and value byte-lengths — never values; for sensitive keys, only
  `changed: true`. `sensitiveErrorFields`
  ([logging.ts:21-29](apps/server/src/observability/logging.ts:21)) only redacts
  _error_ diagnostics today and does not cover this.
- Never log the settings path under the key `path` — that literal field name is
  redacted. Use `settingsFile`.
- A test asserting no `sensitive: true` value appears in `/settings/raw`, in an
  export, in a settings snapshot, or in any log line.
- `AppOptions.settings` gains `secretsFilePath` and it is threaded through all 15
  `createApp` call sites alongside the settings path — same failure mode, same fix.

## Test isolation — read this before writing any file code

Today nothing writes the developer's real settings because `createApp` hands
`SettingsService` the in-memory DB handle
([app.ts:72-75](apps/server/src/app.ts:72)). A file store has no such accident,
and there is deliberately no healing code.

**15 `createApp(` call sites outside `app.ts` must receive the settings slot in the
same commit** (verified with `rg -n 'createApp\(' apps --glob '!**/app.ts'`):
`apps/server/src/index.ts:27`, `apps/web/test/server.ts:32`,
`apps/server/src/settings/tests/routes.test.ts:152`,
`apps/server/src/tests/app.test.ts:285` and `:991`,
`apps/server/src/git/tests/{commit-progress.ts:21,worktrees.ts:282,service.ts:482}`,
`apps/server/src/fs/tests/search-routes.test.ts:101`,
`apps/server/src/provider/tests/{auth-routes.ts:102,command-routes.ts:71}`,
`apps/server/src/orchestration/tests/engine.test.ts:413/:530/:1211`,
`apps/server/src/observability/tests/runtime.test.ts:324`.

Make the failure loud rather than silent: `SettingsService` **throws
`settings.FILE_PATH_UNSET` unless a path is supplied** by `AppOptions.settings` or
`PLATFORM_SETTINGS_FILE`. Production `index.ts` supplies it explicitly. Add a
harness assertion in `apps/web/test/server.ts` that the resolved path is under the
temp root.

## Phases

Every phase ends on `bun run verify` green plus its named suite.

**Phase 0 — Make settings falsifiable. ✅ DONE on main (`fed42fd`).** Providers
hydrate from the document at boot and re-reconcile on change; a saved value now
changes which adapters run, covered by
`apps/server/src/settings/tests/provider-instance-reconciliation.test.ts`. Start at
Phase 1.

**Phase 1 — Registry + resolver, pure, in `packages/contracts/src/settings/`.
✅ DONE 2026-08-13.** `{registry,keys,json-equal,resolve,wire}.ts` plus
`tests/settings-{registry,resolve}.test.ts`; 25 new tests, contracts at 115 passing,
`typecheck`/`lint`/`format:check` green, knip reports no unused exports.

Four keys registered — `providers.instances`, `models.hidden`, `models.order`,
`keybindings.overrides` — all `application` scope, since provider config reaches
process spawn and a keybinding can invoke any app command.

Three things came out differently than written, each for a reason worth keeping:

- **The resolver takes the registry as a parameter.** Every Phase 1 key is
  `application`-scoped, so the workspace layer can never carry one — which makes
  user-vs-workspace precedence _untestable_ against the shipping table until Phase 3
  adds a `window` key. Welding the resolver to a global registry would have meant
  shipping the precedence rules unproven. It is now a pure function of
  `(registry, layers)`, with an overload that defaults to the real table, and the
  tests drive a fixture registry carrying `window` and `machine` keys.
- **Duplicate-id rejection is the compiler's job, not a runtime check.** Registry
  entries are object literal keys, so a duplicate is `TS1117` — verified. The runtime
  `registryProblems()` covers only what types cannot: malformed ids, and defaults
  that satisfy the type but fail the schema's own refinements (`v.maxLength`,
  `v.regex`, a `v.check` on a list).
- **`settings.ts` was touched after all**, by one word: `modelRefListSchema` is now
  exported rather than file-private, so `models.hidden`/`models.order` reuse the
  existing schema instead of duplicating it. Additive; Phase 2 deletes the file.

`jsonEqual` is new and not in the original module list. The resolver needs it for the
previous-value reuse the audit required — `JSON.stringify` comparison would be
key-order sensitive, and key order changes exactly when someone hand-edits the file,
which is the moment it is asked to say "nothing changed". Both identity tests were
calibrated by breaking the reuse path and confirming they fail.

**Phase 2 — Storage cutover + home consolidation. ✅ DONE 2026-08-13.**
`app_settings` dropped (migration v8), `~/.platform/settings.json` is the source of
truth, seven dot-directory sites consolidated behind `platformHomePath()`, secrets
split into `~/.platform/secrets.json` (mode `0600`), five routes live, and
`AppOptions.settings` threaded through every `createApp` call site.

Server 766 tests / web 1537 / contracts 115, all green; lint, format and
`unused:exports` clean.

Four things worth recording:

- **A synchronous boot read, not an async `createApp`.** The provider registry is
  built from settings inside the same synchronous call, and making construction
  async would have rippled through fifteen call sites. One small `readFileSync` at
  startup is the smaller cost.
- **`settingsPaths` refuses to default the user path.** It throws
  `settings.FILE_PATH_UNSET` instead. That is what turned "a forgotten call site
  silently overwrites the developer's real settings" into a loud boot failure — and
  it found every un-threaded site in one test run.
- **The secret split needed a correction.** Storing `value: ''` for both a set and
  an unset variable would have destroyed the distinction main's redaction was
  careful to preserve. The file holds `''` always; the _snapshot_ masks based on
  whether the secret store has the ref. Main's wire protocol is unchanged — only
  its backing storage moved.
- **The echo-suppression bug the critique predicted was real.** Reintroducing it
  (not clearing the hash on an applied reload) fails exactly one test: the file
  returning to previously-written content — an undo in the user's editor — was
  swallowed forever. Verified by breaking it and restoring it.

Deliberately deferred to Phase 3: the client does not yet subscribe to
`GET /settings/events`, so an external edit reaches the server store and the next
read, but not an open page live. The route and the store's change stream exist and
are tested; only the browser-side `EventSource` is missing.

**Phase 3 — Page shell + appearance batch. ✅ MOSTLY DONE 2026-08-13.**
Settings open as a `settings:` editor tab (dedupes by path, so it is a singleton
for free); with no folder open the dialog is the folderless shell, since there is
no tab strip there and that is exactly when first-run provider setup happens. The
page has search over id/label/category/keywords/description, category grouping
from the descriptor, per-type widgets, a modified indicator and per-row reset.

**Six keys live, wired to real consumers**: `workbench.colorTheme`, the four
`workbench.surface.*` material knobs, and `workbench.wallpaper.enabled`. Their
localStorage homes are deleted, not migrated — the `theme` key, the storage
listener, and `wallpaperHidden` across the cache, the store, the persistence
subscriptions and nine test files.

The SSE subscription deferred from Phase 2 also landed, tested end to end through
the real server: another writer's change reaches this tab's cache without polling.

Three things worth recording:

- **A pre-paint pass, not a React effect.** `applyAppearance` runs at module scope
  in `main.tsx` before `createRoot`, reading a per-key-validated boot mirror. React
  runs child effects before parent effects, so a root-level effect lands _after_
  descendants that read computed styles — the terminal snapshots CSS variables when
  it is built. The provider is the correction, not the primary path.
- **`humanizeSettingId` takes all but the first segment**, not just the leaf.
  Leaf-only turned `workbench.wallpaper.enabled` into "Enabled", and the generic
  leaves (`enabled`, `mode`, `size`) are precisely the ones that repeat across
  namespaces.
- **Three keys were deliberately _not_ registered.** `workbench.uiMode`,
  `workbench.tree.density` and `editor.diff.viewMode` are threaded through the
  workspace store with roughly ten readers each, and registering them without
  rewiring those readers would have broken this plan's own rule that a key is never
  registered inert. They are the first work of the next pass, not a gap in this one.

**Phase 4 — Write-path completeness. ✅ DONE 2026-08-13.**
Scope tabs (User | Workspace, gated on a folder being open, no Folder tab),
`deriveWriteTarget`, `inspect()`-driven "also modified in <scope>" hints, a
disabled state with the scope rule stated where the user meets it, the per-row
action menu (Reset / Copy setting ID / Copy as JSON / Edit in settings.json), a
diagnostics banner, page-level Open settings.json and Reset all, and a
focus-authoritative number widget.

**Verified in the real app, not only in tests** — the loop that had never been
exercised outside a test harness:

- A UI write reached `~/.platform/settings.json` holding _only_ the changed key,
  so untouched defaults stay live.
- A hand-edit to that file — with a comment — changed the running app with no
  reload: theme flipped, opacity dropped, both rows showed the modified marker.
  File → watcher → store → SSE → query cache → applied appearance.
- A subsequent UI write **kept the comment** and left the hand-edited keys alone,
  which is the whole reason for `jsonc.modify` over parse-and-restringify.
- `~/.platform/` now holds settings, secrets, fonts, lsp, the metadata database,
  provider status and save markers — the consolidation, confirmed on disk.

Two things worth recording:

- **The number widget is authoritative while focused.** Commit on blur/Enter, and
  ignore incoming values during focus. Both halves are needed: per-keystroke
  writes would save `1`, `12`, `120` for one edit, and accepting the echo of the
  user's own save resets the field under the cursor. Escape cancels through a ref,
  because Escape blurs and blur commits — state is not flushed in time.
- **I reintroduced the palette's own bug and caught it in test.** `SettingsPage`
  read the workspace store through the throwing accessor, which would have taken
  down the folderless dialog exactly as `useSaveProjectScript` took down the
  command palette. `useHasWorkspace` reads it optionally instead. Any component
  rendered by both a workbench tab and the folderless shell has to assume the
  provider may be absent.

**Phase 5 — Editor + terminal batch. ✅ DONE 2026-08-13.** 22 keys registered.

**Editor typography is live with no remount and no cross-repo change**, which the
plan had budgeted as the phase's main risk. The editor package's own stylesheet
already reads `tab-size: var(--editor-tab-size)` and `line-height:
var(--editor-row-height)`, and the app's host rule owns font-family and
font-size — so `editor.{fontFamily,fontSize,lineHeight,tabSize}` are four CSS
custom properties, not four editor options. Verified in the browser: the editor
element's computed `font-size` follows the setting.

**The font service is finally wired to a setting.** `apps/server/src/fonts/` can
fetch, subset and cache ~70 Nerd Fonts on demand, and its only consumer hardcoded
`JetBrainsMono`. `editor.fontFamily` now holds a font _name_, with a widget that
does both: browse the catalogue with each row drawn in its own face (the preview
route returns a woff2 subset of just the sample text), or type any family already
installed. One value serves both because the stack tries `"X Nerd Font"` then
`"X"` — the first matches the face this app registers, the second matches a local
install. Verified live: writing `Hack` fetched the font from the service and
registered `Hack Nerd Font` as a FontFace.

**Terminal appearance mutates `terminal.options.*`**, never re-creating the
Terminal, because re-creating it clears the scrollback. Applied at the ghostty
handover rather than at construction, so it is an effect event that sees current
settings rather than the ones the mount began with.

`editor.diff.viewMode` also landed here — deferred from Phase 3 because its
consumers were still on the workspace store.

Two things recorded honestly:

- **The plugin toggles are `requiresRestart: true`.** `editor.{minimap.enabled,
guides.indentation, syntaxHighlighting.enabled, decode.mode}` replace the
  `?editorPerfDisable=` URL gates, so no editor feature is reachable only by a
  query param. But the non-critical plugin list is a lazy module-level singleton
  built once per page load; claiming they apply live would be a lie the user
  discovers by toggling one. The registry flag exists for exactly this and the
  page renders it as a badge.
- **`editor.tabSize` changes rendered width, not inserted indentation.** The CSS
  variable drives how a tab is drawn; what the editor _inserts_ is captured in the
  `Editor` constructor and has no setter. Splitting that hair in the description
  is better than a setting that half works.

**Phase 6 — files / search / chat / logs / window batch. ✅ DONE 2026-08-13.**
34 keys registered, every one wired to a real consumer, zero diagnostics on a
fresh install.

**The scope rule got its first real workout.** `search.{defaultMatchMode,
caseSensitive,wholeWord,maxResults,quickOpenLimit}` are `window` — they become
ripgrep argv, but only ever as operands after a fixed flag, which is the
suppression side of the amended rule — and they carry the cross-scope indicator,
because a workspace-authored search default changes what the user _and_ the agent
find. `chat.{defaultRuntimeMode,defaultInteractionMode}` are `application`: they
are the permission posture a provider session spawns with, and a cloned
repository setting `full-access` would silently overrule a user who chose
approval-required. The page states that refusal where the user meets it rather
than only as a server error after a failed save.

**`readOnlyReason` finally renders.** The field existed on the descriptor since
Phase 1 and nothing showed it. `window.nativeVibrancy` is its first user: shown,
disabled, with the measured reason (transparency forces CEF into off-screen
rendering, ~5.5MB CPU copy per paint). A knob that is silently absent reads as a
bug; a knob that says why it is off reads as a decision.

**The boot mirror grew a second, honest job and a better name.** It is
`readSettingsMirror` now, not `readBootMirror`: appearance still needs it before
first paint, but the editor's plugin list is a module-level singleton and the
search limits are read inside async generators — none of them can call a React
query. It is rewritten from every server snapshot, so a read is live rather than
merely boot-time, and it is still never authority.

One bug worth recording: `defaultLogsFilterState` was a module-level `const`, so
reading the mirror there would have been evaluated once at import and frozen. It
is a function now.

**`files.autoSave` shipped after all**, as a real feature rather than a key.
`files.autoSave` (off | afterDelay | onFocusChange | onWindowChange, default off)
and `files.autoSaveDelay` drive a hook that reuses `saveEditorDocumentByPath` —
the same function `Mod+S` calls, because a second write path would be a second
set of conflict and dirty-tracking bugs. Off costs nothing: no store
subscription and no window listener, which the tests assert directly.

**`editor.formatOnSave` is NOT shipped, and the reason is load-bearing rather
than a matter of effort.** `LspPlugin.formatDocument()` fires
`void this.requestFormatting(active)` and returns `true` immediately; its own doc
comment says the answer arrives asynchronously. Format-on-save built on that
would save the _unformatted_ text and then leave the file dirty when the edits
land — strictly worse than not having the feature. It needs the editor package to
expose a promise, which is the same cross-repo constraint Phase 5 hit. Registering
it now would put a key on the page that silently corrupts saves.

`lsp.servers` also stays out: a change has to restart live language-server
sessions, not just re-read config, and that is a session-lifecycle feature rather
than a registry entry.

**What was verified, and what was not.** The autosave hook is unit-tested per
mode — off subscribes to nothing, `afterDelay` subscribes to the document store,
`onWindowChange` adds a blur listener — and it reuses the existing, working save
path. It was _not_ confirmed end to end in a browser writing a real file: the
file index would not surface a freshly created probe file, and the claim is left
at what the tests actually show rather than stated more strongly.

**Phase 7 — Complex-value editors + provider/model wiring. ✅ DONE 2026-08-13.**

**The headline finding was not on the plan's list.** `ProviderSection`,
`ModelSection` and `KeybindingSection` had been rendered _nowhere_ since Phase 3
replaced the old dialog panel with the registry-driven page — knip found them
only once `modelPreferenceRows` came back as unused. So the one screen whose job
is configuring providers was showing "Edit in settings.json". Two new widget
kinds, `providers` and `models`, map those keys to the real editors, and the
sections lost their own headings: they render inside a row that already carries
the label, id and description, under a category with the same name.

**`models.hidden`/`models.order` are alive at both ends**, which was the call I
made when this was an open question. Rows now come from the provider catalogue
joined against the sparse prefs — deriving them from `hidden` meant the list could
only contain models the user had already hidden, so it started empty and offered
no way to hide anything. And `providerModelOptionGroups` applies the prefs when
building the picker, per provider rather than across the flattened list, since the
picker regroups by provider anyway. Ordering uses a stable partition, not a sort:
a comparator that invented a rank for unlisted models would quietly reshuffle a
provider's own preferred sequence.

**A record editor replaces the JSON fallback for `keybindings.overrides`.**
Removing a row deletes the key rather than writing `null`, because those are
different documents — an absent key keeps the command's default, a `null` one
unbinds it. An unbound entry shows a placeholder rather than an empty field, so it
cannot be mistaken for a value someone is mid-way through typing.

**Two loose ends closed.** A settings write now invalidates `['providers']`; the
composer's list is cached for 60s, so disabling a provider used to leave it in the
picker for up to a minute while the server had already reconciled. And
`launchArgs` is gone — stored, validated and round-tripped by nothing, which
greenfield says to delete rather than leave looking configurable.

**All three of Phase 7's loose ends are now closed.**

- **`reconcile()` no longer kills a live turn.** It was the only real correctness
  bug left: disposing an adapter mid-stream kills the child process the session
  is reading from, and threads route by `providerInstanceId`, so the turn died
  with whatever the transport threw. The registry now takes an injected
  `hasLiveSessions` predicate — injected because the registry owns adapters, not
  the session directory, and reading the orchestration schema from here would tie
  provider config to it — and defers disposal while a session is live, removing
  the instance on a later reconcile. The first test caught the fix being
  incomplete: `reorderInstances` rebuilt the map purely from the new entries and
  dropped the deferred instance straight back out, undoing the deferral.
- **A chord recorder replaces the keybinding text field.** Typing `Mod+Alt+S`
  by hand means knowing the notation, and getting it wrong produces a binding
  that silently never fires. It captures the actual keystroke, stores the
  portable `Mod` spelling rather than the platform's own, swallows Escape and Tab
  while recording (the chords people most want to rebind are the ones a normal
  field cannot capture), ignores a modifier held on its own, and shows how many
  other commands already use the chord _before_ the save.
- **`models.order` is editable from the page.** Move-up/move-down buttons rather
  than drag: the list scrolls inside a settings row inside a scrolling page, and a
  drag that has to auto-scroll two nested containers is worse than two clicks for
  a list whose whole use case is moving one model to the top. A model with no rank
  is appended before it moves, because `order` is sparse — "move this up" first
  has to make it one of the models the user has an opinion about.

**Phase 8 — Retirement and polish. ✅ DONE 2026-08-13.**

**Docs no longer argue against what shipped.**
`docs/router-everything-linkable-plan.md` had settings as a dialog overlay in
several places, including a decision row justifying it. `?settings=` survives —
it is still a param rather than a path, and the reason it gave (a real route
unmounts the workspace and kills live terminal sockets) is still correct — but it
now selects a _category_ on the settings page rather than opening an overlay
panel, and the section components it named are gone. The conclusion held; the
mechanism did not, and the doc says so.
`editor-parity-gap-matrix.md`'s "Settings editor UI" row moves 🟡 → ✅ with its
residuals named, and `t3code-parity-second-sweep.md`'s `no-general-preferences`
is marked closed with the four things still missing spelled out rather than
quietly dropped.

**`docs/settings-reference.md` is generated, not written** — `bun run
settings:reference`. A hand-maintained table of 36 keys with defaults and scopes
is a table that is wrong within a month, and this file is the one a user reads to
hand-edit their settings.

**AGENTS.md gained a Settings section**, which is the durable outcome of this
work: every user-facing knob is a registry entry, never a new localStorage key; a
key is never registered inert; scope is a security boundary with the
execution/suppression split stated; settings are read through `useSettingValue`
or `readSettingsMirror`; secrets never enter the document.

**Keyboard:** Escape returns focus to the search box from anywhere in the list,
captured on the container rather than per row so a new widget cannot silently
miss it, and skipped when a control has already handled the key — a recorder is
capturing, and a text field treats Escape as "discard my edit". Roving tabindex
was **not** built: it earns its keep against thousands of tab stops in a
virtualized list, and virtualization was dropped at ~55 visible rows. Building it
anyway would have been ceremony copied from VS Code's constraints rather than
ours.

`unused:exports` and `unused:files` are clean for the whole settings feature.

### Deferred deliberately

- **The keybindings shape.** `Record<commandId, hotkey|null>` is a key-value model
  over a list domain, and the strain is already documented in our own code:
  _"the settings document stores one hotkey per command, so a command with two
  defaults loses both"_ ([active-bindings.ts:47-53](apps/web/src/keymap/active-bindings.ts:47)).
  Meanwhile `PlatformKeyBinding` carries a `pane` clause a user cannot express
  ([types.ts:73](apps/web/src/keymap/types.ts:73)). The right shape is
  `{ key, command, pane?, remove? }[]`. But changing it rewrites
  `resolvedPlatformKeyBindings`, `commandKeyBindings`, `liveKeyBindings`,
  `appliedOverrides`, the collision policy, the palette's shortcut display, and the
  titlebar accelerators. Keep the Record shape through the storage cutover so the
  highest-risk phase changes one thing at a time; take the rule list in Phase 7,
  where those tests are being deleted anyway.
- ~~**Editor commands remain unrebindable.**~~ ✅ **Resolved on main (`91d22d4`)** —
  `AppRuntimeContent` now resolves overrides before building the editor layers, and
  the filter is gone from `keybinding-section.tsx`. The Keyboard Shortcuts page can
  list every command honestly, which removes the largest shortfall this plan had
  budgeted for.
- **Language-specific overrides** (`"[typescript]": {}`). Not now.

## Registry payload

**Scope of v1 is full parity** (maintainer's call). The full inventory is
[settings-registry-inventory.md](settings-registry-inventory.md) — 230 candidate keys
across 8 namespace groups, each with its default verified against `fda1523`.

**The "~95 keys" estimate this plan shipped with was wrong**, in both directions:

|                                                           | Count  |
| --------------------------------------------------------- | ------ |
| Candidates inventoried                                    | 230    |
| Distinct after dedupe (see below)                         | ~213   |
| **`visibility: user` — the actual settings page**         | **55** |
| `visibility: advanced`                                    | 76     |
| `visibility: internal` (engineering constants, JSON-only) | 99     |
| NEW FEATURE (behaviour does not exist yet)                | 25     |

So the _page_ is ~55 rows — comfortably below the virtualization threshold, which
retires that open question. The _registry_ is ~213. The earlier "roughly 80 of the
~95 keys are wiring" sentence should be read as: **~190 of ~213 are wiring, ~25 are
new features.**

Corrected namespace list — the earlier one omitted four namespaces that groups
actually registered against, three of which are the only sections that exist on disk
today: `workbench`, `editor`, `files`, `terminal.integrated`, `search`, `chat`, `git`,
`lsp`, `telemetry`, **`logs`**, **`providers`**, **`models`**, **`keybindings`**,
`window`, plus a new **`server`** namespace for the bind/network knobs (port, host,
allowed origins, session token, workspace root) that currently have no home.

### Before anyone types `keys.ts`

Four corrections, in order. Each was found by an auditor and independently verified.

**1. Resolve ~18 duplicates.** 8 keys are registered twice under the _same_ id with
conflicting scope or phase; 10 _constants_ are registered twice under _different_
ids, which is worse because an id-uniqueness check misses them — e.g.
`git.autofetchPeriod` and `git.upstreamFetch.interval` both cite
[upstream-fetch.ts:5](apps/server/src/git/upstream-fetch.ts:5). Ship a registry test
asserting **no two descriptors cite the same defining `file:line`**, not just that
ids are unique. Resolve each conflict scope-first.

**2. Editor keys are Phase 5, not Phase 3.** 17 `editor.*` rows came back marked P3,
but Phase 3 is an enumerated 10-key appearance batch containing exactly one editor
key (`editor.diff.viewMode`). As mis-assigned, Phase 3 would have to ship two new
editor-package setters and a plugin-array restructure — inside the phase whose entire
point is being the first thin vertical slice.

**3. Amend the scope rule to separate execution from suppression.** Six `search.*`
keys came back `window`, and they _do_ reach `spawn` — verified:
`caseSensitive` → `--ignore-case`, `wholeWord` → `--word-regexp`, and include/exclude
globs → `--glob <pattern>` at
[search.ts:716-755](apps/server/src/fs/search.ts:716), spawned at
[search-tool-runner.ts:34](apps/server/src/fs/search-tool-runner.ts:34). The
unqualified rule bounces all six, which would kill per-project search excludes — the
single most legitimate use of workspace settings.

> **Amended rule.** A value that reaches **execution** — selects the binary, sets env,
> becomes a flag name, or binds a key — is `application` or `machine`. Never `window`.
> A value that reaches only **suppression** — lands as a data operand after a fixed
> flag, on a fixed binary, spawned with no shell, and can at worst hide results — may
> be `window`, but **must** carry the "also modified in `<scope>`" indicator.

The indicator is not decoration here. A cloned repo shipping
`search.exclude: ['**/*.ts']` hides files from the user _and from the agent's search
results_, silently. `SERVER_CONSUMED_SETTINGS` enforces the amended wording, and
`terminal.integrated.shellArgs`, `lsp.servers`, `providers.instances`, and
`chat.defaultRuntimeMode` stay on the execution side with no exception.

**4. Drop what is inert or misclassified.** `git.confirmForcePush` gates nothing —
force push does not exist ([service.ts:553-565](apps/server/src/git/service.ts:553)
builds only `['push']` or `['push','--set-upstream',…]`). `workbench.chatMode.sessionRailVisible`
and `.toolPaneVisible` are restored session state, not preferences — `toolPaneOpen`
flips as a side effect of clicking the already-active tab, so a write-through would
churn `settings.json` on every click. Keep `defaultToolTab`, which is a real startup
preference.

### The cross-repo schedule risk, confirmed

`packages/editor-core` is a **relative** symlink to `../../Editor/packages/editor`,
which from this worktree resolves to `.claude/worktrees/Editor` — a path that does not
exist. `ls packages/editor-core/` fails with ENOENT here; the real files are at
`/Users/shaul/Desktop/D/Editor/packages/editor/`, a **separate repository at a
different HEAD**.

Every "new editor-package setter" in Phase 5 is therefore a commit in another repo,
consumed through a symlink that is broken in this worktree, plus `bun link`, plus root
overrides — and historically needs a Vite dev-server restart to pick up. Budget it as
cross-repo work, not as a prop change. Values re-verified at the real path:
`DEFAULT_TAB_SIZE = 4`, `wrap: options.wordWrap ?? false`, `setLineHeight` and
`setWordWrap` exist, **`setTabSize` does not**.

### Cut list, restated honestly

The 25 NEW FEATURE keys are where the schedule goes. The honest cut line, if cutting
is needed: `files.autoSave`, `files.autoSaveDelay`, `editor.formatOnSave`, live
`editor.tabSize`, the editor plugin-enable flags, `git.enabled`,
`git.decorations.enabled`, `lsp.enable`, and `workbench.wallpaper.animated`/`.source`.
None of them compromises the architecture.

### Notable gaps the sweep found

- **A whole font service with no font setting.** `apps/server/src/fonts/` scrapes
  nerdfonts.com, subsets, caches to `~/.platform/fonts`, and serves four routes wired
  at [app.ts:129](apps/server/src/app.ts:129). Its only consumer hardcodes
  `DEFAULT_NERD_FONT_ID = 'JetBrainsMono'`
  ([default-nerd-font.ts:3](apps/web/src/lib/default-nerd-font.ts:3)). This is the
  clearest built-it-never-exposed-it gap in the repo, and it is what makes
  `editor.fontFamily` and `terminal.integrated.fontFamily` mean anything.
- **`editor.renderWhitespace` is free.** `hiddenCharacters` is _already_ wrapper-synced;
  the app just never passes it. One prop, zero package work — the cheapest user-facing
  editor key in the inventory.
- **No version string anywhere**, so a bug report cannot carry one. An About section
  (version, build, settings file path, reveal-logs action) is the cheapest row on the
  page and closes a tracked gap. Revealing the log directory needs one new
  `DesktopRPC` request — the bridge currently has exactly one handler.
- **`workbench.clockFormat`** is a tracked exit criterion and unclaimed. Trap: all four
  `Intl.DateTimeFormat` instances are built once at module load for virtualized-list
  performance, so a live change must rebuild them, not mutate them.

### Sharp edges

- The editor is constructed with **no** typography or layout options at all
  ([editor.tsx:108-125](apps/web/src/features/editor/components/editor.tsx:108)).
- The plugin array is built once per mount, so minimap / scope-lines / syntax toggles
  need plugin-level enable flags or an editor remount.
- The `-solid` utilities deliberately ignore `--surface-opacity`, so a "100% opacity"
  setting will not make everything opaque uniformly. Verify visually.
- The app theme key is literally `'theme'` — unversioned and unprefixed, unlike every
  other `platform.*` key. Delete it in the same pass; do not migrate.
- **Name trap**: the content-well property is `--content-opacity`, not
  `--surface-contentOpacity`, and its only consumer is the terminal background — the
  editor does not read it. Either wire the editor well in the same pass or narrow the
  setting's description. Do not ship a slider that claims to affect the editor.
- Several ids borrow a VS Code name while changing its type or unit. The dangerous one
  is `git.autofetchPeriod`: **milliseconds** here, **seconds** in VS Code — both parse.
  Either adopt VS Code's value space or rename.

## Testing

Real in-process Elysia server, no module mocks, `fixtures.ts`, `renderWithProviders`.
`node`/`dom` under `bun --bun vitest`; `browser` avoided (it has hung at the RUN
banner).

Named cases that must exist:

- **Layer precedence** — workspace beats user beats default; policy beats all.
- **Scope filter** — an `application`-scoped key in the workspace file is dropped and
  reported, not applied.
- **Unknown-key retention** — write an unknown key by hand, toggle an unrelated
  setting through the route, assert the unknown key survives byte-for-byte.
- **Malformed recovery** — a broken file serves defaults, refuses writes with
  `FILE_MALFORMED`, and `settings.reset` still works.
- **Empty file** — zero bytes resolves to `{}`, and a write succeeds.
- **Comment preservation** — a commented file survives a UI write.
- **Echo suppression round-trip** — write via the store, hand-edit away, hand-edit
  back to the store-written bytes, assert a change is still emitted.
- **Stale revision** — a hand-edit between read and rename is refused, not lost.
- **Identity** — resolve twice from identical layer documents and assert
  `Object.is` on `keybindings.overrides`.
- **Registry** — every default parses against its own schema; every
  `SERVER_CONSUMED_SETTINGS` key is `application` or `machine` scope.
- **Isolation** — the harness asserts the resolved settings _and secrets_ paths are
  under the temp root.
- **Secrets never leak** — set a provider env value, then assert it appears in
  none of: `GET /settings`, `GET /settings/raw`, an export, the workspace layer, or
  any line the run wrote to `logs/`. One test, five assertions; it is the guard that
  makes the raw routes defensible.
- **Secret round-trip** — read (masked) → write the mask back unchanged → assert the
  stored value survived, and that renaming a variable does **not** carry the old
  value onto the new name (`restoreRedactedSecrets` matches on id+name, never
  position).
- **Secrets file mode** — after a write, `stat` reports `0600`, including when the
  write went through temp+rename.
- Plus search ranking, per-type widget rendering, reset-to-default, scope switching,
  and "with no folder open, the settings surface can be dismissed".

## Preconditions — cleared 2026-08-13

Root `bun install` succeeded in 2.9s with **no lockfile change**: all fifteen
`@singapor/*` global links were already registered and the sibling `../../Editor`
repo was present. The step the plan called fragile was not, this time.

It did leave two **pre-existing, environmental** failures in `bun run verify`, both
artifacts of the fresh install and neither related to any settings code:

- `desktop typecheck` — `electrobun`'s own `dist/api/bun/index.ts` imports `three`
  with no types (`TS7016`). Confirmed pre-existing by stashing the change and
  re-running: identical failure.
- `@workspace/tree` browser tests — Playwright wants `chromium_headless_shell-1223`;
  the cache has `1228` and `1234`. Fix with
  `bunx playwright install chromium-headless-shell`. Non-gating per the testing
  section.

Everything else is green: contracts, server (737 tests), web (1536 tests), lint,
format.

## Preconditions

- This worktree has **no root `node_modules`**. `bun install` here is the documented
  fragile step: the `link:@singapor/*` overrides depend on global `bun link`
  registrations plus the sibling `../../Editor` repo, and `bun install` busts the
  turbo cache. Make "root install succeeds and `@singapor/core` resolves" an explicit
  gate before Phase 1.

## Docs to reconcile

`docs/router-everything-linkable-plan.md` encodes settings in **five** places, not
one: `:100` (owned search param), `:136-139` (address table), `:153` (pushed history
entry), `:158` (retained param), `:199` (state inventory), `:378-382` (M6 milestone),
and `:486` (explicitly rejects moving settings off the dialog). All of them.

Also `docs/editor-parity-gap-matrix.md` `:116/:509/:510/:515` and
`docs/t3code-parity-second-sweep.md` Milestone B — which _is_ this work.

Write the doc nobody has: a **user-facing settings reference** (every key, default,
scope, and what it affects). With ~213 keys in a hand-editable file, that is the doc
that matters most. Add an AGENTS.md rule: _every new user-facing knob gets a registry
entry, never a new localStorage key._

## Resolved (2026-08-12)

All five open questions are closed. No blockers remain.

| #   | Question                         | Decision                                                                                                                                                                    | Where                                                         |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Two home dot-directories         | **Consolidate onto `~/.platform/` now**, in Phase 2, via a new `platformHomePath()` helper. No migration code — user deletes `~/.platform-file-picker`.                     | [Home directory consolidation](#home-directory-consolidation) |
| 2   | Scope of v1                      | **Full parity** — verified inventory came back at 230 candidates / ~213 distinct / 55 user-visible, not the ~95 estimated. Phases batch by wiring risk, not ambition.       | [Registry payload](#registry-payload)                         |
| 3   | The env editor                   | **Ships in v1.** Main's wire redaction (`920af78`) is adopted as-is; sensitive values move to a sibling `secrets.json` so the file store, raw routes, and export stay safe. | [Secrets](#secrets)                                           |
| 4   | `models.hidden` / `models.order` | **Keep and wire both ends** — catalog-sourced rows, picker applies the prefs. Deleting saves nothing structurally.                                                          | Phase 7                                                       |
| 5   | Desktop shell state              | **Same document**, `machine` scope. Window _preferences_ are settings; last-window-bounds is restored state and stays out.                                                  | [Desktop](#desktop)                                           |

### Two things to watch as a consequence

Neither changes the architecture; both are schedule risks that full parity makes
real rather than hypothetical.

- **The feature-shaped keys.** `files.autoSave`, `files.autoSaveDelay`, and
  `editor.formatOnSave` do not exist anywhere in the codebase, and live
  `editor.tabSize` plus the plugin toggles need editor-package changes
  (`setTabSize` does not exist; the plugin array is built once per mount). These are
  the honest cut line if the schedule slips.
- **The secrets split is Phase 2, not follow-up.** `920af78` protects secrets on the
  wire but not on disk, and this plan's raw routes, JSON tab, and export all hand the
  disk back to that channel. Sensitive values must live outside the settings file
  _before_ the first settings file is written — moving them afterwards is a
  migration, and there is no migration code. This is the one item where main's work
  made this plan's job bigger rather than smaller.
