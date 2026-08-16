# Plan 035: Move the six execution-affecting env knobs onto the settings registry

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
>
> ```
> git diff --stat ace313f..HEAD -- apps/server/src/lsp apps/server/src/app.ts packages/contracts/src/settings.ts packages/contracts/src/settings/keys.ts packages/contracts/src/settings/registry.ts packages/contracts/src/index.ts packages/contracts/src/tests/settings-registry.test.ts docs/settings-reference.md
> ```
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Known drift already present at the time of writing (not a STOP condition)**:
> the working tree at `ace313f` has _uncommitted_ edits to
> `packages/contracts/src/settings/keys.ts`, `packages/contracts/src/settings/registry.ts`,
> `packages/contracts/src/index.ts`, `docs/settings-reference.md` and ~13 files
> under `apps/web/` that add a `title` / `rowOwner` field and the `models.*`
> row-sharing helpers. Those edits are unrelated to this plan and do not touch
> anything below. `apps/server/` was byte-identical to `ace313f`.
>
> **Baseline, capture it before you edit anything** (verified 2026-08-16 — these
> are pre-existing conditions, none of them yours to fix):
>
> ```
> cd /Users/shaul/Desktop/D/platform && bun run format:check
> ```
>
> → **fails**, on exactly one file: `apps/web/src/features/settings/hooks/use-setting-inspection.ts`.
> That file is out of scope. It means the root `bun run verify` cannot exit 0 in
> this working tree, which is why the gates below are per-workspace. Do **not**
> format or edit anything under `apps/web/` to make a gate go green.
>
> ```
> cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck && bun run test
> cd /Users/shaul/Desktop/D/platform/packages/contracts && bun run typecheck && bun run test
> ```
>
> → all green (contracts: 14 files, 120 tests). The `apps/server` suite spawns
> real processes and takes a few minutes — run it anyway, and **write down which
> tests fail, if any**. Step 12 re-runs it, and without this baseline you cannot
> tell your breakage from the pre-existing kind. A red _contracts_ baseline is a
> STOP condition; a red server test that this plan does not touch is a note for
> your report, not a thing to fix.
>
> ```
> cd /Users/shaul/Desktop/D/platform && bun -e "import {SETTING_IDS} from './packages/contracts/src/index'; console.log(SETTING_IDS.length)"
> ```
>
> → `34` today. Step 11 expects `38`. Record whatever number you actually get;
> the invariant is +4, not the literal 34.
>
> ```
> cd /Users/shaul/Desktop/D/platform && git status --porcelain > /tmp/plan-035-baseline-status.txt
> ```
>
> → the "files you did not dirty" snapshot the last Done criterion diffs against.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: api-design
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

Six environment-variable names decide which language-server **binary** the
server spawns, with what **argv**, with what **environment**, and whether it is
**downloaded** first. `AGENTS.md` says that is exactly what must not happen, and
one of the six is worse than a style violation: it is a **one-way latch**.
`apps/server/src/lsp/registry.ts:55` snapshots `process.env.FS_EXPERIMENTAL_LSP_TY`
at module load, and `:511` ORs that snapshot into the per-call value, so
`lspServersForEnvironment(env)` advertises an injection seam that can turn the
flag **on** but can never turn it **off**. The function cannot be driven to a
known state, which means the existing default-set test at
`apps/server/src/lsp/tests/registry.test.ts:17` **fails on any machine whose
shell exports `FS_EXPERIMENTAL_LSP_TY`** — a test that reports green only
because nobody has that variable set.

Two of the six (`FS_LSP_CONFIG`, `FS_LSP_IDLE_TIMEOUT_MS`) are legacy aliases
sitting beside a `PLATFORM_`-prefixed name for the same knob, which the repo's
greenfield rule bans outright.

None of the six is in `.env.example` or in `turbo.json`'s `globalPassThroughEnv`
(`turbo.json:4`), so under `turbo` they do not even reach the process. They are
undiscoverable knobs that only work by accident.

After this plan: four registry keys under a **Language servers** category,
readable and editable from the settings page and `~/.platform/settings.json`,
all at `machine` scope so a cloned repository cannot reach them; six env names
deleted; the latch gone; and a test that proves the flag flips **both**
directions even with the old env var exported.

**Six names, four keys — the counts differ on purpose.** Deleted:
`FS_EXPERIMENTAL_LSP_TY`, `PLATFORM_LSP_CONFIG`, `FS_LSP_CONFIG`,
`PLATFORM_LSP_IDLE_TIMEOUT_MS`, `FS_LSP_IDLE_TIMEOUT_MS`,
`FS_DISABLE_LSP_DOWNLOAD`. Registered: `lsp.experimental.tyForPython`,
`lsp.idleTimeoutMs`, `lsp.downloadRuntimes`, `lsp.servers`. Two of the six are
`FS_` aliases of a `PLATFORM_` name, which is why six collapse into four.
`MAX_TEXT_FILE_BYTES` (`apps/server/src/fs/service.ts:70-71`) looks like a
seventh; it is out of scope for the architectural reason given in Scope.

## Repo conventions that govern this change

The executor has not read `AGENTS.md`. These are the rules that decide the shape
of this work, quoted verbatim from `/Users/shaul/Desktop/D/platform/AGENTS.md`:

> ## Settings
>
> - Every user-facing knob is a registry entry in `packages/contracts/src/settings/keys.ts`. Never a new `localStorage` key, never a new env var, never a hardcoded constant someone has to recompile to change.
> - A key is never registered inert. Register it in the same pass that wires its consumer, or do not register it — a knob that writes a file nothing reads is worse than no knob.
> - Scope is a security boundary. A value that reaches **execution** — selects a binary, sets env, becomes a flag name, or binds a key — is `application` or `machine`, never `window`: a workspace file ships inside a cloned repository. A value that reaches only **suppression** may be `window`, and then it must show the cross-scope indicator.
> - Settings are read through `useSettingValue` in React, or `readSettingsMirror()` outside it (module scope, async generators). Do not reach into the query cache directly.
> - Secrets never enter the settings document. They go to the secret store, which is why the raw JSON view, export and the settings file itself are safe to read.
> - Regenerate `docs/settings-reference.md` with `bun run settings:reference` after changing the registry.

**Important qualification on the fourth bullet**: `useSettingValue` and
`readSettingsMirror()` are **web-app** mechanisms (`apps/web/src/features/settings/utils/boot-mirror.ts`).
This plan changes **server** code. On the server the equivalent is the
`SettingsStore` instance that `createApp` already builds at
`apps/server/src/app.ts:78`; read it with `settings.snapshot().values['<id>']`,
exactly as `apps/server/src/settings/store.ts:108` does for
`providers.instances`. Do **not** import anything from `apps/web` into
`apps/server`.

> ## Greenfield, No Backward Compatibility
>
> - This project is greenfield and not live: no releases, no external users, no data anyone needs migrated.
> - No backward compatibility shims, no legacy aliases, no deprecation windows. Update every call site in the same pass.

> ## Control Flow
>
> - Keep nesting depth to 3 or less.
> - Use guard clauses and early returns. Keep the happy path shallow.
> - Do not use `else` after an early return.
> - Never use nested ternaries.

> ## Naming And Refactors
>
> - When removing a redundant prefix, rename the file, exports, and all call sites in one pass.
> - Delete obsolete tests instead of preserving old behavior.

> ## Testing
>
> - Do not `mock.module` or `vi.mock` our server, client, or feature modules.

The `apps/web` rule about importing `{ test, expect }` from
`apps/web/test/fixtures.ts` does **not** apply here. The `apps/server` LSP tests
import `{ describe, expect, it }` from `vitest` directly — see
`apps/server/src/lsp/tests/registry.test.ts:4` — and this plan keeps that.

Design constraint quoted from `packages/contracts/src/settings/registry.ts:11-30`,
the doc comment on `SettingScope`:

