# Plan 059: Make settings writes conflict-proof, then optimistic

> **Executor instructions**: Read this plan completely before editing. Then read
> `/Users/shaul/Desktop/D/platform/AGENTS.md`,
> `/Users/shaul/.agents/skills/never-nester/SKILL.md`, and the current TanStack
> Query mutation guidance linked under **References**. Follow the milestones in
> order: first remove the false conflict from normal writes, then add optimism.
> Run only the focused verification gates named here. Work in the current
> worktree. Do not create a branch, worktree, commit, push, or PR unless the
> operator explicitly asks.
>
> This is a greenfield cutover. Do not keep the old revision-guarded keyed-write
> contract beside the new intent contract. Do not add a stale-write retry around
> the current whole-value payloads, and do not remove conflict detection from raw
> JSON saves. Temporary compile breakage is acceptable inside one milestone; its
> exit gate must be green.
>
> **Drift check (run first)**:
>
> ```bash
> cd /Users/shaul/Desktop/D/platform
> git diff --stat 0d96f6f9..HEAD -- \
>   packages/contracts/src/index.ts \
>   packages/contracts/src/settings \
>   apps/server/src/settings \
>   apps/server/src/observability \
>   apps/web/src/components/app-command-surface.tsx \
>   apps/web/src/components/app-runtime-content.tsx \
>   apps/web/src/components/file-picker-dialog.tsx \
>   apps/web/src/components/theme-aware-toaster.tsx \
>   apps/web/src/components/theme-context.ts \
>   apps/web/src/components/theme-provider.tsx \
>   apps/web/src/features/command-palette \
>   apps/web/src/features/editor/hooks/use-editor-color-theme.ts \
>   apps/web/src/features/settings \
>   apps/web/src/features/terminal/components/panel.tsx \
>   apps/web/src/features/workbench/components/wallpaper.tsx \
>   apps/web/src/features/workbench/hooks/use-titlebar-menu.ts \
>   apps/web/src/features/workbench/utils/titlebar-menu.ts \
>   apps/web/src/keymap/commands.ts \
>   apps/web/src/keymap/define-command.ts \
>   apps/web/src/keymap/workspace-commands.ts \
>   apps/web/src/lib/client-error-reporting.ts \
>   apps/web/src/lib/client-error-taxonomy.ts \
>   apps/web/src/lib/client-logging.ts \
>   apps/web/src/main.tsx \
>   apps/web/test/client.ts \
>   apps/web/test/fixtures.ts \
>   apps/web/test/render.tsx \
>   apps/web/test/server.ts
> git status --short > /tmp/plan-059-before.txt
> git status --short -- \
>   packages/contracts/src/index.ts \
>   packages/contracts/src/settings \
>   apps/server/src/settings \
>   apps/server/src/observability \
>   apps/web/src/components/app-command-surface.tsx \
>   apps/web/src/components/app-runtime-content.tsx \
>   apps/web/src/components/file-picker-dialog.tsx \
>   apps/web/src/components/theme-aware-toaster.tsx \
>   apps/web/src/components/theme-context.ts \
>   apps/web/src/components/theme-provider.tsx \
>   apps/web/src/features/command-palette \
>   apps/web/src/features/editor/hooks/use-editor-color-theme.ts \
>   apps/web/src/features/settings \
>   apps/web/src/features/terminal/components/panel.tsx \
>   apps/web/src/features/workbench/components/wallpaper.tsx \
>   apps/web/src/features/workbench/hooks/use-titlebar-menu.ts \
>   apps/web/src/features/workbench/utils/titlebar-menu.ts \
>   apps/web/src/keymap/commands.ts \
>   apps/web/src/keymap/define-command.ts \
>   apps/web/src/keymap/workspace-commands.ts \
>   apps/web/src/lib/client-error-reporting.ts \
>   apps/web/src/lib/client-error-taxonomy.ts \
>   apps/web/src/lib/client-logging.ts \
>   apps/web/src/main.tsx \
>   apps/web/test/client.ts \
>   apps/web/test/fixtures.ts \
>   apps/web/test/render.tsx \
>   apps/web/test/server.ts
> ```
>
> At planning time `HEAD` was `0d96f6f9`. The worktree was dirty with
> user-owned file-picker/fs work and edits to `AGENTS.md`,
> `packages/contracts/src/settings/keys.ts`,
> `packages/contracts/src/settings/schema.json`,
> `docs/settings-reference.md`, and
> `packages/ui/src/styles/globals.css`. This plan does not change registry keys,
> the generated schema/reference, fs code, file-picker feature logic outside the
> exception below, or UI theme tokens.
> One narrow exception is required in the already-dirty
> `components/file-picker-dialog.tsx`: migrate its settings reads and remove the
> `hiddenWriteStartedRef` / global-`isSaving` toggle lock at current lines
> 206–230 and 430–434, because the optimistic projection makes the absolute next
> value immediate. Preserve every unrelated file-picker edit byte-for-byte. If
> that exact block has also changed, STOP for ownership reconciliation. If the
> dirty `keys.ts` change overlaps a type or collection shape required below, or
> if plan 062 has already changed the theme, palette, settings-action, or
> workspace-command symbols cited here, STOP and reconcile before editing.

## Status

- **State**: Reconcile drift first; execute before plan 062, then reconcile 062's theme-command
  and `useSettingsActions` assumptions
- **Priority**: P0
- **Effort**: XL
- **Risk**: HIGH — persistence, secrets, file watching, SSE ordering, raw editor
  conflict state, theme paint, and optimistic UI meet here
- **Depends on**: none
- **Blocks**: the settings/theme portions of plan 062
- **Category**: correctness / architecture / UX / observability
- **Planned at**: Platform commit `0d96f6f9`, 2026-08-23

## Outcome

After this plan:

1. Highlighting a color mode is a cancelable in-memory preview and performs zero
   writes. Selecting it commits exactly once.
2. Normal settings controls send absolute, idempotent domain intent. They do not
   send a whole-file base revision, so `settings.REVISION_STALE` is unreachable
   from `/settings/write` by construction.
3. The server serializes each target file, reads the latest document inside that
   serialization boundary, applies the intent, and internally replays it if the
   file moves before commit. Disjoint and rapid same-tab writes cannot reject one
   another.
