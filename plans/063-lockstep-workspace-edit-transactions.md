# Plan 063: Land LSP WorkspaceEdit transactions in Editor and Platform lockstep

> **Executor instructions**: Read this plan completely before editing. Then read
> `/Users/shaul/Desktop/D/platform/AGENTS.md`, `/Users/shaul/Desktop/D/platform/PLAN.md`,
> `/Users/shaul/Desktop/D/Editor/AGENTS.md`, and
> `/Users/shaul/.agents/skills/never-nester/SKILL.md`. Execute the milestones in order in the
> two existing worktrees. Do not create a branch, worktree, commit, push, or PR unless the
> operator explicitly asks. Do not start another dev server; reuse the running one.
>
> This is one lockstep change, not two independently shippable features. Editor lands the
> lossless protocol model and guarded same-buffer transaction API first; Platform consumes
> that exact API in the same execution before either side is declared complete. Do not merge
> or release a Platform half that parses LSP itself, and do not leave an Editor half whose
> rename/code-action path can partially apply a WorkspaceEdit.
>
> This is greenfield. Do not add an adapter around the obsolete per-tab/static-document
> architecture, a legacy alias, a fallback through `Editor.setContent`/`Editor.applyEdit`, a
> second dirty set, or a second cross-file persistence path. Change readonly contracts at the
> ownership boundary; never spread, `Array.from`, or otherwise copy a container only to satisfy
> a mutable parameter type.

## Status

- **State**: Blocked on plan 062 and authoritative `PLAN.md` scheduling; executable after both
  are reconciled
- **Priority**: P1
- **Effort**: XL, lockstep across two repositories
- **Risk**: HIGH — protocol versions, dirty memory, reversible disk mutation, resource
  operations, watcher replay, and undo meet at one boundary
- **Depends on**: plan 062, which depends on plan 059; plan 062's typed CommandBus and command
  metadata must exist before the explicit workspace undo/redo commands are registered
- **Ordering with 060/061/064**: no semantic dependency, but do not execute concurrently. If 060,
  061, or 064 lands first, re-run this plan's drift check over shared Editor/WDS/provider/plugin
  files. If this plan lands first, reconcile 061 against the new prepared-open/document transaction
  APIs and 064 against the changed LSP option/plumbing surface.
- **Category**: architecture / correctness / LSP
- **Planned at**: Platform `bcd4a5b0`, Editor `c8c36b9`, 2026-08-24

## Drift check and baseline

During planning, Editor's concurrent allocation work landed cleanly as `c8c36b9`; it changes
`documentTextSnapshot.ts`, the piece-table walker, Shiki/token files, and tests. This plan was
re-audited against that head and deliberately uses the current snapshot range/chunk contract
without editing `documentTextSnapshot.ts`. Platform concurrently gained user-owned plan 064/parity
changes and an in-progress prepared-open/diff/workbench/tree/UI change set while its head remained
`bcd4a5b0`; it already had the modified plan index and untracked plan 062. None belongs to this plan
and all must be preserved. If execution overlaps one of those dirty files or a later commit moves a
named contract, STOP and reconcile rather than absorbing it silently. Record both worktrees before
editing:

```bash
cd /Users/shaul/Desktop/D/platform
git status --short > /tmp/plan-063-platform-before.txt
git rev-parse HEAD
git diff --stat bcd4a5b0 -- \
  apps/server/src/fs \
  apps/server/src/lsp \
  apps/web/src/features/editor \
  apps/web/src/features/search \
  apps/web/src/features/workbench \
  apps/web/src/features/workspace \
  apps/web/src/keymap \
  apps/web/src/lib/file-server.ts \
  apps/web/test \
  packages/contracts/src \
  .github/workflows/ci.yml

cd /Users/shaul/Desktop/D/Editor
git status --short > /tmp/plan-063-editor-before.txt
git rev-parse HEAD
git diff --stat c8c36b9 -- \
  packages/editor/src/documentSession.ts \
  packages/editor/src/public/document.ts \
  packages/editor/src/index.ts \
  packages/editor/src/tokens.ts \
  packages/editor/test \
  packages/lsp/src \
  packages/lsp/test \
  packages/lsp-plugin/src \
  packages/lsp-plugin/test \
  packages/lsp-plugin/package.json
```

Completed plan 062 drift is expected. Read its landed command IDs, async ticket result, undo
category, and provider locations instead of restoring names from this planning snapshot. Drift
from 060/061/064 is also expected only if those plans were explicitly scheduled first. If any other
in-scope dirty edit overlaps a symbol named below, STOP and ask the operator to reconcile
ownership. Never revert, stash, overwrite, or format unrelated work.

Capture focused baselines before implementation. A final gate is a delta against these results,
not an absolute count:

```bash
cd /Users/shaul/Desktop/D/Editor/packages/editor
bun run test -- test/documentSession.test.ts test/editor.test.ts test/public-api.test.ts \
  > /tmp/plan-063-editor-core-baseline.txt 2>&1

cd /Users/shaul/Desktop/D/Editor/packages/lsp
bun run test > /tmp/plan-063-editor-lsp-baseline.txt 2>&1

cd /Users/shaul/Desktop/D/Editor/packages/lsp-plugin
bun run test -- test/workspaceEdit.test.ts test/plugin.test.ts test/codeActions.test.ts \
  test/narrowFactoryPlumbing.test.ts > /tmp/plan-063-editor-plugin-baseline.txt 2>&1

cd /Users/shaul/Desktop/D/platform/apps/server
bun --bun vitest run src/lsp/typescript/tests/session.test.ts \
  src/lsp/tests/proxy-session.test.ts src/tests/app.test.ts \
  > /tmp/plan-063-platform-server-baseline.txt 2>&1

cd /Users/shaul/Desktop/D/platform/apps/web
bun --bun vitest run --project node \
  src/features/editor/tests/document-state.test.ts \
  src/features/editor/tests/file-sync-service.test.ts \
  src/features/editor/tests/language-server-plugin.test.ts \
  src/features/search/tests/search-replace-runner.test.ts \
  src/features/workspace/tests/use-events.test.ts \
  > /tmp/plan-063-platform-web-baseline.txt 2>&1
```

If a baseline has a pre-existing failure, record its exact test name and continue only when the
failure is unrelated and reproducible before edits. Completion permits no new failure.

## Outcome

After this plan:

1. Editor parses an untrusted `WorkspaceEdit` losslessly into one readonly, ordered operation
   stream. Versions, annotations, repeated document operations, URIs, and resource options survive.
2. Editor strictly validates UTF-16 positions and overlaps against an immutable target snapshot.
   It never clamps, drops, re-diffs, or partially retains an invalid workspace edit.
3. Editor prepares and commits one guarded transaction per buffer. Preparation is side-effect-free;
   commit checks revision plus snapshot identity and emits one transaction/change. Platform receives
   rollback/undo receipts but does not implement Editor internals.
4. Rename and code-action producers hand the whole normalized edit to one Platform callback. No
   active-document half is applied locally.
5. Platform owns target classification, dirty/open/unopened policy, preview and confirmation,
   cancellation, persistence, resource operations, rollback orchestration, state/cache projection,
   and cross-file undo/redo.
6. Open buffers are edited in memory and never silently saved. Unopened files are guarded and
   persisted without opening a hidden document or tab.
7. A server-side reversible journal makes ordered writes/create/rename/delete one operation. A
   failed leg compensates completed legs; failed compensation becomes an explicit
   recovery-required result rather than false success.
8. Text-only work on exactly one live buffer uses normal Editor undo. Every persistence/resource or
   multi-buffer edit is one Platform-owned group behind Editor history barriers; ordinary `Mod+Z`
   cannot undo one leg.
9. Watch events are post-commit invalidation hints carrying the transaction write ID. They are not
   used to prove success or repair timing races.

## Architectural ownership — do not blur this table

| Concern                                                             | Sole owner                                | Required boundary                                                            |
| ------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| Runtime parsing of raw LSP `WorkspaceEdit`                          | Editor `@singapor/lsp-plugin`             | Platform receives a parsed readonly result, never raw protocol objects       |
| UTF-16 position, range, overlap, annotation, and version validation | Editor                                    | Platform supplies exact current target snapshots and calls Editor validation |
| One-buffer prepare/commit/rollback receipt                          | Editor core                               | Platform invokes guarded APIs; it does not mutate piece tables or history    |
| Supported schemes, root containment, path/resource type policy      | Platform                                  | Editor preserves URI strings without deciding workspace policy               |
| Dirty/open/unopened selection                                       | Platform `WorkspaceEditService`           | Live WDS buffer wins; unopened file snapshot comes through `FileSyncService` |
| Preview, confirmation, cancellation, busy/recovery UI               | Platform                                  | React renders service state; effects do not coordinate the transaction       |
| Disk staging, version guards, persistence, compensation             | Platform server through `FileSyncService` | No loop over the old single-file APIs                                        |
| Live document/tab/path/query projection                             | Platform                                  | WDS and existing domain actions update once after durable commit             |
| Same-document undo                                                  | Editor `DocumentSession`                  | One normal history entry                                                     |
| Cross-file/persistence/resource undo and redo                       | Platform                                  | Explicit commands; Editor barriers/receipts and optional server journal      |

## Audited current state

### Editor currently loses information before application

`/Users/shaul/Desktop/D/Editor/packages/lsp-plugin/src/workspaceEdit.ts` currently says versions are
“deliberately dropped,” reduces resource operations to kind strings, drops annotations, treats a
snippet as a side marker, and returns only the first matching operation for a URI. It accepts a
typed value rather than validating `unknown`.

Load-bearing current excerpt:

```ts
if (edit.documentChanges) return planFromDocumentChanges(edit.documentChanges)

if ('kind' in change) {
  resourceOperations.push(change.kind)
  continue
}

documents.push({ edits, uri: change.textDocument.uri })
```

The operation URI/options/version/annotation and relative ordering across the two output arrays are
gone after this point.

Rename at `packages/lsp-plugin/src/plugin.ts:839-863` and quick fixes at
`packages/lsp-plugin/src/codeActions.ts:267-303` reject cross-file edits, then call
`formattingEdits`. `packages/lsp-plugin/src/formatting.ts:8-60` clamps protocol positions, silently
drops reversed/overlapping edits, and re-diffs the survivors. That behavior remains valid only for
formatter minimization; it is forbidden for WorkspaceEdit.

Current rename application excerpt:

```ts
if (workspaceEditTouchesOtherDocuments(plan, active.uri)) {
  this.handleRequestError(
    new Error('Rename spans several files, which this editor cannot apply yet.'),
  )
  return
}

const edits = formattingEdits(active.fullText, workspaceEditForDocument(plan, active.uri))
feature.applyCompletion({ edits, selection: { anchor: head, head } })
```

Editor core is already close to the required atomic primitive. In
`packages/editor/src/documentSession.ts:384-423`, `applyEdits` normalizes and validates the entire
batch against one snapshot, builds the next persistent snapshot, and commits once. The transaction
already contains inverse edits and before/after snapshots at `:646-661`; the buffer exposes
`getRevision()` at `:516-518`. What is missing is side-effect-free preparation and a guarded commit.

### Platform producers and versions are incomplete

`apps/server/src/lsp/typescript/handlers/rename.ts` and `code-action.ts` emit legacy `{ changes }`,
drop open-document versions, and silently omit outside-root/unreadable legs. Code action also uses
`Array.from(diagnostics)` only to cross a readonly/mutable type mismatch. A partial producer result
is not an executable rename or fix.

Current producer excerpt from rename:

```ts
const changes: Record<lsp.DocumentUri, lsp.TextEdit[]> = {}
for (const location of locations) appendTextChange(ctx, changes, location.fileName /* ... */)
return { changes }
```

`appendTextChange` returns early for an outside/unreadable leg, so the caller cannot distinguish a
complete edit from a retained subset.

The external proxy rewrites browser document versions into pooled backend versions in
`apps/server/src/lsp/proxy-session.ts:855-894` and strips pooled diagnostic versions at
`:1657-1663`. Therefore a numeric `TextDocumentEdit.version` from an external server is not a WDS
revision and is not automatically the browser LSP version. This plan adds explicit response-time
translation; it never compares unrelated counters.

### Platform has single-resource APIs, not a workspace transaction

`WorkspaceDocumentService` owns live buffers/dirty/revisions/path projection, but has no prepared
batch or rollback boundary. `FileSyncService` performs one guarded file save. `save.ts` and search
replace intentionally permit partial success. Those semantics must not be reused for WorkspaceEdit.

Server `write.ts` atomically replaces one file. `create.ts`, `rename.ts`, and `delete.ts` are
independent; overwrite rename removes its destination before the source rename has succeeded.
Routes carry no group transaction, reverse journal, or status recovery. Watcher reconciliation in
`features/workspace/hooks/use-events.ts` still reacts after the fact; it cannot become the commit
protocol.

Current `FileSyncService.save` is deliberately one document/one write:

```ts
const entry = await this.writeContent(sync.path, text, {
  baseVersion: sync.fileVersion,
  expectedMtimeMs: sync.mtimeMs,
  origin: 'editor',
  writeId,
})
this.documentStore.getState().markLiveEditorDocumentSaved(/* one document */)
```

Current search replace likewise branches per target: open buffers receive `applyEdits`, while each
unopened target calls `writeFileContent` independently and reports later failures as skipped. This
plan deletes that second policy rather than wrapping it.

