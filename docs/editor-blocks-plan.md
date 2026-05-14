# Editor Blocks Plan

## Goal

Add a core editor primitive for rendering structured UI attached to editor
text without replacing the editor as the source of truth for text, selection,
copy, cursor movement, find, and virtualization.

The first product use case is search result tabs, where platform search can use
one editor-backed generated document and attach file headers/actions through
blocks. The longer-term use case is notebook-style editing, where a cell can own
toolbars, run buttons, metadata, and output panels around a text range.

The editor must stay agnostic. It should not know about search, notebooks, or
any other product surface. It should only expose generic document, block,
surface, sizing, lifecycle, and command primitives that consumers compose.

## Non-Goals

- Do not make search tabs own editor virtualization or editor pooling.
- Do not replace normal text rows with arbitrary HTML in V1.
- Do not add overlay blocks in V1.
- Do not make raw unsanitized HTML the primary public API.
- Do not add search-only editor APIs.
- Do not keep the current complex search-tab renderer as a long-term fallback.
- Do not keep two search result rendering systems alive after the block-based
  search consumer ships.

Replacing a text row with arbitrary HTML can be added later as an escape hatch,
but it should not drive the core model. If a row is no longer text, editor
selection, copy, cursor mapping, hit testing, and find all need special cases.

## Core Model

An `EditorBlock` is a semantic unit anchored to a line or line range. It can
attach UI surfaces around that range.

```ts
export type EditorBlock = {
  readonly id: string
  readonly anchor: EditorBlockAnchor
  readonly top?: EditorBlockHorizontalSurface
  readonly bottom?: EditorBlockHorizontalSurface
  readonly left?: EditorBlockVerticalSurface
  readonly right?: EditorBlockVerticalSurface
}

export type EditorBlockAnchor =
  | {
      readonly row: number
    }
  | {
      readonly startRow: number
      readonly endRow: number
    }
```

The editor owns the layout slots. Consumers own the DOM mounted inside those
slots.

## Surface Sizes

Surfaces must declare the dimension that affects editor layout:

- `top` and `bottom` surfaces declare `height`
- `left` and `right` surfaces declare `width`

Use explicit union members instead of a `kind`/`type` discriminant so callers
do not have to pass a mode field, while still preserving strict IntelliSense.

```ts
export type FixedSize = {
  readonly px: number
  readonly minPx?: never
  readonly maxPx?: never
}

export type MinSize = {
  readonly px?: never
  readonly minPx: number
  readonly maxPx?: never
}

export type MaxSize = {
  readonly px?: never
  readonly minPx?: never
  readonly maxPx: number
}

export type BoundedSize = {
  readonly px?: never
  readonly minPx: number
  readonly maxPx: number
}

export type EditorBlockSize =
  | FixedSize
  | MinSize
  | MaxSize
  | BoundedSize

export type EditorBlockHorizontalSurface = {
  readonly height: EditorBlockSize
  readonly width?: never
  readonly mount: EditorBlockMount
}

export type EditorBlockVerticalSurface = {
  readonly width: EditorBlockSize
  readonly height?: never
  readonly mount: EditorBlockMount
}
```

This deliberately rejects an empty measured size. A measured surface must at
least declare a minimum, a maximum, or both.

## Mount Lifecycle

Core should expose a DOM-based lifecycle. Framework-specific helpers can live
outside the core package.

```ts
export type EditorBlockMount = (
  container: HTMLElement,
  context: EditorBlockMountContext
) => void | EditorDisposable

export type EditorBlockMountContext = {
  readonly blockId: string
  readonly surface: EditorBlockSurfaceSlot
  readonly anchor: EditorBlockAnchor
  readonly documentId: string | null
  readonly text: string
  focusEditor(): void
  setSelection(anchor: number, head: number): void
  requestMeasure(): void
}

export type EditorBlockSurfaceSlot = "top" | "bottom" | "left" | "right"
```

For React usage, add an adapter:

```ts
createReactEditorBlocksPlugin({
  blocks,
  renderSurface: (block, surface, context) => <CellToolbar cell={block} />,
})
```

The core editor should not import React.

## Layout Semantics

### Top And Bottom

`top` and `bottom` surfaces add vertical space around the anchored text range.
For fixed sizes, the editor can immediately calculate the virtual row size. For
measured sizes, the editor mounts the surface, observes its size, clamps it to
the declared bounds, and updates virtualization.

### Left And Right

`left` and `right` surfaces reserve horizontal lanes beside the anchored text
range. They are useful for notebook run controls, cell status, diagnostics, and
future inline action rails.