4. The client renders `confirmed + pending + preview` immediately while keeping
   file bytes, layer revisions, and the boot mirror confirmed-only.
5. HTTP responses and SSE events carry an orderable server version, so an older
   delivery cannot regress the confirmed cache.
6. A raw `settings.json` save remains compare-and-swap. Its irreducible conflict
   becomes an inline Reload / Compare / Overwrite decision; it never leaks a
   technical file path through the generic settings toast.
7. Logs can distinguish submitted intent, acknowledgement, server rebase, raw
   conflict, stream recovery, and final failure without recording values or
   secrets.

The phrase “make this error impossible” is scoped deliberately. Platform can
make a stale-revision error impossible for semantic registry actions routed
through one server process. It cannot make simultaneous arbitrary whole-file
replacement by another process mathematically conflict-free while keeping JSON
on disk as the source of truth: POSIX rename has no content-conditional form,
and a writer can land between the final hash check and rename. That case belongs
to the raw document conflict UI, not to an automatic last-write-wins policy.

## Evidence and root cause

### The palette's preview is a write loop

- `apps/web/src/features/command-palette/hooks/use-highlighted-palette-value.ts:34-45`
  reports the initially selected cmdk row and every later highlight mutation.
- `apps/web/src/features/command-palette/content.tsx:119-151` sends each color-mode
  highlight through `dispatch(item.command)`. The comment at current lines
  146–147 explicitly says preview means running the real command.
- `apps/web/src/features/command-palette/color-mode-groups.tsx:18-27` dispatches
  that command again when the row is selected.
- `apps/web/src/keymap/workspace-commands.ts:757-795` maps those commands to
  `setTheme`, and `apps/web/src/components/theme-provider.tsx:27-49` maps that to
  the persistent `setColorTheme` settings action.
- The editor-theme picker already has the correct model:
  `apps/web/src/features/editor/state/color-theme-store.ts:67-69,90-129` keeps a
  transient preview overlay, clears it on cancel, and persists only on commit.

### Every hook instance races with the same document revision

- `apps/web/src/features/settings/hooks/use-settings-actions.ts:38-66` creates an
  unscoped `useMutation` per consumer and captures the current whole-snapshot
  revision at `mutate()` time.
- Theme, settings rows, model/provider/keybinding rows, and workspace commands
  instantiate the hook independently. Their `isSaving` flags are local even
  though they mutate one document.
- `apps/web/src/features/settings/utils/api.ts:22-56` sends the captured
  `baseRevision` with whole-value edits.
- `packages/contracts/src/settings/wire.ts:74-108` defines the top-level revision
  as a user-file content hash and makes it the guard for every keyed write.
- `apps/server/src/settings/layer.ts:122-155,350-370` correctly serializes writes,
  but that makes the false conflict deterministic: write A advances `R0` to
  `R1`; already-issued write B reaches the lock carrying `R0` and must fail.
- `apps/server/src/settings/structured-errors.ts:45-50` creates the exact error,
  and `apps/web/src/features/settings/utils/notify-save-error.ts:6-19` exposes its
  internal path through a generic toast.

### The logs prove a same-client conflict, not an external editor

In `logs/2026-08-23.1.jsonl`, the unique backend `/settings/write` outcomes are
29 attempts: 11 successes and 18 `settings.REVISION_STALE` responses. Every one
of the 18 rejected writes names only `workbench.colorTheme`, and the adjacent
client events carry the same `client.instanceId`. Representative bursts are at
current lines 1324–1325, 3380–3423, and 3657–3885. Client/backend fan-out makes
the raw number of log lines larger; 18 is the deduplicated server-conflict count.

### The current transport has two more ordering holes

- `apps/web/src/features/settings/hooks/use-settings-stream.ts:31-54`, mutation
  success in `use-settings-actions.ts:43-50`, and raw save in
  `apps/web/src/features/settings/state/sync-service.ts:40-46` independently
  replace the whole query snapshot.
- `apps/server/src/settings/store.ts:481-499` broadcasts during invalidation and
  the route then returns a snapshot, so an own write can arrive by SSE and HTTP.
  A content hash detects equality but cannot say which different snapshot is
  newer.
- `use-settings-stream.ts:39-54` swallows a dropped stream permanently while
  `use-settings.ts:10-15` keeps the last query fresh forever.
- `apps/server/src/settings/json-document.ts:171-207` checks the revision before
  writing the temp file despite its “immediately before rename” comment. The
  check/write/rename window therefore remains wider than intended.

## Product semantics — decisions, not implementation accidents

These decisions are part of the contract and must be captured in tests.

### Preview, commit, and cancellation

- Palette highlight/arrow/hover changes only `previewColorMode`.
- Escape, palette close, mode change, or unmount clears hover preview and
  restores the current optimistic/confirmed mode. It does not clear a commit
  handoff latch that is waiting for its pending/acknowledged intent.
- Selection dispatches one real command. Committing the already effective mode
  is a no-op and still closes the palette.
- A committed mode becomes a pending settings intent immediately. Clearing the
  preview and adding that pending intent must not produce an intermediate frame
  of the old mode.

### Normal setting actions

- Scalar set/reset is absolute: the later accepted intent for the same
  `{target,key}` wins.
- There are no toggle operations on the wire. A retry of “set hidden true” must
  remain true; it must never invert twice.
- Keybindings update or remove one command entry.
- Model visibility sets membership for one stable model ref.
- Provider enablement identifies one instance and changes only `enabled`.
  Creating an untouched built-in may include a non-secret seed whose environment
  values are forced empty; it never resends a stale full instance or a redaction
  placeholder as configuration.
- Model ordering writes the projected displayed order as one absolute atomic
  register. This matches the current invariant in
  `features/settings/utils/patch.ts:67-91`: the persisted order must name the
  whole displayed list for one arrow click to move exactly one place. Concurrent
  reorder operations do not pretend to merge; the later accepted reorder wins.
- Reset-row and reset-all are atomic request batches for one target layer.
- A command without an explicit scope derives the target from the projected
  layers with `deriveWriteTarget`. This fixes the current hardcoded user target,
  which can be hidden by a workspace value for window-scoped settings such as
  `workbench.colorTheme`.

### Concurrency and causality