## Required Editor contracts

### 1. Lossless readonly plan

Replace the flattened model in `packages/lsp-plugin/src/workspaceEdit.ts` with a public parser that
takes `unknown` and returns a discriminated success/failure. Export it through a new
`@singapor/lsp-plugin/workspace-edit` package entry and the root entry point.

The semantic shape is:

```ts
type ParsedWorkspaceEdit = {
  readonly annotations: ReadonlyMap<string, WorkspaceEditAnnotation>
  readonly operations: readonly WorkspaceEditOperation[]
}

type WorkspaceEditAnnotation = {
  readonly description?: string
  readonly label: string
  readonly needsConfirmation: boolean
}

type ParsedWorkspacePosition = {
  readonly character: number
  readonly line: number
}

type ParsedWorkspaceTextEdit = {
  readonly annotationId?: string
  readonly newText: string
  readonly range: {
    readonly end: ParsedWorkspacePosition
    readonly start: ParsedWorkspacePosition
  }
}

type WorkspaceEditOperation =
  | {
      readonly annotationId?: string
      readonly edits: readonly ParsedWorkspaceTextEdit[]
      readonly kind: 'text-document'
      readonly uri: string
      readonly version: number | null
    }
  | {
      readonly annotationId?: string
      readonly ignoreIfExists: boolean
      readonly kind: 'create'
      readonly overwrite: boolean
      readonly uri: string
    }
  | {
      readonly annotationId?: string
      readonly ignoreIfExists: boolean
      readonly kind: 'rename'
      readonly newUri: string
      readonly oldUri: string
      readonly overwrite: boolean
    }
  | {
      readonly annotationId?: string
      readonly ignoreIfNotExists: boolean
      readonly kind: 'delete'
      readonly recursive: boolean
      readonly uri: string
    }

type WorkspaceEditFailure = {
  readonly code: WorkspaceEditFailureCode
  readonly editIndex?: number
  readonly operationIndex?: number
  readonly reason: string
}

type WorkspaceEditFailureCode =
  | 'ambiguous-inserts'
  | 'invalid-annotation'
  | 'invalid-position'
  | 'invalid-workspace-edit'
  | 'overlapping-edits'
  | 'reversed-range'
  | 'snapshot-drift'
  | 'unsupported-snippet'
  | 'version-mismatch'

type ParseWorkspaceEditResult =
  | { readonly ok: true; readonly value: ParsedWorkspaceEdit }
  | { readonly error: WorkspaceEditFailure; readonly ok: false }

declare function parseWorkspaceEdit(input: unknown): ParseWorkspaceEditResult
```

Rules:

- `documentChanges` is authoritative when present. Reject a payload that ambiguously carries both
  executable shapes instead of silently choosing one.
- Preserve exact `documentChanges` order and repeated text operations for the same URI.
- A legacy `changes` map becomes one unversioned text operation per URI in lexicographic URI order;
  map order is not a protocol ordering guarantee.
- Preserve every annotation and `needsConfirmation`. Reject a referenced annotation ID missing
  from `changeAnnotations`.
- Reject malformed positions, non-integer versions/coordinates, unknown operations, and snippet
  edits as one structured parse failure with `operationIndex`/`editIndex`. Never return a partial
  executable plan.
- Preserve unsupported URI schemes for Platform to classify. Scheme support is not parser policy.
- Normalize absent resource-option booleans to `false` and preserve both option values. Platform,
  which owns resource semantics, applies overwrite/ignore precedence during its virtual filesystem
  preflight; Editor does not execute or reinterpret a resource operation.

### 2. Strict text preparation

Add `packages/lsp-plugin/src/workspaceTextEdits.ts`. Platform resolves the resource graph and gives
Editor the ordered text operations that address one logical target; Editor owns their protocol
replay, version/range validation, and composition into one core transaction:

```ts
type WorkspaceTextDocumentProvenance = {
  readonly textSnapshot: TextSnapshot
  readonly uri: string
  readonly version: number
}

type WorkspaceTextReplayInput = {
  readonly initialSnapshot: DocumentTextSnapshot
  readonly operations: readonly {
    readonly operation: Extract<WorkspaceEditOperation, { kind: 'text-document' }>
    readonly operationIndex: number
  }[]
  readonly provenance: readonly WorkspaceTextDocumentProvenance[]
}

type PreparedWorkspaceTextEdit = TextEdit & {
  readonly annotationId?: string
}

type PreparedWorkspaceTextStep = {
  readonly edits: readonly PreparedWorkspaceTextEdit[]
  readonly operationIndex: number
  readonly snapshotAfter: PieceTableSnapshot
  readonly snapshotBefore: PieceTableSnapshot
  readonly uri: string
}

type PrepareWorkspaceTextReplayResult =
  | {
      readonly ok: true
      readonly steps: readonly PreparedWorkspaceTextStep[]
      readonly transaction: PreparedDocumentTransaction
    }
  | { readonly error: WorkspaceEditFailure; readonly ok: false }

declare function prepareWorkspaceTextReplay(
  input: WorkspaceTextReplayInput,
): PrepareWorkspaceTextReplayResult
```

`DocumentTextSnapshot` is the instrumentable input and carries its piece-table snapshot. Platform's
live/disk stamps are deliberately absent: Platform retains and revalidates them around this pure
Editor call. Step snapshots let Platform preserve unopened write/resource order without parsing or
re-applying LSP ranges.

- Validate UTF-16 line/character positions against piece-table line metadata. Do not materialize
  full text merely to locate lines and do not call the clamping `lspPositionToOffset` helper.
- Reject negative/fractional/out-of-line positions, reversed ranges, true overlaps, and two
  zero-width inserts at the same offset. Coincident insert order is protocol-ambiguous and must not
  inherit an incidental descending sort.
- Accept unsorted adjacent edits. All ranges are measured against the immutable input snapshot.
- Seed the simulated version from provenance whose URI and `textSnapshot` identity match the target.
  A non-null operation must equal the simulated LSP version; missing/mismatched provenance is
  `version-mismatch`, not a null downgrade. Every sequential text-document operation, including a
  null-version one, advances the simulated version once. Thus `N, N+1` is valid and `N, N` or
  `N, N+2` fails atomically. Never substitute core revision or `textVersion`.
- A resource rename changes URI provenance. A later non-null edit at the new URI requires a captured
  lane entry for that exact URI/snapshot; otherwise reject. A null edit can continue on Platform's
  guarded logical target.
- Put the number of replayed text-document operations into the prepared transaction's
  `logicalRevisionCount`. `DocumentSync` passes that count to an extended readonly
  `LspWorkspace.updateDocumentSnapshot` option, which emits one atomic `didChange` at the simulated
  final monotonic version rather than pretending the collapsed operations were one protocol step.
  A second mounted view observing the identical resulting snapshot adopts the already-current
  workspace document/version without a second `didChange`, even if its local change event carries
  the same effective edits.
- Preserve annotation association in the prepared output. Surrogate-boundary snapping must report
  the actual applied ranges. Preserve parser `newText` exactly, then let the Editor transaction
  boundary normalize CRLF/lone CR to its LF model and report the effective text. Unopened
  persistence serializes with `pieceTableDocumentText`, preserving a consistent source line-ending
  policy and BOM; it never writes `materializeFullText()` directly.
- Export `documentTextRoundTripStatus(text)` and `pieceTableDocumentText(snapshot)` through
  `@singapor/core/document`. The status accepts consistent LF or CRLF with an optional UTF-8 BOM and
  rejects mixed endings, lone CR, and U+2028/U+2029 before a transient unopened buffer can lose
  their original representation.

Stable failure codes must include `invalid-workspace-edit`, `invalid-annotation`,
`unsupported-snippet`, `invalid-position`, `reversed-range`, `overlapping-edits`,
`ambiguous-inserts`, `version-mismatch`, and `snapshot-drift`.

### 3. Guarded one-buffer transaction

Extend `packages/editor/src/documentSession.ts`, `packages/editor/src/public/document.ts`, and
`packages/editor/src/index.ts` with a generic core API, not an LSP-specific one:

```ts
type PreparedDocumentTransaction = {
  readonly logicalRevisionCount: number
  readonly expectedRevision: number
  readonly snapshotBefore: PieceTableSnapshot
  readonly snapshotAfter: PieceTableSnapshot
  readonly edits: readonly TextEdit[]
  readonly inverseEdits: readonly TextEdit[]
}

type DocumentTransactionHistory =
  | { readonly kind: 'record'; readonly undoGroup?: string }
  | { readonly groupId: string; readonly kind: 'external-barrier' }

type DocumentTransactionCommitTarget = {
  readonly buffer: EditorTextBuffer
  readonly sourceView: EditorViewSession | null
}

type DocumentTransactionCommitOptions = {
  readonly history: DocumentTransactionHistory
  readonly selection?: DocumentSessionEditSelection
  readonly selections?: readonly DocumentSessionEditSelection[]
}

declare const documentTransactionReceiptBrand: unique symbol

type DocumentTransactionReceipt = {
  readonly [documentTransactionReceiptBrand]: true
  readonly edits: readonly TextEdit[]
  readonly history: DocumentTransactionHistory
  readonly inverseEdits: readonly TextEdit[]
  readonly logicalRevisionCount: number
  readonly phase: 'provisional' | 'sealed'
  readonly revisionAfter: number
  readonly revisionBefore: number
  readonly snapshotAfter: PieceTableSnapshot
  readonly snapshotBefore: PieceTableSnapshot
}

type PreparedDocumentCommitResult =
  | {
      readonly status: 'committed'
      readonly change: DocumentSessionChange
      readonly receipt: DocumentTransactionReceipt
    }
  | { readonly status: 'stale' }

type ReverseDocumentTransactionResult =
  | {
      readonly status: 'reversed'
      readonly change: DocumentSessionChange
      readonly receipt: DocumentTransactionReceipt
    }
  | { readonly status: 'stale' }

type SealDocumentTransactionResult = {
  readonly receipt: DocumentTransactionReceipt
  readonly status: 'sealed' | 'already-sealed'
}

type ReleaseDocumentTransactionResult = {
  readonly status: 'released' | 'already-released'
}
```

- Export exact `prepareDocumentTransaction(buffer, readonlyEdits, logicalRevisionCount)`,
  `commitPreparedDocumentTransaction(target, prepared, options)`,
  `reverseDocumentTransaction(target, receipt)`,
  `sealDocumentTransactionReceipt(target, receipt)`,
  and `releaseDocumentTransactionReceipt(target, receipt)` functions/types through
  `@singapor/core/document` and the root. Reverse returns a reciprocal branded receipt used for
  redo. Release is idempotent and keyed by the opaque barrier identity, not current text: it can
  squash an older retained history token beneath newer barriers without changing text, revision,
  selection, or emitting. A missing/already-released barrier is a no-op.
- Seal is likewise identity-based, synchronous, and idempotent. It drops only the pre-group redo
  branch and cannot fail for snapshot drift; it returns the sealed branded receipt Platform stores.
- Preparation validates and constructs `snapshotAfter` without changing buffer revision, history,
  selections, dirty state, subscribers, or text.
- Commit compares both `getRevision()` and `getSnapshot()` identity, then commits synchronously.
  Revision is required because edit then undo can return to equivalent text/snapshot state.
- `record` produces one ordinary native undo entry. `external-barrier` changes current text without
  putting the group leg on ordinary history, clears redo as a new edit must, and inserts an
  Editor-owned barrier: later user edits may undo back to the group result, but native Undo cannot
  cross into the pre-group snapshot. The opaque receipt retains the pre-barrier history only for
  exact rollback/Platform undo. A provisional receipt retains pre-existing redo for compensation;
  sealing after Platform finalize permanently drops that obsolete redo while retaining the older
  undo chain behind the barrier. Releasing a drifted/evicted receipt permanently squashes that old
  undo chain at the barrier.
- Expose a guarded inverse/rollback operation over the returned receipt. It may mutate only when the
  buffer is still at the receipt's exact after revision/snapshot and barrier state. It restores the
  before snapshot and source selection state, emits one change, and returns the reciprocal receipt.
  Reversing a provisional receipt for compensation restores exact pre-existing undo/redo; reversing
  a sealed receipt for user Undo keeps pre-existing redo discarded and yields only the reciprocal
  workspace-group Redo. Platform decides which boundary it is in; Editor performs the same-buffer
  reversal.
- Extend `EditorTextBufferChange` with an Editor-owned external/view origin and make mounted
  `Editor` instances subscribe/unsubscribe on attach/detach/dispose. A normal source view still
  applies its own call once; an external prepared commit notifies every attached view exactly once.
  Each view keeps/maps its distinct anchor selections and scroll state; the target's optional
  `sourceView` supplies native-history selections without making other views adopt them. Explicit
  `selection`/`selections` affect that source view only; absent options map every view's own anchors.
- `logicalRevisionCount` defaults to one and is metadata for consumers such as `DocumentSync`; the
  core buffer revision still advances exactly once for the atomic transaction.
- `TextEdit` and every input container used here are genuinely readonly. Change callees that do not
  mutate; do not copy inputs to silence TypeScript.
- Do not expose or route through the obsolete static `DocumentSession`/`Editor` content replacement
  architecture.

