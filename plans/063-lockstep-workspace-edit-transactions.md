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

- **State**: Scheduled next by authoritative `PLAN.md`; executable after the normal drift and
  baseline reconciliation
- **Priority**: P1
- **Effort**: XL, lockstep across two repositories
- **Risk**: HIGH — protocol versions, dirty memory, reversible disk mutation, resource
  operations, watcher replay, and undo meet at one boundary
- **Depends on**: the landed typed CommandBus, command metadata, and semantic settings foundation.
  Extend them for the explicit workspace undo/redo commands.
- **Ordering with 060/061/064**: no semantic dependency, but do not execute concurrently. If 060,
  061, or 064 lands first, re-run this plan's drift check over shared Editor/WDS/provider/plugin
  files. If this plan lands first, reconcile 061 against the new prepared-open/document transaction
  APIs and 064 against the changed LSP option/plumbing surface.
- **Category**: architecture / correctness / LSP
- **Planned at**: Platform `bf863b7b`, Editor `c8c36b9`, 2026-08-24

## Drift check and baseline

During planning, Editor's concurrent allocation work landed cleanly as `c8c36b9`; it changes
`documentTextSnapshot.ts`, the piece-table walker, Shiki/token files, and tests. This plan was
re-audited against that head and deliberately uses the current snapshot range/chunk contract
without editing `documentTextSnapshot.ts`. Platform's prepared-input/diff/workbench/tree/UI change
set and the then-current planning files were committed through `bf863b7b` while this plan was reviewed. The plan was
reconciled to those files, including the current `use-diff-language.ts` connection shape; do not
restore an earlier diff-loading or pending-input design. If a later commit moves a named contract,
STOP and reconcile rather than absorbing it silently. Record both worktrees before editing:

```bash
cd /Users/shaul/Desktop/D/platform
git status --short > /tmp/plan-063-platform-before.txt
git rev-parse HEAD
git diff --stat bf863b7b -- \
  apps/server/src \
  apps/web/src \
  apps/web/test \
  packages/contracts/src \
  .github/workflows/ci.yml \
  PLAN.md \
  docs/editor-parity-implementation-plan.md \
  plans/README.md

cd /Users/shaul/Desktop/D/Editor
git status --short > /tmp/plan-063-editor-before.txt
git rev-parse HEAD
git diff --stat c8c36b9 -- \
  packages/editor/src \
  packages/editor/test \
  packages/lsp/src packages/lsp/test \
  packages/lsp-plugin/src packages/lsp-plugin/test \
  packages/lsp-plugin/package.json
```

Typed command/focus runtime drift is expected. Read the landed command IDs, non-rejecting async
ticket result, undo category, and provider locations instead of restoring names from this planning snapshot. Drift
from 060/061/064 is also expected only if those plans were explicitly scheduled first. If any other
in-scope dirty edit overlaps a symbol named below, STOP and ask the operator to reconcile
ownership. Never revert, stash, overwrite, or format unrelated work.

Capture focused baselines before implementation. A final gate is a delta against these results,
not an absolute count:

```bash
cd /Users/shaul/Desktop/D/Editor/packages/editor
bun run test -- test/documentSession.test.ts test/editChain.test.ts test/editor.test.ts \
  test/public-api.test.ts \
  > /tmp/plan-063-editor-core-baseline.txt 2>&1

cd /Users/shaul/Desktop/D/Editor/packages/lsp
bun run test > /tmp/plan-063-editor-lsp-baseline.txt 2>&1

cd /Users/shaul/Desktop/D/Editor/packages/lsp-plugin
bun run test -- test/workspaceEdit.test.ts test/plugin.test.ts test/codeActions.test.ts \
  test/lane.test.ts test/narrowFactoryPlumbing.test.ts \
  > /tmp/plan-063-editor-plugin-baseline.txt 2>&1

cd /Users/shaul/Desktop/D/platform/apps/server
bun --bun vitest run src/lsp/typescript/tests/session.test.ts \
  src/lsp/tests/proxy-session.test.ts src/tests/app.test.ts \
  > /tmp/plan-063-platform-server-baseline.txt 2>&1

cd /Users/shaul/Desktop/D/platform/apps/web
bun --bun vitest run --project node \
  src/features/editor/tests/document-state.test.ts \
  src/features/editor/tests/file-sync-service.test.ts \
  src/features/editor/tests/language-server-plugin.test.ts \
  src/features/editor/state/tests/diff-language-session.test.ts \
  src/features/search/tests/search-replace-runner.test.ts \
  src/features/workspace/tests/use-events.test.ts \
  > /tmp/plan-063-platform-web-baseline.txt 2>&1
bun --bun vitest run --project dom \
  src/features/editor/hooks/tests/use-diff-language.test.tsx \
  > /tmp/plan-063-platform-web-dom-baseline.txt 2>&1
```

If a baseline has a pre-existing failure, record its exact test name and continue only when the
failure is unrelated and reproducible before edits. Completion permits no new failure.

## Outcome

After this plan:

1. Editor parses an untrusted `WorkspaceEdit` losslessly into one readonly, ordered operation
   stream. Versions, annotations, repeated document operations, URIs, and resource options survive.
2. Editor strictly validates UTF-16 positions and overlaps against an immutable target snapshot.
   It never clamps, drops, re-diffs, or partially retains an invalid workspace edit.
3. Editor prepares and commits one guarded transaction per buffer, or one guarded sequence when a
   resource operation delimits text on that same buffer. Preparation is side-effect-free; each
   commit checks revision plus snapshot identity. A sequence emits only the protocol-required
   segment changes while retaining one history barrier/receipt. Platform receives rollback/undo
   receipts but does not implement Editor internals.
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
replay, version/range validation, and composition into one core transaction sequence:

```ts
type WorkspaceTextDocumentProvenance = {
  readonly textSnapshot: TextSnapshot
  readonly uri: string
  readonly version: number
}

declare const documentLogicalRevisionScopeBrand: unique symbol
declare const documentSyncSegmentBrand: unique symbol

type DocumentLogicalRevisionScope = {
  readonly [documentLogicalRevisionScopeBrand]: true
}

type DocumentSyncSegment = {
  readonly [documentSyncSegmentBrand]: true
}

declare function createDocumentLogicalRevisionScope(): DocumentLogicalRevisionScope

type WorkspaceTextReplaySegmentInput = {
  readonly operations: readonly {
    readonly operation: Extract<WorkspaceEditOperation, { kind: 'text-document' }>
    readonly operationIndex: number
  }[]
  readonly segmentIndex: number
  readonly uri: string
}

type WorkspaceTextReplayTarget = {
  readonly buffer: EditorTextBuffer
  readonly expectedRevision: number
  readonly initialSnapshot: DocumentTextSnapshot
}

type WorkspaceTextReplayInput = {
  readonly logicalRevisionScope: DocumentLogicalRevisionScope
  readonly provenance: readonly WorkspaceTextDocumentProvenance[]
  readonly segments: readonly WorkspaceTextReplaySegmentInput[]
  readonly target: WorkspaceTextReplayTarget
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

type PreparedWorkspaceTextSegment = {
  readonly logicalRevisionCount: number
  readonly segmentIndex: number
  readonly sequenceSegmentIndex: number | null
  readonly simulatedVersionAfter: number | null
  readonly simulatedVersionBefore: number | null
  readonly snapshotAfter: PieceTableSnapshot
  readonly snapshotBefore: PieceTableSnapshot
  readonly steps: readonly PreparedWorkspaceTextStep[]
  readonly uri: string
}

type PrepareWorkspaceTextReplayResult =
  | {
      readonly ok: true
      readonly segments: readonly PreparedWorkspaceTextSegment[]
      readonly sequence: PreparedDocumentTransactionSequence | null
    }
  | { readonly error: WorkspaceEditFailure; readonly ok: false }

type DocumentSyncPoint = {
  readonly revision: number
  readonly segment: DocumentSyncSegment
  readonly textVersion: number
}

type DocumentChangesSinceSyncPoint = {
  readonly edits: readonly TextEdit[] | null
  readonly logicalRevisionCount: number
  readonly revisionAfter: number
  readonly syncPointAfter: DocumentSyncPoint
}

type DocumentTextRoundTripIssue =
  'mixed-line-endings' | 'lone-carriage-return' | 'unusual-line-terminator'

type DocumentTextRoundTripStatus =
  | {
      readonly hasByteOrderMark: boolean
      readonly lineEnding: DocumentLineEnding
      readonly ok: true
    }
  | {
      readonly issues: readonly DocumentTextRoundTripIssue[]
      readonly ok: false
    }

declare function prepareWorkspaceTextReplay(
  input: WorkspaceTextReplayInput,
): PrepareWorkspaceTextReplayResult

declare function documentTextRoundTripStatus(text: string): DocumentTextRoundTripStatus
declare function pieceTableDocumentText(
  snapshot: PieceTableSnapshot,
  options?: PieceTableDocumentTextOptions,
): string
```

`target.initialSnapshot` is the instrumentable input and carries its piece-table snapshot. The
target also supplies the exact live or transient `EditorTextBuffer` and expected core revision;
Editor first proves the buffer revision/snapshot identities match, validates all text segments, and
binds them through `prepareDocumentTransactionSequence` before returning. A mismatch is
`snapshot-drift`. Platform's disk/content/path stamps remain absent: Platform retains and
revalidates them around this side-effect-free Editor call. After resolving the virtual resource
graph, Platform partitions one logical buffer's text operations only at intervening
resource-operation indices and supplies those ordered segments; it never parses or applies an LSP
range. Editor carries the simulated version and snapshot across each boundary and returns a
commit-ready branded sequence plus step snapshots. Platform may interleave only the named resource
legs between those prepared segments; it never binds validated edits to core itself. An unopened
target uses the transient Editor buffer already required by policy.

- Validate UTF-16 line/character positions against piece-table line metadata. Do not materialize
  full text merely to locate lines and do not call the clamping `lspPositionToOffset` helper.
- Reject negative/fractional/out-of-line positions, reversed ranges, true overlaps, and two
  zero-width inserts at the same offset. Coincident insert order is protocol-ambiguous and must not
  inherit an incidental descending sort.
- Accept unsorted adjacent edits. All ranges are measured against the immutable input snapshot.
- Seed the simulated version from provenance whose URI and `textSnapshot` identity match the target.
  A non-null operation must equal the simulated LSP version; missing/mismatched provenance is
  `version-mismatch`, not a null downgrade. A target with no lane provenance may replay only null
  versions and keeps a null simulated version; `logicalRevisionCount` still records its effective
  steps. Every sequential operation whose application changes
  the simulated snapshot advances the version once, whether its declared version is numeric or
  null. Thus two effective operations accept `N, N+1` and reject `N, N` or `N, N+2` atomically.
  An empty edit list or a batch whose effective text equals its input is an explicit no-op: retain
  its step for preview/order, do not advance the simulated version, and omit its sequence segment.
  Return `sequence: null` only when **every** step is no-op. Effective steps that later restore the
  initial text still retain their version advances and produce a non-null logical sequence. Use the
  existing piece-table chunk comparison to decide text equality without materializing the document;
  when a segment ends text-identical to its input, canonicalize `snapshotAfter` to the exact
  `snapshotBefore` identity. Never substitute core revision or `textVersion`.
- A resource rename changes URI provenance. A later non-null edit at the new URI requires a captured
  lane entry for that exact URI/snapshot; otherwise reject. A null edit can continue on Platform's
  guarded logical target.
- Put the number of effective replay steps into each prepared sequence segment's
  `logicalRevisionCount` and scope it to the originating `LspWorkspace`'s opaque
  `DocumentLogicalRevisionScope`. Editor core owns and exports
  `createDocumentLogicalRevisionScope()`; the lsp-plugin lane resolver creates exactly one token per
  `LspWorkspace` and reuses it for that workspace's guards, replay, and `DocumentSync`. Carry
  count/scope on `DocumentTransactionMetadata` and
  `DocumentSessionChange`; ordinary text/undo/redo/reversal uses count one with null scope, while
  selection/no-op changes use zero. A scoped origin lane advances by the stored count; another lane
  sees one revision when final text changed and zero when it did not.