- If an external update is observed by the server's final revision check before
  a local semantic intent is committed, the server rebases and the explicit
  local interaction wins. Do not claim the irreducible check-to-rename window is
  covered for non-cooperating writers.
- If an external update commits after the local intent, that later external
  update wins and arrives through SSE.
- Pending local intent stays visible when a newer confirmed snapshot arrives;
  the client rebases the pending operations over the new confirmed base.
- A deterministic 4xx error removes only its own pending intent. Later and
  unrelated intents remain visible.
- A transport failure keeps the intent optimistic while bounded retries use the
  same mutation id. If retries exhaust, remove only that intent, restore the
  resulting projection, and offer Retry with the retained intent. Do not create
  a durable offline queue in this plan.
- Derive stable semantic resource keys for each intent. If a later intent
  intersects a failed intent's resources, mark the older failure superseded and
  suppress its stale Retry; retrying it could overwrite the newer choice. Failed
  intents with no later intersecting intent remain retryable with the same id.
- If an admitted SSE event already acknowledged that mutation id, a later HTTP
  transport error is not a save failure: settle the transport bookkeeping
  without rollback, Retry, or duplicate notification.
- Pending work does not disable the whole settings page. Keep controls
  interactive so a later absolute intent can supersede an earlier one. Use the
  shared small loader in the existing status slot; if a pending count is shown,
  it uses `tabular-nums`.
- Optimistic values never enter `writeBootMirror`. A reload shows only a value
  the server acknowledged.

### Raw JSON

- Raw text is a whole-document replacement and never auto-merges.
- Every raw save requires the exact target-layer revision; omission is invalid.
- Every raw save also carries a unique `writeId`. Retrying the identical body
  after an uncertain response returns the original acknowledgement; reusing that
  id with a different target, revision, or body hash is rejected.
- A stale raw save preserves the dirty buffer, refreshes the confirmed file, and
  enters an explicit conflict state.
- Reload discards the local buffer only after confirmation. Compare opens local
  versus confirmed text. Overwrite is a second, explicit request guarded by the
  newly confirmed revision.
- Raw conflict is not a toast and is not categorized as a generic I/O failure.

## Required architecture

### 1. One idempotent intent vocabulary

Add a discriminated settings-intent contract in
`packages/contracts/src/settings/mutations.ts`; export exact files through the
package entry point only. The concrete names may improve, but the union must
cover this semantic shape:

```ts
type SettingsOperation =
  | { kind: 'set'; key: ScalarSettingId; value: unknown }
  | { kind: 'reset'; keys: readonly SettingId[] }
  | { kind: 'keybinding.set'; command: string; keys: string | null }
  | { kind: 'keybinding.remove'; command: string }
  | { kind: 'model.setHidden'; ref: ModelRef; hidden: boolean }
  | { kind: 'model.setOrder'; order: readonly ModelRef[] }
  | {
      kind: 'provider.setEnabled'
      providerInstanceId: ProviderInstanceId
      enabled: boolean
      createIfMissing?: NonSecretProviderSeed
    }

type SettingsMutationRequest = {
  mutationId: string
  target: SettingsWriteTarget
  operations: readonly SettingsOperation[]
}
```

Do not expose a generic array-index operation, `toggle`, JSON Patch, or a
generic whole-collection replacement. `model.setOrder` is the one explicit
atomic-list operation because sparse relative edits cannot reproduce the visible
one-step move; validate uniqueness and use last accepted intent semantics for
that register. Define schemas that narrow keys to the operation that can safely
edit them. The wire contract validates a non-empty command id; the web action
boundary continues to narrow it to `PlatformCommandId` without making the
shared contracts package import app code. Reject duplicate/conflicting operations
within one request unless their ordered composition is explicitly supported.

`NonSecretProviderSeed` contains the public driver/display/binary/config fields
needed to materialize a built-in and environment variable names with values
fixed to `''`. Its schema rejects the redaction token and every non-empty
environment value. Existing instances are patched by id and retain every other
current field.

Put the pure reducer beside the contract so the server and optimistic client
execute the same semantics. It accepts one target layer's latest raw record and
returns `{ raw, touchedSettingIds }` without mutating its input. The server turns
only those touched top-level ids into `DocumentEdit`s against the latest text;
it never serializes the returned record wholesale, so comments, formatting, and
unknown keys survive. The reducer must preserve untouched collection entries,
reuse unchanged references where practical, remain at nesting depth three or
less, and prove idempotence with a test for every operation kind.

Replace `SettingsWriteRequest` in `settings/wire.ts` atomically. Normal writes
carry no `baseRevision`. Remove the snapshot's ambiguous top-level user-file
`revision`; raw compare-and-swap uses each layer's existing `file.revision`.

### 2. An orderable update envelope

Add a server version to confirmed settings updates:

```ts
type SettingsServerVersion = {
  epoch: string
  sequence: number
}

type SettingsMutationResult = {
  mutationId: string
  appliedVersion: SettingsServerVersion
  changedSettingIds: readonly SettingId[]
  duplicate: boolean
  snapshot: SettingsSnapshot
}

type SettingsEvent = {
  changedSettingIds: readonly SettingId[]
  originMutationId?: string
  snapshot: SettingsSnapshot
}
```

`SettingsSnapshot` carries `serverVersion`. One store epoch is created at server
startup; sequence increases once per applied invalidation. The HTTP result and
SSE event for one write carry the same version. `changedSettingIds` is value-free
and lets every tab invalidate provider/model consumers without inspecting
payload values.

The initial GET establishes the active epoch. Within it, accept only a higher
sequence and treat an equal version as duplicate delivery. On reconnect or any
response/event with an unexpected epoch, pause admission, refetch, atomically
switch to the fetched epoch, and retire the old epoch; late responses from every
retired epoch are ignored. Do not compare sequence numbers across epochs or
admit the surprising response directly.

Keep mutation ids client-generated and globally unique. The server retains a
bounded per-epoch cache of request fingerprint, applied version, and changed ids
so an uncertain retry with the same id does not create a second update. It does
not cache an old full snapshot: a duplicate acknowledgement carries the current
snapshot plus the original `appliedVersion` and `duplicate: true`. Apply the same
rule to a raw `writeId`, caching a body fingerprint and result metadata, never
raw text. Reusing a retained id with another fingerprint is an id-collision
error.