Multiple sequential text operations on one logical buffer must be simulated in protocol order and
collapsed into one prepared initial-to-final transaction when no resource boundary requires a
Platform group. Cross-file/resource groups use `external-barrier`; Platform is their only undo
owner and ordinary Editor Undo cannot expose one leg.

### 4. One producer callback and honest capabilities

Add a single async `onApplyWorkspaceEdit` option to adapter, set, and narrow plugin options. The
request carries the parsed plan, source (`rename` or `code-action`), title/label, server ID, origin
URI/version, the owning lane's revalidation guard, and an `AbortSignal`. The guard owns a readonly
capture of every `LspWorkspace` document at response time as `{ uri, version, textSnapshot }` and
an `isCurrent(uri)` method that verifies that target's captured URI/version/snapshot identities
still match the same workspace. Platform calls it only for parsed target URIs, so unrelated open
document activity does not invalidate the edit. Do not materialize text or copy a container merely
to satisfy mutability. The result is a non-rejecting `applied | cancelled | failed` union.

```ts
type WorkspaceEditOriginGuard = {
  readonly documents: readonly WorkspaceTextDocumentProvenance[]
  isCurrent(uri: string): boolean
}

type ApplyWorkspaceEditRequest = {
  readonly guard: WorkspaceEditOriginGuard
  readonly label: string
  readonly originUri: string
  readonly originVersion: number
  readonly plan: ParsedWorkspaceEdit
  readonly serverId: string
  readonly signal: AbortSignal
  readonly source: 'code-action' | 'rename'
}

type ApplyWorkspaceEditResult =
  | { readonly status: 'applied' }
  | { readonly status: 'cancelled' }
  | { readonly code: string; readonly message: string; readonly status: 'failed' }

type OnApplyWorkspaceEdit = (
  request: ApplyWorkspaceEditRequest,
) => Promise<ApplyWorkspaceEditResult>
```

- Rename and code actions always dispatch the whole plan. Delete the local “pick this document”
  application path.
- Preserve existing active-document identity checks before dispatch. Abort/supersede the request
  when the document changes, a newer request wins, the prompt cancels, or the plugin disposes.
- Change `onRequestRenameName` to receive `{ currentName, signal }`. One operation-scoped
  `AbortController` spans prepareRename, the prompt (including the built-in widget), rename request,
  parsing, and host application. Active-document drift, a newer rename, or disposal aborts the
  pending prompt and closes its widget before any later stage runs.
- Fix `resolveAdapterOptions` so `onRequestRenameName` is actually propagated.
- Host cancellation is not reported as an error toast. Host failure is reported once.
- The normal pooled Platform connection always installs the same host callback and the same
  immutable capability object for every borrower. Diff sessions use their separate
  `diff:<sessionId>` pool key and omit it. Synthetic/read-only targets are rejected by Platform
  policy, never by varying normal-pool initialization according to the first borrower.
- Once rollback tests are green, the exact addition is:

  ```ts
  workspace: {
    workspaceEdit: {
      documentChanges: true,
      resourceOperations: ['create', 'rename', 'delete'],
      failureHandling: 'undo',
      normalizesLineEndings: true,
      changeAnnotationSupport: { groupsOnLabel: true },
    },
  }
  ```

  Preserve parser `newText` and normalize only at Editor application. Do not advertise snippet
  edits or `failureHandling: 'transactional'`.

- Editor is the sole capability composer: when `onApplyWorkspaceEdit` is installed, its existing
  deep merge adds that exact block without replacing host or semantic-token capabilities. Platform
  supplies the stable callback and never hand-builds a second WorkspaceEdit capability object.
- Do **not** advertise `workspace.applyEdit` in this plan. The pooled Platform proxy cannot safely
  choose among multiple browser owners for an uncorrelated server request. Server-initiated
  `workspace/applyEdit` remains an explicit future LspService task. It may be enabled only after
  one connection/root-scoped Platform `WorkspaceEditService` owner and one correlated
  `ApplyWorkspaceEditResult` response path exist; never broadcast/lease the request among views.
  Add pool/proxy ownership tests before advertising it. Accidentally enabling it now is a STOP.

## Required Platform behavior

### Target and preview policy

Platform resolves every URI before any preview:

- accept only canonical local `file:` URIs with empty authority;
- decode once, reject malformed escapes/`..`, normalize through one helper, and require
  `isPathInWorkspace(path, rootPath)`;
- reject synthetic document IDs, other schemes, non-regular text targets, and any path the server
  cannot stage reversibly;
- reject every symlink target, even one resolving inside the root, because aliases make document
  identity and reverse-resource guards ambiguous; after canonicalizing the workspace root itself,
  `lstat` every existing target component and reject any descendant symlink component;
- create, rename, and delete support regular files only in this first implementation. A directory
  URI is `unsupported-resource-type` even when delete carries `recursive: true`; do not walk or
  partially mutate descendants.
- reject two distinct URI spellings that resolve to the same canonical path as
  `ambiguous-resource-alias`; do not merge them by accident on case-insensitive filesystems.

The same active document may apply without a preview only when the plan is text-only, touches that
one already-live buffer, references no `needsConfirmation` annotation, and the owning-lane guard has a
current entry whose text snapshot is identical to the WDS snapshot. A non-null operation version
must also equal that entry's LSP version.
Everything else previews: multiple documents, another dirty/open document, any unopened target,
any resource operation, or any confirmation annotation.

The preview is a frozen proposal, not a lock. It lists ordered operations, before/after text diffs,
dirty/open/unopened status, resource option/no-op effects, annotations, and whether the group uses
Editor undo or Platform undo. Confirm revalidates every stamp. Drift closes/disables the stale
proposal and requires the originating rename/fix to be requested again; never rebase an old answer.
Confirmation is all-or-nothing. This implementation has no file or hunk checkboxes; a future
subset UI must construct and validate a new plan rather than delete prepared operations.

### Open, dirty, and unopened files

| Target                                                     | Source of truth            | Apply/persist behavior                                                                                                                                           |
| ---------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active live buffer                                         | WDS buffer                 | Editor guarded transaction; never auto-save; dirty remains dirty, clean becomes dirty                                                                            |
| Other clean live buffer                                    | WDS buffer                 | Preview, then Editor guarded transaction; becomes dirty; no disk write                                                                                           |
| Other dirty live buffer synced in the originating LSP lane | WDS buffer                 | Require a lane-guard entry with identical text-snapshot identity (and matching non-null version); preview with warning; remains dirty                            |
| Dirty live buffer absent/stale in the originating LSP lane | none                       | Reject whole edit as unprovable, including a null-version edit; do not apply disk-based offsets to dirty text                                                    |
| Unopened regular text file                                 | FileSync guarded snapshot  | Require UTF-8 plus consistent LF/CRLF (optional BOM); use transient Editor buffer, serialize by its policy, persist conditionally, and open no live document/tab |
| Dirty resource rename source (one file)                    | live buffer plus disk base | Allow after preview; rename the disk base and remap the same dirty buffer/path/sync metadata                                                                     |
| Dirty delete or overwrite target                           | none                       | Block the whole edit; never discard unsaved bytes                                                                                                                |
| Directory or symlink resource operation                    | none                       | Reject as unsupported before preview; `recursive` does not expand this plan's regular-file scope                                                                 |

Clean open delete is allowed only after preview: close its tabs and remove the live document after
the server commit. Rename of a clean open file preserves its buffer/views and remaps path state.
Create does not auto-open. Create/rename overwrite of any open destination is blocked even when
clean; merging two live document identities is not a resource-option implementation.

### Overlap and version drift

- Any invalid/reversed/overlapping/ambiguous edit rejects the entire WorkspaceEdit before preview.
  Adjacent ranges are valid. Repeated text operations are applied sequentially in protocol order.
- Built-in TypeScript producers emit exact open versions and `null` for unopened files.
- The external proxy translates pooled backend versions back to the requesting browser connection's
  captured LSP versions. If the target was not owned by that connection, moved during the request,
  or cannot be mapped exactly, return Content Modified/failure for the whole producer response.
- Platform captures live `{documentId, buffer identity, localRevision, contentRevision, snapshot}`
  stamps and unopened `{path, version, mtimeMs}` stamps. It checks them after preview, after server
  prepare, and immediately before local commit.
- A null-version unopened operation is protocol-unversioned: Platform guarantees only that the
  exact guarded snapshot read after the response remains unchanged from preparation through commit.
  It does not claim the file was unchanged while the server computed the response. A stale
  versioned response, stale preview, post-read file change, replaced buffer, root switch, or lost
  provenance produces zero intended mutations. No offset rebasing or best-effort remainder is
  allowed.

### Resource operation semantics

Preserve `documentChanges` order exactly. The server preflight maintains a virtual filesystem so a
later operation observes earlier create/rename/delete effects.

- **Create**: create an empty file unless later text writes change it. Existing target fails;
  `ignoreIfExists` makes it an explicit no-op; `overwrite` wins and requires a reversible backup.
- **Rename**: source must exist at that point. Existing destination fails; ignore makes it a no-op;
  overwrite wins and backs up the destination before moving the source. Rename cycles use staging,
  never delete-first behavior, but staging cannot reinterpret sequential protocol semantics. For
  example, `A -> B` with overwrite followed by `B -> A` ends with initial A at A and B absent while
  initial B is only in the undo journal; a true swap requires the three explicit rename operations
  `A -> temp`, `B -> A`, and `temp -> B`.
- A rename whose canonical old/new URI is exactly identical is an explicit no-op after validating
  source existence. A case-only/differently-spelled alias is rejected by target resolution rather
  than guessed on a case-insensitive filesystem.
- **Delete**: missing target fails unless ignored. For a regular file, `recursive` is preserved for
  preview/protocol fidelity but has no additional effect. Any directory or symlink is unsupported.
  Deletion moves the exact file into journal staging so undo can restore it.
- A later text operation refers to the URI/path visible at that point. Edit-before-rename edits the
  source then moves it; rename-before-edit edits the destination. Edit-after-delete fails unless a
  create restored the path.
- For an open source, a text leg changes only the live buffer. A later resource rename moves the
  prior saved disk bytes while WDS remaps that edited dirty buffer; only explicit Save persists its
  new text. Only an unopened text target produces a server `write` leg.
- If a resource target and journal staging are on different devices and exact rename-based recovery
  cannot be guaranteed, reject the whole resource plan before commit. Do not silently fall back to
  copy/delete. Text-only writes may use the existing guarded sibling-temp write path and journaled
  byte after-images across devices; this exception does not authorize cross-device rename/delete.

### Cancellation

- Rename-name cancel/unchanged input sends no rename request.
- During target reads, validation, server prepare, or preview, cancellation aborts work and server
  staging and produces no mutation.
- A newer request, plugin/provider disposal, buffer replacement, or root generation change cancels
  the older pre-commit request.
- Once `commit` is sent, the operation reaches its point of no return. Disable Cancel and root-switch
  commands for that workspace until `commit -> local apply -> finalize` or compensation settles.
  An HTTP abort cannot be treated as cancellation; query idempotent transaction status.
- Cancellation after the point of no return returns the actual `applied`, `rolled-back`, or
  `recovery-required` outcome. Never abandon an in-flight coordinator.

### Partial failure and recovery boundary

The filesystem protocol is two-phase, write-ahead journaled, and idempotent. `operationId` names
one immutable prepared request. Every state-changing call after prepare also carries a fresh
`transitionId` and the caller's `expectedGeneration`; the server caches the result by transition
ID and rejects a reused ID with different input. This distinguishes a transport retry from a new
Undo after Redo. `status(operationId)` returns the durable generation and a process-wide
`serverEpoch` UUID so a browser can invalidate an ephemeral stack after server restart.

1. Client preparation reads exact targets and builds Editor prepared transactions/diffs.
2. After confirmation, `FileSyncService.prepareWorkspaceMutation` sends the ordered persistence
   operations plus expected versions, origin `workspace-edit`, and a UUID operation/write ID.
3. Server prepare acquires the canonical-workspace mutation lease, revalidates, builds a virtual
   operation graph, stages backups/after-images outside visible paths, writes and fsyncs a durable
   journal, and returns `prepared` without visible mutation.
4. Client revalidates live buffers again. Drift calls `abort` and applies nothing.
5. Under the same lease, server `commit` revalidates the entire expected set immediately before the
   first visible leg. For each leg it durably records and fsyncs the inverse intent before mutation,
   applies the leg, then durably marks it complete. Failure compensates completed or indeterminate
   intents in reverse order. It returns `rolled-back` only after exact restoration, or `partial`
   with exact unrecovered relative paths.
6. After a successful provisional disk commit, Platform commits all live Editor transactions and
   path projections inside one WDS publication batch. An unexpected local failure reverses already
   committed Editor receipts, reverses path projections, then calls the distinct server `rollback`
   transition. `rollback` is valid only for a committed-but-unfinalized direction; it is not
   pre-commit `abort` or user `undo`.
7. `finalize` durably advances the provisional direction and then publishes one semantic watcher
   group. Every event carries `origin: 'workspace-edit'` and `writeId: operationId`. Cache/WDS
   reconciliation happens directly before publication. After status proves finalize, Platform
   seals every provisional Editor receipt and only then exposes the undo group/applied result. If
   finalize journal persistence fails, the client rolls back; if only the HTTP response is lost, it
   queries status, resends the same transition ID only when status remains at its prior provisional
   generation, and follows the durable result. Event delivery is a no-throw queue/invalidation hint
   and cannot reverse finalized state.