> - `application` — the user file only. App-wide, no per-project meaning.
> - `machine` — the user file only, and machine-specific: paths, binaries, window chrome. Never synced even if syncing arrives.
> - `window` — the user file or a workspace file.
> - `resource` — as `window`; reserved for per-file/per-language keys.
>
> The rule that decides between them: a value reaching **execution** — selecting a binary, setting env, becoming a flag name, or binding a key — is `application` or `machine`, never `window`.

All four new keys select or configure a **binary** on **this machine**, so all
four are `machine`. Not `application`, not `window`.

## Current state

### The files, and each one's role

- `apps/server/src/lsp/registry.ts` — the built-in table of 36 language servers,
  the `PLATFORM_LSP_CONFIG` override reader, and the ty/pyright switch. Contains
  the latch bug.
- `apps/server/src/lsp/proxy-session.ts` — pooled LSP child processes; reads the
  idle-disposal timeout from env at `:929-935`.
- `apps/server/src/lsp/installers.ts` — downloads and resolves language-server
  binaries; the download kill-switch is a module const at `:43`, consulted at 11
  sites.
- `apps/server/src/lsp/routes.ts` — the `/lsp/match` handler and the `/lsp`
  websocket; the only caller of `matchLspServer` and `LspProxySession.create`.
- `apps/server/src/app.ts` — `createApp`; already owns a `SettingsStore` (`:78`)
  and already wires the LSP routes (`:161`, `:164`).
- `packages/contracts/src/settings.ts` — value schemas for registry entries
  (`providerInstanceConfigsSchema`, `keybindingOverridesSchema`, …).
- `packages/contracts/src/settings/keys.ts` — `SETTINGS_REGISTRY`, the one table.
- `packages/contracts/src/index.ts` — the package's only barrel (allowed; it
  backs the `"."` export).

### The latch — `apps/server/src/lsp/registry.ts:55`

```ts
const useTyForPython = truthy(process.env.FS_EXPERIMENTAL_LSP_TY)
const serverPriority = ['deno', 'typescript', 'vue', 'eslint', 'oxlint', 'biome'] as const
```

### The seam it defeats — `apps/server/src/lsp/registry.ts:474-515`

```ts
export async function matchLspServer(input: {
  filePath: string
  serverId?: string | null
  workspaceRoot: string
}) {
  const extension = fileExtension(input.filePath)
  const candidates = lspServersForEnvironment()
    .filter((server) => serverMatches(server, extension, input.serverId))
    .sort(compareServerPriority)

  for (const server of candidates) {
    const root = await server.root(input.filePath, input.workspaceRoot)
    if (!root) continue

    return { root, server } satisfies LspServerMatch
  }

  return null
}

export function lspServersForEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const configured = lspConfigFromEnvironment(env)
  const base = experimentalFilteredServers(env)
  if (!configured) return base

  const servers = new Map(base.map((server) => [server.id, server]))
  for (const [id, config] of Object.entries(configured)) {
    if (config.disabled) {
      servers.delete(id)
      continue
    }

    const existing = servers.get(id)
    if (!config.command && !existing) continue

    servers.set(id, configuredServer(id, config, existing))
  }

  return Array.from(servers.values())
}

function experimentalFilteredServers(env: NodeJS.ProcessEnv) {
  const tyEnabled = truthy(env.FS_EXPERIMENTAL_LSP_TY) || useTyForPython
  if (tyEnabled) return lspServers.filter((server) => server.id !== 'pyright')

  return lspServers.filter((server) => server.id !== 'ty')
}
```

`|| useTyForPython` is the bug: passing `{ FS_EXPERIMENTAL_LSP_TY: undefined }`
cannot clear a snapshot that was `true` at import.

### The hand-rolled parser and the legacy alias — `apps/server/src/lsp/registry.ts:44-53, 614-650, 722-752`

```ts
type LspConfig = Record<
  string,
  {
    readonly command?: readonly string[]
    readonly disabled?: boolean
    readonly env?: Record<string, string>
    readonly extensions?: readonly string[]
    readonly initialization?: Record<string, unknown>
  }
>
```

```ts
function lspConfigFromEnvironment(env: NodeJS.ProcessEnv): LspConfig | null {
  const raw = env.PLATFORM_LSP_CONFIG ?? env.FS_LSP_CONFIG
  if (!raw) return null

  try {
    return lspConfigFromValue(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

function lspConfigFromValue(value: unknown): LspConfig | null {
  /* … */
}
function lspServerConfigFromValue(value: unknown): LspConfig[string] | null {
  /* … */
}
function stringArray(value: unknown) {
  /* … */
}
function stringRecord(value: unknown) {
  /* … */
}
function unknownRecord(value: unknown) {
  /* … */
}
function truthy(value: string | undefined) {
  /* … */
}
```

Those five hand-written validators exist only because a JSON string from an env
var had to be validated by hand. A valibot schema in `@workspace/contracts`
replaces all of them, and the settings store already runs the schema on write
(`apps/server/src/settings/store.ts:242-249`) and on resolve.

### Where that config reaches execution — `apps/server/src/lsp/registry.ts:589-601`

```ts
return {
  id,
  extensions: config.extensions ?? existing?.extensions ?? [],
  root: existing?.root ?? (async (_filePath, workspaceRoot) => workspaceRoot),
  spawn: (root) =>
    spawnCommand(command, {
      cwd: root,
      env: {
        ...process.env,
        ...config.env,
      },
    }),
  initializationOptions: configuredInitialization(config, existing),
}
```

Arbitrary argv, arbitrary environment. This is why `lsp.servers` must be
`machine`.

### The idle timeout — `apps/server/src/lsp/proxy-session.ts:79, 551-554, 929-935`

(`lspIdleTimeoutMs` reads `process.env` at :930; it is one of the 11 baseline
grep hits listed in step 12.)

```ts
const DEFAULT_IDLE_TIMEOUT_MS = 120_000
```

```ts
  private scheduleIdleDisposal(): void {
    this.clearIdleTimer()
    this.idleTimer = setTimeout(() => this.dispose('idle_timeout'), lspIdleTimeoutMs())
  }
```

```ts
function lspIdleTimeoutMs(): number {
  const raw = process.env.PLATFORM_LSP_IDLE_TIMEOUT_MS ?? process.env.FS_LSP_IDLE_TIMEOUT_MS
  const parsed = Number(raw)
  if (Number.isFinite(parsed) && parsed >= 0) return parsed

  return DEFAULT_IDLE_TIMEOUT_MS
}
```

The second `PLATFORM_`/`FS_` alias pair. Note `lspIdleTimeoutMs()` is called
**fresh on every arm**, so a settings-backed value takes effect on the next arm
with no restart — keep that property.

### The download kill-switch — `apps/server/src/lsp/installers.ts:43`

```ts
const disableDownloads = truthy(process.env.FS_DISABLE_LSP_DOWNLOAD)
```

Consulted at exactly 11 sites: lines **85, 98, 114, 125, 304, 344, 371, 418,
446, 468, 491**. Ten are `if (… disableDownloads) return null`; line 371 is
`if (disableDownloads) return false`.

`installers.ts:726-730` has a **second, character-identical copy** of
`truthy` (the first is `registry.ts:748-752`). Both die in this plan.

### How the routes are wired today — `apps/server/src/app.ts:161-164`

```ts
    .get('/lsp/match', ({ query }) => lspRouteMatch(fs.paths, query), {
      query: lspMatchQuerySchema,
    })
    .ws('/lsp', lspRoutes(fs, auth))
```

and the store that already exists two dozen lines above, `apps/server/src/app.ts:78`:

```ts
const settings = new SettingsStore({ ...options.settings, workspaceRoot: fs.paths.workspaceRoot })
```

### The registry entry shape to copy — `packages/contracts/src/settings/keys.ts:310-324`

`window.nativeVibrancy` is the closest existing `machine`-scope entry; match its
style, including the `//` comment that explains _why_ the scope is what it is.

```ts
  'window.nativeVibrancy': defineSetting({
    schema: v.boolean(),
    default: false,
    // Machine scope: window chrome is a property of this machine's desktop shell,
    // and a cloned repository must not be able to re-chrome the window.
    scope: 'machine',
    widget: 'boolean',
    category: 'Window',
    description: 'Composite the live macOS desktop behind the window.',
    // …
    keywords: ['window', 'vibrancy', 'transparency', 'desktop', 'macos'],
  }),
```