- `DocumentEditChain` stores core revision, text version, edits/null, text-changed flag, count, and
  scope for every emitted transaction, including an effective sequence whose final text returns to
  the starting text. Replace `editsSinceTextVersion` with
  `changesSinceDocumentSyncPoint(point, scope): DocumentChangesSinceSyncPoint | null`; expose both
  the required readonly `documentSyncPoint` property of type `DocumentSyncPoint` and the required
  readonly `changesSinceDocumentSyncPoint` accessor with signature
  `(point: DocumentSyncPoint, scope: DocumentLogicalRevisionScope | null) => DocumentChangesSinceSyncPoint | null`
  on `EditorViewSnapshot`; do not retain the old optional accessor. The buffer-owned chain creates
  one `DocumentSyncSegment`, shared by every mounted view, and rotates it only on a
  buffer replacement, untrackable full replacement, or document-identity transition. Attaching a
  second view adopts the current point; it does not rotate the shared segment. A point from another
  segment returns null. Compose
  edits and lane-specific counts across deferred workspace and ordinary changes, and retain the
  count even when edit composition becomes null and requires full sync. Change semantic-token/find
  consumers to read `.edits`; do not keep a compatibility accessor or copy readonly edits.
- Extend `LspWorkspace.updateDocumentSnapshot` with `logicalRevisionCount`, source core revision,
  source `DocumentSyncSegment` identity, and the exact source snapshot. A positive count is required
  for the first observation of a source revision, including full-sync fallback and same-text logical
  synchronization. Zero is legal only to adopt the exact source-segment/revision/snapshot tuple that
  this workspace already applied; zero with a new tuple or changed content is an invariant failure.
  It emits one atomic `didChange` at the advanced version; a
  same-text effective sequence sends one full-content same-text change for the origin lane. The
  first mounted observer sends, while another observer with the same LspWorkspace token, source
  revision, segment, and exact text snapshot adopts the current version. The same identity with
  different content is an invariant failure. Distinct `lineStarts`/`lineStartsView` containers do
  not defeat deduplication.
- Add `LspWorkspace.adoptUnchangedDocumentSource(uri, options)` for the distinct no-wire case. It
  accepts a new source segment/revision only when the supplied text snapshot is the exact current
  workspace snapshot, records that source point, and returns the unchanged LSP version without
  `didChange`; content mismatch is an invariant failure. `DocumentSync` uses this branch when
  `changesSinceDocumentSyncPoint` returns count zero for a non-origin logical-only transaction,
  stores `syncPointAfter`, and does not call `updateDocumentSnapshot`. A later ordinary edit
  composes from that adopted point and advances the wire version once rather than replaying the
  logical-only change.
- Change `LspWorkspaceSnapshotEditOptions` exactly to carry readonly `textSnapshot`, `lineStarts`,
  `edits`, `logicalRevisionCount`, `sourceRevision`, and `sourceSegment: object`. The LSP package
  treats the segment as an opaque identity and never constructs or inspects it; lsp-plugin supplies
  the core `DocumentSyncSegment`. Do not add a second overload retaining the old option shape.
- Add snapshot-preserving `LspWorkspace.openDocumentSnapshot(...)` and attachment-token close APIs.
  First open stores the caller's exact `textSnapshot`/line-start view identities and materializes
  text only for the wire `didOpen`; a second holder adopts that same server document. Delete the
  string-only open path rather than keeping a compatibility overload. A first rename immediately
  after cold open must therefore compare the same snapshot object in lane provenance and WDS.
- Replace URI-only open counts with opaque workspace document attachments. A synchronous
  `transitionDocumentUri(attachment, options)` operates on the shared workspace document: it sends
  the one `didClose(old)` first, rebinds every attachment, rotates the workspace sync segment,
  sends one `didOpen(new)` with the supplied exact snapshot, then notifies every `DocumentSync` to
  adopt the result. The first mounted observer performs the transition for all holders; later view
  refreshes adopt it and send nothing. Its reciprocal transition is retained for local rollback.
  Never let per-view close/open ordering decide the wire order.
- Preserve annotation association in the prepared output. Surrogate-boundary snapping must report
  the actual applied ranges. Preserve parser `newText` exactly, then let the Editor transaction
  boundary normalize CRLF/lone CR to its LF model and report the effective text. Unopened
  persistence serializes with `pieceTableDocumentText`, preserving a consistent source line-ending
  policy and BOM; it never writes `materializeFullText()` directly.
- Export the exact `DocumentTextRoundTripIssue`, `DocumentTextRoundTripStatus`,
  `PieceTableDocumentTextOptions`, `DocumentLogicalRevisionScope`, `DocumentSyncPoint`,
  `DocumentSyncSegment`,
  `createDocumentLogicalRevisionScope()`,
  `documentTextRoundTripStatus(text)`, and `pieceTableDocumentText(snapshot, options?)` contracts
  above
  through `@singapor/core/document`. Strip only one leading U+FEFF for classification; empty and
  single-line text are safe LF. Unsafe issue order is fixed as mixed, lone CR, unusual terminator,
  and U+2028/U+2029 set the last issue before a transient unopened buffer can lose representation.

Stable failure codes must include `invalid-workspace-edit`, `invalid-annotation`,
`unsupported-snippet`, `invalid-position`, `reversed-range`, `overlapping-edits`,
`ambiguous-inserts`, `version-mismatch`, and `snapshot-drift`.

### 3. Guarded one-buffer transaction

Extend `packages/editor/src/documentSession.ts`, `packages/editor/src/public/document.ts`, and
`packages/editor/src/index.ts` with a generic core API, not an LSP-specific one:

```ts
type PreparedDocumentTransaction = {
  readonly hasTextChange: boolean
  readonly logicalRevisionCount: number
  readonly logicalRevisionScope: DocumentLogicalRevisionScope | null
  readonly expectedRevision: number
  readonly snapshotBefore: PieceTableSnapshot
  readonly snapshotAfter: PieceTableSnapshot
  readonly edits: readonly TextEdit[]
  readonly inverseEdits: readonly TextEdit[]
}

declare const preparedDocumentTransactionSequenceBrand: unique symbol
declare const documentTransactionSequenceReverseBrand: unique symbol

type PreparedDocumentTransactionSequence = {
  readonly [preparedDocumentTransactionSequenceBrand]: true
  readonly expectedRevision: number
  readonly segments: readonly PreparedDocumentTransaction[]
  readonly snapshotAfter: PieceTableSnapshot
  readonly snapshotBefore: PieceTableSnapshot
}

type DocumentTransactionSequenceSegmentInput = {
  readonly edits: readonly TextEdit[]
  readonly logicalRevisionCount: number
  readonly logicalRevisionScope: DocumentLogicalRevisionScope | null
}

type DocumentTransactionSequenceReverseCursor = {
  readonly [documentTransactionSequenceReverseBrand]: true
  readonly nextSegmentIndex: number
}

type DocumentTransactionHistory =
  | { readonly kind: 'record'; readonly undoGroup?: string }
  | { readonly groupId: string; readonly kind: 'external-barrier' }

type DocumentTransactionCommitTarget = {
  readonly buffer: EditorTextBuffer
  readonly mutationLease?: DocumentMutationLease
  readonly sourceView: EditorViewSession | null
}

type DocumentTransactionCommitOptions = {
  readonly history: DocumentTransactionHistory
  readonly selection?: DocumentSessionEditSelection
  readonly selections?: readonly DocumentSessionEditSelection[]
}

declare const documentTransactionReceiptBrand: unique symbol
declare const documentMutationLeaseBrand: unique symbol

type DocumentMutationLease = {
  readonly [documentMutationLeaseBrand]: true
  readonly ownerId: string
}

type AcquireDocumentMutationLeaseResult =
  | { readonly lease: DocumentMutationLease; readonly status: 'acquired' }
  | { readonly status: 'busy' | 'stale' }

type DocumentMutationLeaseState = {
  readonly isLeased: boolean
  readonly ownerId: string | null
}

type DocumentTransactionReceipt = {
  readonly [documentTransactionReceiptBrand]: true
  readonly edits: readonly TextEdit[]
  readonly history: DocumentTransactionHistory
  readonly inverseEdits: readonly TextEdit[]
  readonly logicalRevisionCount: number
  readonly phase: 'provisional' | 'sealed'
  readonly revisionAfter: number
  readonly revisionBefore: number
  readonly segmentCount: number
  readonly snapshotAfter: PieceTableSnapshot
  readonly snapshotBefore: PieceTableSnapshot
}

type PreparedDocumentCommitResult =
  | {
      readonly status: 'committed'
      readonly change: DocumentSessionChange
      readonly receipt: DocumentTransactionReceipt
    }
  | {
      readonly status: 'logical-only'
      readonly change: DocumentSessionChange
    }
  | { readonly status: 'stale' }

type PreparedDocumentSequenceSegmentCommitResult =
  | {
      readonly change: DocumentSessionChange
      readonly receipt: DocumentTransactionReceipt | null
      readonly status: 'committed' | 'logical-only'
    }
  | { readonly status: 'out-of-order' | 'stale' }

type CompletePreparedDocumentSequenceResult =
  | {
      readonly receipt: DocumentTransactionReceipt | null
      readonly status: 'completed'
    }
  | { readonly status: 'incomplete' | 'stale' }

type ReverseDocumentTransactionSequenceSegmentResult =
  | {
      readonly change: DocumentSessionChange
      readonly cursor: DocumentTransactionSequenceReverseCursor
      readonly status: 'reversed'
    }
  | { readonly status: 'out-of-order' | 'stale' }

type CompleteReverseDocumentTransactionSequenceResult =
  | {
      readonly receipt: DocumentTransactionReceipt
      readonly status: 'completed'
    }
  | { readonly status: 'incomplete' | 'stale' }

type RotateDocumentSyncSegmentResult =
  | { readonly status: 'rotated'; readonly syncPoint: DocumentSyncPoint }
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

type ReleaseDocumentMutationLeaseResult = {
  readonly status: 'released' | 'already-released'
}
```

- Export exact
  `prepareDocumentTransaction(buffer, readonlyEdits, logicalRevisionCount, logicalRevisionScope)`,
  `prepareDocumentTransactionSequence(buffer, readonlySegments)`,
  `acquireDocumentMutationLease(buffer, expectedRevision, expectedSnapshot, ownerId)`,
  `commitPreparedDocumentTransaction(target, prepared, options)`,
  `commitPreparedDocumentTransactionSequenceSegment(target, sequence, segmentIndex, options)`,
  `completePreparedDocumentTransactionSequence(target, sequence)`,
  `beginReverseDocumentTransactionSequence(target, receipt)`,
  `reverseNextDocumentTransactionSequenceSegment(target, cursor, segmentIndex)`,
  `completeReverseDocumentTransactionSequence(target, cursor)`,
  `reverseDocumentTransaction(target, receipt)`,
  `sealDocumentTransactionReceipt(target, receipt)`,
  `releaseDocumentTransactionReceipt(target, receipt)`, and
  `releaseDocumentMutationLease(buffer, lease)`, `getDocumentMutationLeaseState(buffer)`, and
  `subscribeDocumentMutationLeaseState(buffer, listener)`, plus
  `rotateDocumentSyncSegment(buffer, expectedPoint, mutationLease)` functions/types through
  `@singapor/core/document` and the root. Reverse returns a reciprocal branded receipt used for
  redo. Release is idempotent and keyed by the opaque barrier identity, not current text: it can
  squash an older retained history token beneath newer barriers without changing text, revision,
  selection, or emitting. A missing/already-released barrier is a no-op.
- Seal is likewise identity-based, synchronous, and idempotent. It drops only the pre-group redo
  branch and cannot fail for snapshot drift; it returns the sealed branded receipt Platform stores.
- Preparation validates and constructs `snapshotAfter` without changing buffer revision, history,
  selections, dirty state, subscribers, or text. Sequence preparation carries the output snapshot
  of one segment into the next; every segment is commit-ready before Platform performs a resource
  leg.
- Commit compares both `getRevision()` and `getSnapshot()` identity, then commits synchronously.
  Revision is required because edit then undo can return to equivalent text/snapshot state.
- When effective replay steps return to the same final text, `hasTextChange` is false but the
  prepared transaction remains real. Commit increments core revision once, leaves snapshot/text
  version/dirty/selection/history unchanged, emits one `kind: 'synchronize'` change with the scoped
  logical count, creates no receipt/barrier/undo entry, and returns `logical-only`. Platform omits a
  receipt for that leg. This differs from an all-no-op replay, which never calls commit.