8. Undo and redo use the same boundary: server `undo`/`redo` first reaches a provisional
   `undo-committed`/`redo-committed` state, Platform applies guarded live/path receipts, and
   `finalize` advances to `undone`/`redone`. Local failure invokes `rollback` to the prior stable
   state. No history pointer moves until finalize succeeds.
9. `commit`, `finalize`, `rollback`, `status`, `abort`, `undo`, `redo`, and `release` obey the
   operation/transition/generation idempotency contract. `operationId` is the only transaction
   identifier used by client, server, events, logs, and undo groups.

A fully compensated failure changes no visible state and creates no undo entry. A `partial` result
creates no undo/redo entry, marks affected live documents conflicted/recovery-required, invalidates
and re-reads exact file/tree/git queries, writes one wide structured event, and shows a persistent
recovery surface naming relative paths. Never claim success or auto-retry destructive legs.

For guarded text writes, “restored” means path existence/type, bytes, POSIX mode, recorded mtime,
and resulting Platform file version match the before-state; successful writes preserve the prior
mode while naturally receiving a new mtime/version. Inode, ctime, ACL, and extended-attribute
identity are not part of the current text-write API and must not be claimed in UI/logs. If product
requires those metadata to be crash-restored too, STOP and widen the filesystem contract first.

This is live-process transactional compensation with a durable recovery journal, not a claim of
crash-atomic mutation across arbitrary filesystems. On restart, `prepared` journals abort,
forward/undo/redo provisional journals replay idempotent inverse intents to their prior stable
state, `partial` journals remain for operator recovery, and finalized/undone journals are released
because no browser undo group survives the new `serverEpoch`. Recovery completes before accepting
another mutation. If product scope changes to require power-loss atomicity across mount points,
STOP — this design is not that guarantee.

### Cross-file undo/redo policy

- Native Editor undo owns only a text-only edit affecting exactly one already-live buffer with zero
  persistence or resource legs. It commits with `history: 'record'`.
- Every other edit — including one unopened-file write, multiple live buffers with no server leg,
  or any resource operation — commits live buffers with `external-barrier` and creates one Platform
  group. A multi-live-buffer-only group stores no server operation ID; its guarded Editor receipts
  are sealed after the WDS batch and still undo/redo as one Platform command. Native `Mod+Z` has no
  per-buffer leg to expose.
- Plan 062's CommandBus gains keyless `workspace.undoWorkspaceEdit` and
  `workspace.redoWorkspaceEdit` rows with `undoCategory: 'workspace-operation'`. A success toast may
  invoke the same command; do not add a second handler.
- Maintain one ephemeral LIFO stack per workspace, capped by
  `MAX_WORKSPACE_EDIT_UNDO_GROUPS = 20`. A group stores Editor receipts, optional server
  `{ operationId, serverEpoch }`, before/after document and file stamps, and projection receipts.
  It is never persisted and never crosses a root switch/reload.
- Undo/redo first verify every buffer revision/snapshot, every disk generation, current path graph,
  server epoch, and stack position. Drift in the top group refuses it before mutation and clears/
  releases that group and every older group whose affected path/document set intersects it; older
  disjoint groups remain, but LIFO exposes them only after invalidated entries are removed. An
  ordinary edit/save/resource mutation invalidates intersecting groups and their newer dependent
  groups immediately. No partial inverse is attempted.
- Undo/redo use the same server journal and WDS batch/compensation path. A new forward edit after
  undo — ordinary or WorkspaceEdit, on any path in that workspace — clears/releases the entire redo
  stack. On the twenty-first group, release the oldest before exposing the
  new group; a failed release is retained as cleanup-pending but is no longer undoable and is
  retried on status/root disposal. Every invalidation/eviction/disposal also calls Editor's guarded
  receipt release so history barriers do not retain hidden snapshots. Root switch/reload releases
  every reachable journal. Abrupt browser loss is bounded by the server lease; restart cleanup
  releases orphan stable journals, and the 24-hour stable journal TTL bounds a finalized orphan
  without restart.
- A recovery-required forward/undo/redo result has no usable history entry.

## Shared persistence wire contract

Add `packages/contracts/src/workspace-edit.ts`, export it from the package's existing entry point,
and test it. Inputs are readonly discriminated operations; Valibot route schemas mirror them without
hand-maintained alternate semantics:

```ts
type WorkspaceResourcePrecondition =
  | { readonly kind: 'missing' }
  | {
      readonly kind: 'snapshot'
      readonly mtimeMs: number
      readonly version: string
    }
  | {
      readonly afterOperation: number
      readonly kind: 'transaction'
    }

type WorkspacePersistenceOperation =
  | {
      readonly expected: Exclude<WorkspaceResourcePrecondition, { kind: 'missing' }>
      readonly index: number
      readonly kind: 'write'
      readonly path: string
      readonly text: string
    }
  | {
      readonly destination: WorkspaceResourcePrecondition
      readonly ignoreIfExists: boolean
      readonly index: number
      readonly kind: 'create'
      readonly overwrite: boolean
      readonly path: string
    }
  | {
      readonly destination: WorkspaceResourcePrecondition
      readonly ignoreIfExists: boolean
      readonly index: number
      readonly kind: 'rename'
      readonly newPath: string
      readonly oldPath: string
      readonly overwrite: boolean
      readonly source: Exclude<WorkspaceResourcePrecondition, { kind: 'missing' }>
    }
  | {
      readonly expected: WorkspaceResourcePrecondition
      readonly ignoreIfNotExists: boolean
      readonly index: number
      readonly kind: 'delete'
      readonly path: string
      readonly recursive: boolean
    }
```

`snapshot`/`missing` preconditions describe state observed before the transaction. A
`transaction` precondition must point to an earlier operation index and means “the exact virtual
generation produced by that operation”; this is what makes create -> write and rename -> edit
guardable without inventing an on-disk version that does not exist yet. Server contract validation
rejects forward references and a first touch without an external snapshot/missing precondition.
`index` is the original parsed WorkspaceEdit operation index, so omitted memory-only open-buffer
legs leave harmless gaps while persistence/resource ordering remains traceable to preview/logs.
`afterOperation` may reference only an earlier persistence/resource leg that produced that path,
never an omitted live-buffer edit.

Prepare carries `operationId`, `origin: 'workspace-edit'`, canonical workspace path, and ordered
operations. Transition bodies carry `operationId`, unique `transitionId`, and
`expectedGeneration`. Result states are `prepared | committed | finalized | aborted | rolled-back |
undo-committed | undone | redo-committed | redone | partial | released` and include
`serverEpoch`, generation, ordered affected/rolled-back/unrecovered relative paths, and resulting
entries/versions. Never put file contents or absolute paths in logs/errors.
Every status response, including a structured not-found/released result, carries `serverEpoch` so
the client can distinguish eviction from process restart without guessing.

## Implementation scope

The executor may adjust a path when plan 062/061 moved the same responsibility, but must preserve
the feature/kind layout and ownership above. Reconcile before creating a near-duplicate.

### Editor worktree

- Core transaction API:
  - `packages/editor/src/documentSession.ts`
  - `packages/editor/src/history.ts`
  - `packages/editor/src/pieceTable/lineEndings.ts` and `pieceTable/documentText.ts`
  - `packages/editor/src/editor/Editor.ts`
  - `packages/editor/src/editor/documentController.ts` if attachment cleanup belongs there
  - `packages/editor/src/tokens.ts` only if readonly fields need correction
  - `packages/editor/src/public/document.ts`
  - `packages/editor/src/index.ts`
  - `packages/editor/test/documentSession.test.ts`
  - `packages/editor/test/editor.test.ts`
  - `packages/editor/test/public-api.test.ts`
- LSP validation/capabilities:
  - `packages/lsp/src/capabilities.ts`
  - `packages/lsp/src/types.ts` and `packages/lsp/src/workspace.ts` for readonly version advancement
  - `packages/lsp/test/capabilities.test.ts`
  - `packages/lsp/test/workspace.test.ts`
  - do not add server-request plumbing while `workspace.applyEdit` remains unsupported
- LSP plugin model and routing:
  - replace `packages/lsp-plugin/src/workspaceEdit.ts`
  - add `packages/lsp-plugin/src/workspaceTextEdits.ts`
  - update `plugin.ts`, `codeActions.ts`, `documentSync.ts`, `lspConnectionPool.ts`,
    `renameWidget.ts`, `serverSet.ts`, `types.ts`, `pluginTypes.ts`, `index.ts`
  - remove WorkspaceEdit use of `formatting.ts`; keep formatter-specific behavior/tests
  - add the `./workspace-edit` export in `packages/lsp-plugin/package.json`
  - update `workspaceEdit.test.ts`, `plugin.test.ts`, `codeActions.test.ts`,
    `documentSync.test.ts`, `lspConnectionPool.test.ts`, `narrowFactoryPlumbing.test.ts`, and add
    `public-api.test.ts`
  - add `workspaceTextEdits.test.ts`

### Platform worktree

- Shared contract:
  - add `packages/contracts/src/workspace-edit.ts`
  - update the package entry `packages/contracts/src/index.ts`
  - add `packages/contracts/src/tests/workspace-edit.test.ts`
- Native/external LSP producer correctness:
  - add `apps/server/src/lsp/typescript/handlers/workspace-edit.ts`
  - update `handlers/initialize.ts`, `handlers/rename.ts`, `handlers/code-action.ts`,
    `shared/boundary.ts`, `shared/context.ts`, and `session.ts`
  - add `apps/server/src/lsp/typescript/tests/workspace-edit.test.ts`
  - tighten `apps/server/src/lsp/typescript/tests/session.test.ts`
  - update `apps/server/src/lsp/proxy-session.ts` and
    `apps/server/src/lsp/tests/proxy-session.test.ts`
- Filesystem transaction:
  - add `apps/server/src/fs/workspace-edit.ts`, `workspace-edit-journal.ts`, and a narrow injectable
    filesystem driver only if deterministic fail-leg tests require it
  - update `fs/contracts.ts`, `routes.ts`, `service.ts`, `errors.ts`, `read.ts`,
    `app-save-marker.ts`, `watch.ts`, `tree.ts`, `search.ts`, `workspace-index.ts`, and
    `apps/server/src/home.ts` only for the transaction contract, fatal text-read boundary,
    reserved-root exclusion, lease, and event barrier
  - tighten `fs/write.ts` so a supplied base version cannot recreate a missing file
  - preserve the existing regular file's POSIX mode through guarded temp replacement; transaction
    rollback also restores recorded mtime/mode
  - add `apps/server/src/fs/tests/workspace-edit.test.ts`; extend `contracts.test.ts` and
    `apps/server/src/tests/app.test.ts`
- Platform coordinator and document bridge:
  - add `apps/web/src/features/editor/state/workspace-edit-service.ts`
  - extend `state/file-sync-service.ts`, `state/workspace-document-service.ts`,
    `state/document-state.tsx`, and `state/commands.ts`
  - add `providers/workspace-edit-context.ts` and `providers/workspace-edit-provider.tsx`; mount
    them at the existing Editor provider boundary after reconciling plan 062
  - add pure URI/path/risk helpers under `features/editor/utils/`, not `lib/`, unless a second
    outside feature consumes them in the same change
  - add `components/workspace-edit-preview-dialog.tsx` and a separate recovery component only if
    the persistent recovery state needs distinct rendering
- Host/persistence wiring:
  - update `utils/language-server-plugin.ts`, `hooks/use-lsp-plugin.ts`,
    `state/language-server-connection-pool.ts`, and `tests/language-server-plugin.test.ts`
  - pass the invariant callback; Editor alone composes its conditional WorkspaceEdit capability
    without overwriting semantic-token/host capabilities
  - update `apps/web/src/lib/file-server.ts` with abortable prepare/commit/finalize/status/abort/
    rollback/undo/redo/release clients and transition generation fields
  - update exact file/tree/git query projections and `features/workspace/hooks/use-events.ts`
  - thread `workspaceEditJournalRoot`, injectable transaction filesystem driver, clock, and watch
    option through `FileSystemServiceOptions`, `AppOptions`, `apps/web/test/server.ts`, and its
    callers; failure selection is constructor-injected and never request-controlled
- Consolidation and commands:
  - register `workspace.undoWorkspaceEdit`/`workspace.redoWorkspaceEdit` through plan 062's one
    registry/bus
  - route search replace through `WorkspaceEditService`; delete its current per-file partial-success
    persistence loop and update its tests
  - do not put a store, subscription, or mutable transaction registry in `utils/`

## Milestone 0 — Reconcile dependencies and freeze contracts

1. Confirm plan 059 and plan 062 are complete. Confirm root `PLAN.md` explicitly schedules this
   plan. If not, STOP; do not build a temporary command/focus/undo path.
2. Re-run the drift and baselines above. Save the current source status separately from planning
   files. If plan 064's GO path landed, merge its `types.ts`/`plugin.ts`/`index.ts` and Platform
   `use-lsp-plugin.ts`/`language-server-plugin.ts` changes into the same option object rather than
   creating parallel plugin factories or callbacks.
