# Search Result Editor Refactor Plan

## Goal

Replace the current plain virtual search-result document with a Zed-shaped
search result editor surface:

- file groups remain first-class UI rows with path, count, collapse, and replace
  controls
- each content match renders as a readonly editor excerpt, not as one line in a
  generated mega-document
- excerpts eventually get real syntax highlighting, editor selection, copy, and
  find behavior
- editor-core exposes enough primitives that this does not require reimplementing
  editor rendering in React

The search tab should feel like a structured result buffer, not a flat text
dump.

## Current State

Search-buffer tabs currently render grouped results by projecting search state
into one readonly virtual editor document:

- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-buffer-editor.tsx`
- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-result-document.ts`
- `/Users/shaul/Desktop/platform/apps/web/src/features/search/search-result-document-editor.tsx`

This proved that an editor-backed search tab is viable, but the model is wrong:

- file headers are just text rows, so they cannot naturally own rich UI
- collapse and replace controls belong outside the generated text
- syntax highlighting per result is awkward because the whole document is one
  synthetic language-less buffer
- match rows have source mapping bolted on after the fact
- readonly behavior is implemented by filtering keys and blocking input events
- editor focus/selection sync can fight the search input because the result tab
  is one large controlled editor

The sidebar search tree is still the right compact experience. This refactor is
for search-buffer tabs only.

## Product Shape

The target search-buffer tab is a vertically virtualized list of structured file
groups:

```text
apps/server/src/fs/search.ts                  12 matches      [replace file]
  811  function addLineMatch(...)
  846  const preview = searchPreview(line, columnIndex)
  854  preview: preview.text,

apps/web/src/features/search/search-buffer-editor.tsx          4 matches
  47   const searchDocument = useMemo(...)
```

Important behavior:

- File headers are clickable and open the file.
- File headers can collapse/expand their match excerpts.
- Active result state is shared with the sidebar/search summary.
- Clicking or pressing Enter on an excerpt opens the source match.
- Search result navigation moves between excerpts, not arbitrary blank text
  rows.
- Match highlights use the same yellow visual language as the sidebar.
- Active match highlight is distinct from passive match highlights.
- Replace controls remain available at all, file, and match levels.
- Large result sets stay responsive through virtualization.

## Result Data Model

The current `WorkspaceSearchMatch.preview` shape is useful for the sidebar but
too small for an editor excerpt. Add a view-model layer for search-buffer tabs:

```ts
type SearchResultFileBlock = {
  readonly id: SearchResultId
  readonly path: string
  readonly pathLabel: string
  readonly languageId: EditorSyntaxLanguageId | null
  readonly collapsed: boolean
  readonly matchCount: number
  readonly excerpts: readonly SearchResultExcerpt[]
}

type SearchResultExcerpt = {
  readonly id: SearchResultId
  readonly path: string
  readonly languageId: EditorSyntaxLanguageId | null
  readonly startLine: number
  readonly text: string
  readonly matchRanges: readonly SearchResultRange[]
  readonly sourceMatch: WorkspaceSearchMatch
}

type SearchResultRange = {
  readonly end: number
  readonly start: number
}
```

Near-term, excerpts can still be built from `WorkspaceSearchMatch.preview`.
Longer term, the provider should return richer excerpts:

- one or more lines of surrounding context
- exact range offsets inside excerpt text
- source start line for gutter display
- multiple ranges when one excerpt contains multiple matches
- stable excerpt identity independent of preview window truncation

This avoids treating display text as the source of truth.

## UI Architecture

Replace the single `SearchResultDocumentEditor` with a structured view:

```text
SearchBufferEditor
  SearchResultEditorSurface
    SearchResultToolbar/Summary
    SearchResultVirtualList
      SearchResultFileHeader
      SearchResultExcerptEditor
```

Ownership:

- `SearchBufferEditor` owns search controls, replace controls, and command
  integration with the workspace.
- `SearchResultEditorSurface` owns the result layout, virtualization, active
  result, and keyboard navigation.
- `SearchResultFileHeader` owns file-level UI: path display, count, collapse,
  open file, replace file.
- `SearchResultExcerptEditor` owns only the editor excerpt rendering and local
  interaction for one match or one grouped preview.

The old `SearchResultsView` remains the sidebar implementation and fallback.

## Virtualization

There are two layers of virtualization:

- editor-core already virtualizes rows inside each mounted editor instance
- the search result surface still needs outer list virtualization so we do not
  mount one editor instance for every result in a large search

Use TanStack Virtual for the outer list of file headers and excerpt editor
instances. One editor instance per result is acceptable only if the outer list
mounts roughly:

- visible viewport rows
- small overscan above and below
- no hidden editor instances for collapsed groups