The editor should reserve the required lane width and ensure text rows in the
anchored range are laid out beside the lane. This should not be implemented as
an overlay because overlays complicate hit testing and selection.

### No Overlay In V1

Overlay blocks are intentionally excluded. They need a separate design for
stacking, pointer events, scroll clipping, selection interaction, and keyboard
focus routing.

### No Replace In V1

Replacing a row with HTML is intentionally excluded from the primary API. If a
future use case requires it, it should be added as a separate escape hatch with
explicit text fallback and editor behavior rules.

## Block Provider API

Add a generic block provider contribution for editor blocks:

```ts
export type EditorPluginContext = {
  registerBlockProvider(provider: EditorBlockProvider): EditorDisposable
}

export type EditorBlockProvider = {
  getBlocks(context: EditorBlockProviderContext): readonly EditorBlock[]
}

export type EditorBlockProviderContext = {
  readonly documentId: string | null
  readonly text: string
  readonly lineCount: number
}
```

The editor should recompute blocks when:

- the document changes
- a provider is added or removed
- a provider explicitly invalidates
- measured block size changes

## Consumer-Owned Rendering Boundary

Editor core should provide primitives, not product renderers. Consumers should
own their generated document text, block data, rendered DOM, command handlers,
and state mapping.

For search, platform remains the consumer. It keeps the search service, search
state, replace runner, workspace commands, and result contracts. The search
surface should use the generic editor block APIs to produce:

- one readonly generated result document
- block providers for file headers and later richer controls
- range highlights for passive and active matches
- command handlers for open result, collapse, expand, and replace

For notebooks, a notebook consumer can use the same APIs to produce:

- one editor document containing code cell text
- top surfaces for cell toolbars
- left surfaces for run/status rails
- bottom surfaces for output panels
- notebook-specific commands and focus routing

The important boundary is generic: editor core knows how to mount block
surfaces around text, but never knows what those surfaces mean.

## Search Rendering Cleanup Target

The final migration must remove the current search rendering stack from
platform. This includes the complex virtual multi-editor path, the single-doc
fallback, and stale tests/fixtures that only exist for those renderers.

Delete or replace with the block-based search consumer:

- `apps/web/src/features/search/search-result-editor-surface.tsx`
- `apps/web/src/features/search/search-result-document-editor.tsx`
- `apps/web/src/features/search/search-result-document.ts`
- `apps/web/src/features/search/search-result-view-model.ts`
- `apps/web/src/features/search/search-result-editor-pool.ts`
- `apps/web/src/features/search/search-result-virtual-list.ts`
- `apps/web/src/features/search/search-result-editor-surface.perf-entry.tsx`
- `apps/web/search-result-editor-surface.perf.html`
- renderer-only tests for the files above
- the fallback renderer path in `SearchBufferEditor`

Also clean up:

- imports and exports that only served the removed renderers
- obsolete CSS classes and CSS custom properties
- obsolete docs that describe the multi-editor search-tab renderer as current
- stale performance plans that no longer apply after the block-based renderer
  ships
- workspace cache or tab metadata that assumes a platform-owned search renderer

The end state should have no hidden "just in case" search result renderer in
platform. If block-based rendering fails, the product should show a clear
rendering failure state rather than silently falling back to the old renderer.

## Search Result Use Case

Platform search can move search tabs from many editor instances to one readonly
generated document:

- generated text contains file header lines and match lines
- file headers attach `top` surfaces or dedicated line-adjacent header surfaces
- collapse buttons update the search result document model
- replace file and replace match actions mount inside surfaces
- matches remain text rows with range highlights and normal editor selection

Example:

```ts
const block: EditorBlock = {
  id: `search-file:${path}`,
  anchor: { row: headerRow },
  top: {
    height: { px: 32 },
    mount: mountSearchFileHeader,
  },
}
```

If the header should visually sit where the synthetic header line is, the first
implementation should keep that line as small textual fallback rather than
replacing it. A later API can decide whether true row replacement is worth the
tradeoff.

## Notebook Use Case

Notebook cells attach UI to ranges:

```ts
const block: EditorBlock = {
  id: `cell:${cellId}`,
  anchor: {
    startRow: cellStartRow,
    endRow: cellEndRow,
  },
  top: {
    height: { px: 34 },
    mount: mountCellToolbar,
  },
  left: {
    width: { px: 40 },
    mount: mountCellRunRail,
  },
  bottom: {
    height: { minPx: 48, maxPx: 520 },
    mount: mountCellOutput,
  },
}
```

This supports:

- cell toolbar above code
- run/status rail on the left
- output panel below code
- measured output heights with explicit bounds
- normal text editing inside the anchored range

## Keyboard And Focus