3. Write the Editor public type signatures and Platform persistence types side by side before
   implementation. The Editor types contain protocol semantics; Platform contracts contain only
   already-resolved relative paths, text, versions, operation order, and transaction results.
4. Confirm the reserved journal contract below is wired exactly: production
   `platformHomePath('workspace-edit-journals')`, constructor-injected temp root in tests, strict
   permissions/exclusions, and real `stat.dev` rejection for resource legs. Do not choose a second
   location during implementation.
5. Confirm the final capability object does not advertise `workspace.applyEdit`, snippets, or
   `failureHandling: 'transactional'`.

Verification:

```bash
cd /Users/shaul/Desktop/D/platform
rg -n "workspace\.undoWorkspaceEdit|workspace\.redoWorkspaceEdit|CommandBus" \
  apps/web/src/keymap apps/web/src/features

cd /Users/shaul/Desktop/D/Editor
rg -n "workspaceEditPlan|workspaceEditForDocument|formattingEdits" \
  packages/lsp-plugin/src packages/lsp-plugin/test
```

Expected before edits: the first command proves the plan-062 registry is present but the two new
rows are absent; the second identifies the current flattened/local application path. Any second
production command registry or already-divergent WorkspaceEdit implementation is a STOP.

## Milestone 1 — Editor core: side-effect-free prepare and guarded commit

Implement the generic prepared transaction API in core first. Keep functions shallow: validation,
snapshot construction, commit guard, commit, and inverse guard are named steps; do not nest failure
handling inside mutation loops.

Exact tests in `packages/editor/test/documentSession.test.ts`:

- `prepares a readonly edit batch without changing text, revision, dirty state, history, selection, or subscribers`
- `commits a prepared batch as one transaction, one change event, and one undo step`
- `returns exact before and after revisions snapshots effective snapped edits and inverse receipt`
- `rejects a prepared commit after an intervening edit without mutation`
- `rejects a prepared commit after edit then undo even when text matches again`
- `discards a prepared transaction as cancellation with no effects`
- `rolls back a provisional receipt and restores preexisting undo and redo exactly`
- `refuses receipt rollback after later buffer drift`
- `stops ordinary undo at an external barrier after undoing later user text`
- `restores and reciprocates an external barrier for exact Platform undo and redo`
- `seals a finalized barrier and permanently discards the pre-group redo branch`
- `releases a drifted external barrier without exposing a grouped leg`
- `releases an older external barrier beneath a newer barrier without text or history leakage`
- `preserves distinct selections in two mounted views across external commit and rollback`
- `keeps invalid and overlapping preparation atomic`
- `accepts readonly edit fixtures without ownership copies`
- `classifies consistent LF CRLF and BOM as round-trip safe and mixed lone-CR unusual terminators as unsafe`
- `serializes a prepared snapshot with its original consistent line ending and BOM`

Extend `editor.test.ts` to prove two mounted views observe one external commit and rollback exactly
once, preserve distinct selections/scroll, and still avoid double-applying an ordinary source-view
edit. Extend `public-api.test.ts` to prove the types/functions are exported from both root and
`@singapor/core/document`.

Run before moving on:

```bash
cd /Users/shaul/Desktop/D/Editor/packages/editor
bun run test -- test/documentSession.test.ts test/editor.test.ts
bun run typecheck
bun run build
bun run test -- test/public-api.test.ts
```

STOP if preparation emits, changes revision/history/dirty state, materializes a large snapshot
without need, or cannot reject stale commit synchronously. Platform work must not begin without
this primitive.

## Milestone 2 — Editor LSP: lossless parse and strict target validation

Rewrite `workspaceEdit.ts`; do not layer a second parser beside it. Add the strict target preparer
and reuse core's prepared transaction API.

Exact parser tests in `packages/lsp-plugin/test/workspaceEdit.test.ts`:

- `preserves interleaved create edit rename delete operations and every option`
- `preserves annotations, edit annotation ids, and needsConfirmation`
- `preserves repeated text document operations and integer and null versions`
- `normalizes legacy changes in lexicographic URI order with null versions`
- `rejects a payload containing both executable shapes`
- `rejects malformed coordinates and missing annotation references atomically`
- `rejects snippet edits without returning the surrounding valid operations`
- `preserves an unsupported scheme for host policy`
- `returns an empty ordered plan for an absent edit and not for malformed input`

Exact strict-preparation tests in new `workspaceTextEdits.test.ts`:

- `converts UTF-16 positions from a piece-table snapshot without materializing full text`
- `rejects negative fractional missing-line and past-line positions`
- `rejects reversed ranges overlapping ranges and coincident inserts`
- `accepts unsorted adjacent edits against one snapshot`
- `checks a non-null LSP version before range preparation`
- `rejects an unmapped version instead of treating it as unversioned`
- `accepts repeated same-target versions N then N-plus-one and advances once per operation`
- `rejects repeated same-target versions N then N or N-plus-two atomically`
- `rejects a non-null post-rename URI without exact lane provenance`
- `preserves annotation ids in prepared edits`
- `preserves parser CRLF then reports normalized effective text and surrogate snapping`
- `applies repeated document operations sequentially while preserving operation order`

Use a `DocumentTextSnapshot` wrapper over a real piece-table snapshot whose
`materializeFullText()` throws for the non-materialization case; its range/chunk methods remain
usable. Do not weaken existing `formatting.test.ts`; it continues to characterize formatter
behavior only.

Add exact `packages/lsp/test/workspace.test.ts` coverage
`advances one didChange version by the supplied logical revision count and rejects a non-positive
count` and `adopts an identical snapshot from a second holder without another didChange`, plus
`packages/lsp-plugin/test/documentSync.test.ts` coverage
`publishes one atomic workspace edit change at the simulated final LSP version` and
`two mounted observers synchronize one shared buffer change once`.

Verification:

```bash
cd /Users/shaul/Desktop/D/Editor/packages/lsp
bun run test -- test/workspace.test.ts
bun run typecheck

cd /Users/shaul/Desktop/D/Editor/packages/lsp-plugin
bun run test -- test/workspaceEdit.test.ts test/workspaceTextEdits.test.ts \
  test/documentSync.test.ts
bun run typecheck
bun run build
bun run test -- test/public-api.test.ts
```

`public-api.test.ts` imports parser/replay types and functions from both `@singapor/lsp-plugin` and
`@singapor/lsp-plugin/workspace-edit`; it runs only after build so export-map assertions cannot read
stale `dist`.

STOP if Platform would need to inspect raw LSP ranges/options, if repeated operations are grouped
out of order, or if invalid input can yield a partial plan.

## Milestone 3 — Editor LSP: route rename and code actions through one host

Thread `onApplyWorkspaceEdit` through adapter/set/narrow options and resolve functions. Give code
actions an owning lane/provenance handle so version validation uses the exact server workspace that
produced the action. Do not pick the first currently ready lane after resolution. Fix the existing
rename prompt propagation defect in the same pass.

Rename flow:

1. capture active document and owning lane;
2. prepare/prompt; cancellation returns quietly;
3. request with cancellation;
4. recheck active identity;
5. parse and validate producer provenance;
6. await the one host callback;
7. report only a real failed result.

Code-action flow follows the same dispatch after optional resolve. Delete calls to
`workspaceEditForDocument`, `workspaceEditTouchesOtherDocuments`, and `formattingEdits` from both
flows. Because this client does not advertise `workspace.executeCommand`, reject an action that
contains a command — including edit plus command — before applying its edit. Do not execute only
the edit half.

Exact tests:

- `plugin.test.ts`
  - `dispatches a same-document rename to the host exactly once`
  - `dispatches a cross-file rename without applying the active-document half`
  - `propagates the host rename-name callback through resolved options`
  - `does not dispatch after prompt cancel request cancel or active-document drift`
  - `aborts and closes a pending rename prompt on a newer rename or disposal`
  - `reports malformed producer output without invoking the host`
  - `treats host cancellation as a non-error`
- `codeActions.test.ts`
  - `dispatches the complete preferred fix with its owning lane`
  - `does not call the local completion edit feature for a WorkspaceEdit`
  - `rejects edit plus unsupported command without invoking the host or applying text`
  - `cancels resolved-action application on document drift or disposal`
  - `reports one host failure and no partial local edits`
- `narrowFactoryPlumbing.test.ts`
  - `advertises WorkspaceEdit response capabilities only with a host callback`
  - `advertises documentChanges resources annotations line-ending normalization and failureHandling undo exactly`
  - `never advertises workspace applyEdit or snippet edit support`
  - `preserves semantic-token capability while adding workspace-edit capability`
- `lspConnectionPool.test.ts`
  - `reuses a key only when immutable initialize options and capabilities are deep-equal`
  - `rejects a later borrower whose pooled initialization contract differs`

Verification:

```bash
cd /Users/shaul/Desktop/D/Editor/packages/lsp
bun run test
bun run typecheck
bun run build

cd /Users/shaul/Desktop/D/Editor/packages/lsp-plugin
bun run test -- test/workspaceEdit.test.ts test/workspaceTextEdits.test.ts \
  test/plugin.test.ts test/codeActions.test.ts test/lspConnectionPool.test.ts \
  test/narrowFactoryPlumbing.test.ts
bun run typecheck
bun run build
```

## Milestone 4 — Freeze and build the Editor producer boundary

Before Platform imports the new API:

```bash
cd /Users/shaul/Desktop/D/Editor
bun run typecheck
bun run format:check
bunx --bun knip
bun run build

cd /Users/shaul/Desktop/D/Editor/packages/editor
bun run test

cd /Users/shaul/Desktop/D/Editor/packages/lsp
bun run test

cd /Users/shaul/Desktop/D/Editor/packages/lsp-plugin
bun run test
```

Record the resulting Editor SHA/diff in the Platform implementation handoff. Platform's local
`link:@singapor/*` must resolve these freshly built sibling packages. In CI, verify Platform against
the exact Editor head; if that requires a temporary `EDITOR_REF`, remove the pin after Editor lands
and rerun Platform CI against Editor `main`. Do not leave a branch-name compatibility pin in the
final Platform change.

STOP on any new Editor baseline failure, dead export, missing package export, or consumer that still
applies one slice of a WorkspaceEdit locally.

## Milestone 5 — Platform LSP producers: exact edits and version provenance

### Native TypeScript producer

Create one readonly helper used by rename and code action. It accumulates all legs first and returns
`null`/failure for the whole edit if any location/change is outside root, unreadable, malformed, or
unrepresentable. During initialize, parse and retain the client's
`workspace.workspaceEdit.documentChanges`, `resourceOperations`, and
`changeAnnotationSupport` support in `SessionContext`; session tests must initialize with the exact
capability object Platform advertises.

For a capable client, emit ordered `documentChanges`:

```ts
{
  textDocument: {
    uri,
    version: openDocumentVersionForFileName(ctx, fileName) ?? null,
  },
  edits,
}
```

Use first file occurrence order from TypeScript's readonly producer data. Resolve text and version
atomically from one canonical open-document record; do not run independent path-alias scans. Open
session text wins; unopened text comes from disk. Reject negative/out-of-bounds TypeScript spans
instead of clamping them. Honor `FileTextChanges.isNewFile` as exact create followed by its text
edit; if the client omitted create support, reject the whole fix. If `documentChanges` is false, a
text-only result may emit one complete legacy `changes` object, but any resource operation rejects
the result. Preserve `newText` bytes exactly.

The parsed request owns a mutable diagnostics array because the LSP `CodeAction.diagnostics`
contract requires one. Pass that same owned container through; remove `Array.from(diagnostics)` and
do not cast or copy a genuinely readonly array to satisfy the mutable protocol field.

Add `apps/server/src/lsp/typescript/tests/workspace-edit.test.ts` with exact equality assertions:

- `emits an exact exported-symbol rename for one dirty open and one unopened file`
  - fixture `src/value.ts` exports `value`; `src/use.ts` imports and references it;
  - open `value.ts` at a nonzero version with changed text, leave `use.ts` unopened;
  - assert ordered URIs, exact UTF-16 ranges/newText, open version, unopened `null`, and unchanged
    fixture files.
- `emits every leg of a multi-file TypeScript code fix`
  - drive a real session-level code action from an actual diagnostic and two real
    `FileTextChanges` targets;
  - assert exact operations/ranges/text and handler wiring, not substring containment.
- `emits create before edits for an isNewFile change`
- `rejects isNewFile when the client omitted create resource support`
- `emits complete legacy changes for an incapable text-only client`
- `initialization retains the exact workspace edit capability matrix`
- `rejects an entire rename when one location is outside root or unreadable`
- `omits an entire code action when one file change cannot be represented`
- `rejects the whole producer result for a negative or out-of-bounds TypeScript span`
- `resolves aliased native paths to one atomic open text and version record`
- `passes the owned mutable diagnostic container without copying`

Tighten `session.test.ts`'s broad rename case to exact `documentChanges`; keep other common request
assertions focused.

### External pooled proxy version translation

Extend each shared document with per-owner
`{ clientVersion, lastSyncEpoch, synchronizedBackendVersion, contentEpoch }`. Parse the client
version in `handleDidOpen`/`handleDidChange`, reject non-monotonic updates, and record which exact
owner content epoch supplied each pooled backend version. Ownership alone is insufficient: if
another owner last replaced backend text, a requester who merely still has the URI open has no
usable provenance.