After cache eviction or restart, reapplying an idempotent semantic request that
does not change latest raw state returns the current snapshot without advancing
sequence or publishing an event. A raw retry whose staged, secret-stripped text
and secret state already equal current state is the same kind of no-op. The
in-memory cache only deduplicates retries reaching one server process; desktop
clients are not load-balanced between processes mid-request.

### 3. One server write transaction per target

Create a settings write coordinator under `apps/server/src/settings/`, keyed by
the canonical target path, and use it for keyed and raw writes. It must be
process-wide rather than private to one `SettingsFileLayer`, so two store
instances in one process cannot pass independent locks. Remove idle coordinators
from the map only after its holder and waiter ref-count reaches zero. Canonicalize
an absent file by resolving its nearest existing parent and appending normalized
remaining segments; do not key nonexistent and later-created spellings
differently. Cross-process advisory locking is out of scope because external
editors would not honor it and the current app topology does not load-balance one
client across server processes. The revision recheck/replay remains required for
changes from those processes, with the irreducible race documented above.

The semantic path is:

1. Validate request shape, key/scope/policy, and operation compatibility before
   any durable side effect.
2. Acquire the target coordinator.
3. Fresh-read the target document and refuse malformed current text with the
   existing domain error.
4. Apply the shared semantic reducer to that latest raw state.
5. Validate every resulting registered value, materialize comment-preserving
   text edits, and stage settings plus secret changes.
6. Recheck the target revision after the temp file is staged and immediately
   before rename. If it moved, discard staged output and restart from step 3
   with the same idempotent request. Do not expose stale as a keyed-write error.
7. Commit, increment the server sequence exactly once, cache the mutation result,
   and publish one event.

Use a bounded wall-time/cancellation budget for repeated non-cooperating external
changes. Exhaustion is a structured `WRITE_CONTENDED` operational failure with
no stale file path, not `REVISION_STALE`; it is logged with attempt count and is
eligible for the client's transport-style Retry action. The expected app case
must complete on the first attempt.

Raw writes acquire the same coordinator and require a layer revision. Rename
the conflict to `RAW_REVISION_STALE`, include target and found revision in
structured metadata, and route it only to the raw editor conflict state. Never
include absolute paths in a user-facing message. An identical retry with the
same raw `writeId` is acknowledged before checking the now-advanced revision;
an explicit Overwrite action creates a new id and uses the newly confirmed
revision.

Provider operations currently write secrets before the settings file has passed
its revision guard (`store.ts:176-183,233-246`). For a write with secret changes,
use this concrete recovery protocol; settings-only writes keep the simpler path:

1. Validate and compute secret-stripped settings text plus the complete next
   secret-store text before writing anything.
2. In their target directories, stage new settings and secrets plus backups of
   both current files. Secret stage/backup files are `0600`; preserve the
   settings file mode. Fsync every staged file.
3. Atomically create a `0600` transaction journal beside the secret store. It
   contains transaction/write id, target/temp/backup paths, old/new content
   hashes, and phase only—never settings text, environment values, or secrets.
   Fsync the journal and both parent directories.
4. Rename settings stage into place, fsync its directory, and atomically advance
   the journal from `prepared` to `settings-committed`.
5. Rename the secret stage into place, fsync its directory, and advance to
   `secrets-committed`.
6. Remove backups/stages/journal and fsync the affected directories.

Run synchronous recovery before the constructor's first layer/secret reads at
`apps/server/src/settings/store.ts:85-100`. Compare destination hashes rather
than trusting the last journal phase. If each destination is at its recorded old
or new hash, roll forward any old side using its intact stage. If either has an
unrelated hash, never overwrite that divergent file; restore the other side only
when it is still exactly the transaction's new hash and its old backup is intact,
then raise a structured recovery-conflict error. Missing stage/backup or hash
mismatch also refuses startup with a precise recovery error. Inject failure at
every journal/rename/fsync boundary and prove recreation either completes the
pair or refuses without exposing a secret. Serialize secret-bearing writes
through this owner and deduplicate them by operation id.

### 4. Confirmed state is distinct from its projection

The TanStack query cache remains confirmed server state. Never put optimistic
file text, layer revision, or forged snapshots into it.

Split the existing hook responsibilities:

- `use-settings-document.ts` returns the confirmed `SettingsSnapshot` query.
- `use-settings-projection.ts` reads that confirmed snapshot plus active intents
  and uses the shared reducer followed by `resolveSettings` to produce a separate
  `SettingsProjection`: effective raw layer views without `file`, effective
  values, projected resolution diagnostics, and pending/acknowledged ids. It is
  not assignable to or branded as `SettingsSnapshot` and never claims optimistic
  file text or revision exists.
- `use-setting-value.ts`, `use-setting-inspection.ts`, settings controls, theme,
  and other live consumers read the projection.
- `SettingsPage` holds both: form controls/modified markers and
  `DiagnosticsBanner` use projection values/layers and projected
  unknown-key/scope/value diagnostics; raw JSON seeding/reconciliation,
  `MalformedBanner` parse errors/exact bytes, and boot-mirror writes use the
  confirmed document.

`resolveSettings` over raw layers produces empty provider environment values;
the server adds redaction masks afterwards at
`apps/server/src/settings/store.ts:109-126`. The client projection must run the
equivalent value-free masking phase: preserve confirmed masks by stable provider
instance id and environment-variable name for untouched fields, apply only the
allowed non-secret provider operation, and never turn a mask into an empty or
literal stored value. Add a focused regression for an optimistic provider toggle
with masked credentials.

Delete the old catch-all `use-settings.ts` after migrating every exact-file
import. Do not leave two hooks whose names differ but both appear to own the
settings truth.

Add a process-wide, resettable settings intent store under
`features/settings/state/`. It owns the one monotonic client-sequence allocator,
active intents in sequence order, acknowledged ids awaiting transport settlement,
and failed intents retained for Retry/Discard. It also derives resource keys and
marks older failed entries superseded when a later intent intersects them.
`useRef` or `submittedAt` per
`useSettingsActions` instance is not an ordering source. Enqueue into this store
synchronously before starting transport, and never restore a captured whole
snapshot on error.