### The existing security test to extend — `packages/contracts/src/tests/settings-registry.test.ts:131-145`

```ts
/**
 * The standing security rule, enforced rather than documented. Anything whose
 * value reaches process spawn, exec, env, or the keymap must not be readable
 * from a workspace file, because that file ships inside a cloned repository.
 */
it('keeps every execution-reaching key out of the workspace layer', () => {
  const executionReaching = [
    'providers.instances',
    'keybindings.overrides',
  ] as const satisfies readonly (keyof typeof SETTINGS_REGISTRY)[]

  for (const id of executionReaching) {
    expect(['application', 'machine']).toContain(descriptorFor(id).scope)
  }
})
```

### The settings page hides `internal` keys — `apps/web/src/features/settings/components/page.tsx:35-37`

```ts
const visible = matchingSettingIds(query).filter(
  (id) => (descriptorFor(id).visibility ?? 'user') !== 'internal',
)
```

This is why `lsp.servers` gets `visibility: 'internal'`: no widget in
`SettingWidget` can edit a record of objects, so the key is edited through the
raw-JSON view only. `packages/contracts/src/settings/registry.ts:47-52` states
the intent:

> `user` is the default page. `advanced` is searchable but collapsed. `internal` is reachable only through the JSON view — it exists so an engineering constant can be overridable and greppable without cluttering the page.

## Commands you will need

| Purpose                      | Command                                                                                                 | Expected on success                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Contracts typecheck          | `cd /Users/shaul/Desktop/D/platform/packages/contracts && bun run typecheck`                            | exit 0, no errors                                                                                                    |
| Contracts tests              | `cd /Users/shaul/Desktop/D/platform/packages/contracts && bun run test`                                 | all pass                                                                                                             |
| Server typecheck             | `cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck`                                   | exit 0, no errors                                                                                                    |
| LSP tests only               | `cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run src/lsp`                        | all pass                                                                                                             |
| Full server tests            | `cd /Users/shaul/Desktop/D/platform/apps/server && bun run test`                                        | all pass                                                                                                             |
| Regenerate the docs table    | `cd /Users/shaul/Desktop/D/platform && bun run settings:reference`                                      | prints `wrote …/docs/settings-reference.md (N settings)` with N four higher than before (38, if the baseline was 34) |
| Server lint                  | `cd /Users/shaul/Desktop/D/platform/apps/server && bun run lint`                                        | exit 0                                                                                                               |
| Contracts lint               | `cd /Users/shaul/Desktop/D/platform/packages/contracts && bun run lint`                                 | exit 0                                                                                                               |
| Format the files you touched | `cd /Users/shaul/Desktop/D/platform/apps/server && bun run format` and the same in `packages/contracts` | exit 0                                                                                                               |

Notes on the runners, because they are unusual:

- `apps/server` tests **must** run under `bun --bun` (its `test` script is
  `bun --bun vitest run`). Without `--bun`, `bun:sqlite` and `Bun.spawn` do not
  resolve.
- `packages/contracts` runs **plain** `vitest` (`bun run test`), no `--bun`.
- **Do not use the root `bun run verify`.** It runs `format:check` across every
  workspace, and this working tree already fails that on an out-of-scope
  `apps/web` file (see the baseline block at the top). The per-workspace gates
  above are the real bar for this plan.
- `bun run format` in a workspace is `oxfmt --write .`, i.e. the whole
  workspace. Both `apps/server` and `packages/contracts` are format-clean at the
  baseline, so this will only rewrite files you touched. If it rewrites anything
  else, revert those files — a formatting sweep is not part of this plan.
- `timeout(1)` does not exist on this machine. Do not wrap commands in it.

## Scope

**In scope** (the only files you may modify):

- `packages/contracts/src/settings.ts` — add the LSP override schema.
- `packages/contracts/src/index.ts` — export it.
- `packages/contracts/src/settings/keys.ts` — add the four registry entries.
- `packages/contracts/src/tests/settings-registry.test.ts` — extend the
  execution-reaching list; add one type-derivation declaration.
- `apps/server/src/lsp/registry.ts`
- `apps/server/src/lsp/proxy-session.ts`
- `apps/server/src/lsp/installers.ts`
- `apps/server/src/lsp/routes.ts`
- `apps/server/src/app.ts`
- `apps/server/src/lsp/tests/registry.test.ts`
- `apps/server/src/lsp/tests/proxy-session.test.ts`
- `apps/server/src/lsp/tests/routes.test.ts`
- `apps/server/src/lsp/tests/installers.test.ts` — **create**; step 7.5.
- `docs/settings-reference.md` — **regenerated only**, never hand-edited.

**Out of scope** (do NOT touch, even though they look related):

- `apps/server/src/fs/service.ts` and its `MAX_TEXT_FILE_BYTES` read
  (`service.ts:71`), plus `FS_DEV_MAX_TEXT_FILE_BYTES` (`apps/server/src/index.ts:23`).
  Those are two more env names in the same family, and they stay.
  `SettingsStore` is constructed **from**
  `fs.paths.workspaceRoot` (`apps/server/src/app.ts:78`), so `FileSystemService`
  cannot read a setting without reversing that construction order, and doing so
  means re-deriving the workspace root outside `FileSystemService` — a second
  hand-maintained copy of a path rule, plus fifteen `createApp` call sites and
  `GitService`, which takes its limit from `fs.info().maxTextFileBytes`
  (`app.ts:69`). That is a separate plan, not a rider on this one.
- `apps/server/src/lsp/proxy-session.ts`'s **pooling** (`pooledSessions`,
  `lspProxySessionKey`, `removePooledSession`). Changing `lsp.servers` does not
  kill an already-running child process; that needs an exported disposer and is
  plan 034's subject. This plan states the limitation in the setting's
  `description` instead of building the disposer.
- **`serverPriority` at `apps/server/src/lsp/registry.ts:56`** — the line
  _directly below_ the one you delete in step 5.3, and
  `docs/settings-registry-inventory.md` names it as a future `lsp.serverPriority`
  key. It is not an env var, it is a plain module const, and this plan is about
  env names. Leave line 56 exactly as it is.
- **A global `lsp.enable` switch.** The inventory also proposes one. It does not
  exist today and has no consumer; registering it here would be an inert key,
  which `AGENTS.md` bans outright.
- `apps/server/src/lsp/proxy-session.ts`'s `startingSessions` map (`:78`,
  `:701-708`). It is the in-flight de-dup for `pooledLspProxySession`; it needs
  no change, and touching it is how the pooling gets broken.
- `docs/settings-registry-inventory.md`. It is a dated planning artifact
  ("verified against `fda1523`"), not a live reference; editing its 400-line
  tables is churn with no consumer.
- `turbo.json` and `.env.example`. **Verified**: none of the six env names
  appears in either file, so there is nothing to remove.
- Any new `SettingWidget` member, and any change to
  `packages/contracts/src/settings/registry.ts`. Plan 026 rewrites
  `SettingWidget`; adding a member here would collide with it.
- `apps/web/**`. These are server-side knobs with no client consumer. Do not add
  a settings-page control, do not add a `useSettingValue` call.
- Argv hardening of `config.command` (option-injection). That is plan 017's
  subject; `machine` scope is this plan's security boundary.

## Git workflow

- **All work happens on `main`** — no new branches, worktrees, commits, pushes,
  or PRs unless the operator explicitly asks.
- If the operator does ask for a commit: conventional commits, lowercase
  descriptive subject. Real examples from `git log`:
  - `refactor(orchestration): the server prepares a session's worktree (M-C)`
  - `fix(address): bound the URL, and stop escaping slashes in ?tabs=`
  - A fitting subject here: `refactor(lsp): the six env knobs become four settings keys`

## Steps

### Step 1: Add the LSP server override schema to contracts

Edit `packages/contracts/src/settings.ts`. It already declares
`ENVIRONMENT_VARIABLE_NAME_PATTERN` at line 12 — reuse it. Append after
`keybindingOverridesSchema` (line 103), before the `export type` block:

```ts
/**
 * One entry of the LSP server override table.
 *
 * Every field is optional because an entry may either replace a built-in
 * server's command or only adjust it: `{ disabled: true }` removes a bundled
 * server, `{ extensions: ['.foo'] }` widens one, and a `command` with no
 * matching built-in id registers a new server outright.
 *
 * `env` is stored in the clear — this is for `PATH`-style knobs, not
 * credentials. Anything secret belongs in the secret store, which is what keeps
 * the settings document safe to read, export and hand to an agent.
 */
export const lspServerOverrideSchema = v.object({
  /** argv, binary first. An empty array is rejected: it would spawn nothing. */
  command: v.optional(v.pipe(v.array(trimmedNonEmptyStringSchema), v.minLength(1))),
  disabled: v.optional(v.boolean(), false),
  env: v.optional(
    v.record(v.pipe(v.string(), v.regex(ENVIRONMENT_VARIABLE_NAME_PATTERN)), v.string()),
  ),
  extensions: v.optional(v.array(trimmedNonEmptyStringSchema)),
  initialization: v.optional(v.record(v.string(), v.unknown())),
})

/**
 * Server id → override. Keyed rather than a list because the id is what the
 * registry merges on, and two entries claiming one id would make the result
 * depend on iteration order.
 */
export const lspServerOverridesSchema = v.record(
  trimmedNonEmptyStringSchema,
  lspServerOverrideSchema,
)
```

**Type trap, so it does not surprise you in step 10**: `disabled` has a default,
so `v.InferOutput` makes it **required** on `LspServerOverride` (same as
`enabled` on `providerInstanceConfigSchema`, `settings.ts:61`). Every override
object written as a _type-checked literal_ — the test fixtures in step 10 — must
therefore spell `disabled` out. Objects fed through `v.parse` (step 4) must not,
because parse fills it. This is intended; do not drop the default to dodge it.

and add to the type exports at the bottom of the same file (currently lines
105-108):

```ts
export type LspServerOverride = v.InferOutput<typeof lspServerOverrideSchema>
export type LspServerOverrides = v.InferOutput<typeof lspServerOverridesSchema>
```

**Verify**: `cd /Users/shaul/Desktop/D/platform/packages/contracts && bun run typecheck` → exit 0.

### Step 2: Export the new schema from the contracts barrel

Edit `packages/contracts/src/index.ts`. The `from './settings'` export block runs
from line 470 (`export {`) to line 483 (`} from './settings'`). Insert the four
names in the block's existing alphabetical order — the value names go after
`keybindingOverridesSchema` and before `modelRefKey`; the `type` names go after
`type KeybindingOverrides` and before `type ModelRef`:

```ts
  lspServerOverrideSchema,
  lspServerOverridesSchema,
```

```ts
  type LspServerOverride,
  type LspServerOverrides,
```

This is the package's `"."` entry-point barrel, which `AGENTS.md` explicitly
permits. Do not create any other barrel.

**Verify**: `cd /Users/shaul/Desktop/D/platform/packages/contracts && bun run typecheck` → exit 0.

### Step 3: Register the four keys

Edit `packages/contracts/src/settings/keys.ts`.

Extend the import at the top (currently lines 2-6):

```ts
import {
  keybindingOverridesSchema,
  lspServerOverridesSchema,
  modelRefListSchema,
  providerInstanceConfigsSchema,
} from '../settings'
```

Insert the four entries into `SETTINGS_REGISTRY` immediately **after**
`'files.autoSaveDelay'` (which ends at line 342) and **before**
`'providers.instances'`:

```ts
  'lsp.experimental.tyForPython': defineSetting({
    schema: v.boolean(),
    default: false,
    // Machine scope, and not negotiable: this picks which Python binary spawns —
    // `spawnTy` or pyright's `pyright-langserver`. A cloned repository choosing
    // the language server that runs against its own source is exactly what the
    // execution rule forbids.
    scope: 'machine',
    widget: 'boolean',
    category: 'Language servers',
    // Honest about the pooling: matching is re-run per file, but a language
    // server already running for a folder is reused by key, so an open Python
    // file keeps whichever server it started with.
    description:
      'Use ty instead of pyright for Python. Files already open keep their current server until reopened.',
    visibility: 'advanced',
    keywords: ['lsp', 'python', 'ty', 'pyright', 'experimental'],
  }),
  'lsp.idleTimeoutMs': defineSetting({
    // Clamped at an hour: the timer governs how long an idle language-server
    // child process stays resident, and an unbounded value is a memory leak
    // with a settings key in front of it.
    schema: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(3_600_000)),
    default: 120_000,
    // Machine scope: this is a per-box RAM tradeoff and it governs child-process
    // lifetime.
    scope: 'machine',
    widget: 'number',
    category: 'Language servers',
    description:
      'Milliseconds an unused language server stays alive after the last editor disconnects. 0 shuts it down immediately.',
    visibility: 'advanced',
    keywords: ['lsp', 'idle', 'timeout', 'memory', 'process'],
  }),
  'lsp.downloadRuntimes': defineSetting({
    schema: v.boolean(),
    default: true,
    // Machine scope: this decides whether a binary is fetched onto this machine
    // and then executed.
    scope: 'machine',
    widget: 'boolean',
    category: 'Language servers',
    description:
      'Download missing language servers on demand. Off means only servers already on PATH are used.',
    visibility: 'advanced',
    keywords: ['lsp', 'download', 'install', 'offline', 'network'],
  }),
  'lsp.servers': defineSetting({
    schema: lspServerOverridesSchema,
    default: {},
    // The strongest case for machine scope in the whole table: `command` becomes
    // argv and `env` is spread over the child's environment, so a workspace file
    // that could set this would be arbitrary code execution on clone.
    scope: 'machine',
    // No widget can edit a record of objects, so this is reachable through the
    // raw JSON view only — which is what `internal` means. Registering it
    // anyway is the point: it replaces an env var nobody could discover.
    widget: 'complex',
    visibility: 'internal',
    category: 'Language servers',
    description:
      'Per-server overrides: command, env, extensions, initialization, or disabled. Applies the next time a server starts; one already running for a folder keeps its old command until it idles out.',
    keywords: ['lsp', 'language server', 'command', 'override', 'disable'],
  }),
```

`widget: 'complex'` **already exists** in the `SettingWidget` union
(`packages/contracts/src/settings/registry.ts:45`) and currently has zero users.
You are adding its first user, not adding a union member — do not edit
`registry.ts`.

Key-id sanity, so you do not have to guess: `SETTING_ID_PATTERN` at
`packages/contracts/src/settings/registry.ts:9` is
`/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/`. All four ids satisfy it,
including the three-segment `lsp.experimental.tyForPython`.

**Verify**: `cd /Users/shaul/Desktop/D/platform/packages/contracts && bun run test` →
all pass. In particular `registryProblems(SETTINGS_REGISTRY)` must still be
`[]`; if it reports "default does not parse" you have a schema/default mismatch.

### Step 4: Extend the contracts tests

Edit `packages/contracts/src/tests/settings-registry.test.ts`.

(a) Add the four ids to the `executionReaching` array (currently at lines
137-140), keeping the `as const satisfies` suffix intact:

```ts
const executionReaching = [
  'providers.instances',
  'keybindings.overrides',
  'lsp.servers',
  'lsp.experimental.tyForPython',
  'lsp.idleTimeoutMs',
  'lsp.downloadRuntimes',
] as const satisfies readonly (keyof typeof SETTINGS_REGISTRY)[]
```

(b) Add one type-derivation declaration beside the existing ones (which live at
lines 25-49, above `describe`). Import `lspServerOverridesSchema` alongside the
existing `modelRefListSchema, providerInstanceConfigsSchema` import from
`'../settings'`:

```ts
const _serversAreOverrides: SettingsValues['lsp.servers'] = v.parse(lspServerOverridesSchema, {
  typescript: { disabled: true },
  'custom-lsp': { command: ['custom-lsp-server', '--stdio'], extensions: ['.custom'] },
})
```