- A prepared sequence commits only its next segment and checks the expected current revision and
  snapshot at every boundary. With `external-barrier`, the first text-changing segment installs one
  barrier and each later segment extends the same provisional cumulative receipt; it never creates
  a second native-history boundary. A logical-only segment emits its synchronization change but
  does not create a receipt. Each segment result returns the latest cumulative receipt, so Platform
  can reverse all already-committed segments after a later resource/local failure.
  `completePreparedDocumentTransactionSequence` succeeds only after every effective segment has
  committed and returns the one final receipt. More than one segment with `history: 'record'` is an
  invariant failure: native one-buffer history is used only when no resource boundary exists.
- A sequence receipt retains its ordered segment boundaries behind one opaque barrier. Compensation,
  workspace Undo, and Redo open a reverse cursor and reverse exactly the next segment in descending
  order; Platform may interleave only the reciprocal resource operation at the corresponding
  boundary. Completion returns one reciprocal sequence receipt. It is an invariant failure to call
  single-transaction reverse on a receipt whose `segmentCount` exceeds one, to skip/repeat a reverse
  segment, or to complete while a segment remains. This preserves inverse wire order without
  exposing per-segment history ownership to Platform. Receipt `segmentCount` counts only
  text-changing segments retained for reversal; logical-only synchronization segments are
  monotonic wire observations with no text/history receipt and are never “reversed” by decrementing
  a version.
- A mutation lease is a generic Editor-core exclusion primitive whose acquisition compares the
  expected revision/snapshot and fails if another owner holds the buffer. While held, every normal
  text mutation entry point—including keyboard, paste, drop, undo/redo, and programmatic
  `applyEdits`—returns the existing non-emitting `kind: 'none'` result; selection and scroll remain
  usable. Only prepared commit/reverse calls carrying that exact lease may change text. Every
  mounted Editor reflects the lock as non-editable. Acquisition and release synchronously publish
  a dedicated lease-state event, separate from `DocumentSessionChange`; mounted Editors query and
  subscribe to that state so every view updates immediately without pretending the lock is a text
  mutation. Release is synchronous and identity-based. Platform decides when to acquire/retain it;
  Editor alone enforces it. STOP if any text mutation path bypasses `EditorTextBuffer` and therefore
  cannot honor the lease.
- `record` produces one ordinary native undo entry. `external-barrier` changes current text without
  putting the group leg on ordinary history, clears redo as a new edit must, and inserts an
  Editor-owned barrier: later user edits may undo back to the group result, but native Undo cannot
  cross into the pre-group snapshot. The opaque receipt retains the pre-barrier history only for
  exact rollback/Platform undo. A provisional receipt retains pre-existing redo for compensation;
  sealing after Platform finalize permanently drops that obsolete redo while retaining the older
  undo chain behind the barrier. Releasing a drifted/evicted receipt permanently squashes that old
  undo chain at the barrier.
- Expose the guarded single-transaction inverse over a one-segment receipt and the cursor API above
  over a sequence receipt. Either may mutate only when the buffer is still at the receipt's exact
  after revision/snapshot and barrier state. It restores the before snapshot and source selection
  state, emits the required change(s), and returns one reciprocal receipt. Reversing a provisional
  receipt for compensation restores exact pre-existing undo/redo; reversing a sealed receipt for
  user Undo keeps pre-existing redo discarded and yields only the reciprocal workspace-group Redo.
  Platform decides which boundary it is in; Editor performs every same-buffer reversal.
- Extend `EditorTextBufferChange` with an Editor-owned external/view origin and make mounted
  `Editor` instances subscribe/unsubscribe on attach/detach/dispose. A normal source view still
  applies its own call once; an external prepared commit notifies every attached view exactly once.
  Each view keeps/maps its distinct anchor selections and scroll state; the target's optional
  `sourceView` supplies native-history selections without making other views adopt them. Explicit
  `selection`/`selections` affect that source view only; absent options map every view's own anchors.
- Extend `DocumentSessionChangeKind` exactly to
  `'edit' | 'selection' | 'undo' | 'redo' | 'synchronize' | 'none'`. WDS records a synchronize
  event's fresh core revision as `localRevision`, but it does not advance content revision, change
  dirty state, or add history because the text snapshot is identical.
- `rotateDocumentSyncSegment` is a synchronous, lease-guarded document-identity operation. It keeps
  core/text versions, snapshot, dirty state, selection, and history unchanged, rotates the
  buffer-owned chain segment, and returns the new current point. WDS invokes it exactly once during
  a live path remap before the shared LSP URI transition; no view owns or independently rotates the
  chain.
- `logicalRevisionCount` is a positive integer for a real prepared transaction, defaults to one for
  ordinary edits, and is metadata for consumers such as `DocumentSync`; forward WorkspaceEdit uses
  its originating scope and K effective replay steps. Compensation/Undo/Redo is one new ordinary
  local transaction with null scope/count one, never the original K. Core buffer revision advances
  exactly once for either a text-changing or logical-only atomic transaction. The replay layer does
  not call this API for an all-no-op plan.
- `TextEdit` and every input container used here are genuinely readonly. Change callees that do not
  mutate; do not copy inputs to silence TypeScript.
- Do not expose or route through the obsolete static `DocumentSession`/`Editor` content replacement
  architecture.

Multiple sequential text operations on one logical buffer must be simulated in protocol order and
collapsed into one prepared initial-to-final transaction when no resource boundary exists. If a
resource leg separates text operations on that buffer, Editor returns one prepared sequence with
commit-ready segments, one lease, one cumulative barrier/reciprocal receipt, and simulated-version
continuation; Platform interleaves the resource leg but never reconstructs an edit. Cross-file/
resource groups use `external-barrier`; Platform is their only undo owner and ordinary Editor Undo
cannot expose one leg.

### 4. One producer callback and honest capabilities

Add a single async `onApplyWorkspaceEdit` option to adapter, set, and narrow plugin options. The
request carries the parsed plan, source (`rename` or `code-action`), title/label, server ID, origin
URI/version, the owning lane's revalidation guard, and an `AbortSignal`. The guard owns a readonly
capture of every `LspWorkspace` document at response time as `{ uri, version, textSnapshot }` and
an `isCurrent(uri)` method that verifies that target's captured URI/version/snapshot identities
still match the same workspace. Platform calls it only for parsed target URIs, so unrelated open
document activity does not invalidate the edit. Do not materialize text or copy a container merely
to satisfy mutability. The result is a non-rejecting settlement union that distinguishes a
pre-commit failure from a compensated or recovery-required post-commit outcome.

```ts
type WorkspaceEditOriginGuard = {
  readonly documents: readonly WorkspaceTextDocumentProvenance[]
  isCurrent(uri: string): boolean
}

type ApplyWorkspaceEditRequest = {
  readonly guard: WorkspaceEditOriginGuard
  readonly label: string
  readonly logicalRevisionScope: DocumentLogicalRevisionScope
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
  | { readonly code: string; readonly message: string; readonly status: 'rolled-back' }
  | {
      readonly affectedPaths: readonly string[]
      readonly code: string
      readonly message: string
      readonly status: 'recovery-required'
    }

type LanguageServerRenamePrompt = {
  readonly anchor: DOMRect
  readonly currentName: string
  readonly signal: AbortSignal
}

type OnApplyWorkspaceEdit = (
  request: ApplyWorkspaceEditRequest,
) => Promise<ApplyWorkspaceEditResult>

type LanguageServerLaneHostOptions = {
  readonly onApplyWorkspaceEdit?: OnApplyWorkspaceEdit
}
```

`cancelled` is legal only before commit. `failed` means commit never began and no intended mutation
remains. `rolled-back` means commit began and exact compensation completed.
`recovery-required` means exact restoration failed; Platform owns its path-level persistent UI.
After commit, cancellation/status loss settles to `applied | rolled-back | recovery-required`,
never `cancelled`.

- Rename and code actions always dispatch the whole plan. Delete the local “pick this document”
  application path.
- Preserve existing active-document identity checks before dispatch. Abort/supersede the request
  when the document changes, a newer request wins, the prompt cancels, or the plugin disposes.
- Preserve the existing anchor and change `onRequestRenameName` to receive the exact
  `{ anchor, currentName, signal }` `LanguageServerRenamePrompt`. One operation-scoped
  `AbortController` spans prepareRename, the prompt (including the built-in widget), rename request,
  parsing, and host application. Active-document drift, a newer rename, or disposal aborts the
  pending prompt and closes its widget before any later stage runs. An already-aborted signal
  resolves `null` without mounting; later abort closes the widget, resolves once, and removes its
  listener.
- Fix `resolveAdapterOptions` so `onRequestRenameName` is actually propagated.
- Host cancellation is not reported as an error toast. Host failure is reported once.
- Every Platform connection that can share the server backend `{canonicalRoot, serverId}` installs
  the same stable host callback and consequently gets a byte-identical immutable capability
  object—including diff,
  read-only, synthetic, and ordinary browser pools. A browser-side `diff:<sessionId>` key isolates
  view/client lifecycle, not the server's `LspSessionPool`; it is not permission to negotiate a
  different backend capability profile. Move conditional WorkspaceEdit capability composition into
  the common Editor lane-resolution path used by both `createLanguageServerSetPlugin` and direct
  `acquireLanguageServerLane`. Add `LanguageServerLaneHostOptions` to both the exact direct-lane and
  server-set option contracts; `resolveLanguageServerSetOptions` supplies the set callback and
  Platform supplies only that same callback to diff lanes. Platform never constructs or passes the
  capability block. Diff/synthetic requests reach the real Platform service and fail at target
  policy before preview; do not install a no-op host. Both Editor's browser pool and Platform's
  server pool reject a later initialize contract whose normalized immutable capabilities/options
  differ from the first; neither silently replays an incompatible first initialize result. STOP if
  direct diff acquisition cannot use Editor's composer without a second Platform implementation.
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
one already-live buffer, references no `needsConfirmation` annotation, and the owning-lane guard
has a current entry whose text snapshot is identical to the WDS snapshot. A non-null operation
version must also equal that entry's LSP version.
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

The virtual plan tracks `pendingUnsavedLiveText` per logical live document. A delete or overwrite
target is destructive when that document is dirty before the plan **or** an earlier text leg in the
same ordered plan makes it dirty. Reject before preview rather than applying text and then dropping
it. This does not block edit-then-rename of the source: that operation preserves and remaps the same
dirty live buffer while moving only its prior saved disk bytes.

### Overlap and version drift

- Any invalid/reversed/overlapping/ambiguous edit rejects the entire WorkspaceEdit before preview.
  Adjacent ranges are valid. Repeated text operations are applied sequentially in protocol order.
- Built-in TypeScript producers emit exact open versions and `null` for unopened files.
- The external proxy translates pooled backend versions back to the requesting browser connection's
  captured LSP versions. If the target was not owned by that connection, moved during the request,
  or cannot be mapped exactly, return Content Modified/failure for the whole producer response.
- Platform captures exact classification stamps:

  ```text
  live = { workspaceGeneration, canonicalPath, documentId, bufferIdentity,
           localRevision, contentRevision, snapshot }
  unopened = { workspaceGeneration, canonicalPath, expectedDocumentId: null,
               pathOwnershipRevision, version, mtimeMs }
  ```

  WDS owns `pathOwnershipRevision` and advances it whenever a canonical path gains, loses, or
  changes live-document ownership. Check the entire classification stamp after preview, after
  server prepare, and immediately before local commit. If an initially unopened path becomes a
  clean or dirty live document, reject as stale with zero mutation; never persist through the
  unopened path or silently reclassify the proposal.

  ```ts
  declare const workspaceDocumentPathReservationBrand: unique symbol

  type WorkspaceDocumentPathReservation = {
    readonly [workspaceDocumentPathReservationBrand]: true
    readonly ownerId: string
  }

  type WorkspaceDocumentPathReservationRequest = {
    readonly canonicalPath: string
    readonly expectedDocumentId: string | null
    readonly expectedPathOwnershipRevision: number
  }

  type AcquireWorkspaceDocumentPathReservationsResult =
    | {
        readonly reservation: WorkspaceDocumentPathReservation
        readonly status: 'acquired'
      }
    | { readonly status: 'busy' | 'stale' }

  type ReleaseWorkspaceDocumentPathReservationsResult = {
    readonly status: 'released' | 'already-released'
  }

  declare function acquireWorkspaceDocumentPathReservations(
    requests: readonly WorkspaceDocumentPathReservationRequest[],
    ownerId: string,
  ): AcquireWorkspaceDocumentPathReservationsResult

  declare function releaseWorkspaceDocumentPathReservations(
    reservation: WorkspaceDocumentPathReservation,
  ): ReleaseWorkspaceDocumentPathReservationsResult
  ```

