# Plan 021: Give fire-and-forget async a rejection boundary on both server and client

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
> git diff --stat ace313f..HEAD -- apps/server/src/observability apps/server/src/index.ts apps/server/src/app.ts apps/server/src/settings/layer.ts apps/server/src/settings/store.ts apps/server/src/settings/json-document.ts apps/server/src/settings/paths.ts apps/server/src/settings/tests/store-watch.test.ts apps/server/src/fs/watch.ts packages/observability/src/runtime.ts apps/web/src/lib/client-logging.ts apps/web/src/features/git/notify-mutation-error.ts apps/web/src/features/git/tests/notify-mutation-error.test.ts apps/web/src/features/chat/components/chat-view.tsx apps/web/src/features/chat/components/chat-draft-view.tsx apps/web/src/features/chat/providers/model-picker-provider.tsx apps/web/src/features/chat/transport/orchestration-rpc-client.ts apps/web/src/features/chat-mode/components/project-rename-dialog.tsx apps/web/src/features/chat-mode/components/tests/project-menu.test.tsx apps/web/src/features/chat-mode/hooks/use-save-project-script.ts
> ```
>
> Expected: no output (nothing changed since this plan was written). If any
> in-scope file changed, compare the "Current state" excerpts against the live
> code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness
- **Planned at**: commit `ace313f`, 2026-08-16

Closes one instance of cross-cutting theme **T3 — "no shared home for a 10-line
utility → N copies"** from `plans/README.md`. There is no shared way to launch
work nothing awaits, so ~30 call sites each open-code the same non-answer:
`void`. `void` is not a rejection boundary; it is the absence of one.

**Every excerpt below was re-read at `ace313f` and matches. One correction to the
original audit finding is baked into this plan**: the client-side claim that a
failed `dispatchCommand` produces "no structured log event" is **wrong**. The RPC
layer already wraps every dispatch in `observeClientOperation`, which emits an
error-shaped event before rethrowing (excerpts below). What is genuinely missing
on the client is the _handled_ rejection, the _user-visible_ surface, and the
rename dialog _waiting_ for the result. This plan is scoped to exactly that — do
not add a second client log event.

## Why this matters

Two blast radii, one root cause.

**Server (the serious half).** Bun terminates the process on an unhandled
rejection. Four of these detached call sites are driven by something external —
a file watcher firing, a settings file changing on disk — so one unexpected
throw off the filesystem takes the whole server down with **nothing in
`logs/*.jsonl`** to say why. That is precisely the failure mode `AGENTS.md`'s
logging section forbids ("If the logs do not explain the failure, that is itself
the bug to fix first"). The path is real and reproducible today — see
"Reproducing the crash" below.

**Client (the smaller half).** Four commands are dispatched with `void` and no
handler. When the socket is down or the request times out, the promise rejects,
the RPC layer logs it, and then the rejection escapes unhandled: no toast, no
rollback, no dialog left open. The rename dialog is the worst of the four — it
calls `dismissRename()` on the line _after_ the dispatch, so the dialog closes as
if the rename succeeded, and the old name silently reappears on the next
projection sync.

After this plan: a detached server rejection is one wide warn event and a server
that is still running; a process-killing rejection is one error event flushed to
disk before exit; and a failed chat command is a toast the user can act on.

## Current state

### Server files and their role

- `apps/server/src/observability/` — the server's logging surface.
  `index.ts` is the established barrel every server module imports from
  (`import { recordProcessWarning } from '../observability'`). `runtime.ts`
  re-exports the process-level recorders from `@workspace/observability`;
  `logging.ts` holds `errorSummary`.
- `apps/server/src/settings/layer.ts` — one watched settings file. Its debounced
  reload is detached.
- `apps/server/src/settings/store.ts` — the layered settings document. Its
  `invalidate()` is what the layer's `onChange` runs, and it can throw.
- `apps/server/src/app.ts` — `createApp`. Re-runs the provider registry when
  settings change, detached.
- `apps/server/src/fs/watch.ts` — `FileChangeHub`, the filesystem watcher. Both
  its native-watcher callbacks dispatch detached handlers.
- `apps/server/src/index.ts` — the process entry point. Registers SIGINT/SIGTERM
  and nothing else.

#### `settings/layer.ts:236-262` (verbatim)

```ts
  private scheduleReload() {
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = setTimeout(() => {
      this.debounce = null
      void this.reload()
    }, RELOAD_DEBOUNCE_MS)
  }

  private async reload() {
    const next = await this.read().catch(() => null)
    if (!next) return

    // Suppress exactly one event: the one our own rename produced.
    //
    // Clearing this on every applied reload is load-bearing. Leaving it set
    // means a file that later returns to previously-written content — an undo in
    // the user's editor — matches the stale hash forever, and the store serves a
    // value the file no longer holds with nothing in the logs to say why.
    const isSelfWrite = next.revision !== null && next.revision === this.selfWrittenRevision
    this.selfWrittenRevision = null
    if (isSelfWrite) return

    if (next.revision === this.contents.revision) return

    this.contents = next
    this.onChange?.()
  }
```

Note the asymmetry: only the _read_ is guarded (`.catch(() => null)`). The
`this.onChange?.()` on the last line is not.

#### `settings/store.ts:305-328` (verbatim) — what `onChange` runs

```ts
  private invalidate() {
    this.cachedSnapshot = null
    // Re-read on every invalidation, not only when *we* wrote a secret. The
    // secret file has no watcher, so a hand-edit is otherwise invisible: the
    // page would show a set variable as empty, and the next save of that row
    // sends `''` back, which the write path reads as "delete it".
    this.secretRefs = new Set(this.secretStore.readSync().keys())
    const snapshot = this.snapshot()

    for (const listener of this.listeners) {
      // The file is already written by the time listeners run. Letting one throw
      // out of here would report "save failed" for a save that happened, and the
      // user would retry a write already on disk.
      try {
        listener(snapshot)
      } catch (error) {
        recordRequestContext({
          area: 'settings',
          operation: 'notify',
          settingsListenerError: error,
        })
      }
    }
  }
```

The `secretStore.readSync()` on line 311 sits **outside** that try/catch. It goes
through `readSettingsFileSync` (`settings/json-document.ts:105-114`), which
returns an empty document for `ENOENT` and **rethrows everything else**:

```ts
export function readSettingsFileSync(filePath: string): SettingsFileContents {
  try {
    const text = readFileSync(filePath, 'utf8')

    return { text, revision: textFileVersion(text) }
  } catch (error) {
    if (isMissingFile(error)) return { text: '', revision: null }
    throw error
  }
}
```

(`isMissingFile` is `error.code === 'ENOENT'`, `json-document.ts:204-206`.)

#### `app.ts:107-121` (verbatim)

```ts
// A saved provider list is inert unless something re-runs the registry when
// it changes. Without this the settings UI writes rows the server never reads
// until the next restart.
//
// Secrets are resolved here rather than in the snapshot: the values a provider
// spawns with never appear in anything a route can return.
settings.onChange(() => {
  void settings
    .providerInstancesForSpawn()
    .then((instances) =>
      providerAdapterRegistry.reconcile(
        mergeProviderInstanceConfigs(DEFAULT_PROVIDER_INSTANCES, instances),
      ),
    )
})
```

An async chain with no `.catch` at all. Because it is async it also escapes
`invalidate()`'s synchronous try/catch — the listener returns immediately and the
rejection lands later, unowned.

#### `fs/watch.ts:136-159` (verbatim)

```ts
    const subscription = await parcelWatcher.subscribe(
      target.absolutePath,
      (error, events) => {
        if (error) {
          this.emit(watchError(error, relativeRoot))
          return
        }

        for (const event of events) {
          void this.handleParcelEvent(relativeRoot, event)
        }
      },
      { ignore: watcherIgnoredChildGlobs },
    )

    return () => subscription.unsubscribe()
  }

  private createNodeWatcher(relativeRoot: string): WatchRelease {
    try {
      const target = this.paths.resolve(relativeRoot)
      const watcher = watch(target.absolutePath, { recursive: true }, (event, filename) => {
        void this.handleNodeEvent(relativeRoot, event, filename?.toString() ?? '')
      })
```

Both handlers `await` filesystem work and then call `this.emit(...)`, which fans
out through `broadcastTo` (`fs/watch.ts:282-284`):

```ts
  private broadcastTo(listeners: Set<Listener>, event: WatchServerMessage) {
    for (const listener of listeners) listener(event)
  }
```

No try/catch. A subscriber that throws rejects the detached handler.

#### `index.ts:53-69` (verbatim) — the only process-level handlers

```ts
installShutdownHandlers()

export type App = typeof app

function installShutdownHandlers() {
  let stopping = false

  const stop = (signal: NodeJS.Signals) => {
    if (stopping) return

    stopping = true
    void stopServer(signal)
  }

  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}
```

`rg -n "unhandledRejection|uncaughtException" apps/server packages/observability apps/desktop/src scripts` returns **no hits** in our source. (The only repo-wide hits are inside the vendored electrobun bundle under `apps/desktop/build/`, which is third-party and out of scope.)

#### The recorders that already exist

`observability/runtime.ts:4-11` (verbatim):

```ts
export {
  flushObservability,
  isObservabilityActive,
  observabilityConfig,
  recordObservabilityInfo as recordProcessInfo,
  recordObservabilityWarning as recordProcessWarning,
  resetObservabilityForTests,
} from '@workspace/observability'
```

`packages/observability/src/runtime.ts:108-118` (verbatim) — note that
`recordObservabilityError` exists in the package but is **not** re-exported by
the server yet:

```ts
export function recordObservabilityWarning(action: string, context: Record<string, unknown> = {}) {
  if (!runtime.config.enabled) return

  log.warn({ action, ...context })
}

export function recordObservabilityError(action: string, context: Record<string, unknown> = {}) {
  if (!runtime.config.enabled) return

  log.error({ action, ...context })
}
```

`errorSummary` (`observability/logging.ts:135-151`) already produces the wide
error shape used everywhere else — `{ code, fix, message, name, status, why }`
for an `Error`, with messages capped at 500 chars — and is re-exported from
`observability/index.ts:13`.

### Reproducing the crash (optional but recommended — 60 seconds)

This was run at `ace313f` and reproduces (re-confirmed by review). Write this
file **outside the repo** (e.g. in your scratch dir), run it, delete it. Do
**not** add it to the repo. Replace the absolute import path below with your own
checkout's path.

```ts
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SettingsStore } from '/Users/shaul/Desktop/D/platform/apps/server/src/settings/store'

process.on('unhandledRejection', (reason) => {
  console.log('UNHANDLED REJECTION:', (reason as Error)?.message)
  process.exit(7)
})

const root = await mkdtemp(path.join(tmpdir(), 'probe-'))
const store = new SettingsStore({ userFilePath: path.join(root, 'settings.json'), watch: true })
await mkdir(path.join(root, 'secrets.json')) // a directory where the file should be
await writeFile(path.join(root, 'settings.json'), '{ "models.hidden": ["alpha"] }', 'utf8')
await new Promise((resolve) => setTimeout(resolve, 600))
console.log('survived; no unhandled rejection observed')
store.close()
```

`bun <that file>` prints, today:

```
UNHANDLED REJECTION: EISDIR: illegal operation on a directory, read
```

Why a directory: `readFileSync` on a directory throws `EISDIR`, which is not
`ENOENT`, so `readSettingsFileSync` rethrows → out of `invalidate()` → out of
`reload()` → into the `void` at `layer.ts:240`. Without the `process.on` handler
in the probe, Bun kills the process. `SecretStore`'s path defaults to
`secrets.json` beside the settings file (`settings/paths.ts:41,57-59`), which is
what makes the probe (and the test in Step 2) possible without extra options.

### Client files and their role

- `apps/web/src/features/chat-mode/components/project-rename-dialog.tsx` — the
  rename dialog. Dismisses on the line after the dispatch.
- `apps/web/src/features/chat/components/chat-view.tsx` — persists a project's
  default model from an open thread.
- `apps/web/src/features/chat/components/chat-draft-view.tsx` — the same persist
  from the draft composer.
- `apps/web/src/features/chat-mode/hooks/use-save-project-script.ts` — promotes a
  run script into the project's saved list.
- `apps/web/src/features/chat/transport/orchestration-rpc-client.ts` — the RPC
  client behind `environment.dispatchCommand`.
- `apps/web/src/lib/client-logging.ts` — `observeClientOperation`.

#### `project-rename-dialog.tsx:37-44` (verbatim)

```tsx
function save() {
  if (!request || !canSave) return

  void environment.dispatchCommand(
    createProjectMetaCommand({ projectId: request.projectId, title: trimmed }),
  )
  dismissRename()
}
```

#### `chat-view.tsx:96-110` (verbatim)

```tsx
const projectId = thread?.projectId
// Stable identity is required because this is part of the model picker context value.
const handlePersistModelSelection = useCallback(
  (next: ModelSelection) => {
    if (!projectId) return

    void environment.dispatchCommand(
      createProjectDefaultModelCommand({
        defaultModelSelection: next,
        projectId,
      }),
    )
  },
  [environment, projectId],
)
```

#### `chat-draft-view.tsx:71-83` (verbatim)

```tsx
const handlePersistModelSelection = useCallback(
  (next: ModelSelection) => {
    if (!project) return

    void environment.dispatchCommand(
      createProjectDefaultModelCommand({
        defaultModelSelection: next,
        projectId: project.id,
      }),
    )
  },
  [environment, project],
)
```

#### `use-save-project-script.ts:42-50` (verbatim)

```ts
const remaining = project.scripts.filter((saved) => saved.command !== script.command)

void environment.dispatchCommand(
  createProjectScriptsCommand({
    projectId: project.id,
    scripts: [script, ...remaining],
  }),
)
```

#### These promises really do reject

`environment.dispatchCommand` is bound to the RPC client
(`features/chat/environment/local-chat-environment.ts:19`:
`dispatchCommand: dispatchOrchestrationCommandRpc`). The client rejects on
request timeout, connect timeout, socket error, socket close and heartbeat
timeout — e.g. `orchestration-rpc-client.ts:699-708`:

```ts
function createOrchestrationRpcTimeoutError(method: string) {
  return createClientError({
    code: 'ORCHESTRATION_RPC_TIMEOUT',
    message: `Orchestration RPC request timed out: ${method}`,
    status: 504,
    why: 'The server did not answer the orchestration WebSocket request before the client timeout.',
    fix: 'Inspect the chat pipeline logs and retry after the server is responsive.',
  })
}
```

#### The failure is **already logged** — do not log it twice

`orchestration-rpc-client.ts:78-100` (verbatim):

```ts
  dispatchCommand(command: ClientOrchestrationCommand) {
    return observeClientOperation(
      {
        action: 'chat.command.rpc',
        area: 'chat',
        ...chatCommandSummary(command),
      },
      async () => {
```

and `lib/client-logging.ts:101-116` (verbatim):

```ts
  } catch (error) {
    // A failure after the caller aborted is cancellation, not an error —
    // Chromium surfaces mid-stream cancellation as TypeError ("Error in
    // input stream"), which no error-shape check can tell apart from a real
    // network failure. The signal is ground truth.
    if (!isAbortError(error) && !signal?.aborted) {
      log[failedOperationLevel(level)]({
        ...baseEvent,
        durationMs: elapsedMs(startedAt),
        error: errorSummary(error),
        outcome: 'error',
      })
    }

    throw error
  }
```

`chatCommandSummary` (`features/chat/lib/chat-pipeline-logging.ts:29-37`) already
puts `commandId`, `commandType` and `projectId` on that event, so the log already
identifies which command failed. Adding a second event would violate
`AGENTS.md`'s wide-event rule.

#### One more audit correction, so you do not "fix" a non-bug

The model picker writes the pick into the draft store **before** calling
`persistModelSelection` (`features/chat/providers/model-picker-provider.tsx:46-51`):

```tsx
function commit(nextModelSelection: ModelSelection) {
  // Write the draft override first so the trigger never flickers while the
  // project default round-trips through the projection.
  setModelSelection(draftTarget, nextModelSelection)
  persistModelSelection(nextModelSelection)
}
```

So the composer keeps showing the user's pick even when the dispatch fails. Only
the **project default** silently fails to stick. Do not add a rollback of the
draft store.

#### The existing pattern to match on the client

`features/git/notify-mutation-error.ts` (verbatim, whole file) is the house shape
for "a failed background operation the user should be told about":

```ts
import { toast } from 'sonner'

import { toClientError } from '@/lib/client-error-taxonomy'
import { reportClientError } from '@/lib/client-error-reporting'

export function notifyMutationError(error: unknown) {
  const clientError = toClientError(error)

  reportClientError({
    area: 'git',
    category: clientError.category,
    cause: clientError.cause,
    message: clientError.message,
    operation: 'mutation',
  })

  if (clientError.category === 'unknown') return

  toast.error('Git command failed', {
    description: clientError.message,
  })
}
```

Note the file lives at the **feature root**, not in `utils/` — same as
`features/settings/notify-save-error.ts`. Follow that placement.

And `features/chat-mode/hooks/use-session-actions.ts:155-164` is how the chat
feature already phrases a caught dispatch failure — it uses `errorMessage` from
`@/lib/error-message`:

```ts
  } catch (error) {
    log.warn({
      action,
      area: 'chat',
      commandType: command.type,
      outcome: 'error',
      reason: errorMessage(error, 'Chat command failed.'),
      threadId,
    })
  }
```

### Repo conventions that apply (quoted from `AGENTS.md` — you have not read it)

- **Control flow**: "Keep nesting depth to 3 or less." / "Use guard clauses and
  early returns. Keep the happy path shallow." / "Do not use `else` after an
  early return." / "Never use nested ternaries."
- **Code organization**: "Import exact files through `@/`. Do not add barrel
  `index.ts` files." — you are **not** adding a barrel here.
  `apps/server/src/observability/index.ts` already exists and is the import path
  every server module already uses for observability; adding one export to it is
  the consistent move, not a new barrel.
- **Naming**: "Do not repeat the folder name in file or symbol names."
- **React**: "Avoid manual React memoization… Use them only for measured
  performance issues, required stable identity, or correctness. Add a short
  reason when you do." The two `useCallback`s you touch already carry that
  reason in a comment — keep the comment and the dependency array exactly as
  they are; you are only changing the body.
- **Logging**: "Logging is wide-event style (evlog). Always prefer wide logs:
  enrich the one event per operation/request with more fields instead of
  emitting extra narrow log lines." / "Never throw `new Error`. Create errors
  with `createError` from `evlog` — in practice through the feature's
  `structured-errors.ts` wrapper." **This plan creates no errors.** It only
  catches and records them. (Test files may construct plain `Error`s as
  fixtures — the existing suites do, e.g.
  `apps/web/src/features/git/tests/notify-mutation-error.test.ts:30`.)
- **Greenfield**: "No backward compatibility shims, no legacy aliases, no
  deprecation windows. Update every call site in the same pass."
- **Dev server**: "A dev server is always running. Never spin up your own server
  to test or verify changes — reuse the running one." One is live at
  http://localhost:5173. **Do not start one, and do not restart the server.**
- **Testing**: server tests import `{ describe, it, expect }` **directly from
  `vitest`** (see `apps/server/src/settings/tests/store-watch.test.ts:5`). The
  "import from `apps/web/test/fixtures.ts`" rule applies to **web** tests only.
  "Do not `mock.module` or `vi.mock` our server, client, or feature modules." /
  "Mock only the outside world." — `sonner` is third-party, and the repo already
  mocks it (`features/git/tests/notify-mutation-error.test.ts:8-10`). That is the
  only mock this plan permits.

## Commands you will need

| Purpose               | Command (run from repo root unless noted)                                                                                  | Expected on success                                                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck server      | `bun run --filter server typecheck`                                                                                        | exit 0, no errors                                                                                                                                                                                   |
| Typecheck web         | `bun run --filter web typecheck`                                                                                           | exit 0, no errors                                                                                                                                                                                   |
| Lint                  | `bun run --filter server lint` / `bun run --filter web lint`                                                               | exit 0 (both already print pre-existing `warning` lines — `set-state-in-effect`, `exhaustive-deps`, `no-unused-vars`. Warnings do not fail the gate; only `error`-level rules do. Do not fix them.) |
| Format check          | `bun run --filter server format:check` / `bun run --filter web format:check`                                               | exit 0                                                                                                                                                                                              |
| Format (fix)          | `bun run --filter server format` / `bun run --filter web format`                                                           | rewrites files, exit 0                                                                                                                                                                              |
| One server test file  | `cd apps/server && bun --bun vitest run src/settings/tests/store-watch.test.ts`                                            | all pass (8 pass today, ~1.2s)                                                                                                                                                                      |
| Server tests (all)    | `bun run --filter server test`                                                                                             | see the baseline note below                                                                                                                                                                         |
| One web dom test file | `cd apps/web && bun --bun vitest run --project dom src/features/chat-mode/components/tests/project-rename-dialog.test.tsx` | all pass                                                                                                                                                                                            |
| Web tests             | `bun run --filter web test`                                                                                                | all pass                                                                                                                                                                                            |
| Full verify           | `bun run verify`                                                                                                           | exit 0                                                                                                                                                                                              |

> **Baseline note — read before running the full server suite.** `bun --bun
vitest run` in `apps/server` opens, migrates and WAL-locks the developer's
> **real** `~/.platform/fs-metadata.sqlite`. That is a known verification-baseline
> gap owned by plan 013 and is **not** yours to fix. Prefer the targeted
> file-filtered runs above. If you do run the full suite, run it **once before
> you change anything** and record which tests fail, so you can tell a
> pre-existing failure from one you caused.

## Scope

**In scope** (the only files you may modify or create):

- `apps/server/src/observability/detached.ts` (create)
- `apps/server/src/observability/tests/detached.test.ts` (create)
- `apps/server/src/observability/index.ts`
- `apps/server/src/observability/runtime.ts`
- `apps/server/src/settings/layer.ts`
- `apps/server/src/settings/tests/store-watch.test.ts`
- `apps/server/src/app.ts`
- `apps/server/src/fs/watch.ts`
- `apps/server/src/index.ts`
- `apps/web/src/features/chat/notify-command-error.ts` (create)
- `apps/web/src/features/chat-mode/components/project-rename-dialog.tsx`
- `apps/web/src/features/chat-mode/components/tests/project-rename-dialog.test.tsx` (create)
- `apps/web/src/features/chat/components/chat-view.tsx`
- `apps/web/src/features/chat/components/chat-draft-view.tsx`
- `apps/web/src/features/chat-mode/hooks/use-save-project-script.ts`
- `plans/README.md` (status cell only)

**Out of scope** (do NOT touch, even though they look related):

- **`settings/store.ts:311`** — moving `this.secretRefs = new Set(this.secretStore.readSync().keys())`
  inside a try/catch. It looks like the "real" fix and it is not yours: those
  refs decide what `maskProviderSecrets` redacts out of the snapshot
  (`store.ts:86-91`), so "keep the stale refs and carry on" is a
  security-relevant decision that needs its own reasoning, not a drive-by
  try/catch. `runDetached` already stops the process from dying, which is what
  this plan is for. Flagged as a follow-up in Maintenance notes.
- **The other ~25 `void` call sites in `apps/server/src`** — `provider-adapter-registry.ts:70,195,254,441,464`,
  `provider-service.ts:434`, `adapters/codex.ts`, `adapters/claude.ts`,
  `terminal/service.ts:649-651`, `orchestration/ws-rpc.ts:140,229`,
  `fs/workspace-index.ts:472,496`, `lsp/routes.ts:180`,
  `orchestration/session-checkout-reactor.ts:84`, `git/service.ts:705`. Several
  already have their own `.catch`; the audit only established the
  external-event-driven crash path for the four in this plan. A blanket sweep is
  a separate change with real regression surface.
- **`void stopServer(signal)` in `index.ts:64`** — `index.ts` is in scope for the
  crash handler, which makes this adjacent `void` tempting. Leave it. It runs
  under a signal handler on the way out of the process; routing it through
  `runDetached` would record a warning into a log that is about to be flushed and
  closed by the very function that failed.
- **`broadcastTo` in `fs/watch.ts:282-284`** — do not wrap the listener loop in a
  try/catch. "Current state" points out that it has none, as the explanation for
  _why_ the detached handler can reject; swallowing subscriber errors there would
  hide the same failure this plan is trying to make visible, and it changes
  delivery semantics for every watch subscriber.
- **`process.on('uncaughtException')`** — deliberately not added. A synchronous
  top-level throw leaves arbitrary broken state and deserves its own decision;
  the silent-death mode the audit actually found is the rejection path.
- **`features/chat-mode/hooks/use-session-actions.ts`** — its
  `dispatchSessionCommand` already has a `try/catch` with a log. Whether it
  should also toast is plan 030's call.
- **A shared `dispatchChatCommand` envelope** — that is plan 030
  (`030-chat-dispatch-envelope.md`). Build the narrow notify helper only; 030
  will absorb it.
- **A second client log event** for a failed dispatch — already logged, see
  "Current state". Adding one breaks the wide-event rule.
- **`packages/editor-*`** — symlinks to a sibling checkout. Never in scope.
- **`packages/observability/src/runtime.ts`** — `recordObservabilityError`
  already exists there; you only re-export it from the server.

## Git workflow

- **All work happens on `main`** — no new branches, worktrees, commits, pushes,
  or PRs unless the operator explicitly asks. Leave the work in the working tree
  unless told otherwise.
- If (and only if) the operator asks for a commit: conventional commits,
  lowercase descriptive subject. Real examples from `git log`:
  - `refactor(orchestration): the server prepares a session's worktree (M-C)`
  - `fix(address): bound the URL, and stop escaping slashes in ?tabs=`
  - A fitting subject here: `fix(observability): give fire-and-forget async a rejection boundary`

## Steps

### Step 1: Add `runDetached` and prove it records instead of escaping

Create `apps/server/src/observability/detached.ts`:

```ts
import { errorSummary } from './logging'
import { recordProcessWarning } from './runtime'

type DetachedContext = {
  readonly area: string
  readonly operation: string
  readonly [key: string]: unknown
}

/**
 * The rejection boundary `void` does not give you.
 *
 * Bun kills the process on an unhandled rejection, and every detached caller
 * here is driven by something external — a file watcher firing, a settings file
 * changing on disk — so one unexpected throw off the filesystem took the whole
 * server down with nothing in `logs/*.jsonl` to explain it. Catching turns that
 * into one wide warn event and a server that is still running.
 *
 * Takes a thunk rather than a promise so a synchronous throw on the way to the
 * promise lands on the same boundary.
 */