At each pending rename/code-action/codeAction-resolve request, capture an immutable request-wide
snapshot of **all** shared-document backend and requesting-owner states; response targets are not
knowable in advance. On the matching response, traverse only WorkspaceEdits in that method's
result:

- `null` stays `null`;
- a backend version maps only when it equals the captured/current pooled backend version, the
  requesting owner's captured/current client version/content epoch match, and its
  `synchronizedBackendVersion` is that same backend version;
- a target absent from the capture, a changed/unknown/other-owner version, or divergent owner text
  before/during the request rejects the whole result with the existing `-32801 ContentModified`
  response and the original client request ID;
- duplicate `TextDocumentEdit`s for one URI with inconsistent non-null versions reject the result;
- legacy `changes` remain protocol-unversioned and get no invented numeric mapping;
- response/cancellation routing and request IDs remain unchanged.

Release the provenance snapshot on response, cancellation, connection disposal, and backend
failure. Preserve an existing server error unchanged; do not replace it with provenance failure.

Exact `apps/server/src/lsp/tests/proxy-session.test.ts` cases:

- `rewrites a rename WorkspaceEdit backend version to the originating browser version`
- `rewrites code-action edits and preserves unopened null versions`
- `rejects a versioned target not owned by the requesting connection`
- `rejects a response after backend or browser document drift`
- `rejects two owners with divergent text before the request`
- `rejects other-owner replacement after the request even when requester still owns the URI`
- `maps skipped and nonzero browser versions without equating them to backend counters`
- `maps codeAction resolve and every WorkspaceEdit in a multi-action response`
- `preserves legacy changes as unversioned and rejects inconsistent duplicate document versions`
- `preserves an existing server error and clears provenance on every terminal path`
- `does not rewrite unrelated numeric fields`
- `keeps cancellation routed to the original backend request`
- `rejects backend workspace/applyEdit with -32601 and its backend request ID without forwarding a
request ID or invoking a browser host callback`

Verification:

```bash
cd /Users/shaul/Desktop/D/platform/apps/server
bun --bun vitest run src/lsp/typescript/tests/workspace-edit.test.ts \
  src/lsp/typescript/tests/session.test.ts src/lsp/tests/proxy-session.test.ts
bun run typecheck
```

STOP if exact browser-version provenance cannot be reconstructed. Do not replace a non-null version
with `null`, compare it with WDS revision, or trust the pooled backend counter.

## Milestone 6 — Platform filesystem: reversible ordered transaction

### Contract and routes

Implement and test the shared contract first. Add grouped routes under `/fs/workspace-edit`:

- `POST /prepare`
- `POST /commit`
- `POST /finalize`
- `GET /status?operationId=...`
- `POST /abort`
- `POST /rollback`
- `POST /undo`
- `POST /redo`
- `POST /release`

`prepare` is keyed by immutable `operationId` plus a canonical body digest. Every later mutation
uses `{ operationId, transitionId, expectedGeneration }`; `status` uses `operationId`. A repeated
transition ID returns the cached result, while a new transition advances exactly one valid state.
`prepare` with a reused operation ID returns the same request/result or rejects a body mismatch; it
never creates a second journal.
Keep route schemas in `fs/contracts.ts` and semantic shared models in the contracts package. Do not
create a second hand-maintained client response type in `file-server.ts`.

The only valid durable transitions are:

```text
prepared -> committed -> finalized
prepared -> aborted
committed -> rolled-back
finalized | redone -> undo-committed -> undone
undo-committed -> finalized | redone        (rollback)
undone -> redo-committed -> redone
redo-committed -> undone                    (rollback)
finalized | undone | redone | rolled-back | aborted -> released
any compensating transition -> partial      (only when its inverse cannot complete)
```

`finalize` knows the pending direction and cannot skip a provisional state. `undo`/`redo` are valid
only from the shown stable state. Status never advances state. An invalid expected generation/state
returns stale without mutation.

Add structured catalog entries in `fs/errors.ts`: `WORKSPACE_EDIT_INVALID`,
`WORKSPACE_EDIT_STALE`, `WORKSPACE_EDIT_BUSY`, `WORKSPACE_EDIT_NOT_FOUND`,
`WORKSPACE_EDIT_DEVICE_UNSUPPORTED`, `WORKSPACE_EDIT_QUOTA`, and `WORKSPACE_EDIT_PARTIAL`.
Production code uses the existing `FsError`/structured observability path; never `new Error`.

Tighten the existing `/fs/read` boundary in `fs/read.ts`; do not add a WorkspaceEdit-only second
read route. Read bytes after the size guard, decode with `new TextDecoder('utf-8', { fatal: true })`,
and reject malformed UTF-8 or a NUL byte with a new structured `INVALID_TEXT_FILE` (`415`) code.
Compute the returned text version from the successfully decoded string while preserving the real
byte `size` and `mtimeMs`. This gives every editor/file consumer one honest text contract and lets
the already-abortable `readFileContent(path, signal)` remain the FileSync transport. Extend the
client error taxonomy for the new code; do not silently replace malformed input or infer text from
an extension.

### Journal implementation

`workspace-edit.ts` owns the state machine and one wide operation event. `workspace-edit-journal.ts`
owns durable metadata/staging/reverse entries. A narrow injected filesystem driver is allowed for
deterministic leg/rollback failure tests; production uses real `node:fs/promises`. Do not mock the
service/module.

The one reserved production root is `platformHomePath('workspace-edit-journals')`, supplied to
`FileSystemService` as an internal `workspaceEditJournalRoot` option so every test injects a temp
directory and never touches developer state. Create the root/operation directories with mode
`0700` and manifest/stage files with `0600`; reject symlinks at every journal path. Exclude this
root from `readTree`, workspace indexing, search, and `FileChangeHub`, even when the filesystem
workspace contains `~/.platform`. Reject a WorkspaceEdit whose target is the reserved root or a
descendant. Startup recovery removes terminal/released staging and never logs staged bytes.
Install the exclusion and complete journal recovery before starting workspace index/watch or
serving mutation routes, so recovery legs cannot escape as user file events.

Internal retention constants are not user knobs:
`MAX_WORKSPACE_EDIT_OPERATION_BYTES = 128 * 1024 * 1024`,
`MAX_WORKSPACE_EDIT_JOURNAL_BYTES = 512 * 1024 * 1024`, and
`WORKSPACE_EDIT_STABLE_TTL_MS = 24 * 60 * 60 * 1000`. Prepare reaps expired finalized/undone
journals, counts staged bytes before allocation, and rejects over quota without mutation. Undo/redo
refreshes a stable journal's last-touched time. `partial` recovery data is never TTL-deleted; it
blocks new allocation at quota until explicitly recovered/released. Thus abrupt browser loss is
bounded without making a correctness claim from a timer; an expired client group discovers
`released`/epoch drift and invalidates itself.

Before supporting any rename/delete/overwrite resource leg, compare the journal root's real
`stat.dev` with the source and destination's nearest existing parent/device. A mismatch returns
`WORKSPACE_EDIT_DEVICE_UNSUPPORTED` before staging. Text-only writes retain their byte backups in
the journal but commit through `writeTextFile`'s guarded sibling-temp replacement, so they do not
require journal/target device equality.

Add one canonical-workspace mutation lease in `FileSystemService`. Prepare acquires it after
confirmation; every existing write/create/create-folder/copy/rename/delete endpoint and every
transaction commit/rollback/undo/redo must enter the same lease for each affected path. Canonical
workspace scopes that overlap by ancestor/descendant conflict; disjoint workspaces may proceed.
`WORKSPACE_EDIT_LEASE_MS = 60_000`: an idle prepared lease expires through abort, an idle
committed-provisional lease expires through rollback, and an inverse failure becomes `partial`.
The lease timer never interrupts a running transition. Platform mirrors this with one workspace
mutation gate used by Save, Save All, tree resource commands, root switching, and WorkspaceEdit;
the server lease remains authoritative for external/interleaved calls.

Prepare must:

1. validate all relative paths through `WorkspacePaths`, including real parent containment;
2. stat every expected resource and compare version/mtime/existence;
3. model ordered option/no-op behavior and collision cycles;
4. verify regular-file source/destination types, symlink policy, reserved-path exclusion, and
   resource device;
5. reserve/stage unique after-images and reverse backups without changing visible paths;
6. persist journal state before returning `prepared`.

Commit takes the shared mutation lease and revalidates the whole target set before leg zero. It
walks the prepared operation list in order. Before each visible mutation, append/fsync an inverse
intent containing exact before/after guards; after mutation append/fsync its completion marker.
Crash recovery treats an intent without a completion marker as indeterminate, checks the guards,
and idempotently restores the before-state. Failure walks inverse intents in reverse order. Rename
overwrite stages the destination before source movement; it never calls the current delete-first
helper.

Journal state replacement uses same-directory temp write -> file fsync -> rename -> directory
fsync; append records fsync before its associated visible mutation. If a supported production
filesystem cannot provide the required durable primitives, resource transactions on it are a STOP,
not a reason to weaken the journal silently.

`FileChangeHub` supplies a transaction barrier keyed by operation ID and exact canonical affected
paths. It queues matching native events during forward/rollback/undo/redo while unrelated external
events pass immediately. Rollback drops restored duplicates, partial recovery publishes exact
unrecovered invalidations, and finalize drops matching duplicates then emits one ordered semantic
group. Finalize also installs per-path expected result signatures in the existing app-save marker:
a late native event is an own hint only when a fresh stat matches that exact version/existence and
write ID; a mismatched event is external and passes. Marker cleanup follows consumption, a
mismatched generation, release, or root disposal, never a correctness timeout. Watcher timing is
never success proof.

Tighten `write.ts`: if `baseVersion` was provided and the target disappeared, return stale/conflict
instead of recreating it. Add a focused route test because save and unopened WorkspaceEdit both rely
on this invariant.

Exact contract tests in `packages/contracts/src/tests/workspace-edit.test.ts` and
`apps/server/src/fs/tests/contracts.test.ts`:

- accept every ordered readonly operation and every result state;
- reject invalid option/path/version/existence combinations and unknown fields/kinds;
- prove overwrite precedence and preserve delete `recursive` while resource type policy remains
  regular-file-only;
- prove response paths are relative and no result contains content/absolute staging paths.

Exact server tests in `apps/server/src/fs/tests/workspace-edit.test.ts`, using a real temp workspace:

- `prepare has no visible filesystem or watcher effect`
- `reserved journal paths never appear in tree search index or watch`
- `abort removes staging and is idempotent`
- `commits and finalizes two guarded writes in order`
- `rejects last-target drift after prepare at whole-set commit revalidation before mutation`
- `reverses the first write when the second commit leg fails`
- `preserves mode on commit and restores bytes mode mtime and version on text rollback`
- `restores an overwrite destination when source rename fails`
- `reports exact unrecovered relative paths when compensation fails`
- `commits create then write in protocol order`
- `commits rename then edit at the new path`
- `commits edit then rename using the edited source`
- `supports ignored create rename and delete as explicit no-ops`
- `treats identical rename as no-op and rejects a case or URI alias`
- `moves a regular-file delete into the journal and restores it on undo`
- `rejects directory operations symlinks reserved paths outside-root and cross-device resources`
- `executes A-to-B overwrite then B-to-A with exact sequential final graph and reversible backup`
- `executes an explicit A-to-temp B-to-A temp-to-B swap without inventing cycle semantics`
- `commit finalize rollback status abort undo redo and release honor transition generations`
- `a new undo after redo is not mistaken for a retried undo`
- `undo and redo reject after-version drift before mutation`
- `queues matching native commit events until one ordered finalize group`
- `drops restored watcher events on rollback and publishes exact paths on partial recovery`
- `barriers watcher events through provisional undo and redo while unrelated events pass`
- `a missing file with an expected base version conflicts instead of being recreated`
- `recovers a crash between visible mutation and completion-marker fsync from inverse intent`
- `startup aborts prepared rolls back each provisional direction preserves partial and releases orphan stable journals`
- `startup recovery completes before watch and emits no user transaction event`
- `serializes a transaction against legacy write and tree rename in the same workspace`
- `serializes two overlapping transaction commits and allows disjoint workspace commits`
- `expires an abandoned prepared lease without interrupting a running transition`
- `rejects one-operation and aggregate journal quota before allocation`
- `reaps expired stable journals but retains partial recovery data`

Extend `apps/server/src/tests/app.test.ts` with exact `/fs/read` cases:

- `returns byte size mtime decoded content and content version for valid UTF-8`
- `rejects malformed UTF-8 with INVALID_TEXT_FILE instead of replacement characters`
- `rejects a NUL-bearing file with INVALID_TEXT_FILE`
- retain the existing `FILE_TOO_LARGE` assertion and prove the size guard wins before decoding

Use fail-leg injection for “operation N” and “rollback N”; do not mock `FileSystemService`, client,
routes, or Node modules. Extend `apps/server/src/tests/app.test.ts` with one route-shape success and
one structured partial response through the real Elysia app.

Verification:

```bash
cd /Users/shaul/Desktop/D/platform/packages/contracts
vitest run src/tests/workspace-edit.test.ts
bun run typecheck

cd /Users/shaul/Desktop/D/platform/apps/server
bun --bun vitest run src/fs/tests/workspace-edit.test.ts src/fs/tests/contracts.test.ts \
  src/tests/app.test.ts
bun run typecheck
```