- WDS acquires the readonly request set all-or-none in internal canonical-path order. Failed partial
  acquisition unwinds before returning. While reserved, open/close/remap by another or unowned
  caller returns `busy` without changing state; the owning provisional projection must carry the
  exact token. Acquisition, failed mutation, and release do not change
  `pathOwnershipRevision`; one successful gain/loss/remap advances that path's monotonic revision
  exactly once. Release is synchronous/idempotent, and every terminal coordinator path plus root
  disposal releases it. Correct readonly parameter types rather than copying the request container.
- Acquire WDS path reservations and Editor mutation leases for all affected live/absent targets in
  deterministic canonical-path order, then repeat the final classification/revision check while
  those locks are held and before server commit. Reservations block open/close/remap; mutation
  leases block text edits. A failed acquisition/revalidation releases what it acquired, aborts
  server prepare, and applies nothing. Release both only after finalize or exact compensation
  settles.
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
  During commit, deletion moves the exact file into its reserved same-device journal slot after the
  inverse intent is fsynced so undo can restore it; prepare never moves or copies it.
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

Local buffer/path effects and `DocumentSync` notifications follow the same operation order even
though WDS publishes one final React/store snapshot:

- edit-before-rename commits the prepared old-URI sequence segment and notifies `didChange` for the
  old URI, then the path projection invokes Editor's shared workspace URI transition, which sends
  exactly one `didClose` old URI before one `didOpen` new URI carrying the edited snapshot;
- rename-before-edit invokes that URI transition first using the pre-edit snapshot, then commits the
  prepared new-URI segment and emits `didChange` only for the new URI;
- edit-old -> rename -> edit-new commits two prevalidated segments around that one transition. They
  keep one Editor lease, one external history barrier, and one cumulative reciprocal receipt while
  emitting `didChange(old) -> didClose(old) -> didOpen(new) -> didChange(new)` exactly;
- WDS's deferred store publication does not defer/reorder these protocol notifications, and its
  final reconciliation suppresses duplicate close/open/change for the same operation ID, URI, and
  core revision.

The LSP transition is workspace-level and two-phase internally, never one close/open per mounted
view. It rebinds every attachment before any later observer refresh can open the new URI. If the
local batch compensates or Platform Undo runs, walk the original operation stream backward with the
Editor sequence reverse cursor: reverse an edit-new segment on the new URI, apply the reciprocal URI
transition, then reverse the edit-old segment on the old URI. A prefix that failed before edit-new
transitions back before reversing edit-old. The server therefore sees exact inverse close/open/text
order while Editor still owns one barrier and one reciprocal receipt.

Execute every local leg synchronously in one JavaScript task. Mounted views may receive one event
per affected buffer and `DocumentSync` may observe the ordered sequence; the atomic UI guarantee is
one WDS publication and no browser paint/async yield between legs, not one cross-buffer Editor
event. If true subscriber-level cross-buffer atomicity becomes a product requirement, STOP and add
an Editor notification-batch primitive instead of claiming WDS batching provides it.

### Cancellation

- Rename-name cancel/unchanged input sends no rename request.
- During target reads, validation, server prepare, or preview, cancellation aborts work and server
  staging and produces no mutation. Prepare cancellation is a protocol state transition, not just
  an aborted fetch: `/abort` can durably claim an operation ID before `/prepare`, or mark an active
  `preparing` journal, so a late prepare handler must settle `aborted` and remove its lease/staging.
- A newer request, plugin/provider disposal, buffer replacement, or root generation change cancels
  the older pre-commit request.
- Once `commit` is sent, the operation reaches its point of no return. Disable Cancel and root-switch
  commands for that workspace until `commit -> local apply -> finalize` or compensation settles.
  Keep every affected WDS path reservation and Editor mutation lease for that entire interval, so
  typing/paste/undo/programmatic edits cannot make an exact receipt non-reversible while finalize
  is in flight. An HTTP abort cannot be treated as cancellation; query idempotent transaction
  status. A recovery-required buffer stays leased/read-only until recovery succeeds or the user
  explicitly acknowledges journal discard while that root remains mounted. Acknowledgement releases
  the transaction lease but does not make uncertain live documents editable; it moves them to the
  recovery-conflict state defined below. Root disposal releases only client locks and leaves the
  partial journal for later discovery.
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
   operation graph, stages text after-images/backups, and reserves resource staging names/intents.
   It does not move or copy a resource source/destination. It writes and fsyncs the durable journal
   and returns `prepared` without changing any visible path or resource inode/link relationship.
4. Client acquires all WDS/Editor locks, then revalidates live/absent stamps under those locks.
   Drift releases the locks, calls `abort`, and applies nothing.
5. Under the same lease, server `commit` revalidates the entire expected set immediately before the
   first visible leg. For each leg it durably records and fsyncs the inverse intent before mutation,
   applies the leg, then durably marks it complete. Failure compensates completed or indeterminate
   intents in reverse order. It returns `rolled-back` only after exact restoration, or `partial`
   with exact unrecovered relative paths.
6. After a successful provisional disk commit, Platform verifies every lock/stamp remains exact,
   then synchronously commits all live Editor transactions, WDS path effects, and exact file/tree/
   git query projections as one provisional local batch, retaining guarded projection receipts. It
   performs no async yield between ordered local legs. Unexpected drift/local failure reverses
   committed Editor/projection receipts, then
   calls the distinct server `rollback` transition. `rollback` is valid only for a
   committed-but-unfinalized direction; it is not pre-commit `abort` or user `undo`.
7. Only after the complete local projection in step 6 does Platform call `finalize`. The server
   durably advances the provisional direction and then publishes one semantic watcher group. Every
   event carries `origin: 'workspace-edit'` and `writeId: operationId`; because local projection
   preceded the request, an event racing the finalize response observes the already-consistent
   group and is only an idempotent invalidation hint. After status proves finalize, Platform
   seals every provisional Editor receipt and only then exposes the undo group/applied result. If
   finalize journal persistence fails, the client rolls back; if only the HTTP response is lost, it
   queries status, resends the same transition ID only when status remains at its prior provisional
   generation, and follows the durable result. Event delivery is a no-throw queue/invalidation hint
   and cannot reverse finalized state.
8. Undo and redo use the same boundary: server `undo`/`redo` first reaches a provisional
   `undo-committed`/`redo-committed` state, Platform applies guarded live/path receipts, and
   `finalize` advances to `undone`/`redone`. Local failure invokes `rollback` to the prior stable
   state. No history pointer moves until finalize succeeds.
9. `commit`, `finalize`, `rollback`, `status`, `abort`, `undo`, `redo`, `recover`, and `release`
   obey the operation/transition/generation idempotency contract. `operationId` is the only
   transaction identifier used by client, server, events, logs, and undo groups.

A fully compensated failure changes no visible state and creates no undo entry. A `partial` result
creates no undo/redo entry, marks affected live documents conflicted/recovery-required, invalidates
and re-reads exact file/tree/git queries, writes one wide structured event, and shows a persistent
recovery surface naming relative paths. Never claim success or auto-retry destructive legs.

Every `partial` journal records its exact `recoveryTarget` (`rolled-back`, `finalized`, `undone`, or
`redone`) and remaining inverse intents. `recover` retries only those intents under fresh guards;
success reaches that target and permits ordinary `release`, while another inverse failure remains
`partial` with a new generation and exact paths. The recovery UI also offers a separately confirmed
“Discard recovery data” action only after exact paths have been re-read. It calls `release` with
`acknowledgePartial: { generation, unrecoveredPaths }`; the server requires an exact match, records
one destructive audit event, deletes staging, releases leases, and transitions to `released`.
Never TTL-delete `partial` data or treat dismissal as acknowledgement.

`unrecoveredPaths` is a canonical, sorted, duplicate-free relative-path set in the response,
confirmation, and acknowledgement; byte-for-byte set mismatch rejects release. After successful
recovery, Platform re-reads every affected path, reconciles WDS/file/tree/git state to the recorded
target, clears recovery conflict, and restores each mounted buffer's prior configured editability.
After acknowledged discard, Platform again re-reads exact paths but must not guess which side of a
partial rename/delete/overwrite owns a live document. Preserve each affected buffer's unsaved text,
tabs, and views; mark it `recovery-conflict`; invalidate/remove its file-sync base; and keep it
read-only with Save, Save All, and intersecting resource operations disabled until the user resolves
the conflict or explicitly closes/reopens/reloads it. Unaffected leased buffers unlock normally.
Discard deletes rollback data only: it never fabricates a clean sync version, remaps a document,
or restores configured editability for an affected conflict.

For guarded text writes, “restored” means path existence/type, bytes, POSIX mode, recorded mtime,
and resulting Platform file version match the before-state; successful writes preserve the prior
mode while naturally receiving a new mtime/version. Inode, ctime, ACL, and extended-attribute
identity are not part of the current text-write API and must not be claimed in UI/logs. If product
requires those metadata to be crash-restored too, STOP and widen the filesystem contract first.

This is live-process transactional compensation with a durable recovery journal, not a claim of
crash-atomic mutation across arbitrary filesystems. On restart, `prepared` journals abort,
forward/undo/redo provisional journals replay idempotent inverse intents to their prior stable
state, `partial` journals remain for operator recovery, and finalized/undone/redone journals are
released because no browser undo group survives the new `serverEpoch`. Recovery completes before
accepting another mutation. If product scope changes to require power-loss atomicity across mount
points, STOP — this design is not that guarantee.

### Cross-file undo/redo policy

- Native Editor undo owns only a text-only edit affecting exactly one already-live buffer with zero
  persistence or resource legs. It commits with `history: 'record'`.
- Every other edit — including one unopened-file write, multiple live buffers with no server leg,
  or any resource operation — commits live buffers with `external-barrier` and creates one Platform
  group. A multi-live-buffer-only group stores no server operation ID; its guarded Editor receipts
  are sealed after the WDS batch and still undo/redo as one Platform command. Native `Mod+Z` has no
  per-buffer leg to expose.
- The sole command table gains keyless `workspace.undoWorkspaceEdit` and
  `workspace.redoWorkspaceEdit` rows with `undoCategory: 'workspace-operation'`. A success toast may
  invoke the same command; do not add a second handler.
- Maintain one ephemeral LIFO stack per workspace, capped by
  `MAX_WORKSPACE_EDIT_UNDO_GROUPS = 20`. A group stores Editor receipts, optional server
  `{ operationId, serverEpoch }`, before/after document and file stamps, and projection receipts.
  Each WDS receipt contains exact before/after path ownership, `dirtyFilePaths`, file version/mtime
  sync metadata, tab/view ownership, conflict state, and local/content revisions as **guards**.
  Undo/redo restores the selected direction's text/path/dirty/sync/view values instead of merely
  toggling dirty or recomputing them from current disk, but core/local/content revision counters
  always advance to fresh monotonic stamps; never reset or reuse a recorded revision. The stack is
  never persisted and never crosses a root switch/reload.
- Undo/redo first verify every buffer revision/snapshot, every disk generation, current path graph,
  server epoch, and stack position. Drift in the top group refuses it before mutation and clears/
  releases that group and every older group whose affected path/document set intersects it; older
  disjoint groups remain, but LIFO exposes them only after invalidated entries are removed. An
  ordinary edit/save/resource mutation invalidates intersecting groups and their newer dependent
  groups immediately. No partial inverse is attempted.
- Undo/redo reacquire all WDS path reservations and Editor mutation leases before the provisional
  server transition, and use the same server journal and WDS batch/compensation path. A new forward
  edit after undo—ordinary or WorkspaceEdit, on any path in that workspace—clears/releases the
  entire redo stack. On the twenty-first group, release the oldest before exposing the
  new group; a failed release is retained as cleanup-pending but is no longer undoable and is
  retried on status/root disposal. Every invalidation/eviction/disposal also calls Editor's guarded
  receipt release so history barriers do not retain hidden snapshots. Root switch/reload releases
  every reachable non-partial stable journal; it only releases client locks/receipts for partial
  state, leaving durable recovery data discoverable on return. Abrupt browser loss is bounded by
  the server lease; restart cleanup releases orphan journals in the stable set
  `{ finalized, undone, redone }`, and the 24-hour stable journal TTL bounds an orphan in that set
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