export function runDetached(operation: () => Promise<unknown>, context: DetachedContext) {
  try {
    void operation().catch((error: unknown) => recordDetachedFailure(error, context))
  } catch (error) {
    recordDetachedFailure(error, context)
  }
}

function recordDetachedFailure(error: unknown, context: DetachedContext) {
  recordProcessWarning('detached.failed', { ...context, error: errorSummary(error) })
}
```

Export it from the existing barrel — add to `apps/server/src/observability/index.ts`:

```ts
export { runDetached } from './detached'
```

Keep `DetachedContext` unexported: nothing outside the file needs it and `knip`
reports unused exports.

Now create `apps/server/src/observability/tests/detached.test.ts`. The helpers
are copied from `apps/server/src/observability/tests/runtime.test.ts`
(`fixtureRoot` 347-351, `flushedEvents` 360-364, `readEvents` 366-374,
`eventForAction` 383-388, `testObservabilityEnv` 336-345, `delay` at 420, and
the `afterEach` at 15-18). **Drop everything about `createApp`/requests** — this
test must not construct the app; that is what keeps it clear of the developer's
real SQLite file.

`recordProcessWarning` is a no-op unless the runtime is enabled, so
`initializeObservability(testObservabilityEnv(logDir))` is load-bearing in every
case — without it the run fails with `missing observability event for
detached.failed` and the fault looks like `runDetached`, not the fixture. Write
the file as:

```ts
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { WideEvent } from 'evlog'
import { readFsLogs } from 'evlog/fs'
import { afterEach, describe, expect, it } from 'vitest'

