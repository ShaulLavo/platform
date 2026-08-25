# Plan 060: Persist and replay the last visible editor snapshot

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report; do not improvise. When done, delete this completed plan, remove
> its row from `plans/README.md`, remove Plan 061's `AFTER 060` qualifier while preserving its
> roadmap scheduling state, and rewrite the dependency note to point at the landed initial-paint
> API/benchmark rather than this deleted plan, following the repository's cleanup policy. Because
> root `PLAN.md` is the authoritative scheduler, also close/remove its 060 execution item if one was
> added before implementation and leave 061 as the next item in the approved 060 -> 061 sequence,
> while preserving the landed typed command/focus boundary.
>
> **Platform drift check (run first)**:
>
> ```bash
> git diff --stat 36bf483c..HEAD -- \
>   apps/web/src/features/editor/components/editor.tsx \
>   apps/web/src/features/editor/hooks/use-editor-color-theme.ts \
>   apps/web/src/features/editor/state/color-theme-store.ts \
>   apps/web/src/features/editor/state/tests/color-theme-store.test.ts \
>   apps/web/src/features/workbench/components/file-editor-body.tsx \
>   apps/web/src/features/workspace/hooks/use-cache-persistence.ts \
>   apps/web/src/features/workspace/state/cache.ts \
>   apps/web/src/features/workspace/state/tests/cache.test.ts \
>   apps/web/package.json
> ```
>
> **Editor drift check (run first)**:
>
> ```bash
> git -C ../Editor diff --stat d68ac6e..HEAD -- \
>   packages/editor/src/editor.ts \
>   packages/editor/src/editor/Editor.ts \
>   packages/editor/src/editor/syntaxController.ts \
>   packages/editor/src/editor/tokenIndex.ts \
>   packages/editor/src/editor/types.ts \
>   packages/editor/src/index.ts \
>   packages/editor/src/plugins.ts \
>   packages/editor/src/public/extensions.ts \
>   packages/editor/src/shiki/editor-tokens.ts \
>   packages/editor/src/virtualization/virtualizedTextView.ts \
>   packages/editor/src/virtualization/virtualizedTextViewHighlights.ts \
>   packages/editor/src/virtualization/virtualizedTextViewRows.ts \
>   packages/editor/src/virtualization/virtualizedTextViewTypes.ts \
>   packages/editor/test/shiki/editor-tokens.test.ts \
>   packages/editor/test/syntax.test.ts \
>   packages/editor/test/public-api.test.ts \
>   packages/react/src/index.ts \
>   packages/react/test/useEditor.test.ts \
>   docs/architecture/phase-0/core-public-api.json
> git -C ../Editor diff --stat -- \
>   packages/editor/src/editor.ts \
>   packages/editor/src/editor/Editor.ts \
>   packages/editor/src/editor/syntaxController.ts \
>   packages/editor/src/editor/tokenIndex.ts \
>   packages/editor/src/editor/types.ts \
>   packages/editor/src/index.ts \
>   packages/editor/src/plugins.ts \
>   packages/editor/src/public/extensions.ts \
>   packages/editor/src/shiki/editor-tokens.ts \
>   packages/editor/src/virtualization/virtualizedTextView.ts \
>   packages/editor/src/virtualization/virtualizedTextViewRows.ts \
>   packages/editor/src/virtualization/virtualizedTextViewTypes.ts \
>   packages/editor/test/shiki/editor-tokens.test.ts \
>   packages/editor/test/syntax.test.ts \
>   packages/editor/test/public-api.test.ts \
>   packages/react/src/index.ts \
>   packages/react/test/useEditor.test.ts \
>   docs/architecture/phase-0/core-public-api.json
> rg -l "EditorViewSnapshot" ../Editor/packages --glob '*test*' | sort
> ```
>
> At planning time the Platform source tree is clean. The Editor tree has user-owned, uncommitted
> selection/reveal, cursor-history, geometry, React, and Solid work. Snapshot changes overlap
> textually with `Editor.ts`, `plugins.ts`, `editor.ts`, `index.ts`, `public-api.test.ts`, the React
> binding, and `core-public-api.json`. Preserve every pre-existing hunk and its focused tests. If
> those edits remain uncommitted, capture the full patch and name-status baseline before starting;
> do not replace whole files or treat a clean final diff as success. Add every path returned by the
> structural-fixture `rg` to the saved pre-implementation diff/status baseline even when it is not
> listed statically above.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: none
- **Roadmap status**: executable plan written; not yet scheduled in root `PLAN.md`
- **Category**: perf
- **Planned at**: Platform commit `36bf483c`; Editor commit `d68ac6e`; 2026-08-23

## Why this matters

A cold reload currently restores the active tab and its scroll position but renders no editor while
the file read and live-document creation settle. Even after the editor mounts, syntax work can leave
a short plain-text frame. The editor already knows the exact rows and tokens it painted, but its
`EditorViewSnapshot` is a live operational object rather than a serialization contract.

After this plan, the editor exposes two explicit consumer contracts: a complete JSON representation
of `EditorViewSnapshot`, and a bounded `EditorVisibleSnapshot` containing only the mounted code paint
that a lightweight renderer can reproduce. Platform stores one clean, active visible snapshot and
replays it as an inert visual layer on the next matching workspace/path open.

This cache is deliberately allowed to show old text for a short loading interval. That is the
accepted product tradeoff: it is last-known paint, not file truth, and it never enters the live
document. It therefore needs no content hash or file-version gate. The presentation still has a
short fail-safe and disappears on error or interaction so a hung read cannot leave old source over
the pane indefinitely.

## Decisions fixed by this plan

1. The two snapshots are `EditorViewSnapshot` (existing, complete) and
   `EditorVisibleSnapshot` (new, bounded).
2. Both expose the JavaScript-standard spelling `toJSON()`, not `toJson()`.
3. `EditorViewSnapshot.toJSON()` intentionally materializes full text and line starts. Its API docs
   must say that this is O(document size). Ordinary plugin reads remain lazy.
4. `EditorViewSnapshot.toVisibleSnapshot()` must not read `fullText`, `lineStarts`, or
   `lineStartsView.toArray()`. It returns `null` when mounted paint contains arbitrary plugin widget
   DOM or plugin CSS classes that have no stable JSON paint contract; callers skip that capture
   instead of serializing guessed HTML/styles.
5. The visible snapshot stores chunk-local, non-overlapping paint runs for only the vertically and
   horizontally mounted display paint, not complete long rows or the document-wide token array.
   Stable core text/control/BiDi-refusal paint parts are serialized from what was actually mounted,
   never inferred from `VirtualizedTextChunk.text`. Each run uses the same `color`,
   `backgroundColor`, and `textDecoration` subset that the live CSS Highlight API can actually
   paint. Do not serialize `fontStyle`/`fontWeight` into the compact paint contract or add
   typed-array packing before measurement.
6. Opaque row `metadata`, arbitrary widget/CSS paint, brackets, selections, offscreen tokens, and
   offscreen folds are omitted from the compact DTO because the lightweight renderer does not paint
   them. Full JSON keeps every JSON-safe snapshot fact except opaque metadata and method-bearing
   runtime state, and marks unreplayable mounted plugin paint without serializing DOM or class rules.
7. Platform stores exactly one last visible snapshot, capped at 256 KiB after JSON serialization.
8. Cache lookup requires schema version, workspace root, file path, and committed theme id. It does
   not require content identity, storage age, SHA, `ohash`, or the server file version.
9. The cache is a noninteractive paint only. It is never passed as initial editor tokens, a text
   buffer, or a syntax result. Plan 061 owns promotable work.
10. Dirty buffers are never persisted. Flashing unsaved text that will disappear is misleading, not
    a useful provisional paint.
11. Storage has no TTL, but one presentation attempt lasts at most 1,500 ms. File-read error,
    pointer/keyboard/focus interaction, root/path/theme change, and successful authoritative paint
    dismiss it sooner.