Prepare carries `operationId`, immutable body digest, `origin: 'workspace-edit'`, canonical
workspace path, and ordered operations. Transition bodies carry `operationId`, unique
`transitionId`, and `expectedGeneration`; `recover` also carries the expected recovery target.
`release` accepts `acknowledgePartial` only in the exact partial-discard shape defined above. Result
states are `preparing | prepared | committed | finalized | aborted | rolled-back | undo-committed |
undone | redo-committed | redone | partial | released` and include `serverEpoch`, generation,
ordered affected/rolled-back/unrecovered relative paths, recovery target when partial, event
publication state, and resulting entries/versions. Never put file contents or absolute paths in
logs/errors.
Every status response, including a structured not-found/released result, carries `serverEpoch` so
the client can distinguish eviction from process restart without guessing.

## Implementation scope

The executor may adjust a path when the landed command runtime or plan 061 moved the same responsibility, but must preserve
the feature/kind layout and ownership above. Reconcile before creating a near-duplicate.

### Editor worktree

- Core transaction API:
  - `packages/editor/src/documentSession.ts`
  - `packages/editor/src/history.ts`
  - `packages/editor/src/pieceTable/lineEndings.ts` and `pieceTable/documentText.ts`
  - `packages/editor/src/editor/editChain.ts`
  - `packages/editor/src/editor/Editor.ts`
  - `packages/editor/src/editor/documentController.ts` if attachment cleanup belongs there
  - `packages/editor/src/tokens.ts` only if readonly fields need correction
  - `packages/editor/src/plugins.ts` for the readonly composed-delta accessor type
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
  - update `plugin.ts`, `codeActions.ts`, `documentSync.ts`, `lane.ts`, `lspConnectionPool.ts`,
    `renameWidget.ts`, `serverSet.ts`, `types.ts`, `pluginTypes.ts`, `index.ts`
  - remove WorkspaceEdit use of `formatting.ts`; keep formatter-specific behavior/tests
  - add the `./workspace-edit` export in `packages/lsp-plugin/package.json`
  - update `workspaceEdit.test.ts`, `plugin.test.ts`, `codeActions.test.ts`,
    `documentSync.test.ts`, `lane.test.ts`, `lspConnectionPool.test.ts`,
    `narrowFactoryPlumbing.test.ts`, and add `public-api.test.ts`
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
    `apps/server/src/app.ts`/`home.ts` only for the transaction contract, fatal text-read boundary,
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
    them at the existing Editor provider boundary after reconciling current providers
  - add pure URI/path/risk helpers under `features/editor/utils/`, not `lib/`, unless a second
    outside feature consumes them in the same change
  - add `components/workspace-edit-preview-dialog.tsx` and a separate recovery component only if
    the persistent recovery state needs distinct rendering
- Host/persistence wiring:
  - update `utils/language-server-plugin.ts`, `hooks/use-lsp-plugin.ts`,
    `hooks/use-diff-language.ts`, `state/diff-language-session.ts`,
    `state/language-server-connection-pool.ts`, `tests/language-server-plugin.test.ts`, and
    `hooks/tests/use-diff-language.test.tsx`, `state/tests/diff-language-session.test.ts`
  - pass the invariant callback; Editor alone composes its conditional WorkspaceEdit capability
    without overwriting semantic-token/host capabilities
  - update `apps/web/src/lib/file-server.ts` with abortable prepare/commit/finalize/status/abort/
    rollback/undo/redo/recover/release clients and transition generation fields; update
    `apps/web/src/lib/client-error-taxonomy.ts` for `INVALID_TEXT_FILE`
  - update exact file/tree/git query projections and `features/workspace/hooks/use-events.ts`
  - thread `workspaceEditJournalRoot`, injectable transaction filesystem driver, clock, and watch
    option through `FileSystemServiceOptions`, `AppOptions`, `apps/web/test/server.ts`, and its
    callers; failure selection is constructor-injected and never request-controlled
- Consolidation and commands:
  - register `workspace.undoWorkspaceEdit`/`workspace.redoWorkspaceEdit` through the one
    `platformCommands` table and CommandBus
  - route search replace through `WorkspaceEditService`; delete its current per-file partial-success
    persistence loop and update its tests
  - do not put a store, subscription, or mutable transaction registry in `utils/`

## Milestone 0 — Reconcile dependencies and freeze contracts

1. Confirm the sole typed command/focus runtime and landed settings regression gate remain green. Confirm
   root `PLAN.md` explicitly schedules this plan. If not, STOP; do not build a temporary
   command/focus/undo path.
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

Expected before edits: the first command proves the landed registry is present but the two new
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
- `acquires a mutation lease only for the exact revision and snapshot and reports busy for another owner`
- `blocks keyboard paste drop undo redo and ordinary programmatic text mutations while leased`
- `allows only a prepared commit and reciprocal reverse carrying the matching lease`
- `marks every mounted view non-editable until the lease is released`
- `publishes one non-text lease state event on acquire and release to every mounted view`
- `rotates a shared document sync segment under lease without changing text revision dirty or history`
- `preserves distinct selections in two mounted views across external commit and rollback`
- `carries a positive logical revision count on the transaction change and receipt`
- `commits effective steps with net-identical text as one logical-only synchronize change with no dirty history selection or receipt`
- `commits two resource-delimited segments with one barrier and one cumulative reciprocal receipt`
- `reverses every committed sequence segment when a later resource boundary fails`
- `rejects skipped repeated or stale sequence segment commits without mutation`
- `reverses sequence segments only in descending order and completes with one reciprocal receipt`
- `advances forward replay by K while compensation undo and redo each advance by one`
- `keeps invalid and overlapping preparation atomic`
- `accepts readonly edit fixtures without ownership copies`
- `classifies consistent LF CRLF and BOM as round-trip safe and mixed lone-CR unusual terminators as unsafe`
- `serializes a prepared snapshot with its original consistent line ending and BOM`
- `exports exact safe and unsafe round-trip discriminants and reason codes`

Extend `editor.test.ts` to prove two mounted views observe one external commit and rollback exactly
once, preserve distinct selections/scroll, and still avoid double-applying an ordinary source-view
edit. Extend `editChain.test.ts` to prove a workspace transition count composes with later ordinary
edits, full-sync fallback retains the count, and querying the current `DocumentSyncPoint` returns
empty edits/count zero with the same point. Extend
`public-api.test.ts` to prove the types/functions—including a named
`DocumentLogicalRevisionScope` import—are exported from both root and `@singapor/core/document`.

Run before moving on:

```bash
cd /Users/shaul/Desktop/D/Editor/packages/editor
bun run test -- test/documentSession.test.ts test/editChain.test.ts test/editor.test.ts
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
- `binds validated segments to the exact buffer revision and snapshot as one prepared sequence`
- `rejects a stale target buffer guard without returning validated-but-unbound edits`
- `rejects negative fractional missing-line and past-line positions`
- `rejects reversed ranges overlapping ranges and coincident inserts`
- `accepts unsorted adjacent edits against one snapshot`
- `checks a non-null LSP version before range preparation`
- `rejects an unmapped version instead of treating it as unversioned`
- `accepts repeated effective same-target versions N then N-plus-one and advances once per operation`
- `rejects repeated same-target versions N then N or N-plus-two when the first step is effective`
- `retains empty and same-text steps as no-ops without version advancement and returns a null all-no-op transaction`
- `retains effective steps that restore initial text and returns a non-null logical transaction`
- `rejects a non-null post-rename URI without exact lane provenance`
- `preserves annotation ids in prepared edits`
- `preserves parser CRLF then reports normalized effective text and surrogate snapping`
- `applies repeated document operations sequentially while preserving operation order`
- `prepares edit-old rename-boundary edit-new as two commit-ready segments with one version continuation`

Use a `DocumentTextSnapshot` wrapper over a real piece-table snapshot whose
`materializeFullText()` throws for the non-materialization case; its range/chunk methods remain
usable. Do not weaken existing `formatting.test.ts`; it continues to characterize formatter
behavior only.

Add exact `packages/lsp/test/workspace.test.ts` coverage
`advances one didChange version by the supplied positive logical revision count`,
`rejects a negative fractional or zero count for a changed snapshot`, and
`adopts a duplicate source tuple with zero count despite a distinct line-start view without another
didChange`. Add `packages/lsp-plugin/test/documentSync.test.ts` coverage
`publishes one atomic workspace edit change at the simulated final LSP version`,
`composes a workspace logical count with later ordinary edits during deferred sync`, and
`two mounted observers with distinct line-start views synchronize one shared buffer change once`.
Also cover `falls back to full sync without losing the logical revision delta`,
`emits one full same-text didChange for a net-identical effective replay`, and
`a non-originating lane advances once for changed final text and not at all for logical-only text`.
Add `adopts a new unchanged source point without didChange and rejects a mismatched snapshot` to
the workspace tests, and
`a non-origin logical-only change adopts its point so the next ordinary edit advances once` to
`documentSync.test.ts`.
Also add exact workspace/plugin cases `cold open preserves the caller text snapshot identity before
any edit`, `a final close and reattach rotates the workspace sync segment`, `a URI transition
rotates the segment and closes old before opening new`, `full-sync fallback keeps the source segment
and logical count`, and `two mounted attachments adopt one duplicate source revision`. The cold-open
case performs rename preparation immediately and proves the lane guard snapshot is the exact WDS/
Editor buffer snapshot, not a materialized string snapshot.

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
  - `passes anchor currentName and the operation signal to the host and built-in rename prompt`
  - `does not mount an already-aborted built-in rename prompt`
  - `aborts closes and settles a mounted prompt exactly once`
  - `does not dispatch after prompt cancel request cancel or active-document drift`
  - `aborts and closes a pending rename prompt on a newer rename or disposal`
  - `reports malformed producer output without invoking the host`
  - `treats host cancellation as a non-error`
  - `preserves rolled-back and recovery-required host settlements without reporting applied`
  - `never reports a post-commit settlement as cancelled`
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
- `lane.test.ts`
  - `direct lane and server-set lane acquisition compose the same exact WorkspaceEdit capability block`
  - `direct lane and server-set options accept only the same host callback and Editor composes capabilities`

Verification:

```bash
cd /Users/shaul/Desktop/D/Editor/packages/lsp
bun run test
bun run typecheck
bun run build

cd /Users/shaul/Desktop/D/Editor/packages/lsp-plugin
bun run test -- test/workspaceEdit.test.ts test/workspaceTextEdits.test.ts \
  test/plugin.test.ts test/codeActions.test.ts test/lane.test.ts test/lspConnectionPool.test.ts \
  test/narrowFactoryPlumbing.test.ts
bun run typecheck
bun run build
```

## Milestone 4 — Freeze and build the Editor producer boundary

Before Platform imports the new API:

```bash
cd /Users/shaul/Desktop/D/Editor
bun run typecheck
bun run lint
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
- `converts a readonly two-target FileTextChanges batch completely in first-seen order`
  - A is `export const value = 1\n`, open at version 7, with span `{ start: 13, length: 5 }`;
    unopened B is `console.log(value)\n`, with span `{ start: 12, length: 5 }`; both replace with
    `nextValue`;
  - declare input `as const satisfies readonly ts.FileTextChanges[]`, including readonly nested
    changes, and call the producer helper directly;
  - assert exact A/B `documentChanges` order, A version 7/range 0:13–0:18, B null/range
    0:12–0:17, exact new text, and unchanged fixture files. Do not claim output preserves input
    container identity—the transform allocates protocol output; the compile-time readonly fixture
    and absence of compatibility copies are the contract.
- `wires a real spelling diagnostic code action through the complete producer`
  - fixture `src/index.ts` is exactly `const count = 1\nconsole.log(cout)\n`, open at version 9;
    wait for published diagnostic 2552 at 1:12–1:16 and pass that same diagnostic in the request;
  - assert exact title `Change spelling to 'count'`, kind `quickfix`, structurally equal diagnostic,
    and one `documentChanges` entry at version 9/range 1:12–1:16/new text `count`; disk is unchanged.
    If pinned
    TypeScript no longer produces diagnostic 2552 plus that fix for this fixture, STOP and pin a
    newly observed deterministic fixture; do not fabricate a two-file language-service result.
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

Replace each shared document's owner set with
`Map<LspProxyConnection, OwnerDocumentState>`, where owner state is
`{ clientVersion, text, contentEpoch, lastSyncEpoch, synchronizedBackendVersion }` and the shared
document has a monotonic `syncEpoch`. `didOpen`/`didChange` versions are safe integers. An owner
opening identical text adopts the current sync/backend stamps without a backend message; a
divergent open sends one full replacement at the next backend version and synchronizes only that
owner.