import { runDetached } from '../detached'
import { flushObservability, initializeObservability, resetObservabilityForTests } from '../runtime'

const roots: string[] = []

afterEach(async () => {
  await resetObservabilityForTests()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('runDetached', () => {
  it('records a wide warn event when detached work rejects', async () => {
    const logDir = await fixtureRoot()
    initializeObservability(testObservabilityEnv(logDir))

    runDetached(() => Promise.reject(new Error('detached boom')), {
      area: 'settings',
      operation: 'reload',
    })

    const events = await flushedEvents(logDir)
    expect(eventForAction(events, 'detached.failed')).toMatchObject({
      area: 'settings',
      error: { message: 'detached boom', name: 'Error' },
      level: 'warn',
      operation: 'reload',
      source: 'be',
    })
  })

  it('records nothing when detached work resolves', async () => {
    const logDir = await fixtureRoot()
    initializeObservability(testObservabilityEnv(logDir))

    runDetached(() => Promise.resolve('ok'), { area: 'settings', operation: 'reload' })

    const events = await flushedEvents(logDir)
    expect(events.some((event) => event.action === 'detached.failed')).toBe(false)
  })
})

// Helpers below are copied verbatim from `runtime.test.ts` — see the line
// numbers above. Keep them identical so the two files stay comparable.
function testObservabilityEnv(logDir: string, overrides: Record<string, string> = {}) {
  return {
    OBSERVABILITY_CONSOLE: 'false',
    OBSERVABILITY_DIR: logDir,
    OBSERVABILITY_ENABLED: 'true',
    OBSERVABILITY_INFO_SAMPLE_RATE: '100',
    NODE_ENV: 'production',
    ...overrides,
  }
}

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-observability-'))
  roots.push(root)
  return root
}

async function flushedEvents(logDir: string) {
  await delay(0)
  await flushObservability()
  return readEvents(logDir)
}

async function readEvents(logDir: string) {
  const events: WideEvent[] = []

  for await (const event of readFsLogs({ dir: logDir })) {
    events.push(event)
  }

  return events
}

function eventForAction(events: readonly WideEvent[], action: string) {
  const event = events.find((candidate) => candidate.action === action)
  if (!event) throw new Error(`missing observability event for ${action}`)

  return event as WideEvent & Record<string, unknown>
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
```

(The `new Error` calls here are test fixtures, which `AGENTS.md`'s
"never throw `new Error`" rule permits — `runtime.test.ts` does the same.)

**Verify**:

```
bun run --filter server typecheck
cd apps/server && bun --bun vitest run src/observability/tests/detached.test.ts
```

→ typecheck exit 0; 2 tests pass.

### Step 2: Route the four detached server sites through `runDetached`

**Order matters here: write the test first, watch it reproduce the crash, then
fix.** A test that never saw red proves nothing about the mechanism.

#### 2a. Add the crash test and watch it fail

Add one case to `apps/server/src/settings/tests/store-watch.test.ts` — this is
the test that proves the real crash path is closed. Add `mkdir` to the
`node:fs/promises` import on line 1 (it currently reads
`import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'`) and
append a new `describe` block at the end of the file:

```ts
describe('a secrets file that cannot be read', () => {
  it('does not take the process down during a watch-driven reload', async () => {
    const root = await tempRoot()
    // Construct the store *before* the bad directory exists: `SettingsStore`'s
    // constructor also calls `secretStore.readSync()`, so creating the directory
    // first would throw here instead of on the reload path under test.
    const store = createStore(root)
    const secretsPath = path.join(root, 'secrets.json')
    // A directory where the file should be: `readFileSync` throws EISDIR, which
    // is not ENOENT, so `readSettingsFileSync` rethrows out of `invalidate()` —
    // straight into the detached reload. Before `runDetached` this killed Bun.
    await mkdir(secretsPath)

    await writeFile(path.join(root, 'settings.json'), '{ "models.hidden": ["alpha"] }', 'utf8')
    await new Promise((resolve) => setTimeout(resolve, 400))
    await rm(secretsPath, { recursive: true })

    // Still watching, still serving: the poisoned reload cost one event, not the
    // process.
    const changed = nextChange(store)
    await writeFile(path.join(root, 'settings.json'), '{ "models.hidden": ["beta"] }', 'utf8')

    expect((await changed).values['models.hidden']).toEqual(['beta'])
  })
})
```

Run it against the **unfixed** code:

```
cd apps/server && bun --bun vitest run src/settings/tests/store-watch.test.ts
```

→ the run must surface `EISDIR: illegal operation on a directory, read`, either
as a reported unhandled rejection/failed test or as the runner dying outright.
Both count as reproduced — the point is that the string appears. **If the run
passes clean with no `EISDIR` anywhere in the output, STOP**: the mechanism you
are about to protect is not the one this test exercises, and fixing it would
prove nothing. (A standalone confirmation of the same path, run at `ace313f`, is
in "Reproducing the crash" above.)

#### 2b. Make the four edits

Four edits, each replacing `void <expr>` with `runDetached(() => <expr>, ctx)`.
Do not change any surrounding comment or logic.

1. `settings/layer.ts:236-242` →

   ```ts
   private scheduleReload() {
     if (this.debounce) clearTimeout(this.debounce)
     this.debounce = setTimeout(() => {
       this.debounce = null
       runDetached(() => this.reload(), { area: 'settings', layer: this.id, operation: 'reload' })
     }, RELOAD_DEBOUNCE_MS)
   }
   ```

   Import: `import { runDetached } from '../observability'`.

2. `app.ts:113-121` → keep the comment block above it verbatim; the body becomes

   ```ts
   settings.onChange(() => {
     runDetached(
       () =>
         settings
           .providerInstancesForSpawn()
           .then((instances) =>
             providerAdapterRegistry.reconcile(
               mergeProviderInstanceConfigs(DEFAULT_PROVIDER_INSTANCES, instances),
             ),
           ),
       { area: 'provider', operation: 'reconcile' },
     )
   })
   ```

   `app.ts` already imports from `'./observability'` (line 22 closes that import
   block) — add `runDetached` to it.

3. `fs/watch.ts:145` →

   ```ts
   runDetached(() => this.handleParcelEvent(relativeRoot, event), {
     area: 'fs',
     backend: 'parcel',
     operation: 'watch_event',
   })
   ```

4. `fs/watch.ts:158` →

   ```ts
   runDetached(() => this.handleNodeEvent(relativeRoot, event, filename?.toString() ?? ''), {
     area: 'fs',
     backend: 'node',
     operation: 'watch_event',
   })
   ```

   Add `import { runDetached } from '../observability'` to `fs/watch.ts` (it
   imports nothing from observability today).

   **Do not put `relativeRoot` or any other path in the context object.** The
   repo redacts path-shaped fields out of request logs on purpose
   (`observability/logging.ts:21-29`); `recordProcessWarning` does no such
   redaction, so a path here would be a new leak. `backend` is enough to tell the
   two sites apart.

**Verify**:

```
bun run --filter server typecheck
cd apps/server && bun --bun vitest run src/settings/tests/store-watch.test.ts src/observability/tests/detached.test.ts
rg -n "void this\.reload\(\)|void this\.handleParcelEvent|void this\.handleNodeEvent|void settings$" apps/server/src
```

→ typecheck exit 0; 11 tests pass (8 existing + 1 new in store-watch, 2 in
detached), with no `EISDIR` unhandled-rejection noise in the output; the `rg`
returns **no matches**.

### Step 3: Make a process-killing rejection explain itself

Two tiny export additions first, so the event can be recorded at `error` level
(a rejection that ends the process is not a warning):

- `apps/server/src/observability/runtime.ts` — the export block at lines 4-11 is
  sorted by the _source_ name, so `recordObservabilityError as recordProcessError,`
  goes on its own line directly **above** `recordObservabilityInfo as recordProcessInfo,`.
- `apps/server/src/observability/index.ts` — add `recordProcessError,` to the
  `export { … } from './runtime'` list at lines 5-10 (that list is sorted by the
  exported name, so it goes above `recordProcessInfo,`).

Then in `apps/server/src/index.ts`:

- Add `errorSummary` and `recordProcessError` to the existing
  `from './observability'` import block (lines 4-10).
- Call `installCrashHandlers()` immediately after
  `initializeObservability(Bun.env)` on line 27 — **before** `createApp` on line
  29, so a rejection thrown during boot is explained too.
- Add the function next to `installShutdownHandlers`:

  ```ts
  /**
   * Bun ends the process on an unhandled rejection, and until this existed the
   * only trace was on stderr — nothing in `logs/*.jsonl`, which is the file
   * AGENTS.md tells everyone to debug from. Registering a handler suppresses
   * Bun's own exit, so this deliberately re-creates it: record, flush, exit 1.
   */
  function installCrashHandlers() {
    let crashing = false

    process.on('unhandledRejection', (reason) => {
      if (crashing) return

      crashing = true
      recordProcessError('server.unhandled_rejection', { error: errorSummary(reason) })
      void crash()
    })
  }

  async function crash() {
    await flushObservability()
    process.exit(1)
  }
  ```

  `flushObservability` is already imported at `index.ts:5`.

This step has no automated test: any test that triggers a genuine unhandled
rejection ends the test runner. That is accepted, and is why the handler is
kept to five lines with no branching.

**Verify**:

```
bun run --filter server typecheck
bun run --filter server lint
rg -n "unhandledRejection" apps/server/src
```

→ typecheck and lint exit 0; `rg` returns exactly one hit, in
`apps/server/src/index.ts`.

### Step 4: Give the client a rejection boundary that the user can see

Create `apps/web/src/features/chat/notify-command-error.ts`.

**This is the first file at `features/chat/`'s root** — every other file there
lives in `components/`, `environment/`, `hooks/`, `lib/`, `providers/`,
`state/`, `transport/` or `utils/`. That is deliberate, not an oversight: the
helper calls `toast`, so it is not pure and `utils/` is closed to it
(`AGENTS.md`: "`utils/` — pure, stateless, non-React code only"), and `lib/` is
scheduled for deletion by plan 011. The feature root is exactly where
`features/git/notify-mutation-error.ts` and
`features/settings/notify-save-error.ts` already sit. **Do not relocate it into
`lib/` or `utils/` because the folder looks empty.** Contents:

```ts
import { toast } from 'sonner'

import { errorMessage } from '@/lib/error-message'

/**
 * The rejection boundary for a chat command the UI does not await.
 *
 * `void environment.dispatchCommand(...)` attaches no rejection handler, so a
 * refused or timed-out command produced an unhandled rejection and nothing the
 * user could see — while the UI had already committed to the optimistic
 * outcome. Deliberately no log call: the RPC client already wraps every
 * dispatch in `observeClientOperation`, which emits the wide error event and
 * rethrows. This only surfaces what the log already recorded.
 */
export function notifyChatCommandError(error: unknown, title: string) {
  toast.error(title, {
    description: errorMessage(error, 'The server did not accept the change.'),
  })
}
```

Attach it at three sites. In each, the shape is the same — keep the `void`
marker on the statement, keep the surrounding `useCallback` and its dependency
array untouched:

1. `chat-view.tsx:102-107`:

   ```ts
   void environment
     .dispatchCommand(createProjectDefaultModelCommand({ defaultModelSelection: next, projectId }))
     .catch((error: unknown) => notifyChatCommandError(error, 'Could not save the default model'))
   ```

2. `chat-draft-view.tsx:75-80` — identical, with `projectId: project.id`.

3. `use-save-project-script.ts:44-49`:

   ```ts
   void environment
     .dispatchCommand(
       createProjectScriptsCommand({ projectId: project.id, scripts: [script, ...remaining] }),
     )
     .catch((error: unknown) => notifyChatCommandError(error, 'Could not save the project script'))
   ```

Import in each file: `import { notifyChatCommandError } from '@/features/chat/notify-command-error'`.

Let `oxfmt` decide the final line breaks — run
`bun run --filter web format` after the edits rather than hand-wrapping. Note
that `oxfmt` may collapse the chain back onto one line, so do **not** verify
this step by grepping for `void environment.dispatchCommand(` — the reliable
signal is that each file imports and uses the helper.

**Verify**:

```
bun run --filter web format
bun run --filter web typecheck
bun run --filter web lint
rg -l "notifyChatCommandError" apps/web/src
```

→ typecheck and lint exit 0 (an unused import would fail lint, so a passing
lint plus the file list is what proves the `.catch` is really attached); `rg -l`
lists exactly four files: `features/chat/notify-command-error.ts`,
`features/chat/components/chat-view.tsx`,
`features/chat/components/chat-draft-view.tsx`, and
`features/chat-mode/hooks/use-save-project-script.ts`.

### Step 5: Hold the rename dialog open until the dispatch resolves

In `apps/web/src/features/chat-mode/components/project-rename-dialog.tsx`:

- Add `const [saving, setSaving] = useState(false)` next to the existing
  `useState` calls.
- Replace `save()` (lines 37-44) with:

  ```tsx
  async function save() {
    if (!request || !canSave || saving) return

    setSaving(true)
    try {
      await environment.dispatchCommand(
        createProjectMetaCommand({ projectId: request.projectId, title: trimmed }),
      )
      dismissRename()
    } catch (error) {
      // Closing on dispatch rather than on the result told the user the rename
      // landed; the old name then came back on the next projection sync with no
      // explanation.
      notifyChatCommandError(error, 'Could not rename the project')
    } finally {
      setSaving(false)
    }
  }
  ```

- Both call sites now need the `void` marker: `save()` inside the `onKeyDown`
  handler becomes `void save()`, and the Rename button becomes
  `onClick={() => void save()}`.
- Disable the Rename button while in flight: `disabled={!canSave || saving}`.
- Leave `Cancel`, the `Dialog onOpenChange` handler, and the render-time title
  sync at lines 29-32 **exactly as they are**. That render-time `setState` is a
  deliberate "adjust state during render" pattern that currently passes the
  `oxc-react-compiler/set-state-in-render` rule (which is at `error`); do not
  touch it.

Create `apps/web/src/features/chat-mode/components/tests/project-rename-dialog.test.tsx`.
Model it on `apps/web/src/features/chat-mode/components/tests/project-menu.test.tsx`
(which already renders a `Dialog` in the `dom` project, so the primitive is
known to work there). The whole file:

```tsx
import type { ClientOrchestrationCommand } from '@workspace/contracts'
import { projectIdSchema, threadIdSchema } from '@workspace/contracts'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as v from 'valibot'
import { vi } from 'vitest'

import type { ChatEnvironment } from '@/features/chat/environment/chat-environment'
import { ProjectRenameDialog } from '@/features/chat-mode/components/project-rename-dialog'
import {
  ChatModeSessionContext,
  type ChatModeSession,
} from '@/features/chat-mode/providers/session-context'
import { useProjectRenameRequestStore } from '@/features/chat-mode/state/project-rename-request-store'
import { chatProject } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

// `sonner` is third-party and is the only mock this plan permits — same shape
// as `features/git/tests/notify-mutation-error.test.ts:6-10`.
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastError } }))