12. `EditorState.syntaxStatus` alone is not a paint-ready signal. Core exposes a
    document-generation-aware initial-highlight paint state plus one typed initial-paint event for
    authoritative text and highlight-settled phases. It waits for the applicable Tree-sitter or
    Shiki token path to settle and reach the mounted view.
13. A theme preview or pending theme load is never persisted under the committed theme id. Capture
    only while selected, committed, and actually applied theme identities match; preview/commit/
    load/cancel resets the pending generation.
14. Forgetting/evicting a workspace removes the record when its root matches. Merely switching away
    does not; the single record may still provide the next reload's last-known frame until another
    clean active capture overwrites it.

## Current state

### Editor snapshots are lazy runtime state

`../Editor/packages/editor/src/plugins.ts:216-243` currently defines a plain type with lazy and
method-bearing members:

```ts
export type EditorViewSnapshot = {
  readonly documentId: string | null
  readonly languageId: EditorSyntaxLanguageId | null
  readonly theme?: EditorTheme | null
  readonly textSnapshot?: TextSnapshot
  readonly fullText: string
  readonly textVersion: number
  readonly editsSinceTextVersion?: (textVersion: number) => readonly TextEdit[] | null
  readonly lineStarts: readonly number[]
  readonly lineStartsView?: EditorLineStartsView
  readonly tokens: readonly EditorToken[]
  // ...brackets, selections, metrics, fold markers, visible rows, viewport
}
```

`../Editor/packages/editor/src/editor/Editor.ts:2484-2547` creates it with a lazy full-text getter, a
lazy `lineStarts` getter, a function, and the editor's current token array:

```ts
return defineLazyFullTextProperty({
  documentId: this.documentId,
  textSnapshot,
  editsSinceTextVersion: (textVersion: number) => this.editChain.editsSince(textVersion),
  get lineStarts() {
    return lineStartsView.toArray()
  },
  lineStartsView,
  tokens: this.tokens,
  visibleRows: viewState.mountedRows.map(/* ... */),
  viewport,
})
```

The full snapshot therefore cannot use object spread or default `JSON.stringify` behavior as its
public schema: that would invoke lazy full-document getters accidentally, omit functions silently,
and expose proxy-backed token arrays without copying them.

### The viewport facts already exist

`../Editor/packages/editor/src/plugins.ts:179-204` already exposes serializable viewport geometry and
visible row text, line identity, offsets, and layout positions. Token styles are primitive fields in
`../Editor/packages/editor/src/tokens.ts:1-13`, but the live CSS Highlight path deliberately paints
only color, background, and text decoration (`style-utils.ts:19-35`).

The compact serializer must project tokens onto each mounted horizontal chunk and emit chunk-local
paint runs. Do not select every token between the first and last row, or read a complete long row:
folded regions and minified lines can make either envelope cover most of a document. The runtime
chunk's raw `text` is not necessarily its paint: core rewrites control characters into labels and an
oversized BiDi refusal retains the entire source line while mounting only a short refusal. Capture
stable core paint parts during mount/update. Wrapped source chunks can be mapped from their offsets;
inline-replaced chunks whose display text differs from their source range must be marked
`plain-transformed` and replayed without syntax color until a stable display mapping is added.

The token index in `editor/tokenIndex.ts` makes visible range queries cheap when producers attach it.
Tree-sitter paths already do. Shiki currently does not, so build its index during the existing token
creation pass rather than adding a later O(all tokens) scan. Keep an explicitly documented linear
fallback for externally supplied, unindexed token arrays.

### Platform already has the right persistence lifecycle

`apps/web/src/features/workspace/state/cache.ts:41-75` owns the versioned localStorage namespace and
already splits bulky search data from the small workspace slice. Add another dedicated key in this
same namespace; do not enlarge `CachedWorkspaceSlice`.

`apps/web/src/features/workspace/hooks/use-cache-persistence.ts:225-247` debounces writes, and
`:472-487` flushes on `pagehide` and `visibilitychange:hidden`. Extract that lifecycle helper for
reuse rather than creating a second subtly different page-lifecycle implementation.

`apps/web/src/features/editor/hooks/use-scroll-persistence-plugin.ts:27-64` is the plugin pattern to
match: a stable React hook returns an `EditorPlugin`, view updates remain outside React, and disposal
flushes pending state.

### The cold surface is blank today

`apps/web/src/features/workbench/components/file-editor-body.tsx:46-55` holds the outgoing document
while a replacement loads, but a cold load has no outgoing document. Its final branch at `:93-102`
returns an error or `null`. This is where the cached visual belongs.

`apps/web/src/features/editor/components/editor.tsx:132-149` owns the React editor controller.
Current `EditorState.syntaxStatus` cannot be the handoff by itself: a structural result can become
ready before a Shiki highlighter applies its colors. Add a combined initial-highlight paint state in
core. The cached visual remains above the new Editor until the matching document generation has
settled the applicable token path and the mounted view has adopted it, then leaves on the next
animation frame. A file-read error removes it directly from `FileEditorBody`; no Editor callback is
available on that path.

### Architecture constraints

The root `PLAN.md` requires persistence to remain a cache rather than runtime-service state and says
React should render service projections. This plan follows that boundary: the snapshot record is
local cache data, while the editor and `WorkspaceDocumentService` remain authoritative.

## Commands you will need

| Purpose                    | Command                                                                                                                                                                                                          | Expected on success                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Editor focused tests       | `cd ../Editor/packages/editor && ./node_modules/.bin/vitest run test/viewSnapshot.test.ts test/syntax.test.ts test/shiki/editor-tokens.test.ts test/public-api.test.ts`                                          | exit 0; all selected tests pass                                             |
| Editor React binding test  | `cd ../Editor/packages/react && ./node_modules/.bin/vitest run test/useEditor.test.ts`                                                                                                                           | exit 0; typed paint event forwards once per phase/generation                |
| Editor workspace typecheck | `cd ../Editor && bun run typecheck`                                                                                                                                                                              | exit 0, including structural fixtures in every package                      |
| Editor lint                | `cd ../Editor && bun run lint`                                                                                                                                                                                   | exit 0, no new errors                                                       |
| Editor format              | `cd ../Editor && bun run format:check`                                                                                                                                                                           | exit 0                                                                      |
| Editor API baseline        | `cd ../Editor && bun run health:write && bun run health`                                                                                                                                                         | reviewed baseline update, then exit 0                                       |
| Editor build               | `cd ../Editor && bun run build`                                                                                                                                                                                  | exit 0; linked packages refreshed                                           |
| Platform node tests        | `cd apps/web && bun --bun vitest run --project node src/lib/tests/editor-visible-snapshot-cache.test.ts src/lib/tests/workspace-cache-storage.test.ts src/features/editor/state/tests/color-theme-store.test.ts` | exit 0                                                                      |
| Platform DOM tests         | `cd apps/web && bun --bun vitest run --project dom src/features/workbench/tests/editor-visible-snapshot.test.tsx src/lib/tests/lifecycle-flush.test.ts`                                                          | exit 0                                                                      |
| Platform browser test      | `cd apps/web && ./node_modules/.bin/vitest run --config vitest.browser.config.ts src/features/workbench/tests/editor-visible-snapshot.browser.tsx`                                                               | exit 0 in a real browser                                                    |
| Cold-paint benchmark       | `bun --cwd apps/web run bench:editor-open`                                                                                                                                                                       | emits cold visual and authoritative paint timings plus serialized size/cost |
| Platform typecheck         | `cd apps/web && bun run typecheck`                                                                                                                                                                               | exit 0, no errors                                                           |
| Platform lint              | `cd apps/web && bun run lint`                                                                                                                                                                                    | exit 0, no new errors                                                       |
| Platform format            | `cd apps/web && bun run format:check`                                                                                                                                                                            | exit 0                                                                      |

Do not start another dev server. The repository says one is already running.

## Suggested executor toolkit