STOP if prepare changes a visible path, if overwrite cannot restore its destination, if events leak
before finalize, or if compensation failure can be flattened into an ordinary RPC exception with no
recovery payload.

## Milestone 7 — Platform documents and FileSync: one coordinator

### WorkspaceDocumentService batch boundary

Add WDS operations that prepare live target stamps and commit/rollback an ordered set of Editor
receipts inside one store publication. Do not add another live-document map.

- A target stamp includes document ID/path, buffer identity, core revision/snapshot,
  `localRevision`, `contentRevision`, sync kind/version/mtime, and dirty state.
- Make text-change acceptance idempotent by core revision. Multiple mounted views and the
  coordinator may observe the same buffer change, but WDS increments its dirty/content revision
  once.
- Defer Zustand publication while a workspace batch is committing/rolling back. Publish one final
  state or the exact restored state; React must not observe a half-applied buffer group.
- Batch rename is collision-aware and preserves the same buffer/view objects, dirty state, sync
  metadata, scroll state, and exact-path UI references. Do not copy readonly collections to call a
  mutable helper; correct helper contracts.
- Prepare clean open delete/path changes as projection receipts before server commit. Commit the
  already-prepared projection synchronously; rollback uses the receipt.
- Remove any obsolete manual record path made redundant in the same pass. Do not keep both a new
  service subscription and the old component/store write as parallel truth.

Exact WDS/store tests:

- `records one dirty revision for one buffer transaction observed by two views`
- `commits two prepared buffers with one published state`
- `rolls back the first live buffer when the second guarded commit is stale`
- `preserves a dirty buffer and views across exact-file rename`
- `edits then renames an open dirty buffer while destination disk keeps prior saved bytes`
- `rejects a rename collision before changing either document`
- `prepares and commits a clean open delete then restores it from a receipt`
- `rejects directory and symlink path effects without changing documents`
- `does not put a grouped workspace edit on either buffer undo stack`

### FileSyncService transaction port

Extend `FileSyncService`; do not let `WorkspaceEditService` call `file-server.ts` directly.
`readWorkspaceSnapshot(path, signal)` is the only unopened-text read boundary: it is abortable,
delegates to the tightened `/fs/read`/`readFileContent(path, signal)` boundary, maps `size` to
`byteLength`, preserves fatal UTF-8/NUL/byte-ceiling rejection, and returns readonly
`{ path, text, byteLength, version, mtimeMs }` without registering a live document. Cancellation
must abort the fetch and discard a late response; it need not claim that an already-issued OS read
was physically interrupted.
`WorkspaceEditService` calls Editor's `documentTextRoundTripStatus`, rejects an unsafe mixed/lone/
unusual terminator target, creates a transient Editor buffer from safe text, and persists only
`pieceTableDocumentText(snapshotAfter)`; it never adds the buffer to WDS. Its workspace
mutation methods wrap prepare/commit/finalize/status/abort/rollback/undo/redo/release with fresh
transition IDs/generations, query status after response loss, reconcile returned file versions, and
classify own events by operation/write ID. Keep ordinary `save(document)` behavior and tests; it
remains one-file user save and enters the same workspace mutation gate.

Exact `file-sync-service.test.ts` additions:

- `prepares an ordered workspace mutation with exact expected versions`
- `reads an abortable unopened text snapshot with exact size text version and mtime`
- `rejects oversized binary malformed-UTF8 and cancelled unopened reads without a live document`
- `rejects Editor-unsafe mixed lone-CR and unusual-terminator snapshots before transient mutation`
- `round-trips unopened LF CRLF and BOM policy through pieceTableDocumentText`
- `aborts a prepared mutation on live revalidation failure`
- `recovers a lost commit response through status without retrying the mutation`
- `rolls back committed provisional state after local failure`
- `uses new transition IDs and expected generations across undo redo and retry`
- `publishes cache versions only after finalize`
- `does not publish cache or mark documents saved after rollback`
- `returns exact partial recovery paths without creating history`
- `treats matching own watcher events as idempotent invalidation hints`

### WorkspaceEditService state machine

Implement a non-React service with explicit states:

```text
idle
  -> preparing
  -> awaiting-confirmation
  -> committing
  -> finalizing
  -> applied
  -> undoing / redoing -> finalizing
  -> rolling-back
  -> cancelled | stale | failed | recovery-required
```

Only one mutation per workspace may be past confirmation. A newer request supersedes only a
pre-commit request; a committing request returns busy to newer work. Service construction receives
WDS/store/domain actions, `FileSyncService`, QueryClient, root/generation source, Editor transaction
functions, and structured logging. No global mutable singleton and no React effect transaction.

Preparation algorithm:

1. resolve all URI/resource paths and policy blockers;
2. snapshot every live/unopened target and originating LSP version guard;
3. replay operations in a transient path/buffer graph, asking Editor to prepare each text step;
4. compute final per-buffer transactions and persistence operations;
5. compute preview rows/diffs/annotations/risk and undo category;
6. return immediate safe application or publish `awaiting-confirmation`.

Commit algorithm follows the rollback sequence specified earlier. Use guard clauses and extracted
helpers; no mutation branch may nest beyond three levels.

Exact `workspace-edit-service.test.ts` unit/service cases with injected deterministic ports:

- `applies one active-buffer edit as one Editor undo transaction without preview`
- `previews active dirty another open and unopened targets from their correct sources`
- `accepts a null-version dirty target only with an identical current lane snapshot`
- `rejects a null-version dirty target absent or stale in the owning lane`
- `keeps a dirty secondary dirty and never writes its disk snapshot`
- `persists an unopened target without creating a live document or tab`
- `rejects unsupported scheme authority outside-root synthetic symlink alias and non-text targets before preview`
- `rejects overlap ambiguous insert and invalid annotation before preview`
- `rejects mapped LSP version drift before target reads`
- `rejects live drift after preview with zero server mutation`
- `rejects unopened file drift after preview with zero mutation`
- `cancels during reads prepare and preview with zero mutation`
- `disables cancellation and resolves status after commit starts`
- `blocks save tree mutation and root switch while the workspace mutation gate is held`
- `executes create edit rename delete in exact operation order`
- `allows dirty source rename and preserves unsaved text`
- `keeps old saved bytes on disk when an open dirty edit is followed by rename`
- `blocks dirty delete overwrite and open destination overwrite`
- `rolls back live receipts after server/local failure`
- `enters recovery-required with exact paths after compensation failure`
- `creates one Platform group and no per-buffer history for cross-file work`
- `creates a Platform group for one unopened write and no server journal for live-only multi-buffer work`
- `undoes and redoes the group atomically`
- `refuses group undo on live disk or path drift before mutation`
- `invalidates intersecting dependent groups but retains older disjoint groups`
- `clears every redo group after any new forward workspace mutation`
- `clears groups on server epoch change root disposal and reload`
- `evicts and releases the oldest group when the twentieth-entry cap is exceeded`

Verification:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web
bun --bun vitest run --project node \
  src/features/editor/tests/document-state.test.ts \
  src/features/editor/tests/file-sync-service.test.ts \
  src/features/editor/tests/workspace-edit-service.test.ts
bun run typecheck
```

STOP if a disk leg bypasses `FileSyncService`, a hidden WDS document is created for an unopened
file, open text is auto-saved, or a partial result can publish an applied state/history entry.

## Milestone 8 — Platform preview, recovery UI, and LSP host wiring

Create a narrow provider/context around the service and render the preview/recovery state from it.
The provider owns service lifecycle and subscriptions only. It must not reimplement preparation in
effects or prop-drill the callback through `Editor`/workbench layers.

Preview requirements:

- ordered path/operation list and text diffs;
- labels for dirty, open, unopened, create, rename, delete, ignored/no-op, and confirmation
  annotations;
- explicit copy: open buffers will remain unsaved; unopened files/resource operations will be
  written; group undo/redo is separate from ordinary Editor undo;
- `LoadingState` for an unready preview region, `Spinner` only in the Apply control, and a quiet
  `RingLoader` for commit/recovery status; no hand-rolled loader;
- `@workspace/ui` Dialog/Button primitives, theme tokens, no raw palette colors or ad-hoc surface
  opacity/backdrop blur;
- every updating file/operation count uses `tabular-nums`;
- Cancel while awaiting confirmation, disabled close/cancel after point of no return, focus restored
  through plan 062's FocusService.

Recovery UI is persistent until exact paths have been re-read and the user dismisses it. It never
offers Undo for a partial result.

`use-lsp-plugin.ts` reads one stable host callback from context. Every normal pooled borrower passes
that callback into `createLanguageServerSetPlugin`, regardless of whether the current view is
writable, synthetic, or ordinary; Editor consequently composes the same byte-identical capability
block and Platform policy rejects an unsupported target if the server returns it. Only diff
sessions omit the callback/capability because their `diff:<sessionId>` connection key is isolated.
Editor's `LspConnectionPool` asserts that later borrowers supply initialization options deep-equal
to the first rather than silently accepting order-dependent mismatches; Platform's wrapper test
proves both acquisition orders satisfy it. Preserve semantic-token declarations through Editor's
existing deep capability merge.

Exact DOM tests in `workspace-edit-preview-dialog.test.tsx`:

- `shows ordered diffs and dirty open unopened and resource labels`
- `groups and confirms needsConfirmation annotations`
- `offers only all-or-nothing confirmation with no file or hunk selectors`
- `cancel restores focus and settles the producer as cancelled`
- `apply uses Spinner and disables cancel after commit begins`
- `a stale preview disables apply and explains rerun`
- `partial recovery lists exact relative paths and no undo action`
- `uses distinct loading and empty verdict states`

Exact host tests in `language-server-plugin.test.ts`:

- `forwards one parsed WorkspaceEdit settlement to the Platform host`
- `keeps one stable host callback across pooled view reconstruction`
- `normal pool capabilities are identical when read-only or ordinary target acquires first`
- `rejects mismatched immutable initialization options on a later normal-pool borrower`
- `omits edit capability only on the separately keyed diff pool`
- `merges workspace edit and semantic token capabilities`
- `does not advertise workspace applyEdit`

Verification:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web
bun --bun vitest run --project node \
  src/features/editor/tests/language-server-plugin.test.ts \
  src/features/editor/tests/workspace-edit-service.test.ts
bun --bun vitest run --project dom \
  src/features/editor/tests/workspace-edit-preview-dialog.test.tsx
bun run typecheck
```

## Milestone 9 — Resource projections, watcher idempotence, commands, and duplicate policy removal

### Projection and watcher reconciliation

After finalize, apply returned entries directly to exact file snapshots/tree parents/git
invalidations, then let watcher events invalidate. Extend existing WDS/editor domain actions for
ordered clean delete/rename path effects. Do not manipulate query cache as document text truth.

Own transaction events use `origin: 'workspace-edit'` and `writeId: operationId`; native duplicate
events may cause refetch but may not create conflicts, replace dirty buffers, or retry persistence.
No fixed delay is allowed. Add `use-events.test.ts` cases:

- `treats finalized workspace transaction events as idempotent invalidation hints`
- `does not conflict or replace a dirty buffer on its own transaction replay`
- `reconciles a later genuine external event by version rather than timing`
- `handles ordered create rename delete events with one write id`

### Explicit undo/redo commands

Register the two keyless commands in plan 062's sole table/handler system. Enablement comes from the
active workspace's group stack and busy state. The CommandBus ticket owns async settlement and one
wide event. Do not add a window listener, second registry, or detached promise. Tests cover disabled,
busy, successful, drift-refused, partial-recovery, and root-scoped behavior.

### Search replace consolidation

Refactor `features/search/utils/replace-runner.ts` and `hooks/use-replace.ts` to submit an Editor-
validated workspace change request to the same coordinator. Search results may produce offset edits,
but they still use the guarded core transaction API and Platform target/persistence policy. Delete
the current loop that writes unopened files one by one and counts earlier writes as success after a
later failure.

Update `search-replace-runner.test.ts`:

- retain exact live-buffer and guarded unopened text assertions through the service request;
- replace the partial-success expectation with `rolls back every file when one target fails`;
- add `preview cancel changes no open or unopened target`;
- add `group undo restores all replaced targets`.

If product intentionally requires search replace to retain partial-success semantics, STOP and ask
the operator. Do not leave two same-sounding cross-file applicators with contradictory rollback.

Verification:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web
bun --bun vitest run --project node \
  src/features/editor/tests/state.test.ts \
  src/features/editor/tests/workspace-edit-service.test.ts \
  src/features/search/tests/search-replace-runner.test.ts \
  src/features/workspace/tests/use-events.test.ts