and add `void _serversAreOverrides` to the `void` list below the declarations.
Read the file comment at lines 15-21 first — these are compile-time
declarations, enforced by `tsgo --noEmit`, not runtime assertions.

**Verify**:
`cd /Users/shaul/Desktop/D/platform/packages/contracts && bun run typecheck && bun run test`
→ exit 0, all pass.

### Step 5: Take the env out of `registry.ts`

Edit `apps/server/src/lsp/registry.ts`.

1. Add at the top of the import block:

```ts
import type { LspServerOverride, LspServerOverrides } from '@workspace/contracts'
```

(`@workspace/contracts` is already a dependency of `apps/server` — see
`apps/server/package.json`.)

2. Do sub-step 6 (the deletions) **before** this one — `LspConfig` has six uses
   today, and four of them live inside functions that step 6 removes. Delete
   those first and only two remain.

   Then **delete** the local `LspConfig` type (lines 44-53) and replace every
   surviving use of `LspConfig[string]` with `LspServerOverride`: exactly two
   sites, `configuredServer`'s `config` parameter (`:577`) and
   `configuredInitialization`'s (`:605`). There is no surviving bare `LspConfig`
   use — the parameter type of `lspServersFor` comes from `LspSettings` instead.

3. **Delete** line 55 entirely:

```ts
const useTyForPython = truthy(process.env.FS_EXPERIMENTAL_LSP_TY)
```

4. Add the settings type next to the other exported types (after
   `LspServerMatch`, around line 42):

```ts
/**
 * What the registry needs from settings, resolved by the caller.
 *
 * Passed in rather than read here: the module used to snapshot `process.env` at
 * import, which made the experimental flag a one-way latch no test could clear.
 * A plain value parameter is the property that bug cost us.
 */
export type LspSettings = {
  readonly servers: LspServerOverrides
  readonly tyForPython: boolean
}
```

5. Replace `matchLspServer` (`:474`), `lspServersForEnvironment` (`:489`) and
   `experimentalFilteredServers` (`:510`) — lines 474-515 as one block — with:

```ts
export async function matchLspServer(input: {
  filePath: string
  serverId?: string | null
  settings: LspSettings
  workspaceRoot: string
}) {
  const extension = fileExtension(input.filePath)
  const candidates = lspServersFor(input.settings)
    .filter((server) => serverMatches(server, extension, input.serverId))
    .sort(compareServerPriority)

  for (const server of candidates) {
    const root = await server.root(input.filePath, input.workspaceRoot)
    if (!root) continue

    return { root, server } satisfies LspServerMatch
  }

  return null
}

export function lspServersFor(settings: LspSettings) {
  const base = experimentalFilteredServers(settings.tyForPython)
  const overrides = Object.entries(settings.servers)
  if (overrides.length === 0) return base

  const servers = new Map(base.map((server) => [server.id, server]))
  for (const [id, config] of overrides) {
    if (config.disabled) {
      servers.delete(id)
      continue
    }

    const existing = servers.get(id)
    if (!config.command && !existing) continue

    servers.set(id, configuredServer(id, config, existing))
  }

  return Array.from(servers.values())
}

function experimentalFilteredServers(tyForPython: boolean) {
  if (tyForPython) return lspServers.filter((server) => server.id !== 'pyright')

  return lspServers.filter((server) => server.id !== 'ty')
}
```

The old name `lspServersForEnvironment` would be a lie once there is no
environment, so it is renamed in the same pass, per the repo's rename rule.

6. **Delete** these now-unreachable functions in full: `lspConfigFromEnvironment`
   (`:614`), `lspConfigFromValue` (`:625`), `lspServerConfigFromValue` (`:639`),
   `stringArray` (`:722`), `stringRecord` (`:729`), `unknownRecord` (`:742`), and
   `truthy` (`:748`). Roughly 70 lines go. Nothing outside this file imports any
   of them — verified: they are all module-private.

**Verify**:

```
cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck
```

→ it will still **fail**, and that is expected: `routes.ts` and
`tests/registry.test.ts` still call the old signatures. The gate is _which files_
the errors name. Every error must be in `apps/server/src/lsp/routes.ts` or
`apps/server/src/lsp/tests/registry.test.ts`, and every one must be about the
missing `settings` argument or the removed `lspServersForEnvironment`. **Any
error inside `registry.ts` itself is a STOP condition** — most likely the
readonly/mutable case in the STOP list below.

### Step 6: Take the env out of `proxy-session.ts`

Edit `apps/server/src/lsp/proxy-session.ts`.

1. **Delete** `const DEFAULT_IDLE_TIMEOUT_MS = 120_000` (line 79) and the whole
   `lspIdleTimeoutMs()` function (lines 929-935). The default now lives in the
   registry entry.

2. Thread a **getter**, not a number, so the value stays live across settings
   writes exactly as the env read was live across arms:

   - `LspProxySession.create` (line 82) gains a fourth parameter:

     ```ts
     export class LspProxySession {
       static async create(
         socket: LspProxySocket,
         match: LspServerMatch,
         rootPath: string,
         idleTimeoutMs: () => number,
       ): Promise<LspProxyClientSession | null> {
         const session = await pooledLspProxySession(match, rootPath, idleTimeoutMs)
         if (!session) return null

         return session.connect(socket)
       }
     }
     ```

   - `pooledLspProxySession(match, rootPath)` (line 694) and
     `PooledLspProxySession.spawn(key, match, rootPath)` (line 136) each gain the
     same `idleTimeoutMs: () => number` parameter and pass it down to the private
     constructor (line 122), which stores it as
     `private readonly idleTimeoutMs: () => number`.

   - `scheduleIdleDisposal` (line 551) becomes:

     ```ts
       private scheduleIdleDisposal(): void {
         this.clearIdleTimer()
         this.idleTimer = setTimeout(() => this.dispose('idle_timeout'), this.idleTimeoutMs())
       }
     ```

   Add a one-line comment on the field explaining why it is a function: a pooled
   session outlives many settings writes, and reading at arm time is what makes
   the knob take effect without a restart.

   **Pooling note you must not "fix"**: when a session is already pooled for a
   key, the getter passed by the _second_ caller is discarded — the first one
   wins. Every caller in this codebase passes the same app-level closure, so this
   is not observable. Do not add re-binding logic.

**Verify** (both must print nothing — typecheck is still expected to fail at
this point, because `routes.ts` and the tests have not caught up):

```
cd /Users/shaul/Desktop/D/platform && git grep -nE "PLATFORM_LSP_IDLE_TIMEOUT_MS|FS_LSP_IDLE_TIMEOUT_MS|DEFAULT_IDLE_TIMEOUT_MS|lspIdleTimeoutMs" -- apps/server/src/lsp/proxy-session.ts
```

### Step 7: Replace the download kill-switch in `installers.ts`

Edit `apps/server/src/lsp/installers.ts`.

1. Add to the imports:

```ts
import { DEFAULT_SETTING_VALUES } from '@workspace/contracts'
```

2. Replace line 43 with:

```ts
/**
 * Whether missing language servers may be downloaded.
 *
 * Module-level rather than a parameter because the check sits eleven frames
 * deep behind twenty `spawn` closures in `registry.ts`, none of which carry
 * settings. Held as a *getter* so a settings write takes effect without a
 * restart, and defaulted from the registry so a test that never calls
 * `setLspDownloadPolicy` behaves like a default install.
 */
let readDownloadRuntimes: () => boolean = () => DEFAULT_SETTING_VALUES['lsp.downloadRuntimes']

export function setLspDownloadPolicy(read: () => boolean): void {
  readDownloadRuntimes = read
}

/**
 * Exported for the polarity test only. The setting reads "may download"; every
 * one of the eleven call sites asks "must not download", and a missing `!` here
 * would silently stop the product downloading any language server with every
 * other gate still green.
 */
export function downloadsDisabled(): boolean {
  return !readDownloadRuntimes()
}
```