const projectId = v.parse(projectIdSchema, 'project-platform')
const threadId = v.parse(threadIdSchema, 'thread-platform')

function renderDialog(dispatchCommand: ChatEnvironment['dispatchCommand']) {
  toastError.mockReset()
  useProjectRenameRequestStore.setState({ request: { projectId, title: 'platform' } })

  // Copied from `project-menu.test.tsx:196-216`, with `environment` swapped for
  // the injected dispatch.
  const session: ChatModeSession = {
    activeSession: { status: 'ready', threadId },
    addProject: () => {},
    environment: { dispatchCommand } as ChatEnvironment,
    error: null,
    openProject: () => {},
    project: chatProject({ id: projectId, title: 'platform', workspaceRoot: '/repo/platform' }),
    ready: true,
    retrying: false,
    retryProject: () => {},
    rootPath: '/repo/platform',
    selectSession: () => {},
    startDraft: () => {},
    threads: [],
  }

  renderWithProviders(
    <ChatModeSessionContext value={session}>
      <ProjectRenameDialog />
    </ChatModeSessionContext>,
  )
}

async function rename(next: string) {
  const input = await screen.findByLabelText('Project name')
  await userEvent.clear(input)
  await userEvent.type(input, next)
  await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
}

test('a refused rename keeps the dialog open and says why', async () => {
  renderDialog((async () => {
    throw new Error('socket closed')
  }) as ChatEnvironment['dispatchCommand'])

  await rename('platform-two')

  await waitFor(() =>
    expect(toastError).toHaveBeenCalledWith('Could not rename the project', {
      description: 'socket closed',
    }),
  )
  // The dialog is the user's only way back to the rename; dismissing on
  // dispatch told them it landed when it had not.
  expect(useProjectRenameRequestStore.getState().request).not.toBeNull()
  expect(screen.getByRole('button', { name: 'Rename' })).toBeVisible()
})