bun run typecheck
```

## Milestone 10 — Real Platform integration tests

Add `apps/web/test/integration/workspace-edit.test.ts`. Import `{ test, expect }` from
`apps/web/test/fixtures.ts`; use its real in-process Elysia server and isolated temp filesystem. Do
not mock server/client/WDS modules and do not open a socket.

First extend `apps/web/test/server.ts`/fixture options to pass a temp
`workspaceEditJournalRoot`, `watch: true`, and the constructor-injected transaction filesystem
driver/clock through `AppOptions` and `FileSystemServiceOptions`. Production defaults remain real
filesystem/clock. Fault selection lives only on the injected driver; no route accepts a fail-leg or
test flag. Wait on semantic events/status, never sleeps.

Exact integration scenarios:

1. `applies one group across a dirty active buffer an open secondary and an unopened file`
   - build real files in the fixture workspace;
   - ensure two WDS documents, dirty one, leave the third unopened;
   - assert preview sources, no open-disk writes, guarded unopened persistence, dirty outcomes,
     one group, and no hidden third document.
2. `rejects live and unopened drift after preview with zero net mutation`
   - edit the live target and perform a real guarded external file write before confirm;
   - assert neither remaining target changes and no journal survives.
3. `commits and reconciles create edit rename delete options in order`
   - assert real filesystem contents/existence, WDS/tab path mapping, exact file query snapshots,
     tree parents, and watcher replay idempotence.
   - use only regular files; assert a directory or symlink resource operation is rejected intact.
4. `compensates a later persistence failure and restores live state`
   - use the service's test fail-leg driver through the real route;
   - assert bytes, paths, buffers, dirty flags, queries, and history are exactly before-state.
5. `surfaces exact recovery state when compensation fails`
   - assert unrecovered paths, no applied/undo state, and direct invalidation/re-read.
6. `undoes and redoes an applied group only while every after stamp matches`
   - assert success once; then introduce disk/live drift and assert a second inverse refuses before
     mutation.
7. `cancels on root generation change before commit and blocks root switch during commit`
8. `rejects unsupported scheme authority outside-root symlink and dirty destructive resource`
9. `preserves old disk bytes for open edit then rename until explicit save`
10. `serializes save and tree mutations behind the shared transaction lease`
11. `invalidates history on server restart and releases it on root disposal and cap eviction`

Also extend focused server app integration for route auth/schema and WDS/store tests for projections.
Run:

```bash
cd /Users/shaul/Desktop/D/platform/apps/server
bun --bun vitest run src/fs/tests/workspace-edit.test.ts \
  src/lsp/typescript/tests/workspace-edit.test.ts src/lsp/tests/proxy-session.test.ts \
  src/tests/app.test.ts

cd /Users/shaul/Desktop/D/platform/apps/web
bun --bun vitest run --project node \
  test/integration/workspace-edit.test.ts \
  src/features/editor/tests/workspace-edit-service.test.ts \
  src/features/editor/tests/document-state.test.ts \
  src/features/editor/tests/file-sync-service.test.ts \
  src/features/editor/tests/language-server-plugin.test.ts \
  src/features/search/tests/search-replace-runner.test.ts \
  src/features/workspace/tests/use-events.test.ts
bun --bun vitest run --project dom \
  src/features/editor/tests/workspace-edit-preview-dialog.test.tsx
```

## Milestone 11 — Running-app smoke matrix

Reuse the running dev server. Use a disposable workspace on one supported filesystem; do not test by
editing Platform/Editor source files.

1. **Same-buffer rename**: rename a local symbol in one dirty file. No preview, one text change,
   native Undo/Redo once, file still dirty, no disk write.
2. **Cross-file rename**: exported symbol referenced by a dirty active tab, clean open tab, and
   unopened file. Preview shows all three and correct statuses. Apply keeps both open buffers
   unsaved, writes only unopened text, opens no third tab, and offers one workspace Undo/Redo.
3. **Dirty cancellation**: with a dirty secondary target, Cancel. Text, dirty flags, files, tabs,
   tree, history, and query cache are byte/state identical.
4. **Preview drift**: leave preview open, type in an open target and externally change an unopened
   target. Apply becomes stale/refuses with zero transaction mutation; rerunning rename produces a
   new accurate preview.
5. **Resource order**: exercise create -> edit -> rename -> delete, plus ignored and overwrite
   options and an explicit A -> temp, B -> A, temp -> B swap. Confirm sequential visible/final
   semantics. Undo/Redo restores/moves exact regular files.
6. **Dirty resource rules**: rename one dirty source and verify unsaved text/path/save metadata
   survive and destination disk keeps its prior saved bytes until Save. Attempt dirty delete, dirty
   overwrite, open destination overwrite, directory operation, and symlink operation; each is
   blocked before commit.
7. **Unsupported inputs**: fixture responses with `untitled:`, remote `file://host`, outside-root,
   symlink escape, overlap, and coincident inserts. Each produces one actionable rejection, no
   preview for structurally invalid input, and zero mutation.
8. **Failure recovery**: run the in-process fault scenario for failure after the first write; all
   state restores. Run rollback failure; persistent recovery lists exact paths and no Undo.
9. **Cancellation boundary**: cancel while loading/previewing and observe zero effects. After Apply,
   Cancel/root switch is unavailable until actual commit/rollback status settles.
10. **Root scope**: switch/reload after a successful group. Runtime group history does not cross the
    root or survive reload; server journal is released. Restart the test server and verify the epoch
    invalidates the browser stack; create twenty-one groups and verify the oldest was released.
11. **Ordinary undo isolation**: after a multi-file edit, focus one target and press normal Undo. It
    must not undo one leg; use the workspace Undo command to reverse the group.
12. **Undo classification**: one unopened write offers Platform Undo; a multi-live-buffer-only edit
    has no server journal yet still undoes through one Platform command.

Record pass/fail and any relevant structured log event. Logs must have one wide event per operation
with operation ID, source, counts, dirty/open/unopened counts, phase durations, outcome, rollback
outcome, and relative recovery paths; never content.

## Milestone 12 — Final gates, documentation, and index maintenance

### Structural deletion checks

```bash
cd /Users/shaul/Desktop/D/Editor
rg -n "workspaceEditForDocument|workspaceEditTouchesOtherDocuments" packages/lsp-plugin/src
rg -n "formattingEdits" packages/lsp-plugin/src/plugin.ts packages/lsp-plugin/src/codeActions.ts
rg -n "workspace.*applyEdit|applyEdit.*workspace" packages/lsp/src packages/lsp-plugin/src

cd /Users/shaul/Desktop/D/platform
rg -n "Array\.from\(diagnostics\)" apps/server/src/lsp
rg -n "workspace\.applyEdit" apps/web/src apps/server/src /Users/shaul/Desktop/D/Editor/packages/lsp/src
rg -n "writeFileContent|createFileContent|renamePath|deletePath" \
  apps/web/src/features/editor/state/workspace-edit-service.ts \
  apps/web/src/features/search/utils/replace-runner.ts
rg -n "setTimeout|retry.*delay|sleep" \
  apps/web/src/features/editor/state/workspace-edit-service.ts \
  apps/web/src/features/workspace/hooks/use-events.ts
```

Expected: first two Editor greps empty; `workspace.applyEdit` absent from advertised capabilities/
handlers except explicit negative tests/comments; diagnostics copy absent; coordinator/search do not
call raw single-resource APIs; no timing-based correctness path was added. Existing unrelated event
debounce may remain only if it is demonstrably not part of transaction correctness.

### Focused and package gates

```bash
cd /Users/shaul/Desktop/D/Editor
bun run typecheck
bun run format:check
bunx --bun knip
bun run build

cd /Users/shaul/Desktop/D/Editor/packages/editor
bun run test
bun run typecheck

cd /Users/shaul/Desktop/D/Editor/packages/lsp
bun run test
bun run typecheck

cd /Users/shaul/Desktop/D/Editor/packages/lsp-plugin
bun run test
bun run typecheck

cd /Users/shaul/Desktop/D/platform/packages/contracts
vitest run
bun run typecheck

cd /Users/shaul/Desktop/D/platform/apps/server
bun --bun vitest run src/fs/tests/workspace-edit.test.ts src/fs/tests/contracts.test.ts \
  src/lsp/typescript/tests/workspace-edit.test.ts src/lsp/typescript/tests/session.test.ts \
  src/lsp/tests/proxy-session.test.ts src/tests/app.test.ts
bun run typecheck
bun run format:check

cd /Users/shaul/Desktop/D/platform/apps/web
bun --bun vitest run --project node \
  test/integration/workspace-edit.test.ts \
  src/features/editor/tests/workspace-edit-service.test.ts \
  src/features/editor/tests/document-state.test.ts \
  src/features/editor/tests/file-sync-service.test.ts \
  src/features/editor/tests/language-server-plugin.test.ts \
  src/features/editor/tests/state.test.ts \
  src/features/search/tests/search-replace-runner.test.ts \
  src/features/workspace/tests/use-events.test.ts
bun --bun vitest run --project dom \
  src/features/editor/tests/workspace-edit-preview-dialog.test.tsx
bun run typecheck
bun run format:check
```

Run a broader package suite only when the focused delta exposes a plausible shared regression. Do
not use bare root `bun run verify` as the acceptance gate.

### Documentation/index changes during implementation

1. Update `PLAN.md`'s authoritative execution order to mark plan 063 scheduled/in progress/complete
   only with operator approval; do not let `plans/README.md` become a second roadmap.
2. Update the S5 row/nearby status in `docs/editor-parity-implementation-plan.md` after the smoke
   matrix passes. Record that server-initiated `workspace/applyEdit` remains unsupported because
   pooled request ownership is a separate LspService prerequisite.
3. Update `plans/README.md` state while executing. When every done criterion passes, delete this
   plan and its inventory row per cleanup policy; git history is the archive.
4. If Platform and Editor land via separate PRs, record the paired Editor commit in the Platform PR
   and verify CI against it. Restore CI's `EDITOR_REF: main` after the Editor change is on main.

## Done criteria

- Editor owns and tests lossless runtime parsing, strict ranges/overlap/version validation, and
  guarded same-buffer prepare/commit/rollback.
- Rename and code actions dispatch one whole plan; no local partial application remains.
- Native producer tests assert exact ordered/versioned edits; proxy tests prove numeric version
  provenance or reject the response.
- Platform policy covers every case in the behavior tables: overlap, drift, schemes, dirty/open/
  unopened, resource options, cancellation, failure, and recovery.
- Server prepare is invisible; commit compensation and rollback-failure recovery are tested with a
  real filesystem and deterministic fault driver.
- Open buffers are never auto-saved; unopened edits persist without opening; dirty destructive
  targets are never discarded.
- Same-buffer native undo is one step. Cross-file/resource groups have explicit all-or-nothing
  Undo/Redo, Editor-owned history barriers, bounded retention, and cannot leak one leg to ordinary
  Editor history.
- Mounted views consume external buffer transactions exactly once with distinct selection state;
  repeated text-document operations advance the owning LSP lane by their logical revision count.
- Normal pooled borrowers initialize with one Editor-composed capability object regardless of
  acquisition order; unsupported targets are policy failures, not capability races.
- WDS, tabs, file/tree/git queries, and watcher hints converge directly and without timing proof.
- Search replace no longer owns a contradictory partial-success persistence loop.
- All exact producer, Editor, Platform service, server, DOM, integration, and smoke cases pass with
  no new baseline failure.
- No readonly container is copied solely for type compatibility and no obsolete document
  architecture compatibility layer exists.
- Index and authoritative roadmap/status documentation are reconciled.

## STOP conditions

Stop and report instead of improvising if any condition holds:

1. Plan 062 or root `PLAN.md` scheduling is absent, or an in-scope user edit cannot be reconciled.
2. Editor cannot expose one lossless readonly ordered plan, guarded reciprocal receipt, mounted-view
   subscription bridge, and external history barrier without Platform parsing LSP or mutating piece
   tables/history itself.
3. A numeric external LSP version cannot be mapped exactly from pooled backend to the requesting
   browser's version, or repeated same-target operations cannot advance the lane's logical version
   exactly. Never null it out or compare it to WDS/file counters.
4. Any producer would silently omit an invalid/outside/unreadable leg and return a partial edit.
5. Platform would need to retain both the old local rename/fix application and the new host path.
6. A supported regular-file resource cannot be preflighted for containment/type/device or reversed
   exactly, or implementation proposes copy/delete across devices. Directories and symlinks remain
   explicitly unsupported; expanding them requires a new reviewed plan.
7. Implementation weakens the pinned dirty destructive, clean-open delete, unopened line-ending,
   or cross-file undo policy instead of returning the specified rejection.
8. Prepare changes visible state, watcher timing proves success, or unopened persistence bypasses
   `FileSyncService`.
9. Commit/compensation failure has no explicit `partial` recovery result/UI, or recovery could be
   mislabeled applied/cancelled.
10. Ordinary Editor Undo can expose one leg of a Platform group.
11. Search replace must retain partial-success semantics; ask whether to split that policy rather
    than silently leaving duplicate applicators.
12. Implementation requires `workspace.applyEdit` for pooled external servers. That needs explicit
    connection/root service ownership and one correlated response path; it is outside this plan.
13. Product requires crash/power-loss atomicity across filesystems rather than live-process
    compensation plus journal recovery.
14. A readonly/mutable error is being “fixed” by copying a container rather than correcting the
    callee/model contract.
15. A compatibility shim, legacy alias, second dirty store, hidden live document for unopened text,
    raw CSS/color/loader, or production `new Error` is proposed.
16. A focused baseline gains a failure, a rollback test flakes on timing, or the smoke outcome
    contradicts the logged transaction state.
17. Normal pooled capability/options differ by borrower or acquisition order, or Platform must
    compose the Editor-owned WorkspaceEdit capability a second time.
18. A public API assertion would read stale `dist`, a transaction fixture can trigger production
    failure injection through an HTTP body, or journal/watch exclusion cannot be proven.