Use one settings mutation key and one TanStack mutation `scope.id` across every
`useSettingsActions` instance. Mutation scopes are the transport serialization
backstop; the intent store owns semantic projection/ack/retry state. Put
admission, acknowledgement, failure, and cleanup in the hook-level mutation
options, never per-call `mutate` callbacks. Automatic transport retries reuse the
same mutation id and payload. `useMutationState` may select global transport
status across components, but it is not the source of optimistic order or failed
Retry state.

When an admitted SSE or HTTP update acknowledges mutation A, atomically update
confirmed state and mark A acknowledged before notifying projections. Filter A
even while its HTTP mutation remains TanStack-pending. Keep that acknowledgement
until transport settles, then remove the intent. This prevents the sequence
`SSE ack A → newer external same-key SSE B → late HTTP A` from replaying A over B.

`isSaving` becomes a document-global selector over pending settings transport
for status/close affordances, not a reason to blanket-disable every row. Remove
current `disabled={isSaving}` gates where absolute pending intents can compose;
keep only policy, capability, and genuinely non-composable disablement.
Provider-list invalidation runs only when an acknowledged provider operation
requires it. Later pending operations remain projected while an earlier response
updates confirmed state and leaves the mutation cache.

Create one helper that admits confirmed snapshots by server version. Mutation
success, SSE, raw save, and reconnect/refetch all call it; none directly call
`setQueryData` with an unguarded replacement. The helper also processes
`originMutationId`/changed ids atomically with cache admission.

### 5. Color mode has a real preview owner

Consolidate theme resolution and DOM appearance ownership in the existing
settings provider layer instead of adding another global store:

- Move the theme context module under
  `apps/web/src/features/settings/providers/theme-context.ts`.
- Put `useTheme` alone in
  `apps/web/src/features/settings/hooks/use-theme.ts`.
- Make `AppearanceProvider` own the one `matchMedia` subscription, confirmed
  boot-mirror write, projected appearance application, and transient color-mode
  preview.
- Delete `apps/web/src/components/theme-provider.tsx` and update `main.tsx`, test
  rendering, and exact-file imports. Do not add a feature barrel.

The context distinguishes committed/effective mode from rendered preview mode.
`resolvedTheme` follows preview; the palette's “active” badge follows committed
effective state. `setTheme`/`commitTheme` returns
`{ kind: 'noop' } | { kind: 'submitted'; mutationId: string; settled:
Promise<'acknowledged' | 'discarded' | 'failed'> }`.
A no-op clears hover immediately. A submission promotes preview to
`{ mode, handingOffTo: mutationId }`; keep rendering it until the settings
projection observes that id as pending or acknowledged. Clear/rollback the latch
if its matching intent fails or is discarded before projection ever observes it.
Do not trust React batching or TanStack's scheduled external-store notification.
Palette close/unmount clears hover preview only, never an active commit handoff.
`previewTheme` and `clearThemePreview` never call the command dispatcher or
mutation transport.

Apply projected appearance in `useLayoutEffect` so a committed React render does
not paint the prior root class/data attributes. Keep confirmed boot-mirror writes
and Nerd Font loading in separate `useEffect`s. Load fonts from confirmed values
only: `loadNerdFont` completes asynchronously and has no cancellation/generation
guard, so an old optimistic font load could otherwise overwrite a newer stack.
Before the first confirmed snapshot, do not apply registry/projection defaults
over the boot mirror already painted by `main.tsx`.

Replace `previewHighlightedColorMode` in command-palette content with that
preview action. Keep actual row selection on one real command so keyboard,
palette, and programmatic setting changes still share the command path. Add a
short comment only where it preserves the non-obvious preview/commit boundary.

In `apps/web/test/render.tsx`, replace `ThemeProvider` with the consolidated
`AppearanceProvider`, keep `seedBootMirrorTheme` before mount, and add a
pre-confirmation test proving both DOM/context stay on the mirror rather than
the registry default.

### 6. Stream recovery and raw conflict UX

`useSettingsStream` must record connect/disconnect/outcome, refetch after an
unexpected termination, and reconnect with abortable bounded backoff. A dropped
stream may stay quiet to the user, but it may not leave an infinite-stale query.
Pending intents continue to project while the confirmed refetch lands.

Teach `SettingsSyncService` to branch on `RAW_REVISION_STALE` before generic
error reporting. Add an explicit settings-document conflict transition to the
document service, preserving local text and recording the latest confirmed
revision. Render the resolution UI with existing `@workspace/ui` primitives and
theme tokens. Do not build a spinner or raw button, and do not reuse the
filesystem conflict type if its path/file assumptions do not fit a settings
layer.

### 7. Wide-event observability

Move request context enrichment before mutation work so failures retain setting
ids and target. Never record values, provider environment, raw text, or secrets.
One mutation operation/event should carry:

- `mutationId`, client instance id, initiator/command when known;
- target, setting ids, operation kinds, and affected stable domain ids;
- client queue wait, server coordinator wait, rebase attempts, epoch/sequence;
- outcome: applied, duplicate-ack, rejected, contended, transport-failed, or
  acknowledged after a newer confirmed update;
- structured error code/status without flattening it to generic `io_error`.

Add a stable client event id and deduplicate client-ingest retries so one failure
has one canonical client event. Stream lifecycle is one wide event per
connection attempt. Watcher read failures at `settings/layer.ts:423-424` must be
logged with layer and operation rather than swallowed.

## Scope

### In scope

- `packages/contracts/src/settings/wire.ts`, a new semantic mutation module and
  focused contract tests, plus package-entry exports.
- Settings server routes, store, layer, file writer, errors, secrets transaction
  boundary, watcher logging, and focused settings/observability tests.
- Web settings transport, confirmed document/projection hooks, settings actions,
  stream, raw sync service/conflict UI, and focused tests.
- Opt-in watcher/controlled-fetch capabilities in
  `apps/server/src/settings/testing.ts` and `apps/web/test/{client,fixtures,server}.ts`.
  Preserve watcher-off as the default for unrelated tests.
- Theme/appearance provider consolidation, exact `useTheme` import migration,
  color-mode palette preview, theme workspace commands, and provider test stack.
- Minimal confirmed/projection import migration in current consumers outside the
  feature: app command/runtime surfaces, file picker, toaster, editor theme,
  terminal, wallpaper/titlebar menu, and keymap command modules named in the
  drift check.