- Apply the mandatory `never-nester` skill to every new function; use guards and extracted helpers.
- Apply `vercel-react-best-practices` only to the React overlay and readiness wiring. Stable plugin
  identity is correctness here; do not add unrelated memoization.

## Scope

**In scope — Editor repository**:

- `../Editor/packages/editor/src/plugins.ts`
- `../Editor/packages/editor/src/editor/viewSnapshot.ts` (create)
- `../Editor/packages/editor/src/editor/tokenIndex.ts`
- `../Editor/packages/editor/src/shiki/editor-tokens.ts`
- `../Editor/packages/editor/src/editor/syntaxController.ts`
- `../Editor/packages/editor/src/editor/types.ts`
- `../Editor/packages/editor/src/editor/Editor.ts`
- `../Editor/packages/editor/src/virtualization/virtualizedTextView.ts`
- `../Editor/packages/editor/src/virtualization/virtualizedTextViewHighlights.ts`
- `../Editor/packages/editor/src/virtualization/virtualizedTextViewRows.ts`
- `../Editor/packages/editor/src/virtualization/virtualizedTextViewTypes.ts`
- `../Editor/packages/editor/src/public/extensions.ts`
- `../Editor/packages/editor/src/editor.ts`
- `../Editor/packages/editor/src/index.ts`
- `../Editor/packages/editor/test/viewSnapshot.test.ts` (create)
- `../Editor/packages/editor/test/syntax.test.ts`
- `../Editor/packages/editor/test/shiki/editor-tokens.test.ts`
- `../Editor/packages/editor/test/public-api.test.ts`
- `../Editor/packages/react/src/index.ts`
- `../Editor/packages/react/test/useEditor.test.ts`
- Structural `EditorViewSnapshot` fixture files reported by the Step 1 `rg` command, currently under
  `packages/{editor,decode,find,minimap,scope-lines,lsp-plugin,typescript-lsp}/test/`
- `../Editor/docs/architecture/phase-0/core-public-api.json`

**In scope — Platform repository**:

- `apps/web/src/lib/lifecycle-flush.ts` (create)
- `apps/web/src/lib/tests/lifecycle-flush.test.ts` (create)
- `apps/web/src/lib/workspace-cache-storage.ts` (create)
- `apps/web/src/lib/tests/workspace-cache-storage.test.ts` (create)
- `apps/web/src/features/workspace/hooks/use-cache-persistence.ts`
- `apps/web/src/features/workspace/state/cache.ts`
- `apps/web/src/features/workspace/state/tests/cache.test.ts`
- `apps/web/src/lib/editor-visible-snapshot-cache.ts` (create)
- `apps/web/src/lib/tests/editor-visible-snapshot-cache.test.ts` (create)
- `apps/web/src/features/workbench/hooks/use-editor-visible-snapshot.ts` (create)
- `apps/web/src/features/workbench/utils/editor-visible-snapshot.ts` (create)
- `apps/web/src/features/workbench/components/editor-visible-snapshot.tsx` (create)
- `apps/web/src/features/workbench/tests/editor-visible-snapshot.test.tsx` (create)
- `apps/web/src/features/workbench/tests/editor-visible-snapshot.browser.tsx` (create)
- `apps/web/src/features/workbench/components/file-editor-body.tsx`
- `apps/web/src/features/editor/components/editor.tsx`
- `apps/web/src/features/editor/hooks/use-editor-color-theme.ts`
- `apps/web/src/features/editor/state/color-theme-store.ts`
- `apps/web/src/features/editor/state/tests/color-theme-store.test.ts`
- `apps/web/scripts/editor-open-benchmark.mjs` (create)
- `apps/web/package.json` (benchmark scripts only)

**Out of scope**:

- `ohash`, SHA calculation, content checksums, or any new dependency.
- Injecting cached text or tokens into an `Editor`, `DocumentSession`, or `WorkspaceDocumentService`.
- Multiple cached files, IndexedDB, server persistence, storage-age TTLs, migrations, or backward
  compatibility.
- Dirty-buffer/session recovery.
- Semantic tokens, diagnostics, minimap pixels, hover/find/occurrence decorations, live carets, or
  arbitrary plugin DOM.
- Foresight prediction, file-byte prefetching, prepared buffers, worker/session transfer, LSP startup,
  and all work assigned to Plan 061.
- Any settings registry entry. This is an internal bounded cache, not a user-facing knob.

## Git workflow

- Work in the current Platform and Editor worktrees. Do not create branches or worktrees unless the
  operator asks.
- Do not revert, stash, or overwrite the existing Editor selection/reveal edits.
- Do not commit, push, or open a PR unless the operator asks.
- Before editing, save `git status --porcelain=v1`, `git diff --binary`, and the focused
  selection/reveal/cursor-history test results for Editor under `/tmp/plan-060-editor-before-*`.
  After implementation, manually verify every baseline hunk/invariant remains and rerun those
  focused tests. A filename-only scope comparison is insufficient for overlapping dirty files.

## Steps

### Step 1: Add explicit full and visible snapshot contracts in editor core

In `plugins.ts`, add explicit JSON DTO types with literal schema versions and discriminants:

```ts
export type EditorInitialHighlightStatus = 'loading' | 'painted' | 'plain' | 'degraded' | 'error'

export type EditorInitialPaintEvent =
  | {
      readonly phase: 'text'
      readonly documentId: string | null
      readonly documentGeneration: number
      readonly textVersion: number
    }
  | {
      readonly phase: 'highlight-settled'
      readonly documentId: string | null
      readonly documentGeneration: number
      readonly textVersion: number
      readonly status: Exclude<EditorInitialHighlightStatus, 'loading'>
    }

export type EditorTokenStyleJSON = {
  readonly color?: string
  readonly backgroundColor?: string
  readonly fontStyle?: 'normal' | 'italic'
  readonly fontWeight?: string | number
  readonly textDecoration?: string
}

export type EditorThemeJSON = {
  readonly type?: EditorThemeType
  readonly backgroundColor?: string
  readonly foregroundColor?: string
  readonly gutterBackgroundColor?: string
  readonly gutterForegroundColor?: string
  readonly caretColor?: string
  readonly minimapBackgroundColor?: string
  readonly syntax?: Readonly<Partial<Record<EditorSyntaxThemeColor, string>>>
  readonly colors?: Readonly<Record<string, string>>
}

export type EditorViewSnapshotJSON = {
  readonly kind: 'editor-view'
  readonly schemaVersion: 1
  readonly documentId: string | null
  readonly languageId: EditorSyntaxLanguageId | null
  readonly theme: EditorThemeJSON | null
  readonly fullText: string
  readonly textVersion: number
  readonly initialHighlightStatus: EditorInitialHighlightStatus
  readonly lineStarts: readonly number[]
  readonly tokens: readonly {
    readonly start: number
    readonly end: number
    readonly style: EditorTokenStyleJSON
  }[]
  readonly brackets: readonly {
    readonly index: number
    readonly char: string
    readonly depth: number
  }[]
  readonly selections: readonly {
    readonly anchorOffset: number
    readonly headOffset: number
    readonly startOffset: number
    readonly endOffset: number
    readonly affinity: SelectionAffinity
  }[]
  readonly metrics: { readonly rowHeight: number; readonly characterWidth: number }
  readonly lineCount: number
  readonly contentWidth: number
  readonly totalHeight: number
  readonly gutterWidth: number
  readonly gutterLayout: EditorVisibleGutterLayoutJSON
  readonly tabSize: number
  readonly foldMarkers: readonly {
    readonly key: string
    readonly startOffset: number
    readonly endOffset: number
    readonly startRow: number
    readonly endRow: number
    readonly collapsed: boolean
  }[]
  readonly visibleRows: readonly EditorVisibleRowSnapshotJSON[]
  readonly viewport: EditorViewportSnapshotJSON
}

export type EditorMountedChunkPaintPartJSON =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'control'; readonly text: string; readonly widthCells: number }
  | { readonly kind: 'refusal'; readonly text: string }

export type EditorMountedChunkPaintJSON =
  | {
      readonly kind: 'replayable'
      readonly parts: readonly EditorMountedChunkPaintPartJSON[]
    }
  | { readonly kind: 'unreplayable-widget' }

export type EditorVisibleChunkSnapshotJSON = {
  readonly sourceStartOffset: number
  readonly sourceEndOffset: number
  readonly rowLocalStart: number
  readonly rowLocalEnd: number
  readonly text: string
  readonly mountedPaint: EditorMountedChunkPaintJSON
}

export type EditorVisibleGutterLayoutJSON = {
  readonly fixedWidth: number
  readonly lanes: readonly {
    readonly id: string
    readonly width: number
  }[]
}

export type EditorVisibleRowSnapshotJSON = {
  readonly index: number
  readonly bufferRow: number
  readonly source: DisplayTextRowSource
  readonly injectedTextRowId: string | null
  readonly startOffset: number
  readonly endOffset: number
  readonly text: string
  readonly kind: 'text'
  readonly primaryText: boolean
  readonly top: number
  readonly height: number
  readonly leftSpacerWidth: number
  readonly contentCursorLine: boolean
  readonly gutterNumberCursorLine: boolean
  readonly gutterCursorLineBackgroundLaneIds: readonly string[]
  readonly mountedPaintSupport: 'replayable' | 'unreplayable-plugin-css'
  readonly chunks: readonly EditorVisibleChunkSnapshotJSON[]
  readonly foldMarker: {
    readonly key: string
    readonly startOffset: number
    readonly endOffset: number
    readonly startRow: number
    readonly endRow: number
    readonly collapsed: boolean
  } | null
}

export type EditorViewportSnapshotJSON = {
  readonly scrollTop: number
  readonly scrollLeft: number
  readonly scrollHeight: number
  readonly scrollWidth: number
  readonly clientHeight: number
  readonly clientWidth: number
  readonly borderBoxHeight: number | null
  readonly borderBoxWidth: number | null
  readonly visibleRange: { readonly start: number; readonly end: number }
}

export type EditorVisiblePaintRunJSON = {
  // Half-open UTF-16 offsets into the concatenated `text` paint parts.
  readonly start: number
  readonly end: number
  readonly style: {
    readonly color?: string
    readonly backgroundColor?: string
    readonly textDecoration?: string
  }
}

export type EditorVisiblePaintChunkJSON = {
  readonly sourceStartOffset: number
  readonly sourceEndOffset: number
  readonly rowLocalStart: number
  readonly rowLocalEnd: number
  readonly parts: readonly EditorMountedChunkPaintPartJSON[]
  readonly replayFidelity: 'exact' | 'plain-transformed' | 'plain-overlap' | 'plain-core-rendered'
  readonly runs: readonly EditorVisiblePaintRunJSON[]
}

export type EditorVisiblePaintRowJSON = {
  readonly index: number
  readonly bufferRow: number
  readonly source: DisplayTextRowSource
  readonly injectedTextRowId: string | null
  readonly primaryText: boolean
  readonly top: number
  readonly height: number
  readonly leftSpacerWidth: number
  readonly contentCursorLine: boolean
  readonly gutterNumberCursorLine: boolean
  readonly gutterCursorLineBackgroundLaneIds: readonly string[]
  readonly foldMarker: EditorVisibleRowSnapshotJSON['foldMarker']
  readonly chunks: readonly EditorVisiblePaintChunkJSON[]
}

export type EditorVisibleSnapshotJSON = {
  readonly kind: 'editor-visible'
  readonly schemaVersion: 1
  readonly documentId: string | null
  readonly languageId: EditorSyntaxLanguageId | null
  readonly theme: EditorThemeJSON | null
  readonly textVersion: number
  readonly initialHighlightStatus: EditorInitialHighlightStatus
  readonly metrics: EditorViewSnapshotJSON['metrics']
  readonly lineCount: number
  readonly contentWidth: number
  readonly totalHeight: number
  readonly gutterWidth: number
  readonly gutterLayout: EditorVisibleGutterLayoutJSON
  readonly tabSize: number
  readonly viewport: EditorViewportSnapshotJSON
  readonly rows: readonly EditorVisiblePaintRowJSON[]
}

export type EditorVisibleSnapshot = {
  readonly kind: 'editor-visible'
  readonly schemaVersion: 1
  readonly documentId: string | null
  readonly languageId: EditorSyntaxLanguageId | null
  readonly theme: EditorThemeJSON | null
  readonly textVersion: number
  readonly initialHighlightStatus: EditorInitialHighlightStatus
  readonly metrics: EditorViewSnapshotJSON['metrics']
  readonly lineCount: number
  readonly contentWidth: number
  readonly totalHeight: number
  readonly gutterWidth: number
  readonly gutterLayout: EditorVisibleGutterLayoutJSON
  readonly tabSize: number
  readonly viewport: EditorViewportSnapshotJSON
  readonly rows: readonly EditorVisiblePaintRowJSON[]
  toJSON(): EditorVisibleSnapshotJSON
}
```

Extend `EditorViewSnapshot` with:

```ts
readonly initialHighlightStatus: EditorInitialHighlightStatus
readonly gutterWidth: number
readonly gutterLayout: EditorVisibleGutterLayoutJSON
toJSON(): EditorViewSnapshotJSON
toVisibleSnapshot(): EditorVisibleSnapshot | null
```

Extend the runtime `EditorVisibleRowSnapshot`/its chunk type with the same JSON-safe mounted paint
source shown above: chunk `mountedPaint`, `leftSpacerWidth`, `contentCursorLine`,
`gutterNumberCursorLine`, `gutterCursorLineBackgroundLaneIds`, `mountedPaintSupport`, and
`foldMarker`; expose the ordered gutter layout beside total width. Populate these values while the
row mount/update pass already has the O(1) chunk, cursor, gutter, and fold lookup results. Copy
mounted text-node data and built-in control labels/widths into stable parts. The oversized
BiDi-refusal path records only its bounded ellipsis/refusal labels. Any other widget part records
`unreplayable-widget`; never serialize or traverse arbitrary widget HTML. Mark a row
`unreplayable-plugin-css` when its mounted `inlineKindsClassName`, row/gutter decoration class, or an
unrecognized `textRenderMode: 'widget'` can change text paint/geometry. The explicitly tagged core
BiDi refusal is the only widget render mode accepted by the small contract. `toVisibleSnapshot()`
must consume these captured fields; do not hide them in a private closure or fall back to slicing
full `row.text`/`chunk.text`. Full `toJSON()` copies the support marker because it is a legitimate
JSON-safe fact. Update structural fixtures with explicit neutral defaults (`[]`, `0`, `false`,
`null`, `'replayable'`) where they do not model mounted paint.

Implement construction and serialization in the new `editor/viewSnapshot.ts`. Attach methods as
non-enumerable own properties so object iteration keeps the existing field surface. Do not convert
snapshots into classes.

Full JSON rules:

- Include `fullText`, fully materialized `lineStarts`, copied tokens/styles, brackets, selections,
  metrics, fold markers, visible rows/chunks without `metadata`, viewport, language, theme, dimensions,
  gutter width/layout, tab size, and text version.
- Omit `textSnapshot`, `editsSinceTextVersion`, and `lineStartsView`; their useful data is represented
  by `fullText`/`lineStarts`, and functions are not JSON.
- Copy nested arrays and token styles so a proxy-backed or subsequently changed runtime array cannot
  leak into the returned DTO.
- Omit properties whose runtime value is `undefined` only inside cloned theme/token-style records.
  Normalize optional snapshot geometry and row ids to `null` as typed above. Reject non-finite
  numbers rather than emitting JSON's silent `null` conversion.
- The promise is `structuredClone(snapshot.toJSON())`, not `structuredClone(snapshot)`: runtime
  snapshots still contain functions and operational objects.