3. Replace the identifier `disableDownloads` with the call `downloadsDisabled()`
   at all 11 usage sites — lines **85, 98, 114, 125, 304, 344, 371, 418, 446,
   468, 491**. The surrounding conditions and their polarity stay **exactly** as
   they are; this is a mechanical identifier→call swap, nothing else.

4. **Delete** the now-unreachable `truthy` at lines 726-730.

**Verify**:

```
cd /Users/shaul/Desktop/D/platform && git grep -n "disableDownloads" -- apps/server
```

→ no output.

```
cd /Users/shaul/Desktop/D/platform && git grep -c "downloadsDisabled()" -- apps/server/src/lsp/installers.ts
```

→ `apps/server/src/lsp/installers.ts:11` (11 call sites; the definition line
reads `export function downloadsDisabled(): boolean {`, which does not match).

5. **Create `apps/server/src/lsp/tests/installers.test.ts`** — the polarity gate.
   Without it, writing `return readDownloadRuntimes()` instead of
   `return !readDownloadRuntimes()` passes typecheck, lint, and every grep in
   this plan while disabling all language-server downloads:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTING_VALUES } from '@workspace/contracts'

import { downloadsDisabled, setLspDownloadPolicy } from '../installers'

afterEach(() => {
  setLspDownloadPolicy(() => DEFAULT_SETTING_VALUES['lsp.downloadRuntimes'])
})

describe('LSP download policy', () => {
  it('allows downloads until something turns them off', () => {
    // Both directions, because the setting reads "may download" and the eleven
    // call sites ask "must not download". A dropped `!` inverts the product.
    expect(downloadsDisabled()).toBe(false)

    setLspDownloadPolicy(() => false)
    expect(downloadsDisabled()).toBe(true)

    setLspDownloadPolicy(() => true)
    expect(downloadsDisabled()).toBe(false)
  })
})
```

**Verify**: `cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run src/lsp/tests/installers.test.ts`
→ 1 test passes.

### Step 8: Thread the settings through `routes.ts`

Edit `apps/server/src/lsp/routes.ts`.

1. Import the new type and add a runtime type:

```ts
import { matchLspServer, type LspSettings } from './registry'
```

```ts
/**
 * The live settings the LSP layer reads, as getters.
 *
 * Getters rather than values because `/lsp/match` and the websocket outlive any
 * one settings snapshot, and a knob that only applied at boot would be a knob
 * the user has to restart the server to use.
 */