Pass the originating connection into `handleDidChange`. Require
`incomingClientVersion > owner.clientVersion`, compute positive safe-integer
`logicalDelta = incomingClientVersion - owner.clientVersion`, and require
`backendVersion + logicalDelta` to remain safe. Strictly apply the complete content-change list to
the sender's own `text`, never the current shared-backend text. Invalid/non-monotonic input changes
no owner/shared state, sends nothing, and closes/releases only that owner so reconnect performs a
full `didOpen`. If the owner's prior text/sync/backend stamps match the current shared state,
forward the validated original changes; otherwise forward exactly one full replacement with the
new owner text. Both use backend version `B + logicalDelta`, so a collapsed WorkspaceEdit change
from `C` to `C + K` advances `B` to `B + K`, not `B + 1`. Then atomically update shared text/version,
increment shared `syncEpoch` and sender `contentEpoch`, synchronize the sender, and leave every
other owner's old sync stamp stale. Even accepted same-text `didChange` advances by the browser's
positive delta.

Before writing the first initialize request to the backend, normalize it through the existing proxy
root/workspace/process/initialization-options rewrite and retain an immutable deep-comparison value
of the complete normalized `params`; exclude only the request ID. Every concurrent/later initialize
is normalized and structurally compared with object key order ignored. Equal requests share the
in-flight promise or cached response and are forwarded only once. A mismatch while pending or
settled receives JSON-RPC `-32602` with its original client ID and message
`Initialize params do not match the pooled backend contract`; close/release only that owner and do
not forward, replace the retained contract, or disturb the backend/other owners. Clear the retained
contract only if normalization/spawn/write fails before a backend initialize exists. Do not hash
for correctness or log params/capabilities. Browser keys—including `diff:<sessionId>`—do not add a
server pool-key dimension.

At each pending rename/code-action/codeAction-resolve request, capture an immutable request-wide
snapshot of **all** shared-document backend and requesting-owner states; response targets are not
knowable in advance. On the matching response, traverse only WorkspaceEdits in that method's
result:

- `null` stays `null` and no numeric version is invented;
- for each URI, let captured synchronized versions be backend `B` and requesting-browser `C`.
  Translate every non-null server version `V` affinely to `C + (V - B)` after proving `V`, the
  delta, and the mapped result are safe non-negative integers. Reject underflow/overflow, but do not
  decide edit effectiveness in the proxy. Thus `B, B+1` maps to `C, C+1`, while `B, B` maps to
  `C, C` and Editor's strict replay decides whether the first operation was an effective change or
  a no-op;
- mapping is valid only while the requesting owner's captured/current client version, exact text,
  content epoch, shared/owner sync epoch, and synchronized backend version still match the
  request-wide capture;
- a target absent from the capture, a changed/unknown/other-owner version, or divergent owner text
  before/during the request rejects the whole result with the existing `-32801 ContentModified`
  response and the original client request ID;
- repeated `TextDocumentEdit`s are translated independently by the affine rule and are never
  rejected merely because their versions differ;
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
- `applies divergent owner incremental ranges to owner text then forwards one safe full replacement`
- `never applies a stale owner incremental range to another owner's backend text`
- `closes a non-monotonic or invalid-range owner without backend mutation`
- `preserves a positive multi-step client version delta in one collapsed backend didChange`
- `maps skipped and nonzero browser versions without equating them to backend counters`
- `maps repeated backend B then B-plus-one to browser C then C-plus-one`
- `preserves repeated backend B then B for Editor no-op or mismatch validation`
- `preserves null and maps the following numeric version by backend delta not array position`
- `rejects affine version underflow and overflow without rewriting the response`
- `maps codeAction resolve and every WorkspaceEdit in a multi-action response`
- `preserves legacy changes as unversioned`
- `normal-first and diff-first owners negotiate the same backend capability fingerprint`
- `replays one initialize for equal normalized params while pending and after settlement`
- `accepts equal initialize params with different object key order`
- `rejects a capability mismatch while first initialize is pending without forwarding it`
- `rejects later initializationOptions mismatch with original client ID and closes only that owner`
- `preserves an existing server error and clears provenance on every terminal path`
- `does not rewrite unrelated numeric fields`
- `keeps cancellation routed to the original backend request`
- `after a two-step edit forwards one collapsed didChange at backend B-plus-two and maps the next response to browser C-plus-two`
- `rejects backend workspace/applyEdit with -32601 and its backend request ID without forwarding a
request ID or invoking a browser host callback`

The divergent-owner regression uses exact state: A opens `abc\n` at client 40/backend 40; B opens
`axbc\n` at client 7 and causes a full replacement at backend 41; A then inserts `X` at character 1
with client version 43. The proxy must apply the range to A's `abc\n`, forward full `aXbc\n`—never
corrupt `aXxbc\n`—at backend 44, map response version 44 only to A version 43, and treat B's prior
sync stamp as stale. Every initialize mismatch test also asserts exactly one backend initialize and
proves the first owner can still complete a hover request.

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
- `POST /recover`
- `POST /release`
- `GET /recovery?workspace=...`

`prepare` is keyed by immutable `operationId` plus a canonical body digest. Before its first await,
the server registers an epoch-scoped in-flight slot; status may return `preparing` at generation
zero. `abort` uses its own non-aborted control request: it marks an in-flight slot, waits for
cleanup, and returns `aborted` only after staging/lease removal. If abort wins before registration,
generation-zero abort installs a cancellation tombstone so a later matching prepare returns
`aborted` without staging. Prepare checks cancellation after every stage and before publishing
`prepared`; a late handler cannot resurrect an aborted operation. Every later mutation uses
`{ operationId, transitionId, expectedGeneration }`; `status` uses `operationId`. A repeated
transition ID returns the cached result, while a new transition advances exactly one valid state.
`prepare` with a reused operation ID returns the same request/result or rejects a body mismatch; it
never creates a second journal.
Keep route schemas in `fs/contracts.ts` and semantic shared models in the contracts package. Do not
create a second hand-maintained client response type in `file-server.ts`.

The only valid durable transitions are:

```text
preparing -> prepared | aborted
prepared -> committed -> finalized
prepared -> aborted
committed -> rolled-back
finalized | redone -> undo-committed -> undone
undo-committed -> finalized | redone        (rollback)
undone -> redo-committed -> redone
redo-committed -> undone                    (rollback)
finalized | undone | redone | rolled-back | aborted -> released
any compensating transition -> partial      (only when its inverse cannot complete)
partial -> recoveryTarget                    (successful explicit recover)
partial -> partial                           (failed explicit recover; generation advances)
partial -> released                          (exact-path acknowledged discard; no path mutation)
```

`finalize` knows the pending direction and cannot skip a provisional state. `undo`/`redo` are valid
only from the shown stable state. `recover` reacquires the workspace lease, preflights all remaining
inverse guards, and retries only the stored compensation program; it never replays a forward/undo/
redo leg. Entering `partial` releases the active lease, so intervening drift makes later recovery
stale before mutation. `recovery` lists root-scoped partial summaries after browser/server restart
without contents, absolute paths, or staging names. Status/list never advances state. An invalid
expected generation/state returns stale without mutation.

Add structured catalog entries in `fs/errors.ts`: `WORKSPACE_EDIT_INVALID`,
`WORKSPACE_EDIT_STALE`, `WORKSPACE_EDIT_BUSY`, `WORKSPACE_EDIT_NOT_FOUND`,
`WORKSPACE_EDIT_DEVICE_UNSUPPORTED`, `WORKSPACE_EDIT_QUOTA`, and `WORKSPACE_EDIT_PARTIAL`.
Production code uses the existing `FsError`/structured observability path; never `new Error`.

Tighten the existing `/fs/read` boundary in `fs/read.ts`; do not add a WorkspaceEdit-only second
read route. Read bytes after the size guard, decode with
`new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })` so a leading U+FEFF reaches Editor's
round-trip policy, and reject malformed UTF-8 or a NUL byte with a new structured
`INVALID_TEXT_FILE` (`415`) code.
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
`WORKSPACE_EDIT_STABLE_TTL_MS = 24 * 60 * 60 * 1000`. Define the stable retention set once as
`{ finalized, undone, redone }`; startup cleanup and prepare TTL reaping use that exact set. Prepare
counts staged bytes before allocation and rejects over quota without mutation. Undo/redo
refreshes a stable journal's last-touched time. `partial` recovery data is never TTL-deleted; it
blocks new allocation at quota until explicitly recovered/released and is discoverable by canonical
workspace after reload. A cancellation tombstone remains for the current server epoch while its
matching prepare may still arrive; restart invalidates old requests through `serverEpoch`. Thus
abrupt browser loss is bounded without making a correctness claim from a timer; an expired client
group discovers `released`/epoch drift and invalidates itself.

Before supporting any rename/delete/overwrite resource leg, compare the journal root's real
`stat.dev` with the source and destination's nearest existing parent/device. A mismatch returns
`WORKSPACE_EDIT_DEVICE_UNSUPPORTED` before staging. Text-only writes retain their byte backups in
the journal but commit through `writeTextFile`'s guarded sibling-temp replacement, so they do not
require journal/target device equality.

Add one canonical-workspace mutation lease in `FileSystemService`. Prepare acquires it after
confirmation; every existing write/create/create-folder/copy/rename/delete endpoint and every
transaction commit/rollback/undo/redo/recover must enter the same lease for each affected path.
Canonical workspace scopes that overlap by ancestor/descendant conflict; disjoint workspaces may
proceed.
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
5. materialize text after-images/byte backups, but for resource delete/rename/create-overwrite only
   reserve unique **absent** same-device staging names plus stat/device guards and inverse
   descriptors; do not rename, link, copy, unlink, chmod, or change source/destination inode/link
   metadata during prepare;
6. persist journal state before returning `prepared`.

Commit takes the shared mutation lease and revalidates the whole target set before leg zero. It
walks the prepared operation list in order. Before each visible mutation, append/fsync an inverse
intent containing exact before/after guards; after mutation append/fsync its completion marker.
Crash recovery treats an intent without a completion marker as indeterminate, checks the guards,
and idempotently restores the before-state. Failure walks inverse intents in reverse order. Rename
overwrite moves the destination into its reserved same-device slot only after that subleg's inverse
intent is fsynced, marks the move complete, then moves the source; it never calls the current
delete-first helper. Abort of `prepared` deletes only manifest/text stages/reservations because all
reserved resource slots remain absent.

Journal state replacement uses same-directory temp write -> file fsync -> rename -> directory
fsync; append records fsync before its associated visible mutation. If a supported production
filesystem cannot provide the required durable primitives, resource transactions on it are a STOP,
not a reason to weaken the journal silently.

`FileChangeHub` supplies a transaction barrier keyed by operation ID and exact canonical affected
paths. It queues matching native events during forward/rollback/undo/redo/recover while unrelated
external events pass immediately. Rollback drops restored duplicates, partial recovery publishes exact
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
- `prepare reserves absent resource slots without moving copying or linking source or destination`
- `fsyncs inverse intent before the first resource move into a reserved slot`
- `aborting a prepared resource transaction removes metadata only`
- `reserved journal paths never appear in tree search index or watch`
- `abort removes staging and is idempotent`
- `abort before prepare prevents the later prepare from staging`
- `abort waits for an in-flight prepare and leaves no journal lease watcher or visible effect`
- `late prepare completion cannot resurrect an aborted operation`
- `commits and finalizes two guarded writes in order`
- `rejects last-target drift after prepare at whole-set commit revalidation before mutation`
- `reverses the first write when the second commit leg fails`
- `preserves mode on commit and restores bytes mode mtime and version on text rollback`
- `restores an overwrite destination when source rename fails`
- `reports exact unrecovered relative paths when compensation fails`
- `recovers only remaining inverse intents from partial to its recorded stable target`
- `a failed recovery remains partial with a new generation and exact paths`
- `release rejects partial without the current exact-path acknowledgement`
- `acknowledged partial release changes no workspace path and unblocks quota`
- `lists partial recovery summaries after restart without exposing contents or staging paths`
- `commits create then write in protocol order`
- `commits rename then edit at the new path`
- `commits edit then rename using the edited source`
- `supports ignored create rename and delete as explicit no-ops`
- `treats identical rename as no-op and rejects a case or URI alias`
- `moves a regular-file delete into the journal and restores it on undo`
- `rejects directory operations symlinks reserved paths outside-root and cross-device resources`
- `executes A-to-B overwrite then B-to-A with exact sequential final graph and reversible backup`
- `executes an explicit A-to-temp B-to-A temp-to-B swap without inventing cycle semantics`
- `commit finalize rollback status abort undo redo recover and release honor transition generations`
- `a new undo after redo is not mistaken for a retried undo`
- `undo and redo reject after-version drift before mutation`
- `queues matching native commit events until one ordered finalize group`
- `drops restored watcher events on rollback and publishes exact paths on partial recovery`
- `barriers watcher events through provisional undo and redo while unrelated events pass`
- `a missing file with an expected base version conflicts instead of being recreated`
- `recovers a crash between visible mutation and completion-marker fsync from inverse intent`
- `startup aborts prepared rolls back each provisional direction preserves partial and releases orphan stable journals`
- `startup releases an orphan redone journal with the same stable-state policy`
- `startup recovery completes before watch and emits no user transaction event`
- `serializes a transaction against legacy write and tree rename in the same workspace`
- `serializes two overlapping transaction commits and allows disjoint workspace commits`
- `expires an abandoned prepared lease without interrupting a running transition`
- `rejects one-operation and aggregate journal quota before allocation`
- `reaps expired stable journals but retains partial recovery data`
- `reaps an expired redone journal through the shared stable retention set`