Visible snapshot rules:

- Serialize each mounted row's **mounted horizontal chunks**, not the complete logical row text.
  Reuse/copy the actual chunk window, local/source offsets, captured paint parts, and measured
  left-spacer width. A normal short/wrapped row has its mounted chunk(s); a long unwrapped row
  contains only the horizontally overscanned chunk window already used by live paint. Never copy
  raw `chunk.text` into the compact DTO, slice `row.text` outside those chunks, or scan a whole
  minified line to make the small snapshot.
- A chunk whose mounted paint contains only text parts may carry token runs. Concatenate those
  bounded parts for run coordinates. Built-in control spans and BiDi refusal labels remain
  replayable as `plain-core-rendered` parts with no syntax runs, including exact `widthCells` for a
  control span. If any row is `unreplayable-plugin-css` or any chunk is `unreplayable-widget`, return
  `null` for the whole visible snapshot before reading source or tokens. A partially missing/styled
  row is not an acceptable cached frame.
- Classify every remaining mounted chunk in a bounded first pass **before any token-index work**.
  Core-rendered and injected chunks are immediately no-run fallbacks. For a document chunk containing
  only text parts, compare
  `sourceEndOffset - sourceStartOffset` with the bounded mounted-paint UTF-16 length **before**
  reading the source snapshot. An unequal length is immediately `plain-transformed` with no source
  slice and no runs. Only equal-length chunks may read and compare that exact source slice. Wrapped
  identity chunks remain `exact`; a same-length content mismatch is `plain-transformed`. Never apply
  source offsets to different display text. This ordering prevents a tiny inline replacement backed
  by a huge hidden source span from making compact extraction copy the omitted source.
- Treat injected chunks as `plain-transformed` with no syntax runs unless a future snapshot contract
  supplies and validates an explicit source-to-display mapping. Their display text is still replayed;
  source-token offsets are not guessed.
- Only after that first pass, if at least one exact-eligible text chunk remains, build the one-pass
  external fallback index (when needed) and query tokens for those exact chunks' half-open source
  ranges. An all-core/injected/transformed viewport performs zero token-array scans and zero token-
  index range queries. Never query a complete row, a transformed chunk's potentially huge hidden
  source span, or the envelope between chunks/rows. Emit non-overlapping chunk-local runs, clamp them
  to `[0, mountedPaintText.length)`, merge adjacent equal styles, and omit empty styles.
- Indexed built-in token sources use their deterministic live precedence. If an unindexed external
  token array contains an overlap whose equal-priority paint order cannot be reconstructed from the
  snapshot, mark the affected chunk `plain-overlap` and emit no runs for it. Do not guess registry
  acquisition order merely to claim exact replay.
- Fix snapshot creation to copy the view's real `primaryText` fact rather than treating every
  document-source wrap continuation as primary.
- Capture the view's actual `gutterWidth`, fixed-width residual, and ordered contribution lane ids/
  widths. Record content cursor highlighting by virtual-row identity, line-number active foreground
  separately, and cursor background lane ids by buffer-row identity. Platform can then place the
  `line-gutter` and 16 px `fold-gutter` lanes correctly, apply active-number foreground only to the
  former, and apply cursor background only to the latter. Unknown lanes reserve their measured
  geometry but do not serialize arbitrary contribution DOM. Selection-only updates must refresh
  these row facts even when no row remount occurs. Attach only the fold marker already associated
  with a mounted primary row. Do not include arbitrary brackets, selections, row decorations, or
  offscreen fold/token data.
- Thread the O(1) `foldMarkerByStartRow` result already used while mounting a row into the runtime
  `EditorVisibleRowSnapshot`, then copy that row-local fact into both JSON forms. Compact extraction
  must not search or enumerate the full `EditorViewSnapshot.foldMarkers` array to recover it; full
  `toJSON()` may still serialize that array independently.
- Include only mounted paint parts/geometry, chunk-local paint runs, mounted gutter facts, viewport
  geometry, text metrics, tab size, line count, content dimensions, theme, language, and text version.
  Omit complete row text for horizontally chunked lines, full document text, all line starts, edit
  history, metadata, and all non-rendered structural data.
- Build a token index during Shiki's existing token-construction pass. For an externally supplied
  unindexed array, a documented O(all tokens) fallback is allowed **once per**
  `toVisibleSnapshot()` **only when an exact-eligible chunk exists**—build a transient sorted
  partition/range index in one pass, then project exact chunks from it. Never rescan the full
  external array per chunk. Built-in Tree-sitter and Shiki captures must stay O(mounted chunks +
  tokens intersecting exact-eligible chunks).

Update root, `./editor`, and `./extensions` type exports and the reviewed API baseline. Add a short
doc comment warning that full `toJSON()` is intentionally O(document size), while
`toVisibleSnapshot()` copies only mounted vertical rows/horizontal chunks for indexed built-in
tokens, may scan an unindexed external array, and returns `null` when arbitrary mounted widget DOM or
plugin CSS paint cannot be represented faithfully.

Adding required methods changes structural snapshot fixtures across the Editor workspace. Before
editing, run:

```bash
rg -n "EditorViewSnapshot" packages --glob '*test*'
```

Inspect every structural test fixture/reference surfaced by that broad search, including class
methods and multiline return signatures, and then let workspace typecheck surface any non-test
structural value the search missed. Update every returned fixture or spread to preserve the methods;
all such fixtures are in scope even when absent from the static list above. At planning time this
includes editor, decode, find, minimap, scope-lines, lsp-plugin, and typescript-lsp tests. Prefer a
focused package-local test factory where several fixtures repeat the same base shape. Do not make the
methods optional merely to avoid reconciling fixtures.

**Verify**:

```bash
(cd ../Editor/packages/editor && ./node_modules/.bin/vitest run \
  test/viewSnapshot.test.ts \
  test/syntax.test.ts \
  test/shiki/editor-tokens.test.ts \
  test/public-api.test.ts)
(cd ../Editor/packages/react && ./node_modules/.bin/vitest run test/useEditor.test.ts)
(cd ../Editor && bun run typecheck)
```

Expected: all tests pass and the whole workspace typechecks. Test spies must prove
`toVisibleSnapshot()` performs zero full-text materializations and zero
`lineStartsView.toArray()` calls; built-in Shiki output has an index; runtime snapshots and every
structural fixture expose both required methods; and both JSON results survive
`structuredClone(result)`. A representable view produces the visible JSON result; an arbitrary
mounted widget or plugin-CSS-dependent paint produces `null` without walking DOM/CSS or reading the
chunk's raw source text.

### Step 2: Add the one-record visible-snapshot cache

Extract the generic localStorage prefix/key and schema-validated read/write/remove mechanics from
`workspace/state/cache.ts` into `lib/workspace-cache-storage.ts`. Preserve all existing keys and
behavior.

Own the new codec and storage API in `lib/editor-visible-snapshot-cache.ts`. It qualifies for the
shared layer because workbench capture/replay and workspace forget/eviction are two outside
consumers. Neither feature imports across into the other. Give it one dedicated key under the
current `platform.workspace-state.v17` namespace. Keep the record out of `CachedWorkspaceState` and
`CachedWorkspaceSlice`, so boot and ordinary slice writes do not parse or rewrite source text.

The stored envelope is:

```ts
type CachedEditorVisibleSnapshot = {
  readonly cacheVersion: 1
  readonly rootPath: string
  readonly path: string
  readonly themeId: string
  readonly snapshot: EditorVisibleSnapshotJSON
}
```

Use strict Valibot schemas down through token styles and numeric geometry. Reject non-finite numbers,
negative/out-of-order row/chunk/source offsets, chunk-local runs outside the concatenated text-parts
length, overlapping/unsorted runs, non-`exact` chunks with runs, invalid control widths, duplicate or
unknown gutter-background lane ids, gutter lanes whose fixed/lane widths do not sum to total width,
inconsistent left-spacer geometry, unsupported schema versions, more than 400 rows, 4,096 mounted
chunks, 16,384 paint parts, or 2,048 total runs. Do not require display-paint length to equal its
source-offset length; transformed/core-rendered chunks explicitly differ.