test('an accepted rename closes the dialog', async () => {
  renderDialog((async (_command: ClientOrchestrationCommand) => ({
    deduped: false,
    sequence: 1,
  })) as ChatEnvironment['dispatchCommand'])

  await rename('platform-two')

  await waitFor(() => expect(useProjectRenameRequestStore.getState().request).toBeNull())
  expect(toastError).not.toHaveBeenCalled()
})
```

Notes the executor will otherwise trip on:

- `waitFor` is not optional. `save()` is now async, so the toast and the
  dismissal land a microtask after `userEvent.click` resolves; asserting
  synchronously is a flake.
- If the `ChatModeSession` literal above does not typecheck, the type has drifted
  — re-copy it from `project-menu.test.tsx:196-216` rather than inventing fields.
- If `as ChatEnvironment['dispatchCommand']` is unnecessary (the inferred type
  already matches), drop the cast; do not add `any` to make it fit.

**Verify**:

```
cd apps/web && bun --bun vitest run --project dom src/features/chat-mode/components/tests/project-rename-dialog.test.tsx
```

→ 2 tests pass.

```
bun run --filter web format
bun run --filter web lint
rg -n "await environment\.dispatchCommand" apps/web/src/features/chat-mode/components/project-rename-dialog.tsx
```

→ lint exits 0; `rg` returns exactly one hit. (The `a refused rename keeps the
dialog open` test is the real gate: it fails if `dismissRename()` still runs
before the dispatch resolves.)

### Step 6: Full verification and index update

Run the whole gate, then flip the status cell for row `021` in
`plans/README.md` from `TODO` to `DONE` (the row already exists in the Phase 1
table — do not add a new one).

**Verify**:

```
bun run verify
```

→ exit 0. If `apps/server`'s suite reports failures, compare against the
baseline you recorded before Step 1; only failures you introduced are yours.

Optional smoke check, only if http://localhost:5173 already answers (`curl -s -o
/dev/null -w '%{http_code}' http://localhost:5173` → `200`). **Do not start a
dev server if it does not** — skip this and say so in your report. Open a chat
project's context menu → **Rename Project**, rename it to something new, and
confirm the dialog closes and the new name appears in the rail. Both paths are
already covered by the Step 5 test; this only catches a wiring mistake the
happy-dom render cannot see.