- Client error metadata and ingest deduplication needed to prove the behavior.

### Out of scope

- New setting keys, registry defaults/scopes, generated settings schema/reference,
  or unrelated appearance tokens.
- Automatic merge of arbitrary raw JSON text.
- Durable offline mutation storage or cross-device/cloud settings sync.
- A cross-process advisory lock or claim of zero data-loss against arbitrary
  external editors. If Platform later runs multiple server processes against one
  settings path, design a vetted lease as a separate plan.
- Reworking the general CommandBus beyond adapting theme commands to the new
  async settings action. Plan 062 owns that cutover after reconciliation.
- File-picker/fs behavior changes already present in the user worktree; only the
  exact settings-hook/toggle-lock migration named in the drift note is in scope.

## Implementation milestones

### Milestone 0 — Capture the baseline and freeze semantics

Do not add a deliberately failing test that remains red across later milestones.
The code/log evidence above is the bug characterization. Capture the current
focused green baseline before production edits:

```bash
cd /Users/shaul/Desktop/D/platform/packages/contracts
bun run test -- \
  src/tests/settings-resolve.test.ts \
  src/tests/settings-write-target.test.ts

cd /Users/shaul/Desktop/D/platform/apps/server
bun --bun vitest run \
  src/settings/tests/raw-write.test.ts \
  src/settings/tests/store-watch.test.ts

cd /Users/shaul/Desktop/D/platform/apps/web
bun --bun vitest run --project dom \
  src/features/command-palette/tests/color-mode-groups.test.tsx \
  src/features/settings/tests/stream.test.tsx
bun --bun vitest run --project node \
  src/features/settings/tests/json-document.test.ts
```

These tests are controls for palette row mapping, raw compare-and-swap,
watch/SSE delivery, target derivation, and dirty JSON behavior. Save their exact
results under `/tmp/plan-059-baseline.txt`. In Milestones 2–6, write each new
regression test first, observe that it fails for the named old behavior, then
implement the milestone and leave its gate green before continuing.

### Milestone 1 — Define and prove the shared intent contract

Add the discriminated operations, schemas, pure reducer, idempotence tests, and
new request/result/event envelopes without switching production callers yet.
This is staging for the atomic cutover in Milestone 2A, not a compatibility API;
no production branch may choose between old and new contracts.

Gate:

```bash
cd /Users/shaul/Desktop/D/platform/packages/contracts
bun run test -- src/tests/settings-mutations.test.ts
bun run typecheck
```

Expected: every operation composes against latest raw state, applying any
single request twice yields the same record, and contracts typecheck.

### Milestone 2 — Make stale impossible on normal writes

Land the server mechanisms separately so each high-risk boundary has its own
gate. Do not begin client optimism until all three submilestones pass.

#### Milestone 2A — Atomic semantic-route cutover

Implement the process-wide canonical-path coordinator and fresh-read semantic
apply/write loop. Switch every normal client/server call site to the new contract
and delete the old keyed request/edit/base-revision types in the same pass. Split
raw conflict to `RAW_REVISION_STALE`.

Tests in `write-concurrency.test.ts` and `raw-write.test.ts` cover:

- 20 concurrent disjoint scalar writes all survive;
- rapid dark → light → system settles to system with no rejected request;
- same-key writes follow coordinator admission/commit order under a test barrier;
  do not assert JavaScript invocation order across independent processes;
- keybinding/model-visibility/provider operations preserve concurrent unrelated
  entries, while model-order operations prove the documented atomic LWW rule;
- semantic retry after an injected disk revision change is idempotent;
- two `SettingsStore` instances sharing a canonical path cannot lose an edit;
- raw-vs-keyed ordering: raw first lets keyed rebase; keyed first makes the stale
  raw save conflict.

```bash
cd /Users/shaul/Desktop/D/platform/apps/server
bun --bun vitest run \
  src/settings/tests/write-concurrency.test.ts \
  src/settings/tests/raw-write.test.ts
bun run typecheck
```

Expected: `/settings/write` cannot produce `REVISION_STALE`; raw conflict tests
produce only `RAW_REVISION_STALE`.

#### Milestone 2B — Versioning and idempotent acknowledgement

Add epoch/sequence envelopes, current-snapshot duplicate acknowledgements,
bounded fingerprint caches, semantic no-op detection, and value-free changed ids.
Tests in `write-versioning.test.ts` and `store-watch.test.ts` cover:

- same mutation id/payload causes no second write, sequence, SSE, or telemetry;
- duplicate acknowledgement returns the current snapshot plus original
  `appliedVersion`, never a cached older snapshot;
- same retained id with another payload rejects and retention is bounded;
- identical raw retry deduplicates by `writeId`; id/body collision rejects;
- a post-eviction idempotent no-op also emits no second update;
- HTTP/SSE share the applied version; keyed, watcher, and raw success each
  advance sequence exactly once;
- watcher read failure records one structured warning.

```bash
cd /Users/shaul/Desktop/D/platform/apps/server
bun --bun vitest run \
  src/settings/tests/write-versioning.test.ts \
  src/settings/tests/store-watch.test.ts
bun run typecheck
```

#### Milestone 2C — Secret transaction durability

Implement the staged/journaled protocol exactly as specified above. Tests in a
new `transaction-recovery.test.ts` plus the existing raw-secret controls cover
validation failure before side effects, every injected journal/rename/fsync
boundary, synchronous startup recovery, external divergence refusal, permissions,
and absence of secrets from journal/log output.

```bash
cd /Users/shaul/Desktop/D/platform/apps/server
bun --bun vitest run \
  src/settings/tests/transaction-recovery.test.ts \
  src/settings/tests/raw-write-secrets.test.ts
bun run typecheck
```

### Milestone 3 — Add the optimistic intent projection

Split confirmed document from effective projection, give all mutation instances
one mutation key/scope, replay active intents from the central store in client-
sequence order, admit confirmed snapshots by server version, and keep boot/raw
consumers confirmed.
Do not implement optimism with `onMutate` whole-snapshot replacement/rollback.

Focused tests use controlled promises and the real query client:

- two components share one serialized settings mutation scope;
- two hook instances allocate one strict process-wide intent order;
- three pending same-register intents render the last immediately;
- an SSE update rebases pending intent without visible rollback;
- SSE acknowledgement A followed by newer external same-key event B and late
  HTTP A renders B throughout;