The resource-prepare assertion snapshots source/destination path, bytes, inode, link count, mode,
mtime, and watcher output before `/prepare`; all remain identical and every reserved resource slot
is absent. The cancellation tests pause the injected real filesystem driver inside `/prepare`, send
`/abort` over a separate non-aborted request, resume prepare, and assert both requests settle to one
durable `aborted` operation with no lease/stage residue.

Extend `apps/server/src/tests/app.test.ts` with exact `/fs/read` cases:

- `returns byte size mtime decoded content and content version for valid UTF-8`
- `preserves one leading UTF-8 BOM as U+FEFF in decoded content and content version`
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
  once. WDS owns one buffer subscription per live document; delete the old per-mounted-view
  metadata-recording path rather than keeping two writers.
- Accept `kind: 'synchronize'` by recording its fresh core revision as `localRevision` only. The
  identical text snapshot does not advance `contentRevision`, change `dirtyFilePaths`/sync metadata,
  or create a history entry.
- Defer Zustand publication while a workspace batch is committing/rolling back. Run every
  prevalidated buffer commit, ordered path projection, and compensation in one synchronous call
  stack with the workspace gate busy, then publish one final WDS state. Mounted views still receive
  their one synchronous same-buffer event in protocol order; listeners may observe an intermediate
  buffer, but no queued task/browser paint or React/WDS subscriber runs before the group completes.
- Compensation restores exact text/path/tab/view/dirty/sync state, not revision identities. Editor
  reversal creates a fresh core revision; WDS records that as the new `localRevision`, advances
  `contentRevision` once, and never resets/reuses a counter. Set `dirtyFilePaths` from the emitted
  buffer `isDirty()`, restore the receipt side's sync path/kind/fileVersion/mtime/state, never call
  `markClean()`, and never adopt server versions for an open buffer. Store fresh reciprocal stamps
  after forward, compensation, undo, and redo.
- Batch rename is collision-aware and preserves the same buffer/view objects, dirty state, sync
  metadata, scroll state, and exact-path UI references. Do not copy readonly collections to call a
  mutable helper; correct helper contracts.
- Prepare clean open delete/path changes as projection receipts before server commit. Commit the
  already-prepared projection synchronously; rollback uses the receipt.
- Remove any obsolete manual record path made redundant in the same pass. Do not keep both a new
  service subscription and the old component/store write as parallel truth.

Exact WDS/store tests:

- `records one dirty revision for one buffer transaction observed by two views`
- `records a logical synchronize revision without changing content dirty sync or history state`
- `commits two buffers synchronously with ordered one-per-buffer view events and one final WDS publication`
- `rolls back a multi-buffer group with ordered view events and one restored WDS publication`
- `rolls back the first live buffer when the second guarded commit is stale with fresh revisions`
- `compensation restores clean text dirty membership and sync metadata while revisions advance`
- `workspace undo returns an originally clean buffer to clean without changing file version or mtime`
- `workspace undo restores an originally dirty buffer to exact unsaved text and dirty sync base`
- `redo reapplies dirty state with fresh reciprocal stamps`
- `rename undo restores sync path tab bindings views and dirty membership`
- `preserves a dirty buffer and views across exact-file rename`
- `edits then renames an open dirty buffer while destination disk keeps prior saved bytes`
- `commits edit-old rename edit-new with two mounted views in exact wire order and one barrier`
- `rolls back the reciprocal URI transition and every committed text segment after local failure`
- `rolls back edit-old rename edit-new in exact didChange-new close-new open-old didChange-old order`
- `rejects a rename collision before changing either document`
- `prepares and commits a clean open delete then restores it from a receipt`
- `rejects directory and symlink path effects without changing documents`
- `does not put a grouped workspace edit on either buffer undo stack`
- `acquires path reservations all-or-none in canonical order and unwinds a partial busy set`
- `blocks another owner from open close and remap while the same-owner projection succeeds`
- `advances path ownership revision once per successful gain loss or remap and never for reservation lifecycle`
- `releases every reservation on applied cancelled stale failed rolled-back recovery and root-disposal paths`

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
mutation methods wrap prepare/commit/finalize/status/abort/rollback/undo/redo/recover/release and
root-scoped recovery discovery with fresh transition IDs/generations, query status after response
loss, reconcile returned file versions, and classify own events by operation/write ID. Keep
ordinary `save(document)` behavior and tests; it
remains one-file user save and enters the same workspace mutation gate.

Exact `file-sync-service.test.ts` additions:

- `prepares an ordered workspace mutation with exact expected versions`
- `reads an abortable unopened text snapshot with exact size text version and mtime`
- `rejects oversized NUL-bearing malformed-UTF8 and cancelled unopened reads without a live document`
- `rejects Editor-unsafe mixed lone-CR and unusual-terminator snapshots before transient mutation`
- `round-trips unopened LF CRLF and BOM policy through pieceTableDocumentText`
- `aborts a prepared mutation on live revalidation failure`
- `recovers a lost commit response through status without retrying the mutation`
- `rolls back committed provisional state after local failure`
- `cancels a paused prepare through a separate control signal and ignores its late response`
- `recovers a lost abort response through status`
- `uses new transition IDs and expected generations across undo redo and retry`
- `projects provisional result versions before finalize and exposes applied only after finalize`
- `restores provisional projections before rollback when finalize fails`
- `a lost finalize response does not apply returned entries twice`
- `does not publish cache or mark documents saved after rollback`
- `returns exact partial recovery paths without creating history`
- `discovers root-scoped partial recovery after reload without recreating undo history`
- `abandons partial only after explicit exact-path confirmation`
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
recovery-required -> recovering -> recovered | recovery-required
recovery-required -> releasing-recovery -> released
```

Only one mutation per workspace may be past confirmation. A newer request supersedes only a
pre-commit request; a committing request returns busy to newer work. Service construction receives
WDS/store/domain actions, `FileSyncService`, QueryClient, root/generation source, Editor transaction
functions, and structured logging. No global mutable singleton and no React effect transaction.

Preparation algorithm:

1. resolve all URI/resource paths and policy blockers;
2. snapshot every live/unopened target and originating LSP version guard;
3. resolve resource identity in a transient path/buffer graph, then ask Editor to validate and
   prepare each logical buffer's ordered text sequence/segments;
4. compute final per-buffer prepared sequences/segments and persistence operations;
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
- `rejects when an unopened target becomes a clean live document after preview`
- `aborts prepared staging when an unopened target becomes live after prepare`
- `rolls back provisional persistence when an unopened target becomes dirty live before local commit`
- `cancels during reads prepare and preview with zero mutation`
- `disables cancellation and resolves status after commit starts`
- `blocks save tree mutation and root switch while the workspace mutation gate is held`
- `freezes every affected buffer before final revalidation and server commit`
- `blocks typing undo programmatic and subscriber-reentrant edits while frozen`
- `keeps buffers frozen through lost finalize response compensation and recovery-required state`
- `restores prior configured editability after applied rolled-back and successful recovery settlement`
- `acknowledged partial discard leaves affected buffers read-only recovery-conflicted with no sync base`
- `discard after partial rename delete and overwrite preserves unsaved text and disables Save and resource operations`
- `opening a discarded partial path uses a fresh guarded read and never rebinds the conflicted buffer by guess`
- `releases reservations after every terminal settlement including partial acknowledgement`
- `executes create edit rename delete in exact operation order`
- `syncs edit-before-rename on old URI before projecting and opening new URI`
- `projects rename-before-edit before sending the new-URI change`
- `syncs edit-old rename edit-new as didChange close open didChange with one group receipt`
- `closes a deleted live URI without a stale final didChange`
- `allows dirty source rename and preserves unsaved text`
- `keeps old saved bytes on disk when an open dirty edit is followed by rename`
- `blocks dirty delete overwrite and open destination overwrite`
- `rejects edit then delete of an initially clean live document before preview`
- `rejects edit then rename then delete by live document identity`
- `rejects an overwrite target made dirty by an earlier text leg`
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
  through the public FocusService.

On provider/root startup, query the root-scoped recovery summaries and restore a persistent surface
for every partial journal; reload never loses the only operation ID. It never recreates Undo or
offers Undo for a partial result. “Retry recovery” invokes guarded `recover`, re-reads paths, and
releases the stable journal after success. “Discard recovery data” opens a separate destructive
confirmation stating that files may remain changed and only rollback data will be deleted; it sends
the exact current generation/path acknowledgement. Closing/dismissing does not release a partial
journal or its staging. After acknowledgement, replace the recovery action with an explicit
recovery-conflict surface for each affected live buffer: explain that Save/resource operations are
disabled and offer the existing conflict-resolution/close-and-reopen path. Do not report the
buffer recovered merely because staging was discarded.

`use-lsp-plugin.ts` reads one stable host callback from context. Every normal pooled borrower passes
that callback into `createLanguageServerSetPlugin`, regardless of whether the current view is
writable, synthetic, or ordinary; Editor consequently composes the same byte-identical capability
block and Platform policy rejects an unsupported target if the server returns it. Diff sessions
also pass only the stable callback; Editor's common lane resolver composes the exact capability
block. `diff:<sessionId>` isolates browser view lifecycle but shares the server pool keyed by
root/server. Editor's `LspConnectionPool` and the
server `LspSessionPool` both assert that later borrowers supply initialization options/capability
fingerprints deep-equal to the first rather than silently accepting order-dependent mismatches;
Platform tests prove normal-first and diff-first order. Preserve semantic-token declarations
through Editor's existing deep capability merge.

Exact DOM tests in `workspace-edit-preview-dialog.test.tsx`:

- `shows ordered diffs and dirty open unopened and resource labels`
- `groups and confirms needsConfirmation annotations`
- `offers only all-or-nothing confirmation with no file or hunk selectors`
- `cancel restores focus and settles the producer as cancelled`
- `apply uses Spinner and disables cancel after commit begins`
- `a stale preview disables apply and explains rerun`
- `partial recovery lists exact relative paths and no undo action`
- `restores the recovery surface after reload and retries only remaining compensation`
- `requires separate exact-path confirmation before discarding partial recovery data`
- `discard warns then leaves affected live buffers in recovery conflict with Save disabled`
- `dismissal never releases a partial journal`
- `uses distinct loading and empty verdict states`

Exact host tests in `language-server-plugin.test.ts`:

- `forwards one parsed WorkspaceEdit settlement to the Platform host`
- `keeps one stable host callback across pooled view reconstruction`
- `normal pool capabilities are identical when read-only or ordinary target acquires first`
- `rejects mismatched immutable initialization options on a later normal-pool borrower`
- `normal-first and diff-first clients advertise the same workspace edit capability block`
- `routes a diff edit request to Platform policy which rejects the synthetic read-only target`
- `merges workspace edit and semantic token capabilities`
- `does not advertise workspace applyEdit`

Exact `hooks/tests/use-diff-language.test.tsx` cases:

- `normal-first and diff-first connection options have deep-equal capabilities and one host callback`
- `a diff WorkspaceEdit reaches Platform and fails synthetic target policy before preview`

Verification:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web
bun --bun vitest run --project node \
  src/features/editor/state/tests/diff-language-session.test.ts \
  src/features/editor/tests/language-server-plugin.test.ts \
  src/features/editor/tests/workspace-edit-service.test.ts
bun --bun vitest run --project dom \
  src/features/editor/hooks/tests/use-diff-language.test.tsx \
  src/features/editor/tests/workspace-edit-preview-dialog.test.tsx
bun run typecheck
```