Measure the serialized localStorage cost conservatively as `serialized.length * 2`. Reject/remove
anything over 262,144 bytes both before `JSON.parse` on read and before `localStorage.setItem` on
write. Remove a malformed or oversized entry. A quota failure removes only this key.

Do not add `savedAt`, TTL logic, content version, SHA, or `ohash`. This is last-known paint, not a
claim that disk still contains those bytes.

Expose a root-scoped removal helper and call it from the existing workspace forget/eviction path.
Do not clear the record on an ordinary root switch: the root key prevents a cross-workspace replay,
and keeping the previous active file is the point of the one-record cache. File-read error and dirty
transition use the path-scoped removal described below.

**Verify**:

```bash
cd apps/web
bun --bun vitest run --project node \
  src/lib/tests/editor-visible-snapshot-cache.test.ts \
  src/lib/tests/workspace-cache-storage.test.ts \
  src/features/workspace/state/tests/cache.test.ts
```

Expected: existing workspace-cache tests plus valid round-trip, deep schema rejection, pre-parse and
pre-write size caps, row/chunk/part/run caps, malformed-value removal, quota handling, and
overwrite-one-record cases pass. Workspace forget removes a matching-root record but leaves a
different-root record alone.

### Step 3: Capture only the latest stable clean viewport

Extract `addLifecycleFlush` from `use-cache-persistence.ts` into `lib/lifecycle-flush.ts`; preserve its
current `pagehide` and hidden-document behavior and cover add/remove/hidden-only behavior with a
focused DOM test.

Create `use-editor-visible-snapshot.ts` using the same stable-plugin pattern as
`use-scroll-persistence-plugin.ts`. `FileEditorBody` owns this workbench hook and passes its plugin
through Editor's existing `additionalPlugins` prop; do not import a workbench hook into the editor
feature.

The hook takes the active flag, the selected target `{ rootPath, path }`, and a separate rendered
document identity `{ documentId, rootPath, path, buffer }`, plus selected/committed/actually-applied
theme identities. The selected target controls lookup/transition; only the rendered identity may
own a capture key. `FileEditorBody` can temporarily hold document A while its selected `path` prop is
already B, so never derive the rendered path from that prop or store A's snapshot under B. Flush A
under A before the target transition when eligible, then suppress new capture while selected and
rendered paths differ.

Extend `LoadedEditorColorTheme` with the **actual** `resolvedThemeId` and populate
it at the load boundary: built-ins use their own id, a successful VS Code load uses the loaded
definition id, and a failed selection that resolves through `DEFAULT_DEFINITION_BY_COLOR_MODE` uses
the fallback definition id—not the requested id. Extend `EditorColorThemeState` with
`appliedThemeId: string | null` sourced from that result. Pair each async result with its own actual
resolved id, retain the existing cancellation guard for out-of-order loads, and never infer applied
identity from `shikiTheme`/selected id. Its contribution's `update` method only retains the latest
`EditorViewSnapshot`
reference and update kind. It must not call `toVisibleSnapshot()` or stringify on every scroll
frame. A 350 ms debouncer performs materialization and the cache write.

Define identity/generation ordering explicitly:

1. Before selected/rendered root/path/theme/active refs change, synchronously flush the old rendered
   identity under its own path only if it was active, clean, terminally painted, and still owns the
   pending generation.
2. Increment the generation, cancel its timer, then install the new refs.
3. Ignore every contribution update from an inactive or stale/disposed generation.
4. Lifecycle hide flushes the current generation once. Plugin disposal and component unmount are
   idempotent fallbacks; they cannot write after a newer identity has taken ownership.
5. A theme preview, commit, async load completion, or cancel cancels pending capture. Write only when
   selected, committed, and applied theme ids all match at flush time; every transition starts a
   fresh generation.

Capture only when all are true:

- this editor surface is active;
- selected and rendered root/path identities are equal;
- the rendered document's `buffer.isDirty()` is false at flush time;
- the snapshot document id matches the rendered document id, and the cache key uses that rendered
  document's path;
- at least one visible row exists;
- the snapshot's document-generation-aware initial-highlight status is `painted`, `plain`,
  `degraded`, or `error`; and
- selected, committed, and actually applied theme identities still match the captured generation.

At flush time, call `toVisibleSnapshot()` once. If it returns `null` because arbitrary widget DOM or
plugin-CSS-dependent paint is mounted, skip that write and record the bounded
`unreplayable-widget`/`unreplayable-plugin-css` diagnostic outcome; do not inspect the widget/styles
or delete a previously valid last-known record merely because the current viewport is not
representable.

Compose Editor's existing `onDirtyChange` callback at the one `FileEditorBody` boundary. When it
becomes dirty, cancel the timer, remove the matching cache record, dismiss any rendered overlay, and
then forward the normal dirty action. The contribution also re-checks `buffer.isDirty()` so callback
ordering cannot persist the edit.

If a cache write exceeds the size cap, keep the app/editor untouched and leave no record. Record
serialization duration, row/chunk/part/run count, and serialized bytes in the existing performance
diagnostic path for the benchmark; do not emit a log per scroll update.

**Verify**:

```bash
cd apps/web
bun --bun vitest run --project dom \
  src/features/workbench/tests/editor-visible-snapshot.test.tsx \
  src/lib/tests/lifecycle-flush.test.ts
```

Expected: tests prove scroll bursts cause one materialization/write, disposal and hidden-page events
flush once, old identity flush precedes new identity installation, inactive/stale generations cannot
overwrite the record, theme previews never persist, dirty state removes both stored and rendered
state, a committed-but-not-yet-applied theme cannot persist prior paint under its new id, and cleanup
removes every listener/timer/animation frame.

### Step 4: Replay the cache as an inert overlay until authoritative paint

Create `editor-visible-snapshot.tsx` as one render component and keep its pure token-to-row segment
logic in `workbench/utils/editor-visible-snapshot.ts`.

The renderer must:

- be `aria-hidden`, unfocusable, nonselectable, and `pointer-events-none`;
- install the serialized `EditorThemeJSON` on the overlay root through Editor's existing theme-variable
  helper (or its exact public equivalent) so Tree-sitter `var(--editor-...)` run colors resolve. Use
  the serialized foreground/token styles, but preserve Platform's actual transparent workbench editor
  and gutter surfaces instead of painting the theme's opaque background/gutter values over its glass
  parent. Match the live computed background, gutter, and cursor-line CSS; do not invent raw colors;
- use serialized token style only for `color`, `backgroundColor`, and `textDecoration`; never paint
  serialized font weight/style that the live CSS Highlight API ignores;
- reconstruct the fixed gutter residual and ordered lane widths. Render line numbers in the captured
  `line-gutter` lane, fold markers in the captured `fold-gutter` lane, active-number foreground from
  `gutterNumberCursorLine`, and cursor backgrounds only for the serialized lane ids. Reserve unknown
  lanes without inventing their plugin DOM;
- render separate content/gutter cursor-line surfaces, visible fold marker, mounted paint parts/runs
  after the captured left spacer, vertical geometry, and horizontal scroll offset. Control parts use
  their captured labels and `widthCells`; refusal parts use only their captured bounded labels. Never
  concatenate or fetch the omitted portions of a long logical line;
- clip all content to the editor pane;
- never create a fake textarea, caret, selection, minimap, or interactive gutter control;
- tolerate unknown/unsupported token styles by falling back to foreground text.

In `FileEditorBody`, synchronously read the one cache record for the current root/path/theme when a
cold file has no held live document. Keep that same parsed object in component state; do not re-read
or parse localStorage during render loops. Position the overlay above the real Editor after it mounts.
Replay may occur before the committed theme finishes loading because the record itself was captured
only when that theme was applied and carries its paint colors; the applied-theme equality is a write
guard, not an extra cold-read gate.