- older HTTP success cannot overwrite newer SSE confirmed state;
- equal-version HTTP/SSE delivery is a no-op, an older same-epoch sequence is
  refused, and a new epoch forces confirmed refetch before event admission;
- pending projection survives that epoch refetch;
- acknowledgement removes only its matching intent;
- deterministic 4xx removes only its own intent immediately;
- transport failure keeps the projection through bounded retries with one
  mutation id; exhausted retry and `WRITE_CONTENDED` remove only that intent and
  expose Retry;
- HTTP failure after an admitted SSE acknowledgement causes no rollback or Retry;
- an earlier failure never rolls back a later or unrelated intent;
- failed A on one register followed by winning B on the same register suppresses
  A's stale Retry; an unrelated failed intent stays retryable;
- provider query invalidation runs only after relevant acknowledgement;
- provider toggle preserves confirmed credential masks and never projects a
  redaction token into raw configuration;
- global saving state includes mutations started by another component.
- target derivation writes a workspace-overridden window setting to workspace,
  keeps application settings user-only, and falls back to user with no workspace.

Gate:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web
bun --bun vitest run --project dom \
  src/features/settings/tests/settings-actions.test.tsx \
  src/features/settings/tests/settings-projection.test.tsx \
  src/features/settings/tests/stream.test.tsx
bun --bun vitest run --project node src/features/settings/tests/api.test.ts
bun run typecheck
```

### Milestone 4 — Make color preview ephemeral over optimism

With the intent store/projection live, consolidate the appearance/theme provider
and replace persistent highlight dispatch with transient preview plus the
mutation-id handoff latch. Adapt theme commands to enqueue one semantic setting
operation and derive the winning target layer.

Focused tests add these cases:

- zero writes on open/highlight/cancel and one on a real selection;
- committing the effective mode returns `{ kind: 'noop' }`, clears hover preview,
  and creates no handoff latch;
- a submitted commit returns `{ kind: 'submitted', mutationId, settled }`;
- immediate rejection/discard clears or rolls back the matching handoff even if
  projection never observed it pending;
- palette close clears hover only, never a submitted handoff;
- boot mirror stays confirmed until acknowledgement;
- before the first confirmed query result, AppearanceProvider preserves the
  seeded mirror in both DOM and theme context.

```bash
cd /Users/shaul/Desktop/D/platform/apps/web
bun --bun vitest run --project dom \
  src/features/command-palette/tests/color-mode-preview.test.tsx \
  src/features/settings/tests/appearance-preview.test.tsx \
  src/features/settings/tests/appearance-optimistic.test.tsx
bun run typecheck
```

Expected: preview and commit semantics pass in state/mutation tests. Happy-dom
does not claim to prove browser paint ordering.

Prove the preview-to-pending handoff in a real browser:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web
bun run test:browser -- \
  src/features/settings/tests/appearance-optimistic.browser.tsx
```

Expected: the deduplicated document-root transition sequence stays on the
preview/optimistic selected mode continuously through handoff, then makes exactly
one transition to the confirmed mode after an injected final failure, with no
bounce or intermediate mode.
Use the controlled client/fetch boundary and observe the actual document-root
class/data attributes across `requestAnimationFrame`; do not substitute a
happy-dom state assertion for this gate.

### Milestone 5 — Recover streams and surface raw conflicts honestly

Add reconnect/refetch/version admission, settings-document conflict state, and
Reload / Compare / Overwrite UI. Keep dirty text through conflict and ensure
normal mutation errors use domain messages without absolute paths.

The raw-conflict test proves Reload asks before discarding, Compare mutates
nothing, Overwrite creates a new `writeId` with the newly confirmed revision, a
second intervening write conflicts again, dirty local text survives every step,
and neither `notifySaveError` nor the generic settings toast runs.

Use a controlled fetcher around the real in-process SSE response to terminate
one connection deterministically. Assert refetch, abortable backoff, reconnect,
and projection preservation in the automated test; manually severing a stream
is not a completion gate.

Gate:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web
bun --bun vitest run --project dom \
  src/features/settings/tests/stream.test.tsx \
  src/features/settings/tests/raw-conflict.test.tsx
bun --bun vitest run --project node \
  src/features/settings/tests/sync-service.test.ts \
  src/lib/tests/client-error-taxonomy.test.ts
```

### Milestone 6 — Prove the telemetry and do one real-app smoke pass

Gate the new wide events and ingest deduplication:

- rejected writes retain operation id, target, setting ids, operation kinds,
  wait/rebase counts, and structured code/status;
- events contain no value, raw text, provider environment, secret, or absolute
  client-visible path;
- one failed mutation produces one canonical client failure event, not parallel
  `settings.write` and `client.error` failures;
- ingest deduplicates on `(client instance,event id)`, preserves the same id from
  a different instance, and has bounded retention;
- an injected watcher read failure emits exactly one structured warning.

```bash
cd /Users/shaul/Desktop/D/platform/apps/server
bun --bun vitest run src/observability/tests/client-ingest.test.ts

cd /Users/shaul/Desktop/D/platform/apps/web
bun --bun vitest run --project node \
  src/lib/tests/client-logging.test.ts \
  src/lib/tests/client-error-reporting.test.ts
```

If a named test file does not yet exist, create it under the named shared test
directory; do not fold the assertion into an unrelated test.

Reuse the already-running dev server. In the real app:

1. Open Select Color Mode, arrow across all three modes several times, then
   cancel. Confirm live preview and restoration.
2. Repeat and select one mode. Confirm immediate paint and one eventual save.
3. Open two app windows, change disjoint settings rapidly, and confirm both
   persist without a toast.
4. Dirty the raw user settings buffer, change a normal setting elsewhere, then
   save raw. Confirm the inline conflict choices and preserved local text.
5. Optionally observe one controlled settings-stream reconnect in the real app;
   the deterministic completion gate is the controlled-fetch integration test.

Inspect the newest JSONL log with `jq`/`rg`. The color-mode session must show one
normal write for one selection, zero writes for preview/cancel, no
`settings.REVISION_STALE`, and no absolute settings path in a client-visible
error. The raw conflict must show one `RAW_REVISION_STALE` event with ids/target
but no document values.

## Final completion gates

First rerun the complete focused regression set so Milestone 6 cannot regress an
earlier milestone:

```bash
cd /Users/shaul/Desktop/D/platform/packages/contracts
bun run test -- src/tests/settings-mutations.test.ts