## Milestone 9 — Resource projections, watcher idempotence, commands, and duplicate policy removal

### Projection and watcher reconciliation

The provisional `commit` response supplies resulting entries/versions. Before calling `finalize`,
install guarded direct file-snapshot/tree-parent/git-query and WDS path projection receipts in the
synchronous local batch from milestone 7. Finalize events may race their HTTP response; they must
find those projections already installed and act only as idempotent invalidation hints. Finalize
failure reverses guarded projections before server rollback, then invalidates/re-reads for
convergence. Never first install a direct projection after finalize, and do not manipulate query
cache as open-document text truth.

Own transaction events use `origin: 'workspace-edit'` and `writeId: operationId`; native duplicate
events may cause refetch but may not create conflicts, replace dirty buffers, or retry persistence.
No fixed delay is allowed. Add `use-events.test.ts` cases:

- `treats finalized workspace transaction events as idempotent invalidation hints`
- `a semantic finalize event observes direct file tree and WDS projections before the response`
- `a lost finalize response does not install returned entries twice`
- `finalize failure reverses guarded projections before rollback and refetch`
- `does not conflict or replace a dirty buffer on its own transaction replay`
- `reconciles a later genuine external event by version rather than timing`
- `handles ordered create rename delete events with one write id`

### Explicit undo/redo commands

Register the two keyless commands in the sole `platformCommands` table/handler system. Enablement comes from the
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
   - in separate passes, open the originally unopened target clean after preview and dirty after
     server prepare; assert stale/abort or rollback at the specified checkpoint, exact text/dirty/
     disk state, fresh monotonic revisions, and no history.
3. `commits and reconciles create edit rename delete options in order`
   - assert real filesystem contents/existence, WDS/tab path mapping, exact file query snapshots,
     tree parents, and watcher replay idempotence.
   - use only regular files; assert a directory or symlink resource operation is rejected intact.
   - mount two views of one source and assert edit-old -> rename -> edit-new emits
     `didChange(old) -> didClose(old) -> didOpen(new) -> didChange(new)`, uses one barrier/receipt,
     and reverses as one group.
4. `compensates a later persistence failure and restores live state`
   - use the service's test fail-leg driver through the real route;
   - assert bytes, paths, buffer text, dirty/sync/view state, queries, and history match the prior
     direction while core/WDS revisions advance to fresh monotonic stamps.
5. `surfaces exact recovery state when compensation fails`
   - assert unrecovered paths, no applied/undo state, and direct invalidation/re-read;
   - reload the provider, discover the same partial summary, retry remaining compensation, then
     create another partial and explicitly acknowledge release; prove quota unblocks.
   - separately produce partial rename/delete/overwrite results, acknowledge their exact sorted path
     sets, and assert affected live buffers retain unsaved text as read-only recovery conflicts with
     no sync base; Save/resource commands are disabled and a later open performs a fresh guarded read.
6. `undoes and redoes an applied group only while every after stamp matches`
   - assert success once; then introduce disk/live drift and assert a second inverse refuses before
     mutation.
7. `cancels a paused prepare and blocks root switch during commit`
   - abort through a separate control request while the real prepare driver is paused; assert a
     late prepare response cannot resurrect staging, then prove root generation cancellation.
8. `rejects unsupported scheme authority outside-root symlink and dirty destructive resource`
9. `preserves old disk bytes for open edit then rename until explicit save`
10. `serializes save and tree mutations behind the shared transaction lease`
11. `invalidates history on server restart and releases it on root disposal and cap eviction`
12. `normal-first and diff-first clients share one exact initialize contract and host policy`
13. `releases all WDS path reservations after every terminal and root-disposal outcome`

Also extend focused server app integration for route auth/schema and WDS/store tests for projections.
Run:

```bash
cd /Users/shaul/Desktop/D/Editor/packages/editor
bun run test -- test/documentSession.test.ts test/editChain.test.ts test/editor.test.ts

cd /Users/shaul/Desktop/D/Editor/packages/lsp-plugin
bun run test -- test/workspaceEdit.test.ts test/workspaceTextEdits.test.ts \
  test/documentSync.test.ts test/lane.test.ts test/lspConnectionPool.test.ts

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
  src/features/editor/hooks/tests/use-diff-language.test.tsx \
  src/features/editor/tests/workspace-edit-preview-dialog.test.tsx
```

## Milestone 11 — Running-app smoke matrix

Rows marked **manual** reuse the ordinary running dev server and a disposable workspace on one
supported filesystem; never edit Platform/Editor source files. Rows marked **automated
integration** map to the focused Editor producer/core tests, Platform proxy tests, or the
constructor-injected filesystem driver/clock and real in-process app from milestone 10. Do not add
a production route, query flag, global, or UI control for faults, pauses, synthetic WorkspaceEdits,
or initialize-order selection.

1. **Manual — same-buffer rename**: rename a local symbol in one dirty file. No preview, one text
   change, native Undo/Redo once, file still dirty, no disk write.
2. **Manual — cross-file rename**: rename an exported symbol referenced by a dirty active tab, a
   clean open tab, and an unopened file. Preview shows all three and correct statuses. Apply keeps
   both open buffers unsaved, writes only unopened text, opens no third tab, and offers one
   workspace Undo/Redo.
3. **Manual — dirty cancellation**: with a dirty secondary target, Cancel. Text, dirty flags, files,
   tabs, tree, history, and query cache are byte/state identical.
4. **Manual — preview drift**: leave preview open, type in an open target, and externally change an
   unopened target. Apply becomes stale/refuses with zero mutation; rerunning rename produces a new
   accurate preview. Repeat by opening the initially unopened target clean and then dirty; neither
   pass may persist through the stale unopened classification.
5. **Manual — ordinary undo isolation/classification**: after the cross-file rename, normal Undo in
   one target cannot expose a group leg; workspace Undo reverses all targets. A same-buffer-only
   rename remains native Editor history, while the unopened write is Platform history.
6. **Automated integration — resource order and URI transition**: run
   `commits and reconciles create edit rename delete options in order`, including ignore/overwrite,
   the explicit three-rename swap, and edit-old -> rename -> edit-new with two mounted views. Assert
   exact wire order, one receipt, and reciprocal Undo/Redo.
7. **Automated integration — dirty/resource policy**: run
   `rejects unsupported scheme authority outside-root symlink and dirty destructive resource` and
   `preserves old disk bytes for open edit then rename until explicit save`; include clean-open edit
   then delete, edit -> rename -> delete, open overwrite, directory, and symlink rejection.
8. **Automated integration — malformed/unsupported producer output**: run the exact Editor parser/
   strict-preparation suites plus the named service tests
   `rejects unsupported scheme authority outside-root synthetic symlink alias and non-text targets before preview`
   and `rejects overlap ambiguous insert and invalid annotation before preview`. Cover `untitled:`,
   remote authority, outside-root, alias/symlink, overlap, coincident insert, and invalid annotation;
   every case has one structured failure and zero mutation.
9. **Automated integration — failure and recovery**: run
   `compensates a later persistence failure and restores live state` and
   `surfaces exact recovery state when compensation fails`. Cover restart discovery, successful
   recover, exact-path discard for partial rename/delete/overwrite, recovery-conflict Save/open
   policy, and no workspace path change caused by discard itself.
10. **Automated integration — cancellation/lease boundary**: run
    `cancels a paused prepare and blocks root switch during commit` plus the Editor multi-view lease
    tests. Prove late prepare cannot resurrect, and typing/paste/Undo/programmatic edits remain
    blocked until applied, compensated, recovered, or explicitly conflicted settlement.
11. **Automated integration — root/history scope**: run
    `invalidates history on server restart and releases it on root disposal and cap eviction`;
    verify epoch invalidation, stable journal release, twenty-first-group eviction, and all WDS path
    reservation releases.
12. **Automated integration — capability/pool order**: run
    `normal-first and diff-first clients share one exact initialize contract and host policy` plus
    the named diff hook test. Both orders use the Editor-composed block; a diff edit reaches real
    Platform policy and fails synthetic/read-only before preview.

Execute automated smoke rows with the exact milestone-10 commands (the single web integration file,
focused Editor producer suites, and focused server filesystem/proxy suites). Do not try to recreate
fixture responses, pauses, process restarts, or rollback faults through the ordinary running app.

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
bun run lint
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
bun run lint

cd /Users/shaul/Desktop/D/platform/apps/server
bun --bun vitest run src/fs/tests/workspace-edit.test.ts src/fs/tests/contracts.test.ts \
  src/lsp/typescript/tests/workspace-edit.test.ts src/lsp/typescript/tests/session.test.ts \
  src/lsp/tests/proxy-session.test.ts src/tests/app.test.ts
bun run typecheck
bun run lint
bun run format:check

cd /Users/shaul/Desktop/D/platform/apps/web
bun --bun vitest run --project node \
  test/integration/workspace-edit.test.ts \
  src/features/editor/tests/workspace-edit-service.test.ts \
  src/features/editor/tests/document-state.test.ts \
  src/features/editor/tests/file-sync-service.test.ts \
  src/features/editor/tests/language-server-plugin.test.ts \
  src/features/editor/state/tests/diff-language-session.test.ts \
  src/features/editor/tests/state.test.ts \
  src/features/search/tests/search-replace-runner.test.ts \
  src/features/workspace/tests/use-events.test.ts
bun --bun vitest run --project dom \
  src/features/editor/hooks/tests/use-diff-language.test.tsx \
  src/features/editor/tests/workspace-edit-preview-dialog.test.tsx
bun run typecheck
bun run lint
bun run format:check
```

Run a broader package suite only when the focused delta exposes a plausible shared regression. Do
not use bare root `bun run verify` as the acceptance gate. When Platform and Editor are paired by
SHA, the Platform CI `quality` job must also pass with that exact Editor SHA; it is the lockstep
format/lint/typecheck/test gate, not a run against a drifting Editor `main`.

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
  repeated effective text-document operations advance the owning LSP lane by their logical count.
- Resource-delimited edits on one live buffer use one prepared Editor sequence/barrier/receipt and
  one workspace-level URI transition whose old close always precedes the new open.
- Normal/diff/direct borrowers sharing a backend initialize with one Editor-composed capability and
  one normalized server contract regardless of acquisition order; unsupported targets are policy
  failures, not capability races.
- WDS, tabs, file/tree/git queries, and watcher hints converge directly and without timing proof.
- WDS reservations exclude open/close/remap races, and acknowledged partial discard leaves
  uncertain live documents explicitly read-only/conflicted rather than inventing a sync base.
- Search replace no longer owns a contradictory partial-success persistence loop.
- All exact producer, Editor, Platform service, server, DOM, integration, and smoke cases pass with
  no new baseline failure.
- No readonly container is copied solely for type compatibility and no obsolete document
  architecture compatibility layer exists.
- Index and authoritative roadmap/status documentation are reconciled.

## STOP conditions

Stop and report instead of improvising if any condition holds:

1. The sole typed command/focus runtime or root `PLAN.md` scheduling is absent, or an in-scope user
   edit cannot be reconciled.
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
17. Normal/diff/direct capability options differ for connections sharing a backend or by acquisition
    order, or Platform must compose the Editor-owned WorkspaceEdit capability a second time.
18. A public API assertion would read stale `dist`, a transaction fixture can trigger production
    failure injection through an HTTP body, or journal/watch exclusion cannot be proven.
19. An affected buffer cannot be mutation-leased through finalize/status recovery, an unopened path
    cannot be reserved against becoming live, or a partial journal cannot be discovered after
    reload and explicitly recovered/released.
20. A second server owner can initialize the shared backend with different normalized params, or a
    divergent owner's incremental change would be applied against another owner's text.
21. Resource-delimited edits on one live buffer cannot share one Editor barrier/reciprocal receipt,
    or mounted views cannot guarantee `didClose(old)` before `didOpen(new)` as one workspace-level
    transition.
22. Acknowledged partial discard would require guessing live path identity, re-enabling Save with no
    valid sync base, or silently treating an affected document as recovered.