Add a document-generation-aware `initialHighlightStatus` to core `EditorState` and
`EditorViewSnapshot`, with:

```ts
type EditorInitialHighlightStatus = 'loading' | 'painted' | 'plain' | 'degraded' | 'error'
```

The status belongs to the current document generation. When a highlighter session exists, structural
readiness alone cannot make it terminal; wait until that highlighter's initial result has been
adopted by the mounted view. Without a highlighter, wait for the applicable structural token result.
`plain` means no token provider applies. Set `painted` only after token adoption has run through the
view, even when the valid result contains zero tokens. Reset it before attaching a replacement
document. Tests must cover structure-first and Shiki-first completion orders plus provider
registration changes.

An applicable highlighter/structural provider, theme, or syntax-configuration replacement on the
same document also transitions terminal -> `loading` **before** old tokens can be captured under the
new configuration. Notify contributions with that loading snapshot, then publish a fresh terminal
snapshot only after the replacement result is adopted. Keep `EditorInitialPaintEvent`'s phase ledger
once-per-document-generation: if that generation already emitted `highlight-settled`, this later
theme/provider refresh updates snapshots/capture state but does not emit a duplicate “initial” event;
if it had not settled yet, only the winning replacement pipeline may emit it.

Make the terminal state observable to snapshot consumers in the same ordered transition. The
current token path notifies view contributions during adoption and only finishes syntax bookkeeping
afterward; do not leave that ordering intact with a `loading` snapshot. Adopt the applicable result,
commit the generation's terminal status, then notify contributions with a freshly constructed
terminal `EditorViewSnapshot` (once for that update) before emitting the terminal paint event. An
untouched file must become cacheable immediately after its first highlight without requiring a
scroll, layout, edit, or second provider result.

Emit the typed `EditorInitialPaintEvent` exactly once per phase/generation from core, after the
mounted view has adopted the corresponding base text or terminal initial highlight state. Thread one
optional `onInitialPaint` callback through the React binding and Platform `Editor`; do not infer the
event from unrelated renders. Reattaching the same document/text version still receives a new
`documentGeneration`, and stale async provider results cannot emit for a newer generation.

For the matching `highlight-settled` event, schedule one animation frame and dismiss the overlay in
that frame. Cancel the frame on document change, dirty transition, deactivation, or unmount. The
benchmark records the matching next-frame marks with stable names:

- `editor.authoritative_text_paint` for the `text` phase; and
- `editor.authoritative_highlight_paint` only for `painted` or `degraded` terminal status.

`plain` and `error` still dismiss the overlay but emit only a terminal outcome, never a successful
highlight mark. Plan 061 must reuse this event and these marks for prepared-token handoff tests and
measurement rather than creating another ready flag.

The overlay also has non-authoritative escape paths:

- start a 1,500 ms presentation fail-safe when it first renders;
- dismiss immediately on file-read error and remove the matching stored record;
- dismiss synchronously in the pane's capture phase on `pointerdown`, `keydown`, or `focusin` before
  the event reaches the real Editor beneath it;
- dismiss/remove on a dirty transition; and
- reset on root/path/theme identity change.

The capture-phase escape must hide the overlay DOM immediately through its ref/`hidden` state before
queuing the React state cleanup; a batched `setState` alone is not a synchronous visual dismissal.
The original event still proceeds to the real editor. All dismissal paths share one idempotent helper
that cancels the fail-safe and pending authoritative-paint animation frame.

Do not compare cached row text to fetched file text. If the file changed, the overlay may be stale for
the bounded loading interval by design and is then wholly replaced. Do not persist or compare
`FileResult.version`; exact promotion belongs to Plan 061.

**Verify**:

```bash
cd apps/web
./node_modules/.bin/vitest run --config vitest.browser.config.ts \
  src/features/workbench/tests/editor-visible-snapshot.browser.tsx
```

Expected: in a real browser, a seeded matching record paints highlighted source before a deliberately
delayed real-file state, is dismissed before pointer/keyboard/focus pass-through, remains while the
applicable highlighter is pending, and disappears within one animation frame of authoritative paint.
Cover load error, hung load fail-safe, dirty transition, preview/commit/cancel, structure-first and
Shiki-first completion, an untouched first highlight, wrap-continuation content/gutter cursor lines,
selection-only caret movement without a row remount, tabs, C0/C1 control labels, folds, and
inline-transformed/overlapping-external plain fallbacks. Include an oversized BiDi-refusal line and a
huge ordinary one-line file at zero and nonzero horizontal scroll: the former stores only bounded
refusal paint, while the latter stores only mounted chunks at the captured left spacer. An arbitrary
plugin widget, class-only inline replacement, arbitrary row/gutter decoration class, or real Markdown
heading makes capture return `null` unless a future stable style contract represents it. Assert
computed-style parity with live Platform glass plus resolved Tree-sitter/Shiki run colors. Root,
path, theme, schema, row/chunk/part/run-count, and oversize mismatches render no overlay.

### Step 5: Finish public API and repository verification

Update `public-api.test.ts` to type-check both JSON DTOs, `toJSON()` methods, and
`toVisibleSnapshot()` through the package root and relevant category entrypoints. Regenerate/reconcile
`core-public-api.json` with `bun run health:write`, inspect the generated diff, then run
`bun run health`. Do not discard the existing selection/reveal additions.

Build Editor before checking Platform so the linked package declarations are current. Run narrow
tests first, then package gates.

Add the first version of `apps/web/scripts/editor-open-benchmark.mjs` and `bench:editor-open` script.
Plan 061 will extend it with intent/preparation stages. This version measures cold reload with and
without a seeded visible frame:

- use matched fixture copies and reset QueryClient/live-document/browser state between samples;
- randomize mode order after at least five warmups and collect enough trials for meaningful p50/p95
  (default 30 measured samples per mode);
- record navigation-to-cached-frame, navigation-to-authoritative-text, and
  navigation-to-authoritative-highlight;
- record `toVisibleSnapshot`, JSON encode/parse, cached React render, row/chunk/part/run count, and
  bytes;
- prove a cached frame is never counted as authoritative; and
- report long tasks and miss-path regression. Do not establish a hard timing threshold from one
  machine; keep structural correctness gates and paired timing output.

**Verify**:

```bash
(cd ../Editor && bun run health:write)
git -C ../Editor diff -- docs/architecture/phase-0/core-public-api.json
(cd ../Editor && bun run health)
(cd ../Editor && bun run typecheck)
(cd ../Editor && bun run lint)
(cd ../Editor && bun run format:check)
(cd ../Editor && bun run build)
(cd ../Editor/packages/react && ./node_modules/.bin/vitest run test/useEditor.test.ts)
(cd apps/web && bun run typecheck)
(cd apps/web && bun run lint)
(cd apps/web && bun run format:check)
bun --cwd apps/web run bench:editor-open
```

Expected: every command exits 0. Review both repository diffs and confirm no file outside the scope
list changed relative to the captured starting-status files.

## Test plan

### Editor tests

Create `../Editor/packages/editor/test/viewSnapshot.test.ts`, modeled on the editor construction and
viewport mocking helpers in `test/pluginLifecycle.test.ts`, covering:

1. `JSON.stringify(fullSnapshot)` delegates to `toJSON()` and returns the documented full DTO.
2. Full JSON materializes text/line starts exactly once and omits method-bearing runtime fields.
3. `toVisibleSnapshot()` never materializes full text or all line starts.
4. Visible extraction handles empty viewports, overscan, injected-only rows, wraps, tabs, folds,
   token edges, proxy-backed indexed tokens, and unindexed external fallback.
5. A huge one-line document at zero and nonzero horizontal scroll copies only the live mounted
   horizontal chunks/source ranges plus left spacer; extraction never reads or scans the omitted
   logical-line text.