export type LspRuntime = {
  readonly settings: () => LspSettings
  readonly idleTimeoutMs: () => number
}
```

2. `lspRouteMatch` (line 21) takes the resolved settings as a third parameter:

```ts
export async function lspRouteMatch(
  paths: WorkspacePaths,
  query: v.InferOutput<typeof lspMatchQuerySchema>,
  settings: LspSettings,
) {
  const match = await resolveLspRouteMatch(paths, {
    path: query.path,
    root: query.root,
    serverId: query.server ?? null,
  }, settings)
  // … unchanged
```

3. `lspRoutes` (line 43) takes the runtime as its third parameter, keeping
   `deps` last so the existing default still works:

```ts
export function lspRoutes(
  fs: LspRouteFileSystem,
  auth: AuthConfig,
  runtime: LspRuntime,
  deps: LspRouteDeps = {},
) {
```

4. Inside `open`, pass them through — line 70 and line 84 become:

```ts
const match = await resolveLspRouteMatch(fs.paths, socket, runtime.settings(), matchServer)
```

```ts
const session = await createSession(
  socket,
  match,
  fs.paths.toRelative(match.root),
  runtime.idleTimeoutMs,
)
```

5. `resolveLspRouteMatch` (line 193) gains the settings parameter before the
   injectable `match`:

```ts
async function resolveLspRouteMatch(
  paths: WorkspacePaths,
  input: LspRouteMatchInput,
  settings: LspSettings,
  match: typeof matchLspServer = matchLspServer,
) {
  try {
    const file = input.path ? paths.resolve(input.path) : null
    if (!file) return null

    return match({
      filePath: file.absolutePath,
      serverId: input.serverId,
      settings,
      workspaceRoot: paths.resolve(input.root).absolutePath,
    })
  } catch {
    return null
  }
}
```

Note the call sites differ in argument order — `lspRouteMatch` passes settings
positionally as the third argument and lets `match` default; `open` passes both.
Read step 8.2 and 8.4 together before editing.

**Verify**: `cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck`
→ remaining errors only in `apps/server/src/app.ts` and the three files under
`apps/server/src/lsp/tests/`.

### Step 9: Wire it in `app.ts`

Edit `apps/server/src/app.ts`.

1. Extend the LSP import at line 13 and add the installers import:

```ts
import { lspMatchQuerySchema, lspRouteMatch, lspRoutes, type LspRuntime } from './lsp/routes'
import { setLspDownloadPolicy } from './lsp/installers'
```

2. After the `settings` construction (line 78) and its `onChange` block, add:

```ts
// Read through the store on every call rather than captured once: a language
// server that only picked up a settings change on restart would be a knob the
// page claims is live and is not.
const lsp: LspRuntime = {
  settings: () => {
    // One snapshot per call: `snapshot()` re-resolves every layer, so reading
    // two keys through two calls would resolve the whole document twice per
    // `/lsp/match` request.
    const { values } = settings.snapshot()

    return { servers: values['lsp.servers'], tyForPython: values['lsp.experimental.tyForPython'] }
  },
  idleTimeoutMs: () => settings.snapshot().values['lsp.idleTimeoutMs'],
}
// The one knob that cannot be threaded as a parameter — see the comment on
// `setLspDownloadPolicy`.
setLspDownloadPolicy(() => settings.snapshot().values['lsp.downloadRuntimes'])
```

Place it after the existing `settings.onChange(...)` block (which ends at line 121) and before `const orchestration = …`.

3. Update the two route registrations (lines 161-164):

```ts
    .get('/lsp/match', ({ query }) => lspRouteMatch(fs.paths, query, lsp.settings()), {
      query: lspMatchQuerySchema,
    })
    .ws('/lsp', lspRoutes(fs, auth, lsp))
```

**Verify**: `cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck`
→ remaining errors only in `apps/server/src/lsp/tests/`.

### Step 10: Update the three LSP test files, and add the latch regression test

**`apps/server/src/lsp/tests/registry.test.ts`**

- Change the import at line 7 to `import { lspServersFor, matchLspServer } from '../registry'`.
- Add a helper near the top of the file:

  ```ts
  const NO_OVERRIDES = { servers: {}, tyForPython: false } as const
  ```

- Line 17: `lspServersForEnvironment()` → `lspServersFor(NO_OVERRIDES)`.
- Lines 63-70 ("switches python support to ty when enabled"): replace the env
  object with `lspServersFor({ servers: {}, tyForPython: true })`.
- Lines 119-139 ("loads custom server definitions from PLATFORM_LSP_CONFIG"):
  rename the test to `'applies per-server overrides from settings'` and pass the
  record directly instead of a JSON string:

  ```ts
  const servers = lspServersFor({
    servers: {
      'custom-lsp': {
        command: ['custom-lsp-server', '--stdio'],
        disabled: false,
        extensions: ['.custom'],
      },
      typescript: { disabled: true },
    },
    tyForPython: false,
  })
  ```

  (Keep both existing assertions.)

- The three `matchLspServer({...})` calls at lines 78, 95, 111 each gain
  `settings: NO_OVERRIDES`.
- **Add the regression test** that this whole plan exists for. It must set the
  old env var and prove it is inert — that is the only assertion that can fail
  if someone reintroduces a module-load snapshot:

  ```ts
  it('turns ty off again through the setting, whatever the old env var says', () => {
    // The bug this replaces: `truthy(process.env.FS_EXPERIMENTAL_LSP_TY)` was
    // snapshotted at module load and ORed into every call, so the flag could be
    // turned on and never off, and this suite passed only on machines that did
    // not export it.
    process.env.FS_EXPERIMENTAL_LSP_TY = 'true'
    try {
      const on = lspServersFor({ servers: {}, tyForPython: true }).map((server) => server.id)
      const off = lspServersFor({ servers: {}, tyForPython: false }).map((server) => server.id)

      expect(on).toContain('ty')
      expect(on).not.toContain('pyright')
      expect(off).toContain('pyright')
      expect(off).not.toContain('ty')
    } finally {
      delete process.env.FS_EXPERIMENTAL_LSP_TY
    }
  })
  ```

**`apps/server/src/lsp/tests/proxy-session.test.ts`**

- **Delete** lines 14-23's env plumbing — `previousIdleTimeout`, the
  `beforeEach` that sets `PLATFORM_LSP_IDLE_TIMEOUT_MS = '0'`, and the reset
  inside `afterEach` (keep the `roots` cleanup in `afterEach`). Drop
  `beforeEach` from the `vitest` import if it becomes unused.
- Add `const IMMEDIATE_IDLE = () => 0` near the top and pass it as the fourth
  argument to every `LspProxySession.create(...)` call — lines 28, 29, 112, 113.

**`apps/server/src/lsp/tests/routes.test.ts`**

- Add a runtime fixture and pass it as the third argument to `lspRoutes` (line
  34):

  ```ts
  function lspRuntime(): LspRuntime {
    return {
      settings: () => ({ servers: {}, tyForPython: false }),
      idleTimeoutMs: () => 0,
    }
  }
  ```

  ```ts
  const routes = lspRoutes(
    { paths: createWorkspacePaths(root) },
    auth(),
    lspRuntime(),
    bufferedLspDeps(root, createdSessions),
  )
  ```

  and extend the import at line 8 to
  `import { lspRoutes, type LspRouteDeps, type LspRuntime } from '../routes'`.

- The existing `as unknown as` casts on the injected fakes inside
  `bufferedLspDeps` (lines 57 and 63) still compile — `LspRouteDeps` is unchanged
  by this plan. Leave them, and leave `bufferedLspDeps` itself alone.

**Verify**:

```
cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck && bun --bun vitest run src/lsp
```

→ typecheck exit 0; all LSP tests pass, including the new
`turns ty off again through the setting, whatever the old env var says`.

Then prove the old bug is really gone by running the suite with the env var
exported — this command **failed** before this plan and must pass now:

```
cd /Users/shaul/Desktop/D/platform/apps/server && FS_EXPERIMENTAL_LSP_TY=1 bun --bun vitest run src/lsp/tests/registry.test.ts
```

→ all pass, including `exposes the full built-in server set` (which lists
`pyright` and not `ty`).

### Step 11: Regenerate the settings reference

```
cd /Users/shaul/Desktop/D/platform && bun run settings:reference
```

Expected stdout: `wrote /Users/shaul/Desktop/D/platform/docs/settings-reference.md (N settings)`
where N is **four** higher than the baseline count you recorded at the top of
this plan — `38`, if that baseline was `34`.

Then confirm the new section exists:

```
cd /Users/shaul/Desktop/D/platform && grep -c "^## Language servers" docs/settings-reference.md
```

→ `1`. The generator emits one `## <category>` section per distinct `category`
string, sorted alphabetically, so a typo like `Language Servers` would silently
create a second section instead of failing.

Do **not** hand-edit `docs/settings-reference.md`; it carries a
"Generated … Edit `packages/contracts/src/settings/keys.ts`, not this file"
banner and the generator is the only writer.

### Step 12: Full verification

Format first, then gate each workspace. **Not** the root `bun run verify` — it
fails on a pre-existing out-of-scope `apps/web` formatting issue (baseline block
at the top of this plan).

```
cd /Users/shaul/Desktop/D/platform/apps/server && bun run format && bun run format:check && bun run lint && bun run typecheck && bun run test
```

→ exit 0, full `apps/server` suite at or better than the baseline you recorded.
Every LSP test must pass. A test that was already failing at the baseline and is
still failing the same way is not yours; say so in your report.

```
cd /Users/shaul/Desktop/D/platform/packages/contracts && bun run format && bun run format:check && bun run lint && bun run typecheck && bun run test
```

→ exit 0, 120+ tests pass (120 was the baseline; this plan adds no contracts
test cases, only ids inside an existing one).

```
cd /Users/shaul/Desktop/D/platform/apps/web && bun run typecheck
```

→ exit 0. `apps/web` imports the contracts barrel, so this is the gate that
catches a barrel export you got wrong. Do not run `apps/web`'s formatter or
tests; they are out of scope and already red at the baseline.

Then the deletion gate:

```
cd /Users/shaul/Desktop/D/platform && git grep -nE "FS_EXPERIMENTAL_LSP_TY|FS_LSP_CONFIG|PLATFORM_LSP_CONFIG|FS_LSP_IDLE_TIMEOUT_MS|PLATFORM_LSP_IDLE_TIMEOUT_MS|FS_DISABLE_LSP_DOWNLOAD" -- apps packages scripts turbo.json .env.example
```

→ **exactly one** line, the regression test's
`process.env.FS_EXPERIMENTAL_LSP_TY = 'true'` in
`apps/server/src/lsp/tests/registry.test.ts`. Before this plan the same command
printed 11 lines. (`docs/settings-registry-inventory.md` still mentions the
names; it is out of scope and excluded from the path list above.)

### Step 13: Confirm a running app still resolves a language server (conditional — skip if no server is up)

`AGENTS.md` says a dev server is always running and forbids starting your own.
**As of this plan's writing that was not true** — nothing was listening on 3001
or 5173. So probe first, and if nothing answers, **skip this step and say so in
your report**. Do not start a server, and do not treat a missing server as a
failure: steps 10 and 12 are the real correctness gates.

```
cd /Users/shaul/Desktop/D/platform && curl -sS -m 5 -o /dev/null -w "%{http_code}\n" http://localhost:3001/health -H "Origin: http://localhost:5173"
```

- `curl: (7) Failed to connect` → **no server is running. Skip the rest of this
  step.** Report "step 13 skipped: no dev server on :3001".
- `200` → continue below.

The port is `Number(Bun.env.PORT ?? 3001)` (`apps/server/src/index.ts:14`); if
`/health` answers on a different port, use that one.

```
curl -sS "http://localhost:3001/lsp/match?path=apps/server/src/app.ts&root=" -H "Origin: http://localhost:5173"
```

→ JSON containing `"serverId":"typescript"` and a `root`. `path` is resolved
relative to the **server's** workspace root (`FS_WORKSPACE_ROOT`, defaulting to
the filesystem root), so a `null` response here means the running server is
rooted somewhere other than this repo — that is not a regression. Re-run with a
path that is valid for that root, or skip. Also note a long-running dev server
still has the pre-edit module loaded; restarting it is the operator's call, so
report rather than restart.

## Test plan

New test cases in `apps/server/src/lsp/tests/registry.test.ts`:

1. **`turns ty off again through the setting, whatever the old env var says`** —
   the regression test for the latch. Sets `FS_EXPERIMENTAL_LSP_TY=true`, then
   asserts `tyForPython: true` yields ty-without-pyright _and_
   `tyForPython: false` yields pyright-without-ty. This is the assertion the old
   code could not satisfy in either direction while the env var was set.
2. **`applies per-server overrides from settings`** — the rewrite of the
   `PLATFORM_LSP_CONFIG` test. Same two assertions (typescript removed, custom
   server added), now driven by the typed record instead of a JSON string.

Changed, not new: `exposes the full built-in server set` and
`switches python support to ty when enabled` keep their assertions and only
change how the input is supplied. `packages/contracts/src/tests/settings-registry.test.ts`
gains four ids in the existing execution-reaching scope test and one
type-derivation declaration.

Model the new cases on the file they live in —
`apps/server/src/lsp/tests/registry.test.ts` — which imports
`{ afterEach, describe, expect, it }` from `vitest` and uses a local
`fixtureRoot()` helper. Do not introduce `apps/web/test/fixtures.ts` here; that
fixture module is for `apps/web` only.

New file `apps/server/src/lsp/tests/installers.test.ts` (step 7.5), one case:

- **`allows downloads until something turns them off`** — pins the polarity of
  `downloadsDisabled()` in **both** directions plus the registry default. It
  does not exercise the eleven call sites (that means network and PATH
  dependence); the `git grep "disableDownloads"` → nothing gate in step 7 is
  what proves the sites were all converted, and this test is what proves the
  thing they now call means what the old identifier meant.

No new test for `lsp.idleTimeoutMs` beyond the existing pooling suite: passing
`() => 0` from the tests is the same behaviour the deleted `beforeEach` bought
by exporting `PLATFORM_LSP_IDLE_TIMEOUT_MS = '0'`, and those three tests already
depend on immediate disposal.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd apps/server && bun run format:check && bun run lint && bun run typecheck && bun run test` exits 0.
- [ ] `cd packages/contracts && bun run format:check && bun run lint && bun run typecheck && bun run test` exits 0.
- [ ] `cd apps/web && bun run typecheck` exits 0. (Its `format:check` was already
      failing before you started — leave it failing.)
- [ ] `git grep -nE "FS_EXPERIMENTAL_LSP_TY|FS_LSP_CONFIG|PLATFORM_LSP_CONFIG|FS_LSP_IDLE_TIMEOUT_MS|PLATFORM_LSP_IDLE_TIMEOUT_MS|FS_DISABLE_LSP_DOWNLOAD" -- apps packages scripts turbo.json .env.example`
      prints exactly one line, inside `apps/server/src/lsp/tests/registry.test.ts`
      (it printed 11 lines at the baseline).
- [ ] `git grep -n "lspServersForEnvironment\|disableDownloads\|useTyForPython\|lspIdleTimeoutMs" -- apps packages`
      prints nothing.
- [ ] `git grep -n "function truthy" -- apps/server` prints nothing (both copies deleted).
- [ ] `cd apps/server && FS_EXPERIMENTAL_LSP_TY=1 bun --bun vitest run src/lsp/tests/registry.test.ts` passes.
- [ ] `grep -c "^## Language servers" docs/settings-reference.md` prints `1`,
      and the file was produced by `bun run settings:reference`, not by hand.
- [ ] `diff <(git status --porcelain) /tmp/plan-035-baseline-status.txt` shows
      **only additions**, and every added path is in the "In scope" list. **Do
      not** use a bare `git status --porcelain` as a gate: this tree already had
      ~20 unrelated dirty files (`apps/web/**`, `bun.lock`, `package.json`,
      `packages/contracts/src/settings/registry.ts`, untracked `plans/0*.md`)
      before you started. Note `packages/contracts/src/settings/registry.ts` is
      dirty at the baseline **and** out of scope — it must stay byte-identical to
      what you found.
- [ ] `plans/README.md` row for plan 035 updated (the row is at line 81).

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `apps/server/src/lsp/` changed since `ace313f`, or any
  "Current state" excerpt does not match the live file. In particular: if
  `registry.ts:511` no longer reads `truthy(env.FS_EXPERIMENTAL_LSP_TY) || useTyForPython`,
  someone has already fixed the latch and this plan's premise needs re-checking.
- `registryProblems(SETTINGS_REGISTRY)` returns a non-empty array after step 3.
  That means a default does not satisfy its own schema — fix the entry, not the
  test, and if it is not obvious which, report the `reason` string verbatim.
- The `LspServerOverrides` type inferred from valibot does not satisfy
  `configuredServer`'s uses (`config.command`, `config.env`, `config.extensions`,
  `config.initialization`). **Do not** "fix" it by copying arrays
  (`[...config.command]`) or by casting — `AGENTS.md` calls that a fake fix and
  says a readonly/mutable mismatch is a contract bug. Report the exact type error.
- Any test outside `apps/server/src/lsp/tests/` starts failing. Step 9 changes
  `createApp`, which every in-process server test builds, so a break in
  `src/settings/`, `src/fs/` or `src/orchestration/` tests means the `app.ts`
  wiring is wrong — not that those tests need updating.
- The `browser` vitest project is somehow needed. It is not — nothing here is a
  `*.browser.tsx` test — and that project is known to hang at the RUN banner in
  this repo. If you find yourself invoking `bun run test:browser`, stop.
- You are tempted to make a gate green by editing something the baseline already
  showed as broken or dirty: `apps/web/src/features/settings/hooks/use-setting-inspection.ts`
  (pre-existing format failure) or `packages/contracts/src/settings/registry.ts`
  (pre-existing uncommitted `title`/`rowOwner` work). Neither is yours. Stop.
- The `FS_EXPERIMENTAL_LSP_TY=1` run at the end of step 10 still fails. That is
  the plan's whole reason for existing; if it fails, a module-load `process.env`
  read survived somewhere. Report which assertion failed, do not delete the test.
- You conclude the change requires touching `apps/server/src/fs/service.ts`,
  `apps/web/**` source, `turbo.json`, `registry.ts:56`'s `serverPriority`, or the
  pooling internals of `proxy-session.ts`. All are out of scope for stated
  reasons; report instead of widening.
- You discover a consumer of any of the six env names outside
  `apps/server/src/lsp/` (the recon found none; the baseline grep is exactly the
  11 lines listed in step 12, and `apps/server/dist/` is a gitignored build
  artifact that does not count).

## Maintenance notes

For whoever owns this next:

- **What a reviewer should scrutinize.** First, that all four entries are
  `scope: 'machine'` — the settings-registry test now enforces it, but a future
  key added to this category could quietly be `window`, and `lsp.servers` is
  literally "run this argv with this env". Second, that
  `setLspDownloadPolicy` has exactly one production caller (`createApp`); the
  only other caller is `installers.test.ts`'s `afterEach` restoring the default.
  It is the one piece of module-level mutable state this plan introduces,
  justified only because the check sits behind twenty `spawn` closures that carry
  no settings. If a second production caller appears, the last one wins silently
  — and note it is process-global, so a second `createApp` in the same process
  (which the server test suite does) rebinds it for everyone.
- **Deliberately deferred: live invalidation of `lsp.servers`.** Sessions are
  pooled by `` `${server.id}\0${match.root}` `` (`proxy-session.ts:719-721`), so
  changing a server's `command` does not restart an already-running child; the
  old process serves that folder until its idle timer fires. The setting's
  `description` says so. The proper fix is an exported
  `disposeLspSessionsForServer(id)` called from a `settings.onChange`, which
  belongs with plan 034's `LspSessionPool` ownership work, not here.
- **Deliberately deferred: `files.maxTextFileBytes`.** See the Scope section.
  Whoever picks it up should start by extracting the workspace-root resolution
  out of `FileSystemService`'s constructor so `SettingsStore` can be built
  first — that is the actual blocker, and it is worth a plan of its own.
- **Interacts with plan 026** (`Bind SettingWidget to its schema type`).
  `lsp.servers` is the first and only user of `widget: 'complex'`. When 026
  binds widgets to schemas, `complex` + `v.record(string, object)` is the pairing
  it has to admit — or `lsp.servers` needs a new widget name. Nothing else
  breaks, because `visibility: 'internal'` keeps it off the rendered page
  (`apps/web/src/features/settings/components/page.tsx:35-37`).
- **Interacts with plan 017** (argv option-injection hardening). `config.command`
  now originates from a user-owned JSON file rather than an env var. The trust
  level is identical — both are the machine owner — but if 017 introduces an
  argv allowlist, `lsp.servers` is a call site it must consider.
- **Tell the user.** Anyone who has one of the six names exported in a shell
  profile or a local `.env` should delete it: those exports are now silently
  ignored. Per the greenfield rule, no compatibility read is added and none
  should be.
- **`docs/settings-registry-inventory.md:169-171`** predicted three of these four
  keys (`lsp.servers`, `lsp.idleTimeoutMs`, `lsp.experimental.tyForPython`) and
  diagnosed the latch. Those rows are now shipped; the doc is stale on that
  section but is a dated planning artifact and was left alone on purpose. Its two
  remaining LSP rows, `lsp.enable` (:168) and `lsp.serverPriority` (:172), are
  explicitly out of scope here — see the Scope section for why.