## Test plan

New tests, all deterministic, no new mocks except `sonner`:

| File                                                                                    | Cases                                                                                                                                       |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/server/src/observability/tests/detached.test.ts` (new)                            | `records a wide warn event when detached work rejects`; `records nothing when detached work resolves`                                       |
| `apps/server/src/settings/tests/store-watch.test.ts` (append)                           | `does not take the process down during a watch-driven reload` — the EISDIR secrets-directory case, which is the exact crash the audit found |
| `apps/web/src/features/chat-mode/components/tests/project-rename-dialog.test.tsx` (new) | `a refused rename keeps the dialog open and says why`; `an accepted rename closes the dialog`                                               |

The full text of both new files is inlined in Steps 1 and 5; the source files
they were derived from are `apps/server/src/observability/tests/runtime.test.ts`
(helpers at 336-388 and 420) and
`apps/web/src/features/chat-mode/components/tests/project-menu.test.tsx`
(`renderRail` at 147-230). The `store-watch` addition reuses that file's own
`tempRoot` / `createStore` / `nextChange` helpers at lines 11-45.

Both the tightening and the loosening are covered: the rename dialog test
asserts the dialog **stays open** on a rejection _and_ that it **still closes**
on success, so "hold it open" cannot silently become "never close".

**No tests for the three `.catch(...)` additions in Step 4.** They are one-line
edits that change nothing on the success path, the helper they call is covered
through the dialog test, and standing up `chat-view.tsx` in happy-dom to prove a
toast fires would cost far more than it proves. **No test for Step 3**, because a
genuine unhandled rejection ends the test runner — that is stated in the step
rather than papered over.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run --filter server typecheck` exits 0
- [ ] `bun run --filter web typecheck` exits 0
- [ ] `bun run --filter server lint` and `bun run --filter web lint` exit 0
- [ ] `bun run --filter server format:check` and `bun run --filter web format:check` exit 0
- [ ] `cd apps/server && bun --bun vitest run src/observability/tests/detached.test.ts src/settings/tests/store-watch.test.ts` → 11 tests pass (2 new + 8 existing + 1 new)
- [ ] `cd apps/web && bun --bun vitest run --project dom src/features/chat-mode/components/tests/project-rename-dialog.test.tsx` → 2 tests pass
- [ ] `rg -n "void this\.reload\(\)|void this\.handleParcelEvent|void this\.handleNodeEvent" apps/server/src` → no matches
- [ ] `rg -c "runDetached" apps/server/src/settings/layer.ts apps/server/src/app.ts apps/server/src/fs/watch.ts` → 2, 2 and 3 (one import plus the call sites)
- [ ] `rg -l "notifyChatCommandError" apps/web/src` → exactly the four files listed in Step 4, plus `project-rename-dialog.tsx` from Step 5 (five in total)
- [ ] `rg -n "unhandledRejection" apps/server/src` → exactly one hit, in `index.ts`
- [ ] `rg -n "log\.|reportClientError" apps/web/src/features/chat/notify-command-error.ts` → no matches (no second client log event)
- [ ] `bun run verify` exits 0 (or fails only on failures present in the pre-Step-1 baseline)
- [ ] `git status --porcelain` lists no files outside the "In scope" list
- [ ] `plans/README.md` row 021 status is `DONE`