6. C0/C1 controls serialize their actual mounted labels/widths, an oversized BiDi refusal serializes
   only its bounded refusal paint rather than raw line text, and an arbitrary plugin widget returns
   `null` without DOM traversal.
7. Class-only inline replacements, row/gutter decoration classes, unrecognized widget render mode,
   and a real Markdown heading return `null`; none can be mislabeled exact without a serialized CSS
   paint/geometry contract.
8. Inline-transformed display text becomes `plain-transformed`; source/display length mismatch is
   checked before source access, and a counting snapshot proves a tiny replacement backed by a huge
   hidden source span causes no large slice, token-array scan, or indexed range query. An
   all-transformed/core/injected viewport likewise performs zero token work. An ambiguous overlapping
   external token region becomes `plain-overlap`; neither fallback applies guessed source/style
   precedence.
9. Shiki tokens receive an index during creation and visible extraction does not scan all built-in
   tokens; a proxy-backed unindexed external array proves at most one full-array pass for many chunks.
10. Fixed gutter residual plus ordered line/fold lane widths, active-number foreground, per-lane
    cursor background, and distinct virtual-row content state reproduce a short document and wrapped
    continuation. Moving the caret refreshes these facts without a row remount.
11. Compact extraction copies the mounted row's O(1) fold marker and does not enumerate the full fold
    array.
12. Returned rows/chunks/runs/styles/themes/arrays are detached copies; compact runs contain only the three
    live-paint CSS properties.
13. Initial-highlight status is generation-bound and remains loading when structure finishes before
    Shiki; it becomes terminal only after the applicable result reaches the view. An already-painted
    document changing theme/provider/config returns to loading, cannot cache old paint under the new
    identity, then publishes a fresh terminal contribution without duplicating its initial event.
14. Token adoption commits terminal status and sends a fresh contribution snapshot, so an untouched
    initial highlight is capturable without a later scroll/layout/edit.
15. Initial paint emits one `text` and one `highlight-settled` event per generation; stale results,
    same-id reattachment, provider changes, and ready/pending prepared results cannot cross a
    generation or duplicate a phase.
16. Arbitrary cyclic row metadata does not break either JSON serializer because metadata is omitted.
17. Both DTOs survive `structuredClone`, and
    `JSON.parse(JSON.stringify(visibleSnapshot))` exactly matches `visibleSnapshot.toJSON()`.

### Platform tests

- Add shared cache tests for codec, byte/row/chunk/part/run caps, mismatch, corruption and
  single-record overwrite behavior; retain existing workspace cache coverage after extracting shared
  mechanics.
- Extend color-theme-store/provider coverage so successful built-in/VS Code loads expose their actual
  id, a failed requested theme exposes the fallback id, and a late older load cannot overwrite the
  newer applied id. Prove none of those cases can cache fallback colors under the requested key.
- Add a DOM hook test with fake timers for debounce, identity ordering, lifecycle, dirty, active and
  theme-preview rules, including selected B while held/rendered A never writing A under B.
- Add a real-browser overlay test for chunk/gutter-lane/cursor geometry, exact/plain-transformed/
  plain-overlap/plain-core-rendered output, C0/C1 and bounded BiDi refusal paint, widget-skip,
  selection-only refresh, transparent-surface and syntax-variable computed-style parity, input
  dismissal, error/fail-safe exits, Shiki ordering, generation-tagged text/highlight marks, and
  handoff timing.
- Run the cold-paint benchmark with isolated/randomized samples and retain its output in execution
  notes.
- Use app test fixtures and the real in-process file server where a file read is required. Do not mock
  Platform server/client modules or open a socket to the app server.

## Done criteria

- [ ] `EditorViewSnapshot` exposes documented `toJSON()` and `toVisibleSnapshot()` methods.
- [ ] `EditorVisibleSnapshot` exposes `toJSON()` and contains no full-document or method-bearing state.
- [ ] Full JSON is explicit and JSON-safe; visible JSON does not force full text/line starts.
- [ ] Compact paint uses mounted core parts, keeps controls/BiDi refusal bounded, and returns `null`
      instead of guessing arbitrary widget/plugin CSS paint or copying its raw source.
- [ ] Only one capped cache record exists under the existing workspace-cache namespace.
- [ ] No new hash, `ohash` dependency, storage-age TTL, file-version gate, or fetched-content
      comparison exists in the provisional-paint path.
- [ ] Dirty documents remove/skip the cache.
- [ ] Theme previews and committed-but-not-yet-applied loads cannot be cached under the committed
      identity.
- [ ] Failed and out-of-order theme loads report the actual resolved theme id; fallback colors are
      never labeled or persisted as the requested theme.
- [ ] A matching cold reload paints the inert cached viewport, then removes it after authoritative
      editor paint or a bounded error/interaction/fail-safe exit.
- [ ] Structure-first and Shiki-first completion orders use one generation-bound paint signal.
- [ ] Same-document theme/provider/config replacement resets capture status to loading before old
      paint can be cached, settles after adoption, and does not duplicate an already-fired initial
      paint event.
- [ ] Core/React expose one typed initial-paint event; plain/error terminal outcomes dismiss but
      cannot count as successful highlighted paint.
- [ ] Built-in Tree-sitter/Shiki compact extraction is vertically and horizontally bounded to mounted
      exact-eligible chunks; unsupported/transformed viewports do zero token-index work,
      source-length mismatch cannot read/query omitted text, and precedence-ambiguous external chunks
      fail safely to plain display text.
- [ ] Captured fixed/line/fold gutter lane geometry, active-number/per-lane cursor state, separate
      content cursor rows, chunk spacer geometry, transparent Platform surfaces, and cached syntax
      variables match the live editor's computed paint, including selection-only updates.
- [ ] A held/rendered document can never be cached under a newly selected path, and an untouched
      initial highlight produces a terminal contribution snapshot without incidental interaction.
- [ ] Cold-paint and serialization size/cost measurements are captured before and after.
- [ ] Editor focused tests, API health, typecheck, lint, format and build all exit 0.
- [ ] Platform focused node/dom/browser tests, typecheck, lint and format all exit 0.
- [ ] No user-owned Editor selection/reveal/cursor-history/geometry change was reverted or rewritten.
- [ ] No source file outside the in-scope lists changed relative to the recorded starting state.
- [ ] This plan is deleted, its `plans/README.md` row is removed, and Plan 061's row/note now refer
      to the landed paint/benchmark contract rather than deleted Plan 060.
- [ ] Root `PLAN.md`, if it scheduled the approved sequence, closes 060 and leaves 061 next within
      that sequence, preserving the landed typed command/focus boundary.

## STOP conditions

Stop and report instead of improvising if:

- Current snapshot creation no longer uses lazy full text/line starts or current tokens as described.
- A JSON-safe full representation would require serializing an opaque plugin value other than the
  already-excluded row metadata.
- The compact snapshot cannot locate visible tokens without an O(all tokens) scan for indexed arrays.
- Replaying cached rows requires modifying the editor's live document/session state.
- The only way to know authoritative paint is a timeout rather than editor syntax/document state.
- The work requires persisting dirty text or adding a user-facing setting.
- Existing uncommitted Editor edits overlap semantically rather than merely sharing files.
- A focused verification fails twice after a reasonable correction.

## Maintenance notes

- Adding a field to `EditorViewSnapshot` does not automatically add it to either JSON contract. Review
  both serializers and bump only the affected schema version deliberately.
- `EditorVisibleRowSnapshot.metadata` remains runtime-only until it gains an explicit JSON value type.
- The 256 KiB cap is a safety ceiling, not a performance target. Record actual p50/p95 serialized
  sizes before considering packing or IndexedDB.
- The cached layer is allowed to be stale because it is visual-only. If a future change feeds any of
  it into the live editor, that change crosses into Plan 061's validated promotion rules and needs a
  file/revision identity.
- Reviewers should scrutinize accidental full-document reads on viewport updates and any cache write
  inside a scroll frame.