The virtual row model should contain both headers and excerpts:

```ts
type SearchResultVirtualRow =
  | { type: "file"; file: SearchResultFileBlock }
  | { type: "excerpt"; fileId: SearchResultId; excerpt: SearchResultExcerpt }
```

Initial implementation can estimate excerpt height from line count and row
height. After excerpt editors mount, measured heights should be cached by row
id.

## Editor-Core Primitives Needed

The refactor should not require the search UI to fake editor internals. Expose
small editor-core primitives instead.

### Readonly Mode

Readonly must be a first-class editor option:

```ts
type EditorEditability = "editable" | "readonly"
```

Readonly should:

- allow focus, cursor movement, selection, copy, and find
- reject text input, paste, drop, undo/redo edits, and editing commands
- prevent dirty state changes
- avoid requiring every consumer to manually filter keybindings

### Excerpt Gutter

Search excerpts need source line numbers:

```ts
type EditorLineGutterOptions = {
  readonly startLine?: number
  readonly minDigits?: number
}
```

The line gutter should be able to display `startLine + row` while editor
positions stay zero-based inside the excerpt document.

### Semantic Range Highlights

Search wants reusable highlighted ranges:

```ts
type EditorRangeDecoration = {
  readonly className?: string
  readonly end: number
  readonly start: number
  readonly style?: Partial<CSSStyleDeclaration>
}
```

Needed ranges:

- passive search match
- active search match
- replacement preview range later

Prefer class-based decorations for theme/high-contrast support, with inline
style as a lower-level escape hatch.

### Static Excerpt Documents

Expose a cheap way to mount readonly text without full edit history:

```ts
type EditorDocumentMode = "session" | "static"
```

Static documents should be optimized for excerpt editors:

- no undo stack
- no dirty state
- no write path
- stable revision input
- still eligible for syntax highlighting and find

### Syntax Highlighting

`SearchResultExcerptEditor` should pass `languageIdForFilePath(path)` into the
editor. Reuse the existing syntax plugin path instead of inventing separate
React syntax rendering.

Open question: whether every visible excerpt should load tree-sitter/shiki
immediately, or whether syntax highlighting should be deferred until idle for
large result sets.

## Font And Size

Do not add search-specific font or size APIs.

The editor should already support arbitrary font family, font size, row height,
and theme through existing editor styling/options. The search excerpt refactor
should use those existing mechanisms. If we find a missing generic knob, add it
as an editor-wide primitive, not a search-only prop.

## Commands And Keymaps Refactor

The current editor-core default keymap is too large for readonly excerpts. It
bundles basic navigation, editing, find, line actions, multi-cursor actions, and
advanced commands into one default.

Refactor editor commands into composable command/keymap layers.

### Command Packs

Split editor commands into packs:

```ts
type EditorCommandPack =
  | "navigation"
  | "selection"
  | "clipboard"
  | "find"
  | "text-editing"
  | "advanced-editing"
  | "multi-cursor"
  | "lsp-navigation"
```

Search excerpts should enable:

- `navigation`
- `selection`
- `clipboard`
- maybe `find`

Search excerpts should not enable:

- `text-editing`
- `advanced-editing`
- `multi-cursor`
- `lsp-navigation` until source navigation semantics are explicit

### Keymap Layers

Use ordered keymap layers instead of one merged default list:

```ts
type EditorKeymapLayer = {
  readonly id: string
  readonly bindings: readonly EditorKeyBinding[]
  readonly source?: "core" | "plugin" | "app" | "user"
}

type EditorKeymapOptions = {
  readonly enabled?: boolean
  readonly layers?: readonly EditorKeymapLayer[]
}
```

Resolution rule:

- normalize keys
- resolve from first to last for registration order, or from last to first for
  lookup
- the last layer wins when two bindings claim the same key in the same context
- allow explicit no-op/unbind entries later

This can be implemented as arrays first. It does not have to be a full plugin
system on day one.

### Plugin-Contributed Keymaps

Editor plugins should eventually be able to contribute keymap layers:

```ts
type EditorPluginContribution = {
  readonly commands?: readonly EditorCommandRegistration[]
  readonly keymapLayers?: readonly EditorKeymapLayer[]
}
```

That lets advanced editing, find, LSP, and app-specific behavior install their
own bindings. It also creates a clean "last plugin wins" story without
hard-coding all defaults in editor-core.

Open question: whether command registration and keymap registration should be
one plugin contribution API, or whether keymaps should remain a plain array
owned by the app. The safe first step is arrays, with plugin contribution as an
extension point after the resolver exists.

### Default Editor Behavior

The default editor should become minimal:

- navigation
- selection
- clipboard
- basic text input handling

Advanced defaults should be opt-in through standard packs/layers:

- find
- line edit actions
- block/line comments
- move/copy lines
- multi-cursor
- LSP navigation

The app can still assemble a full product editor by passing the standard layers
in the default order.

## Search Tab Key Behavior

Search-result tabs should own high-level result commands outside the excerpt
editor:

- next result
- previous result
- open selected result
- collapse selected file
- expand selected file
- replace selected match
- replace selected file

The excerpt editor should handle only local editor-like interaction:

- cursor movement inside the excerpt
- selection/copy
- local find within mounted excerpt if enabled

Global find for the whole search tab is a separate product decision. A
Zed-style result buffer might want find over visible structured results, but the
current search query already defines the result set.

## Implementation Phases

### Phase 1: Document The Target And Remove The Worst Coupling

Status: Done.

- Keep the current single virtual document working as a fallback.
- Add this design doc.
- Add TODO references from `workspace-search-next-steps.md` to this plan.
- Stop adding features to the mega-document path except bug fixes.

### Phase 2: Build The Structured Search View Model

- Add `SearchResultFileBlock` and `SearchResultExcerpt` builders.
- Preserve existing stable result IDs.
- Build excerpts from current `WorkspaceSearchMatch.preview`.
- Add tests for groups, collapse, match ranges, and source mappings.
- Keep rendering with simple React rows first if needed.

### Phase 3: Add Editor-Core Readonly/Static Primitives

- Add first-class readonly mode.
- Add static document mode if needed for cheap excerpt mounting.
- Add source-line gutter support.
- Add semantic range decorations.
- Add tests in editor-core for readonly input blocking, selection/copy safety,
  gutter numbering, and decorations.

### Phase 4: Refactor Editor Keymaps

- Split default key bindings into named layers or packs.
- Make the full app editor assemble the same behavior it has today.
- Make search excerpt editors opt into only readonly-safe layers.
- Add conflict behavior tests: later layer wins.
- Keep compatibility helpers for current `bindings` callers during migration.

### Phase 5: Render Virtualized Excerpt Editors

- Add `SearchResultEditorSurface`.
- Add `SearchResultFileHeader`.
- Add `SearchResultExcerptEditor`.
- Mount excerpt editors only in virtualized visible rows.
- Wire active result sync, click, Enter, next/previous navigation, and source
  open.
- Add passive and active match highlights.
- Preserve sidebar behavior.

### Phase 6: Syntax Highlighting And Polish

- Pass language ids into excerpt editors.
- Reuse the existing syntax highlight plugin.
- Defer syntax work for large result sets if needed.
- Tune file header and excerpt spacing against Zed.
- Add high-contrast-safe highlight classes.
- Add visual smoke tests for dense result sets.

### Phase 7: Richer Provider Excerpts

- Extend search provider output to support multi-line excerpts.
- Include exact ranges in excerpt coordinates.
- Support multiple ranges per excerpt.
- Handle future multi-line regex matches.
- Add dirty-buffer parity tests for excerpt ranges.

## Migration Strategy

Keep both renderers temporarily:

```ts
type SearchResultTabRenderer = "document" | "structured"
```

Use a feature flag or local constant while building. Once the structured
renderer covers:

- active result sync
- open source
- collapse
- replace
- copy/select
- syntax highlighting baseline
- large result performance

remove the mega-document renderer.

## Risks

- Many editor instances can be expensive. Virtualization is mandatory.
- Syntax highlighting every mounted excerpt may still be expensive. Defer or
  throttle if needed.
- Selection across multiple excerpts will not naturally work if each excerpt is
  a separate editor. Decide whether cross-result selection is required. Zed-like
  structured results may not need it initially.
- Find across all results is not the same as editor find within one excerpt.
  Treat it as a product decision, not an accidental consequence.
- Command/keymap refactor can destabilize normal editing. Keep app editor
  behavior covered by tests before switching search excerpts to the new model.

## Open Questions

- Should one file with many nearby matches merge them into one multi-line
  excerpt, or keep one excerpt per match?
- Should search tabs be live views of the active search state or immutable
  snapshots?
- Should result-tab find search within all excerpts, only focused excerpt, or
  remain the existing workspace search input?
- Should source line gutter numbering live in the line gutter plugin, or should
  excerpt editors provide a custom gutter contribution?
- Should command/keymap layers be plain arrays forever, or become plugin
  contributions once editor-core has a resolver?

## Success Criteria

- Search-buffer tabs visually read as structured search results, not a generated
  text file.
- Each result excerpt can show syntax highlighting for its source language.
- Readonly excerpt editors cannot mutate text or dirty editor state.
- Normal app editor behavior remains unchanged after command/keymap splitting.
- Large result sets remain smooth while scrolling.
- The old single-document result renderer can be deleted without losing
  behavior.