## STOP conditions

Stop and report back (do not improvise) if:

- Any excerpt in "Current state" does not match the live code — the drift check
  found changes, or a line number is off by more than a few lines with different
  content.
- The `apps/server` test run **aborts the process** instead of reporting a
  failure at any point **after Step 2b's edits**. (In 2a it is expected — that is
  the crash being reproduced.) After the fix it means a detached rejection is
  still escaping; report which file it died on rather than chasing it.
- `bun run --filter server test` fails in files this plan does not touch —
  compare against your pre-Step-1 baseline first; if it also failed there, say
  so and move on, do not fix it (plan 013 owns the server test baseline).
- Step 2a's run passes clean, with no `EISDIR` anywhere in the output. The
  mechanism you are protecting is then not the one the test exercises, and
  Step 2b would be unverifiable.
- `runDetached` swallows a rejection but the `detached.failed` event never
  appears in Step 1's test. Check that `initializeObservability(...)` runs in the
  case before assuming `runDetached` is wrong — the recorders no-op when the
  runtime is disabled.
- Adding `await`/`async` to the rename dialog's `save()` trips any
  `oxc-react-compiler/*` rule at `error` level. Do **not** disable or downgrade
  a lint rule; report the rule and the message.
- The rename-dialog dom test throws from inside a `@workspace/ui` primitive
  (happy-dom has known gaps — `getAnimations` is missing, which is why
  `base-ui`'s `ScrollArea` cannot be rendered in dom tests). `Dialog` renders
  fine today in `project-menu.test.tsx`; if it stops doing so, report rather
  than adding polyfills.
- You find yourself wanting to change `settings/store.ts`, or to sweep the other
  `void` sites listed in "Out of scope". Both are deliberate exclusions.

## Maintenance notes

For the human or agent who owns this next:

- **`runDetached` is the seam for the follow-up sweep.** The ~25 other `void`
  sites listed in "Out of scope" can be migrated to it incrementally, one
  subsystem at a time. Do that as its own change with its own review, not as a
  drive-by.
- **`store.ts:311` is still unguarded** and is the honest remaining bug in that
  path: with `runDetached` in place, an unreadable secrets file now aborts the
  invalidation _after_ `cachedSnapshot` is cleared and _before_ any listener
  runs, so the change is dropped rather than crashing. Whoever picks that up
  must decide what stale `secretRefs` mean for `maskProviderSecrets`
  (`store.ts:86-91`) before wrapping it — that is a redaction question, not an
  error-handling question.
- **Plan 030 (`030-chat-dispatch-envelope.md`) will absorb `notifyChatCommandError`.**
  It unifies the seven dispatch-with-telemetry envelopes; this helper is
  deliberately small so folding it in is a rename, not a redesign. If 030 lands
  first, put the toast inside its envelope instead of creating this file.
- **File placement warning**: `apps/web/src/features/chat/notify-command-error.ts`
  sits at the feature root by design (matching `features/git/notify-mutation-error.ts`
  and `features/settings/notify-save-error.ts`). Plans 009/011 reorganize
  `features/chat/`; if they land first, follow whatever the new layout spec says
  rather than this path.
- **What a reviewer should scrutinize**: (1) that no `path`-shaped value made it
  into a `runDetached` context object — `recordProcessWarning` does not redact;
  (2) that the client change added exactly zero new log events; (3) that the
  `useCallback` dependency arrays in `chat-view.tsx` and `chat-draft-view.tsx`
  are byte-identical to before (React Compiler's
  `preserve-manual-memoization` rule is at `error`); (4) that the crash handler
  still calls `process.exit(1)` — registering the handler suppresses Bun's own
  exit, so removing the exit would silently turn a crash into a zombie server.
- **Deliberately deferred**: `uncaughtException`, the `store.ts` try/catch, the
  bulk `void` sweep, a toast for `use-session-actions.ts`, and any rollback of
  optimistic client state. Each is named in "Out of scope" with its reason.