cd /Users/shaul/Desktop/D/platform/apps/server
bun --bun vitest run \
  src/settings/tests/write-concurrency.test.ts \
  src/settings/tests/write-versioning.test.ts \
  src/settings/tests/transaction-recovery.test.ts \
  src/settings/tests/raw-write.test.ts \
  src/settings/tests/raw-write-secrets.test.ts \
  src/settings/tests/store-watch.test.ts \
  src/observability/tests/client-ingest.test.ts

cd /Users/shaul/Desktop/D/platform/apps/web
bun --bun vitest run --project dom \
  src/features/command-palette/tests/color-mode-preview.test.tsx \
  src/features/settings/tests/appearance-preview.test.tsx \
  src/features/settings/tests/settings-actions.test.tsx \
  src/features/settings/tests/settings-projection.test.tsx \
  src/features/settings/tests/appearance-optimistic.test.tsx \
  src/features/settings/tests/stream.test.tsx \
  src/features/settings/tests/raw-conflict.test.tsx
bun --bun vitest run --project node \
  src/features/settings/tests/api.test.ts \
  src/features/settings/tests/json-document.test.ts \
  src/features/settings/tests/sync-service.test.ts \
  src/lib/tests/client-error-taxonomy.test.ts \
  src/lib/tests/client-logging.test.ts \
  src/lib/tests/client-error-reporting.test.ts
bun run test:browser -- \
  src/features/settings/tests/appearance-optimistic.browser.tsx
```

Expected: every named test passes, including the existing raw CAS controls and
all new semantic/optimistic/recovery/telemetry regressions.

Then run targeted typecheck/lint/format only for touched workspaces and compare
with the Milestone 0 baseline:

```bash
cd /Users/shaul/Desktop/D/platform
bun run --filter @workspace/contracts typecheck
bun run --filter server typecheck
bun run --filter web typecheck
bun run --filter @workspace/contracts lint
bun run --filter server lint
bun run --filter web lint
bun run --filter @workspace/contracts format:check
bun run --filter server format:check
bun run --filter web format:check

if rg -n 'baseRevision.*(edits|operations)|(edits|operations).*baseRevision' \
  packages/contracts/src/settings \
  apps/web/src/features/settings \
  apps/server/src/settings; then
  echo 'normal settings writes still carry a file revision'
  exit 1
fi

if rg -n '(^|[^A-Z_])REVISION_STALE([^A-Z_]|$)' \
  packages/contracts/src/settings \
  apps/web/src/features/settings \
  apps/server/src/settings; then
  echo 'plain stale-revision behavior is still reachable'
  exit 1
fi

rg -n 'RAW_REVISION_STALE' \
  packages/contracts/src/settings \
  apps/web/src/features/settings \
  apps/server/src/settings
```

Expected: all workspace commands exit 0; both negative assertions are silent;
the final grep finds only the raw contract/error/conflict handling. Preview
dispatch absence is proved behaviorally by `color-mode-preview.test.tsx`, not by
a brittle source-text grep.

Compare `git status --short` with `/tmp/plan-059-before.txt`. Preserve every
pre-existing dirty path. Review every changed comment: keep only non-obvious
constraints, and keep every new function at nesting depth three or less.

## Done criteria

- Color-mode preview performs zero writes and selection performs at most one.
- No normal registry action carries or can surface a file revision conflict.
- Semantic operations are absolute/idempotent and share one reducer across
  optimistic client and server.
- Concurrent disjoint, same-key, collection, raw-vs-keyed, and multi-store tests
  prove deterministic results without lost app writes.
- Confirmed snapshots are version-ordered; pending intent rebases over SSE/HTTP
  without snapshot rollback.
- File bytes, layer revisions, raw buffers, and boot mirror are confirmed-only.
- Raw conflict is explicit, recoverable, preserves local text, and never uses the
  generic settings toast.
- Settings stream reconnects/refetches after unexpected termination.
- Logs correlate one mutation without values/secrets and no longer duplicate
  client-ingest events.
- Focused tests/typechecks have no regression relative to the recorded baseline.
- Plan 062 is reconciled against the new theme context, async settings action,
  mutation result, and palette preview boundary before it is executed.

## STOP conditions

STOP and report rather than improvise when:

- a current normal settings action cannot be represented as an absolute,
  idempotent operation under the semantics above; `model.setOrder` is the only
  approved atomic whole-list register, not a precedent for other collections;
- the user-owned `keys.ts` edit changes any collection identity or scope assumed
  by this plan;
- plan 062 has landed and changed command/theme ownership without this plan being
  reconciled first;
- a test proves two store instances inside one server process can bypass the
  canonical-path coordinator;
- the secret/settings transaction cannot recover from either commit order
  without persisting secret values in a log/journal readable outside the secret
  boundary;
- an implementation proposal requires optimistic file text/revision, a whole-
  snapshot rollback, a blind stale retry, or disabling raw conflict detection;
- focused verification exposes an unrelated baseline regression. Preserve the
  evidence and ask the operator instead of expanding scope.

## References

- TanStack Query mutation scopes and consecutive-mutation ordering:
  <https://tanstack.com/query/latest/docs/framework/react/guides/mutations>
- TanStack Query optimistic updates:
  <https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates>
- TanStack Query global mutation state:
  <https://tanstack.com/query/latest/docs/framework/react/reference/useMutationState>

## Maintenance notes

- Reviewer priority: raw-vs-semantic boundary, provider mask preservation,
  acknowledged-intent filtering, epoch retirement, preview handoff continuity,
  and journal recovery without secret leakage.
- Every future normal settings action must be absolute and idempotent. If a new
  collection cannot meet that rule, design its domain operation before adding a
  UI writer; never fall back to whole-file revision guarding.
- If deployment changes to multiple server processes sharing one settings path,
  add a vetted cross-process lease in a separate plan and keep the semantic
  recheck/replay because advisory locks still do not cover external editors.
- After verification, follow `plans/README.md` cleanup policy and reconcile plan
  062's theme/settings command assumptions before marking it ready.