Blocks can contain focusable controls. The editor needs clear rules:

- clicking a block control should not automatically move the editor cursor
- Escape from a block should return focus to the editor
- block controls should be able to request editor focus
- editor commands should keep working when focus remains inside the editor
- notebook-specific keyboard routing should live in notebook consumers, not core

Search result headers should support mouse actions first. Keyboard navigation
for block controls can be incremental once focus routing is stable.

## Implementation Phases

### Phase 1: Core Block API

- Export editor block types from `@editor/core`.
- Add `registerBlockProvider` to editor plugins.
- Add block provider invalidation and recomputation.
- Add block sorting, anchor validation, and lifecycle disposal rules.
- Add tests for provider registration, invalidation, sorting, and disposal.

### Phase 2: Fixed Vertical Surfaces

- Add fixed-height `top` and `bottom` block rows to the virtualized layout.
- Mount fixed vertical surface DOM with lifecycle disposal.
- Preserve cursor movement, selection, copy, find, gutters, and range
  highlights around vertical surfaces.
- Add tests for vertical row sizing, virtualization, mounted row recycling, and
  geometry.

### Phase 3: React Blocks Adapter

- Add `createReactEditorBlocksPlugin`.
- Render surfaces through React portals.
- Ensure unmount happens when rows virtualize away, blocks change, or editor
  disposes.

### Phase 4: Horizontal Surfaces

- Add `left` and `right` surface layout.
- Reserve lane widths beside anchored ranges.
- Preserve hit testing, selection, copy, gutters, and cursor behavior beside
  horizontal lanes.
- Add tests for horizontal lane sizing, hit testing, and geometry.

### Phase 5: Measured Surfaces

- Add measured size support with bounds.
- Use `ResizeObserver` internally and debounce virtualization updates.
- Clamp measured size to `minPx` and `maxPx`.
- Add tests for measurement updates, row-size recalculation, clamping, and
  mounted DOM recycling.

### Phase 6: Generic Blocks Hardening

- Verify fixed and measured surfaces together in the same document.
- Verify top, bottom, left, and right surfaces can coexist on the same block.
- Verify readonly and editable documents both work with blocks.
- Add notebook-shaped fixtures to prove the API supports toolbar, run rail, and
  output panel composition without notebook-specific editor APIs.
- Run editor typecheck and focused editor tests.

### Phase 7: Replace Platform Search Renderer

- Replace search-buffer tabs with one readonly generated editor document that
  uses generic block APIs for file headers and actions.
- Keep platform responsible for search execution, state, replace operations,
  and workspace navigation.
- Implement file headers with path, count, icon, open action, collapse, and
  replace group.
- Implement match rows with source line labels, passive highlights, and active
  highlights.
- Implement open file and open match behavior.
- Implement active result selection and keyboard navigation.
- Implement replace all, replace file, replace next, and replace match actions.
- Implement pending/loading, empty, error, and render-failure states.
- Implement readonly selection, copy, and find behavior.
- Run large-result benchmarks against the current renderer before deleting it.
- Run typecheck and focused search/editor tests.
- Make sure it looks exactly 1 to 1 the same as it looked before!

### Phase 8: Delete Platform Search Renderers

- Delete the complex virtual multi-editor search result surface.
- Delete the single-doc fallback renderer from platform.
- Delete renderer-specific models, pools, virtual-list helpers, perf harnesses,
  and tests that do not belong to the block-based renderer.
- Remove all imports from `SearchBufferEditor` to the deleted renderers.
- Remove stale CSS, docs, workspace-cache assumptions, and search-tab
  performance plans that only applied to the deleted renderer.
- Run typecheck and focused search tests to verify no stale references remain.

## Acceptance Criteria

- Search result tabs can render structured file headers inside one editor
  document through the generic editor block APIs.
- Blocks do not break cursor movement, selection, copy, find, or readonly mode.
- Large search result sets avoid per-file editor instances.
- Block DOM is mounted only for visible virtualized regions.
- Measured blocks cannot silently grow without notifying editor layout.
- Notebook cells can express top toolbar, left controls, and bottom output
  without new core primitives.
- Platform no longer contains the old complex search-tab renderer.
- Platform no longer contains the old single-doc fallback renderer.
- Search result rendering has one owner: the block-based search renderer.

## Open Questions

- Should search file headers be `top` surfaces above a fallback line, or should
  V2 introduce explicit row replacement?
- Should measured surfaces be allowed in search, or only notebook-like modes?
- Should block providers be pure functions, or should they own invalidation
  callbacks?
- Should left/right lanes participate in editor gutter width, or be separate
  content-side lanes?
