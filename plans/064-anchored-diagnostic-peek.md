# Plan 064: Ship one anchored diagnostic peek without restoring block surfaces

> **Executor instructions**: Read this plan completely before editing. Then read
> both `/Users/shaul/Desktop/D/platform/AGENTS.md` and
> `/Users/shaul/Desktop/D/Editor/AGENTS.md`, Platform `PLAN.md`,
> `apps/web/src/keymap/state/command-bus.ts`, `apps/web/src/lib/focus/state/service.ts`,
> `apps/web/src/keymap/tests/command-focus.browser.tsx`,
> `docs/editor-parity-implementation-plan.md`, Editor
> `docs/positions/anchors.md`, Editor `docs/display/transforms.md`, and
> `/Users/shaul/.agents/skills/never-nester/SKILL.md`. Follow the steps in
> order and run every verification gate. Stop on any condition in **STOP
> conditions**; do not improvise a broader surface system.
>
> This plan is deliberately consumer-first. Its only product consumer is the
> E2 diagnostic peek opened by `editor.action.marker.next` and
> `editor.action.marker.prev`. Definition/references peek, inline chat,
> quick-diff, test failures, comments, and extension hosting do not inherit this
> contract. They need their own ordinary-React go/no-go decision later.
>
> **Hard dependency**: the landed typed command/focus runtime must remain verified, and root
> `PLAN.md` must schedule this parity work. Its deepest-target FocusService and explicit
> overlay-origin restoration are part of this plan's acceptance contract. Do not rebuild them
> locally or add a compatibility focus/dispatch path.
>
> **Mandatory gate**: source inspection already proves that marker navigation
> exposes no chosen-diagnostic event and `trackRanges` drops a collapsed span.
> Those two narrow gaps are required in either outcome; they must not be used to
> predetermine the geometry decision. Step 0 is a no-production-code,
> real-browser composition spike that supplies a synthetic marker event and
> isolates the remaining question. If the current view-contribution lifecycle,
> `trackRanges`, `getRangeClientRect`, and `scrollElement` can drive an ordinary
> React child, record **NO-GO — MANAGED GEOMETRY** and implement Path A. Only a
> failure in native rect semantics or contribution update/teardown semantics
> authorizes **GO — MANAGED GEOMETRY** and Path B. Product preference,
> provenance, collapsed-point tracking, or hypothetical reuse is not a GO
> reason. Never implement both paths.
>
> **Drift checks (run first)**:
>
> ```bash
> cd /Users/shaul/Desktop/D/platform
> git diff --stat bcd4a5b0 -- \
>   PLAN.md \
>   apps/web/src/keymap/state/command-bus.ts \
>   apps/web/src/keymap/tests/command-focus.browser.tsx \
>   apps/web/src/features/editor \
>   apps/web/src/features/workbench/components/file-editor-body.tsx \
>   apps/web/src/features/workbench/components/diagnostics-panel.tsx \
>   apps/web/src/lib/diagnostic.ts \
>   apps/web/src/lib/focus \
>   apps/web/vitest.browser.config.ts
> git status --short > /tmp/plan-064-platform-before.txt
>
> cd /Users/shaul/Desktop/D/Editor
> git diff --stat f19086e -- \
>   packages/editor/src/plugins.ts \
>   packages/editor/src/editor/Editor.ts \
>   packages/editor/src/editor/inputSelectionController.ts \
>   packages/editor/src/editor/trackedAnchorGeometry.ts \
>   packages/editor/src/public/extensions.ts \
>   packages/editor/test/rangeTracking.test.ts \
>   packages/editor/test/trackedAnchorGeometry.browser.test.ts \
>   packages/editor/test/public-api.test.ts \
>   packages/lsp-plugin/src \
>   packages/lsp-plugin/test/diagnosticsPresenter.test.ts \
>   packages/lsp-plugin/test/plugin.test.ts
> git status --short > /tmp/plan-064-editor-before.txt
> ```
>
> Command/focus drift from the planning base is expected; reconcile against the landed
> FocusService names and behavior before continuing. At planning time Platform
> had user-owned planning changes.
> Editor had user-owned, out-of-scope changes in `documentTextSnapshot.ts`, the
> piece-table walker, Shiki worker/token files, and their tests. Never revert,
> stash, overwrite, or format those edits. If later drift overlaps a symbol or
> file in this plan's source scope, stop and ask the operator to reconcile
> ownership.

## Status

- **State**: Next; mandatory managed-geometry go/no-go
- **Priority**: P2
- **Effort**: M after a GO decision; S if the gate returns NO-GO
- **Risk**: HIGH — edit-stable anchors, virtualized/BiDi geometry, cross-package
  ownership, React cleanup, and actual DOM focus meet at one boundary
- **Depends on**: the landed typed command/focus runtime; root `PLAN.md` schedules plan 064
- **Category**: direction / architecture / E2 parity
- **Planned at**: Platform `bcd4a5b0`, Editor `f19086e`, 2026-08-24

## Outcome

After either implementation path:

1. Running the existing next/previous diagnostic marker command selects and
   reveals the diagnostic exactly as today, then offers one typed, edit-stable
   anchor event to Platform.
2. Editor owns only the native point/range anchor, client-pixel geometry, and
   view lifecycle. Path A composes the existing narrow APIs in a Platform-authored
   contribution; Path B adds one managed geometry handle only if the gate proves
   that composition insufficient. Editor mounts no product DOM and imports no
   React.
3. Platform owns the diagnostic view model, React surface, placement policy,
   related-information navigation, focus/input policy, and consumer cleanup.
4. The peek is a floating overlay. It does not reserve height, add a display
   row, alter wrapping, participate in selection/copy/find, or change the fixed
   row virtualizer.
5. A hidden anchor can become visible again after scrolling. A deleted range,
   replaced document, cleared view, disposed view, or consumer release is
   terminal and closes the product surface.
6. Exactly one producer test and one consumer test chain prove the selected
   contract across the linked Editor packages and Platform.

`NO-GO — MANAGED GEOMETRY` is a successful product outcome, not a stop: add
only the known-required marker event and point tracker, then build the surface
with ordinary React composition. `GO — MANAGED GEOMETRY` substitutes the one
managed anchor/geometry handle for that composition. Neither result authorizes
an Editor render host.

## Why this is the first consumer

`docs/editor-parity-gap-matrix.md:55-56` rates marker navigation plus its
missing diagnostic peek as S, while embedded definition/references peek is M.
The next/previous marker commands and selection/reveal behavior already exist
in `packages/lsp-plugin/src/plugin.ts:552-562,1102-1111` and
`diagnosticsPresenter.ts:82-106`. Platform already receives the full diagnostic
payload in `features/editor/state/language-server-status-source.ts:7-18` and
already renders message, severity, source data, and navigation targets in
`features/workbench/components/diagnostics-panel.tsx:18-155`.

That makes one diagnostic message attached to one selected marker the smallest
honest product proof. Definition peek would add target-file loading and a
second Editor before the anchoring boundary is known. References already use
ordinary React side composition in
`features/workbench/components/file-editor-body.tsx:55-89`. E7 inline chat adds
streaming, editable diffs, and acceptance policy and therefore cannot define
this API.

## Audited current state

### Platform can already host ordinary React

- `features/editor/components/frame.tsx:13-17,34-47` already accepts `children`
  beside `EditorHost`; no React portal or Editor-owned mount callback is needed.
- `features/editor/utils/diff-language-plugin.ts:51-95,187-206` is the precedent
  for a Platform-authored view contribution reading `scrollElement`, querying
  `getRangeClientRect`, following contribution updates, and cleaning up.
- FocusService now resolves the deepest registered target and retains the last compatible Editor
  while an overlay owns focus. That landed behavior is a hard dependency rather than a file-level
  convenience.

### Editor has the composition pieces; two narrow gaps are source-proven

- Piece-table anchors are typed by `AnchorBias`, `AnchorLiveness`, `Anchor`,
  and `ResolvedAnchor` in
  `packages/editor/src/pieceTable/pieceTableTypes.ts:14-31`. The locked position
  design says widgets use anchors while layout uses offsets/points at
  `docs/positions/anchors.md:143-151`.
- `EditorTrackedRanges.resolve()` in `packages/editor/src/plugins.ts:247-257`
  is the current view-level durable range helper. Its implementation at
  `Editor.ts:2304-2339` hides piece anchors, returns offsets only, and drops a
  collapsed span. The first consumer therefore needs one point-tracking sibling
  if ordinary composition wins; that fact is not evidence for a managed
  geometry handle.
- `EditorViewContributionContext.getRangeClientRect()` at
  `plugins.ts:259-335` returns `DOMRect | null`. The implementation at
  `inputSelectionController.ts:1585-1597` returns the first client rect or a
  bounding rect. `null` currently conflates offscreen virtualization, folded or
  otherwise unrendered text, missing document, and unmeasurable geometry.
- View contributions receive `document`, `content`, `tokens`, `selection`,
  `viewport`, `layout`, and `clear` updates, and are disposed on removal,
  failure, or Editor teardown. See `plugins.ts:337-366` and
  `editor/viewContributions.ts:16-124`.
- `DiagnosticsPresenter.moveMarker()` selects/reveals one sorted diagnostic but
  returns only handled/unhandled through the command route. Platform cannot
  recover which duplicate diagnostic won from a later selection observation,
  so one typed producer event is required in either gate outcome.

### Existing render mechanisms are deliberately not the answer

- Injected rows are fixed-height text projections with numeric buffer-row
  anchors (`displayTransforms.ts:73-84`); they host no interactive React DOM.
- Inline replacements have excellent mount/dispose precedent but remain
  single-line, width-affecting atomic runs (`inlineMap.ts:28-60` and
  `virtualizedTextViewRows.ts:1209-1356`).
- Decorations paint edit-tracked ranges and have no mounted product-surface
  ownership (`editor/decorationStore.ts:8-89`).
- LSP completion, hover, signature, and rename share a package-private raw-rect
  helper (`packages/lsp-plugin/src/anchoredSurface.ts:34-140`). It owns a CSS
  anchor element and placement, not a durable Editor anchor exposed to React.
- The current display projection registry contains only folds, row/range
  decorations, injected rows, and gutters
  (`editor/displayProjectionRegistry.ts:8-20`). Every visible row is text.

### Block surfaces are deleted history

Editor commit `79744438b70757d5781be1b1c7f0d771292384e9`
(`refactor(editor): remove block surfaces`) deleted 4,548 lines across 66 files:
the block provider/types, four surface lanes, controller, virtualized block
lanes, React bridge, CSS, and tests. The historical API at
`79744438^:packages/editor/src/editorBlocks.ts` combined row/range anchors,
four slots, four sizing modes, arbitrary mount callbacks, document text,
focus, selection, and measurement. That breadth is exactly what this plan must
not recreate.

Current authority is explicit: `PROGRESS.md:37-38`,
`docs/display/transforms.md:93-94`, and
`docs/architecture-recovery-plan.md:74-76` say removed block APIs are not
compatibility targets. `virtualization/rowHeightIndex.ts:1` says no production
code feeds non-uniform row sizes today. Treat old block names elsewhere in
parity prose and test comments as remnants, not implementation instructions.

## Ownership and contract

| Concern                         | Owner                                 | Required behavior                                                                                                                                                                 |
| ------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diagnostic/LSP data             | Platform after event delivery         | Normalize the immutable event payload into a Platform view model; retain no Editor-side product store.                                                                            |
| Text identity and edit tracking | Editor                                | Anchor one point or one non-empty range to the current document with explicit bias. Path A reuses `trackRanges` and adds only `trackPoint`; Path B uses the gated managed handle. |
| Native geometry                 | Editor                                | Own rect production through the current range-geometry/view APIs in Path A or the managed handle in Path B. Platform may only copy finite numeric results.                        |
| View lifecycle                  | Editor                                | Drive content/viewport/layout/document/clear updates and contribution disposal in Path A; publish handle snapshots in Path B.                                                     |
| Placement and collision policy  | Platform                              | Choose above/below, clamp to the Editor clip rectangle, and render with dynamic position only.                                                                                    |
| Product DOM and styling         | Platform React                        | One component, theme tokens and shared UI primitives; no Editor mount callback.                                                                                                   |
| Focus/input                     | Platform FocusService + React surface | Keep source Editor focus on passive open; deepest overlay target wins after a control is focused.                                                                                 |
| Producer cleanup                | Editor/LSP                            | Retain one claimed consumer cleanup and invoke it before replacement and on presenter/plugin disposal. Never own product state or a claimed geometry handle.                      |
| Consumer cleanup                | Platform                              | Dispose/discard its tracker, source subscription, and focus registration on replace, close, invalidation, tab/document change, contribution disposal, and unmount.                |

### Shared typed anchor and producer contract

Both paths export the same native anchor descriptor through
`@singapor/core/extensions`. It describes one diagnostic location; it is not a
surface registration:

```ts
type EditorTextAnchor =
  | { readonly kind: 'point'; readonly offset: number; readonly bias: 'left' | 'right' }
  | {
      readonly kind: 'range'
      readonly start: number
      readonly end: number
      readonly startBias: 'left' | 'right'
      readonly endBias: 'left' | 'right'
    }
```

The LSP package extends its existing options rather than adding a second plugin
or command:

```ts
type LanguageServerDiagnosticMarkerEvent = {
  readonly direction: 'next' | 'previous'
  readonly diagnostic: lsp.Diagnostic
  readonly documentUri: lsp.DocumentUri
  readonly textVersion: number
  readonly anchor: EditorTextAnchor
}

type LanguageServerDiagnosticMarkerClaim =
  | { readonly kind: 'claimed'; dispose(): void }
  | { readonly kind: 'ignored' }

onDidNavigateDiagnostic?(
  event: LanguageServerDiagnosticMarkerEvent,
): LanguageServerDiagnosticMarkerClaim
```

`DiagnosticsPresenter.moveMarker()` retains the chosen diagnostic beside its
sorted offset range, performs the existing selection/reveal/focus, creates a
point descriptor for a collapsed diagnostic or a range descriptor otherwise,
then invokes the callback. It keeps at most one claimed cleanup. Before the
next marker event and on presenter/plugin disposal it calls that cleanup once;
the Platform cleanup is idempotent if the user already closed the peek. An
absent callback, `ignored`, or a thrown callback leaves no producer resource;
thrown callbacks go through the existing plugin error boundary and navigation
remains handled. Do not infer a claim from `void`, cache product data in LSP,
or change `onOpenDefinition`/`onOpenReferences`.

The event carries a descriptor, never a geometry handle. Platform's own view
contribution validates `documentUri`/`textVersion`, creates the selected path's
tracker, and returns the claimed cleanup. This keeps anchor ownership with the
consumer while still giving producer teardown an explicit revocation edge.

### Path A — NO-GO managed geometry: ordinary React composition

Choose this path when Step 0 passes. Add only the source-proven collapsed-point
sibling to the existing range tracker:

```ts
type EditorTrackedPoint = {
  resolve():
    | { readonly kind: 'live'; readonly offset: number }
    | { readonly kind: 'deleted' }
    | null
}

// On EditorViewContributionContext, optional like trackRanges?.
trackPoint?(
  anchor: Extract<EditorTextAnchor, { readonly kind: 'point' }>,
): EditorTrackedPoint
```

The real Editor always supplies `trackPoint`; hand-written contribution
contexts may omit it. It wraps one piece-table anchor, allocates no registry,
and has nothing to dispose. `null` means there is no active document. A live
point follows its bias; deleted is terminal for the consumer. Range diagnostics
continue using `trackRanges([range], { startBias, endBias })` unchanged.

The Platform diagnostic-peek source also exposes one Platform-authored Editor
view contribution. After it claims an event, the contribution resolves the
point/range on every native update, asks `getRangeClientRect()` for the first
painted fragment, reads the exposed `scrollElement` client rect for clipping,
and immediately copies both mutable DOM rectangles into immutable finite-number
Platform snapshots. A live anchor plus `null` geometry is `hidden`; it may
reshow on a later viewport/layout update. A deleted anchor, changed document
identity, `clear`, contribution disposal, or consumer close is terminal. React
subscribes to the Platform source with `useSyncExternalStore`; Editor gains no
geometry subscription or product lifecycle object.

### Path B — GO managed geometry: one native handle

Choose this path only when Step 0 records a native geometry or contribution
lifecycle failure. Do not also add `trackPoint`. Add exactly one host-agnostic
primitive through `@singapor/core/extensions`:

```ts
type EditorClientRect = {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
  readonly width: number
  readonly height: number
}

type EditorTrackedAnchorGeometrySnapshot =
  | {
      readonly kind: 'visible'
      readonly documentId: string
      readonly textVersion: number
      readonly range: { readonly start: number; readonly end: number }
      readonly anchorRect: EditorClientRect
      readonly clipRect: EditorClientRect
    }
  | {
      readonly kind: 'hidden'
      readonly documentId: string
      readonly textVersion: number
      readonly range: { readonly start: number; readonly end: number }
    }
  | {
      readonly kind: 'invalid'
      readonly reason:
        | 'deleted'
        | 'document-replaced'
        | 'view-cleared'
        | 'view-disposed'
        | 'released'
    }

type EditorTrackedAnchorGeometry = {
  getSnapshot(): EditorTrackedAnchorGeometrySnapshot
  subscribe(listener: () => void): EditorDisposable
  dispose(): void
}

// On EditorViewContributionContext; one anchor, no renderer/provider registry.
trackAnchorGeometry?(anchor: EditorTextAnchor): EditorTrackedAnchorGeometry
```

The method is optional at the type boundary and always present on the real
Editor. Platform creates and owns the handle from its own contribution. The LSP
producer never creates or retains one. Editor invalidates live handles on
document replacement, clear, or view disposal; Platform disposes its handle on
consumer close and when the LSP-owned claim cleanup revokes it.

### Anchor, geometry, and lifecycle semantics

- A non-empty diagnostic uses the existing diagnostic stickiness: start bias
  `right`, end bias `left`, so text inserted at either boundary stays outside
  the server-reported span. A zero-width diagnostic uses a point anchor and
  must not be expanded merely to satisfy `trackRanges`.
- A partial deletion keeps the surviving non-empty range. Full deletion makes a
  range terminal. A point follows its explicit bias until its underlying anchor
  is deleted or the view becomes terminal.
- Visible geometry uses the first painted fragment at the logical anchor start.
  This is intentionally not a multi-rect selection API. Any live but currently
  unpainted anchor is simply `hidden`; the first consumer makes no policy
  distinction between virtualization, folding, and another unrendered cause.
  Hidden is reversible; invalid is terminal.
- Refresh on content, viewport, layout, document, and clear transitions. Font,
  density, wrapping, folding, horizontal/vertical scrolling, and ResizeObserver
  changes already enter those transitions and must be pinned by tests rather
  than duplicated with new observers per consumer.
- Path B rectangles are finite CSS client pixels in immutable plain objects;
  `clipRect` is the Editor scroll viewport. Path A copies the same numeric fields
  immediately at the public API edge. Platform stores no element, `Range`, or
  mutable `DOMRect` in either path.
- In Path B, `getSnapshot()` is synchronous and notifications occur only on
  semantic change. Subscription and disposal are idempotent. Terminal Editor
  transitions publish one invalid snapshot before listeners are cleared; no
  listener fires after either disposal returns. In Path A, the contribution's
  update/dispose callbacks provide those same transitions and the Platform
  source publishes the normalized terminal state exactly once.
- Neither path scrolls, focuses, mounts DOM, or chooses placement. The existing
  marker command selects, reveals, and focuses before emitting the event.

### Platform product behavior

Both paths normalize at the repository boundary into one Platform-owned shape:

```ts
type DiagnosticPeekClientRect = {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
  readonly width: number
  readonly height: number
}

type DiagnosticPeekGeometry =
  | {
      readonly kind: 'visible'
      readonly documentId: string
      readonly textVersion: number
      readonly range: { readonly start: number; readonly end: number }
      readonly anchorRect: DiagnosticPeekClientRect
      readonly clipRect: DiagnosticPeekClientRect
    }
  | {
      readonly kind: 'hidden'
      readonly documentId: string
      readonly textVersion: number
      readonly range: { readonly start: number; readonly end: number }
    }
  | {
      readonly kind: 'invalid'
      readonly reason: 'deleted' | 'document-replaced' | 'view-cleared' | 'view-disposed'
    }
```

- Normalize the event immediately into a Platform-owned model: message,
  severity, source, code, related-information labels/targets, document path,
  direction, anchor descriptor, and normalized geometry. Do not put DOM nodes,
  Editor elements, mutable rectangles, or raw Editor snapshots in Zustand or
  query cache.
- Render one `DiagnosticPeek` as an `EditorFrame` child. It is an overlay, not a
  grid sibling and not a row. `EditorFrame` supplies one positioned overlay
  layer; the peek is `pointer-events-auto` inside a pointer-transparent layer.
  Use `surface-vibrancy` without stacking `bg-popover`; use theme tokens and
  `@workspace/ui` primitives. Inline style is allowed only for the computed
  `top`/`left` coordinates.
- Prefer below the marker with a small gap; flip above when the surface would
  cross `clipRect.bottom`; clamp horizontally within the clip rectangle. Rects
  enter as client coordinates. The component measures only its Platform-owned
  overlay layer and surface, then the pure placement helper subtracts the layer
  rect to return local `top`/`left`; it never reads Editor rows. A
  `ResizeObserver` on those two Platform elements recomputes after message or
  frame size changes. Hide without unmounting product state while the anchor is
  `hidden`, then reappear from the next `visible` snapshot. Close on `invalid`.
- Show severity, message, optional source/code, and every
  `relatedInformation` entry. Related entries call the existing Platform
  definition/open action. Any displayed line/column number uses
  `tabular-nums`.
- Initial open is passive: source Editor focus and its selection do not move
  beyond the marker command's existing behavior. Once a peek button/link is
  focused, its registered FocusService target is the deepest owner and no
  typing, paste, drop, composition, or Editor command reaches the source Editor.
- Escape is local overlay behavior caught at `EditorFrame`: close and restore
  the exact still-live source Editor only if the overlay owned focus. Closing
  after a related target opens does not race that destination with origin
  restoration. Clicking back into the source closes the peek and lets the
  source Editor's real focus acknowledgement win.
- Only one claimed peek exists per Editor view. Replacing it invokes the old
  claim cleanup first, then discards the Path A tracker or disposes the Path B
  subscription/handle before publishing the new model.

## Commands

| Purpose                                | Command                                                                                                                                                                                                                                                                        | Expected on success                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Editor focused build                   | `cd /Users/shaul/Desktop/D/Editor && bunx turbo build --filter=@singapor/core --filter=@singapor/lsp-plugin`                                                                                                                                                                   | exit 0; both `dist/` facades include the new types |
| Editor core DOM tests                  | `cd /Users/shaul/Desktop/D/Editor/packages/editor && ./node_modules/.bin/vitest run --project dom test/rangeTracking.test.ts test/public-api.test.ts`                                                                                                                          | exit 0                                             |
| Editor core browser test (Path B only) | `cd /Users/shaul/Desktop/D/Editor/packages/editor && ./node_modules/.bin/vitest run --project browser test/trackedAnchorGeometry.browser.test.ts`                                                                                                                              | exit 0 in Chromium; skip only for recorded Path A  |
| Editor LSP producer tests              | `cd /Users/shaul/Desktop/D/Editor/packages/lsp-plugin && ./node_modules/.bin/vitest run test/diagnosticsPresenter.test.ts test/plugin.test.ts`                                                                                                                                 | exit 0                                             |
| Editor typecheck                       | `cd /Users/shaul/Desktop/D/Editor && bunx turbo typecheck --filter=@singapor/core --filter=@singapor/lsp-plugin`                                                                                                                                                               | exit 0                                             |
| Platform node tests                    | `cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run --project node src/features/editor/state/tests/diagnostic-peek-source.test.ts src/features/editor/tests/language-server-plugin.test.ts src/features/editor/utils/tests/diagnostic-peek-placement.test.ts` | exit 0                                             |
| Platform DOM tests                     | `cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run --project dom src/features/editor/components/tests/diagnostic-peek.test.tsx`                                                                                                                              | exit 0                                             |
| Platform browser test                  | `cd /Users/shaul/Desktop/D/platform/apps/web && ./node_modules/.bin/vitest run --config vitest.browser.config.ts src/features/editor/tests/diagnostic-peek.browser.tsx`                                                                                                        | exit 0 in Chromium                                 |
| Platform typecheck                     | `cd /Users/shaul/Desktop/D/platform/apps/web && bun run typecheck`                                                                                                                                                                                                             | exit 0                                             |
| Editor lint/format check               | `cd /Users/shaul/Desktop/D/Editor && bunx turbo run lint format:check --filter=@singapor/core --filter=@singapor/lsp-plugin`                                                                                                                                                   | exit 0; checks are read-only                       |
| Platform lint/format check             | `cd /Users/shaul/Desktop/D/platform/apps/web && bun run lint && bun run format:check`                                                                                                                                                                                          | exit 0; checks are read-only                       |

The app's dev server is already running. Never start another one. Build Editor
core and LSP packages before Platform typecheck/tests because Platform's
`link:` dependencies resolve their published `dist/` facades.

## Scope

### Gate-only scratch scope

- `apps/web/src/features/editor/tests/diagnostic-peek-gate.browser.tsx`
  (**temporary; delete before either gate outcome is reported**)

The gate changes no production file and no Editor file.

### Production scope — Editor

Path B only, new:

- `packages/editor/src/editor/trackedAnchorGeometry.ts`
- `packages/editor/test/trackedAnchorGeometry.browser.test.ts`

Modify:

- `packages/editor/src/plugins.ts`
- `packages/editor/src/editor/Editor.ts`
- `packages/editor/src/public/extensions.ts`
- `packages/editor/test/rangeTracking.test.ts`
- `packages/editor/test/public-api.test.ts`
- `packages/lsp-plugin/src/types.ts`
- `packages/lsp-plugin/src/pluginTypes.ts`
- `packages/lsp-plugin/src/diagnosticsPresenter.ts`
- `packages/lsp-plugin/src/plugin.ts`
- `packages/lsp-plugin/src/index.ts`
- `packages/lsp-plugin/test/diagnosticsPresenter.test.ts`
- `packages/lsp-plugin/test/plugin.test.ts`

Path B may also modify
`packages/editor/src/editor/inputSelectionController.ts` only when the gate
records a first-fragment or collapsed-rect failure in its existing
`rangeClientRect()` method. A lifecycle-only Path B leaves that file untouched.

Do not edit Editor React package, `anchoredSurface.ts`, display transforms,
inline replacements, decorations, virtualization row layout, row-height code,
style sheets, package manifests, or any removed block path.

### Production scope — Platform

New:

- `apps/web/src/features/editor/components/diagnostic-peek.tsx`
- `apps/web/src/features/editor/hooks/use-diagnostic-peek.ts`
- `apps/web/src/features/editor/state/diagnostic-peek-source.ts`
- `apps/web/src/features/editor/state/tests/diagnostic-peek-source.test.ts`
- `apps/web/src/features/editor/utils/diagnostic-peek-placement.ts`
- `apps/web/src/features/editor/utils/tests/diagnostic-peek-placement.test.ts`
- `apps/web/src/features/editor/components/tests/diagnostic-peek.test.tsx`
- `apps/web/src/features/editor/tests/diagnostic-peek.browser.tsx`
- `apps/web/src/lib/diagnostic.ts`

Modify:

- `apps/web/src/features/editor/components/editor.tsx`
- `apps/web/src/features/editor/components/frame.tsx`
- `apps/web/src/features/editor/hooks/use-lsp-plugin.ts`
- `apps/web/src/features/editor/utils/language-server-plugin.ts`
- `apps/web/src/features/editor/tests/language-server-plugin.test.ts`
- `apps/web/src/features/workbench/components/diagnostics-panel.tsx` (move the
  existing pure diagnostic label/message/target helpers to the qualifying
  shared `@/lib/diagnostic` module; do not redesign the panel)

Use the landed `apps/web/src/lib/focus` hooks and service. If using them
requires changing a focus-service production file rather than registering a
normal target from the new hook/component, stop and amend this scope first.

### Explicitly out of scope

- Any `EditorBlock*`, block provider, block row/lane, zone widget, view zone,
  arbitrary `mount(container)` callback, React portal registry, renderer
  provider, or space-reserving surface.
- Definition/references embedded editors and the currently delegated
  `openMode: 'peek'`; existing references side pane remains unchanged.
- E7 inline chat, streamed diffs, prompt inputs, quick-diff, test failure peek,
  breakpoint/exception widgets, comments, sticky scroll, CodeLens, and inlay
  hints.
- Generic extension/plugin APIs, capability marketplace, plugin discovery,
  manifests, settings, persistence, server routes, contracts DTOs, telemetry
  schema, or package-version changes.
- New F8/Shift+F8 metadata or binding work. The existing Editor commands are
  the producer under test; command exposure belongs to the command/keymap plans.

## Git workflow

- Work in both current worktrees. Do not create a branch, worktree, commit,
  push, or PR unless the operator explicitly asks.
- Treat each worktree's unrelated dirty files as user-owned. Use
  `git diff -- <explicit paths>` and never run a whole-repository formatter.
- The selected path is one lockstep milestone: Editor's minimal anchor contract,
  LSP producer, rebuilt linked packages, then Platform consumer. Do not land or
  publish a producer that Platform cannot consume. Record Path A or Path B once
  and do not keep the rejected geometry implementation as a fallback.

## Steps

### Step 0: Run and record the ordinary-React gate

After the landed focus runtime and root scheduling are confirmed, create only the temporary
real-browser test `diagnostic-peek-gate.browser.tsx`. Build a disposable
Platform-authored view contribution inside the test and render a plain React
child through `EditorFrame`. Supply a synthetic immutable marker event; marker
provenance is already a source-proven producer gap and is deliberately outside
this geometry decision. The spike may use only current public APIs:
`trackRanges`, `getRangeClientRect`, the exposed `scrollElement`, contribution
updates/dispose, controller snapshots, and the public FocusService.

The scratch test may create one disposable external source and bridge its
immutable `{ visible | hidden | invalid }` snapshot into React with
`useSyncExternalStore`; that is the public imperative-to-React seam under test.
It may not query row DOM, observe Editor internals, rebase an offset itself,
install a document-level listener, or retain a mutable `DOMRect`/Editor element.
The source must copy numeric geometry only, and its update/dispose callbacks
must be the sole lifecycle driver.

Exercise all of these in a real Editor:

1. Feed one synthetic non-empty diagnostic descriptor; an ordinary caret move
   does not call the test source and therefore cannot open the React child.
2. Insert text before the diagnostic and at both boundaries; `trackRanges` and
   geometry follow the declared diagnostic stickiness.
3. Partially delete and fully delete the range; the former survives and the
   latter closes. Separately call `getRangeClientRect(offset, offset)` for a
   visible collapsed diagnostic and require a finite caret rectangle. Do not
   fake collapsed edit tracking; Path A's known `trackPoint` addition owns it.
4. Scroll vertically and horizontally out of view and back; resize and toggle
   wrapping; fold/unfold the containing range; a live anchor with `null`
   geometry becomes `hidden` and later returns to `visible`.
5. Use an RTL/mixed-direction line and assert the surface attaches to the first
   painted fragment at the logical start.
6. Keep Editor focus on passive open, then focus a React control and prove
   typing/paste do not edit the source. Escape restores the exact source Editor.
7. Replace the synthetic event, switch tabs/documents, remove the contribution,
   and unmount under StrictMode; assert no surface, source listener, focus token,
   or retained range remains.

Decision:

- **NO-GO — MANAGED GEOMETRY / Path A** only if every assertion passes without
  forbidden Platform-local reconstruction. The current view APIs are then the
  geometry/lifecycle contract. Record the evidence and implement only the
  shared marker event plus `trackPoint`; do not add a geometry handle.
- **GO — MANAGED GEOMETRY / Path B** only if an assertion fails because the
  Editor cannot produce the required first-fragment/collapsed rect or its native
  contribution updates/disposal cannot express the visible → hidden → visible
  and terminal transitions. Record the exact assertion and smallest missing
  primitive, then implement the managed handle. Failure caused by the synthetic
  provenance seam or absent collapsed edit tracking is invalid gate evidence.

Delete the scratch test before either production path. The gate selects one
implementation branch; it does not cancel the named consumer.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web
./node_modules/.bin/vitest run --config vitest.browser.config.ts \
  src/features/editor/tests/diagnostic-peek-gate.browser.tsx

cd /Users/shaul/Desktop/D/platform
test ! -e apps/web/src/features/editor/tests/diagnostic-peek-gate.browser.tsx
git status --short > /tmp/plan-064-platform-after-gate.txt
cmp /tmp/plan-064-platform-before.txt /tmp/plan-064-platform-after-gate.txt

cd /Users/shaul/Desktop/D/Editor
git status --short > /tmp/plan-064-editor-after-gate.txt
cmp /tmp/plan-064-editor-before.txt /tmp/plan-064-editor-after-gate.txt
```

The first command supplies the recorded pass/failure. The last three commands
must exit 0 after removing the scratch test, relative to the post-command-cutover and
pre-gate snapshots; use explicit path diffs if user-owned edits preclude the
status comparison. Fill the path decision in **Gate record** before Step 1.

### Step 1: Add only the selected Editor anchor contract

Both paths export `EditorTextAnchor` and preserve the existing native geometry
implementation; neither adds rendering or placement.

For recorded **Path A**, add `trackPoint` beside `trackRanges`. Reuse
`anchorAt`/`resolveAnchor`, preserve explicit bias and liveness, and allocate no
registry, listener, or disposable. Extend `rangeTracking.test.ts` for insertion
before/at the point, deletion liveness, no-document `null`, and a document
replacement driven by the contribution lifecycle. Keep existing range behavior
unchanged.

For recorded **Path B**, implement `trackedAnchorGeometry.ts` as the single owner
of point/range anchor state, immutable geometry snapshots, semantic equality,
subscriptions, and idempotent disposal. Reuse piece-table anchors and the native
selection geometry path; do not copy anchor algorithms or add a second DOM
measurement implementation. If the recorded failure is first-fragment or
collapsed-rect semantics, correct the existing
`inputSelectionController.rangeClientRect()` implementation first and pin the
exact failing case in the Path B browser test; a wrapper around a still-broken
rect producer is not a fix. Wire `trackAnchorGeometry` into the real context.
Keep live handles in an Editor-owned registry so content/viewport/layout/
document/clear and Editor disposal update or invalidate them exactly once.
Measure all handles before notifying listeners so a callback cannot interleave
layout writes with another handle's reads.

For either path, extend `public-api.test.ts` to prove only the selected types and
method reach `@singapor/core/extensions`. Path B additionally covers range/point
bias, partial/full deletion, release, notification equality, and idempotence in
`rangeTracking.test.ts`; put its actual rect/visibility cases only in
`trackedAnchorGeometry.browser.test.ts`: visible → hidden → visible, horizontal
scroll, wrap/resize, fold/unfold, collapsed point, mixed BiDi, and view disposal.

**Verify**: run the focused Editor build first, then the core DOM tests and core
typecheck from **Commands**. Run the core browser command only for Path B. All
selected commands exit 0. For Path B,
`rg -n "mount|React|block|zone" packages/editor/src/editor/trackedAnchorGeometry.ts`
returns no matches.

### Step 2: Emit one claimed marker-navigation event from the LSP plugin

Change `diagnosticMarkerTarget()` to retain the selected diagnostic with its
range while preserving current stable start/end ordering and wraparound.
Thread `onDidNavigateDiagnostic` through plugin, set-plugin, adapter, and
resolved option types. After the existing selection/reveal/focus succeeds,
create only the immutable point/range descriptor and invoke the callback with
the active document URI/text version and direction. Do not call either Path A
or Path B tracking API from LSP.

Use the explicit claimed-object/ignored union. Retain one claimed cleanup;
dispose it before publishing the next marker event and on presenter/plugin
teardown. Report thrown callback errors through the existing plugin error
boundary rather than `new Error` or a console call. Navigation still returns
true because selecting the marker succeeded. The producer owns only revocation,
not Platform state or native anchor tracking.

Producer tests must prove exact diagnostic selection with duplicate/same-range
diagnostics, next/previous wraparound, zero-width point creation, callback
ordering after selection/reveal, prior-claim disposal before replacement,
ignored/absent/thrown behavior, idempotent early consumer close, and plugin
teardown revocation. Export the event/claim types only from the existing LSP
package entry point.

**Verify**: run the Editor LSP producer tests, focused build, and LSP typecheck
from **Commands**. All exit 0.

### Step 3: Rebuild the linked facades before touching Platform

Run the focused Editor build. From Platform, resolve the symlinks and inspect
the generated declarations:

```bash
cd /Users/shaul/Desktop/D/Editor
bunx turbo build --filter=@singapor/core --filter=@singapor/lsp-plugin

cd /Users/shaul/Desktop/D/platform
realpath node_modules/@singapor/core
realpath node_modules/@singapor/lsp-plugin
rg -n "EditorTextAnchor" \
  node_modules/@singapor/core/dist/public/extensions.d.ts
# Path A only:
rg -n "EditorTrackedPoint|trackPoint" \
  node_modules/@singapor/core/dist/public/extensions.d.ts
# Path B only, instead of the Path A assertion:
rg -n "EditorTrackedAnchorGeometry|trackAnchorGeometry" \
  node_modules/@singapor/core/dist/public/extensions.d.ts
rg -n "LanguageServerDiagnosticMarkerEvent|LanguageServerDiagnosticMarkerClaim" \
  node_modules/@singapor/lsp-plugin/dist/index.d.ts
rg -n "onDidNavigateDiagnostic" \
  node_modules/@singapor/lsp-plugin/dist/types.d.ts
```

Both `realpath` commands must point into `/Users/shaul/Desktop/D/Editor`. Run
exactly one path-specific core assertion; every selected assertion must match
the named declaration file. Stop if Platform resolves registry copies or stale
declarations; do not add casts or duplicate types.

### Step 4: Build the Platform-owned data source and React surface

Add a per-Editor `diagnostic-peek-source.ts` external source that also supplies
one Platform-authored view contribution plugin. Its marker callback returns
`ignored` unless that contribution is live and its document URI/text version
matches the event. On a claim it synchronously normalizes the diagnostic,
creates the selected Path A tracker or Path B handle, publishes an immutable
snapshot, and returns an idempotent cleanup object to LSP. Guard generations so
a stale update, subscription, or producer cleanup cannot close a replacement.

For Path A, contribution `update` resolves the tracker and pushes geometry into
the source; contribution `dispose` closes it. For Path B, subscribe to the
managed handle and normalize its snapshot. Replacing or closing must detach the
old claim, discard the Path A tracker or dispose the Path B subscription/handle,
and remove focus registration before publishing the next state. Do not ship
both branches or retain a fallback after the gate record selects one.

Put message/severity/source/code/related-target normalization in the pure
`@/lib/diagnostic` module; it qualifies for `lib/` because the Editor feature
and Workbench diagnostics panel both import it. Move the matching helpers from
`diagnostics-panel.tsx` so the two consumers cannot drift. Put only placement math in
`diagnostic-peek-placement.ts`, covered with table-driven cases for below,
flip-above, horizontal clamp, client-to-overlay translation, and a surface
larger than the available clip. Do not put stores, subscriptions, DOM reads, or
React imports in either pure module.

Use `apps/web/test/fixtures.ts` and the shared render helpers for app tests.
Drive the linked real Editor in the browser test; do not mock the Editor,
language-server plugin, Platform client, or FocusService boundary.

`use-diagnostic-peek.ts` owns one source instance, its contribution plugin, and
its `useSyncExternalStore` subscription. Add that plugin to the same Editor
instance's plugin list and pass its stable claim callback through
`use-lsp-plugin.ts` and `language-server-plugin.ts`; stable identity is required
because changing either would rebuild plugins and is the allowed reason for
memoization. The hook closes on inactive tab/document change and unmount.

Render one `DiagnosticPeek` child from `Editor` through `EditorFrame`. Use one
component per file, shared primitives, Tailwind tokens, `surface-vibrancy`, and
dynamic position only in `style`. Do not add loading or empty states: the event
already has a diagnostic verdict. Hidden geometry renders nothing while
retaining source state; invalid geometry closes.

**Verify**: run Platform node tests, DOM component tests, and typecheck from
**Commands**. All exit 0.

### Step 5: Settle focus, input ownership, and cleanup

Register the peek root as a narrow FocusService overlay target keyed by the
owning tab/view. Capture the source Editor target at the open edge. Passive open
must not call `.focus()`. The root is a sibling of `EditorHost`, so once a
button/link owns focus the Editor's hidden input and native clipboard,
composition, drop, and key handlers are not targets.

Extend `EditorFrame` only with local direct-child behavior: Escape closes the
active peek; pointer-down back in `EditorHost` closes it. Restore through
FocusService only when close removed focused peek DOM and the captured source
target is still live. Related-information navigation closes without origin
restoration so the destination's acknowledged focus wins. Do not install a
document listener, prop-drill a command beyond `Editor` → `EditorFrame`, or add
another active-Editor pointer.

The browser test must drive a real Editor and real focus events. It covers:
command → surface, passive source focus, focused related link, typing/paste
isolation, Escape restoration, click-back, edit-above repositioning, offscreen
hide/reshow, a collapsed diagnostic after edits, first-fragment attachment on a
mixed-BiDi wrapped line, deletion close, diagnostic replacement, tab/document
switch, LSP plugin replacement/disposal, StrictMode remount, and teardown
counts. Assert exactly one active descriptor/tracker, source listener, surface,
and focus registration throughout; Path B additionally has exactly one geometry
subscription/handle and Path A has none.

**Verify**: run the Platform browser test and the focused FocusService
test(s) touched by this integration. All exit 0.

### Step 6: Run the lockstep acceptance and structural rejection gate

Run every focused command in **Commands** in this order: Editor build, Editor
tests/typecheck, Platform tests/typecheck, then focused lint/format checks. Do
not run repository-wide suites unless a focused failure shows a plausible
cross-package regression they alone can catch.

Then inspect only this plan's diffs:

```bash
cd /Users/shaul/Desktop/D/Editor
git diff HEAD --check -- \
  packages/editor/src/plugins.ts \
  packages/editor/src/editor/Editor.ts \
  packages/editor/src/editor/inputSelectionController.ts \
  packages/editor/src/editor/trackedAnchorGeometry.ts \
  packages/editor/src/public/extensions.ts \
  packages/editor/test/rangeTracking.test.ts \
  packages/editor/test/trackedAnchorGeometry.browser.test.ts \
  packages/editor/test/public-api.test.ts \
  packages/lsp-plugin/src \
  packages/lsp-plugin/test/diagnosticsPresenter.test.ts \
  packages/lsp-plugin/test/plugin.test.ts

for candidate in \
  packages/editor/src/editor/trackedAnchorGeometry.ts \
  packages/editor/test/trackedAnchorGeometry.browser.test.ts
do
  test -e "$candidate" || continue
  git ls-files --error-unmatch "$candidate" >/dev/null 2>&1 && continue
  check_output="$(git diff --no-index --check /dev/null "$candidate" 2>&1 || true)"
  test -z "$check_output" || { echo "$check_output"; exit 1; }
done

cd /Users/shaul/Desktop/D/platform
git diff HEAD --check -- \
  apps/web/src/features/editor/components/diagnostic-peek.tsx \
  apps/web/src/features/editor/components/editor.tsx \
  apps/web/src/features/editor/components/frame.tsx \
  apps/web/src/features/editor/components/tests/diagnostic-peek.test.tsx \
  apps/web/src/features/editor/hooks/use-diagnostic-peek.ts \
  apps/web/src/features/editor/hooks/use-lsp-plugin.ts \
  apps/web/src/features/editor/state/diagnostic-peek-source.ts \
  apps/web/src/features/editor/state/tests/diagnostic-peek-source.test.ts \
  apps/web/src/features/editor/tests/diagnostic-peek.browser.tsx \
  apps/web/src/features/editor/tests/language-server-plugin.test.ts \
  apps/web/src/features/editor/utils/diagnostic-peek-placement.ts \
  apps/web/src/features/editor/utils/tests/diagnostic-peek-placement.test.ts \
  apps/web/src/features/editor/utils/language-server-plugin.ts \
  apps/web/src/features/workbench/components/diagnostics-panel.tsx \
  apps/web/src/lib/diagnostic.ts

for candidate in \
  apps/web/src/features/editor/components/diagnostic-peek.tsx \
  apps/web/src/features/editor/components/tests/diagnostic-peek.test.tsx \
  apps/web/src/features/editor/hooks/use-diagnostic-peek.ts \
  apps/web/src/features/editor/state/diagnostic-peek-source.ts \
  apps/web/src/features/editor/state/tests/diagnostic-peek-source.test.ts \
  apps/web/src/features/editor/tests/diagnostic-peek.browser.tsx \
  apps/web/src/features/editor/utils/diagnostic-peek-placement.ts \
  apps/web/src/features/editor/utils/tests/diagnostic-peek-placement.test.ts \
  apps/web/src/lib/diagnostic.ts
do
  git ls-files --error-unmatch "$candidate" >/dev/null 2>&1 && continue
  check_output="$(git diff --no-index --check /dev/null "$candidate" 2>&1 || true)"
  test -z "$check_output" || { echo "$check_output"; exit 1; }
done
```

Then scan the approved source/test paths directly so untracked files cannot
escape the rejection gate:

```bash
rejected='registerBlockProvider|EditorBlock\b|EditorBlock(Anchor|Size|HorizontalSurface|VerticalSurface|Mount|SurfaceSlot|Provider)|blockSurface|zoneWidget|mount\(container|marketplace'

cd /Users/shaul/Desktop/D/Editor
if rg -n "$rejected" \
  packages/editor/src/plugins.ts \
  packages/editor/src/editor/Editor.ts \
  packages/editor/src/editor/inputSelectionController.ts \
  packages/editor/src/public/extensions.ts \
  packages/editor/test/rangeTracking.test.ts \
  packages/editor/test/public-api.test.ts \
  packages/lsp-plugin/src/types.ts \
  packages/lsp-plugin/src/pluginTypes.ts \
  packages/lsp-plugin/src/diagnosticsPresenter.ts \
  packages/lsp-plugin/src/plugin.ts \
  packages/lsp-plugin/src/index.ts \
  packages/lsp-plugin/test/diagnosticsPresenter.test.ts \
  packages/lsp-plugin/test/plugin.test.ts
then
  exit 1
fi
if test -e packages/editor/src/editor/trackedAnchorGeometry.ts && \
  rg -n "$rejected" packages/editor/src/editor/trackedAnchorGeometry.ts \
    packages/editor/test/trackedAnchorGeometry.browser.test.ts
then
  exit 1
fi

cd /Users/shaul/Desktop/D/platform
if rg -n "$rejected" \
  apps/web/src/features/editor/components/diagnostic-peek.tsx \
  apps/web/src/features/editor/components/editor.tsx \
  apps/web/src/features/editor/components/frame.tsx \
  apps/web/src/features/editor/components/tests/diagnostic-peek.test.tsx \
  apps/web/src/features/editor/hooks/use-diagnostic-peek.ts \
  apps/web/src/features/editor/hooks/use-lsp-plugin.ts \
  apps/web/src/features/editor/state/diagnostic-peek-source.ts \
  apps/web/src/features/editor/state/tests/diagnostic-peek-source.test.ts \
  apps/web/src/features/editor/tests/diagnostic-peek.browser.tsx \
  apps/web/src/features/editor/tests/language-server-plugin.test.ts \
  apps/web/src/features/editor/utils/diagnostic-peek-placement.ts \
  apps/web/src/features/editor/utils/tests/diagnostic-peek-placement.test.ts \
  apps/web/src/features/editor/utils/language-server-plugin.ts \
  apps/web/src/features/workbench/components/diagnostics-panel.tsx \
  apps/web/src/lib/diagnostic.ts
then
  exit 1
fi
```

Both tracked/staged `diff --check` commands exit 0; every untracked-file check
has empty output; both direct rejection conditions fall through with no match.
Review `git status --short` against the two preflight snapshots; only the
recorded user-owned changes and the selected path's approved files may differ.

Once implementation and acceptance are complete, follow `plans/README.md`
cleanup policy: replace the parity-roadmap plan backlink with landed code/tests,
remove this completed plan and its inventory row, and use git history as the
archive. Do not leave a completed-plan ledger.

## Producer and consumer test matrix

| Layer              | Required proof                                                                                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Editor anchor unit | Shared point/range descriptor. Path A: point bias/liveness and unchanged `trackRanges`; Path B: both anchors, partial/full deletion, semantic notification equality, idempotent release/dispose.                                                                                                       |
| Geometry browser   | The gate characterizes ordinary rect/lifecycle behavior. The Editor core browser test proves managed snapshots and any corrected native rect semantics for Path B. The permanent Platform browser test proves collapsed-point edits and mixed-BiDi first-fragment attachment for either selected path. |
| LSP producer       | Selected diagnostic identity/order, marker wraparound, callback after reveal, explicit claim object, prior-claim replacement, ignored/absent/thrown behavior, and teardown revocation.                                                                                                                 |
| Platform source    | Immediate normalization, one selected tracker, replacement cleanup-before-publish, hidden retention, invalid close, stale-generation rejection, producer revocation, contribution/unmount cleanup.                                                                                                     |
| Platform component | Severity/message/source/code/related info, theme-token classes, no empty/loading fall-through, line/column `tabular-nums`, related target action.                                                                                                                                                      |
| Platform browser   | Real command-to-overlay geometry, edits and scrolling, passive/focused ownership, input isolation, Escape/click-back restoration, target navigation, tab/document/StrictMode cleanup.                                                                                                                  |

## Done criteria

- [ ] The typed command/focus runtime remains green and root `PLAN.md` schedules plan 064.
- [ ] **Gate record** selects Path A or Path B before any production diff and,
      for Path B, names the exact native geometry/lifecycle failure.
- [ ] Path A adds only the shared descriptor plus `trackPoint` and uses the
      existing range/geometry/contribution APIs. Path B adds exactly one managed
      point/range geometry handle. The rejected path is absent.
- [ ] Marker navigation emits one explicit claim-object/ignored event after
      existing selection/reveal/focus; replacement and producer teardown invoke the
      claimed cleanup exactly once.
- [ ] Platform owns the normalized diagnostic state and React DOM; Editor owns
      native anchor/geometry/lifecycle only.
- [ ] Hidden anchors reshow and invalid anchors close. Replacement leaves only
      the new consumer resources; terminal teardown leaves zero source listener,
      tracker/handle, claim cleanup, surface, and focus registrations.
- [ ] Selected focused Editor core/LSP tests, Platform node/DOM/browser tests,
      both typechecks, focused lint/format checks, and tracked/untracked whitespace
      gates pass.
- [ ] Structural rejection greps return no block/zone/mount/marketplace match.
- [ ] No file outside the approved scope changed, and all pre-existing dirty
      edits remain intact.

## STOP conditions

Stop and report instead of broadening the design if:

- Root `PLAN.md` has not scheduled the work, or the landed FocusService lacks deepest-target
  ownership and explicit restoration.
- The gate passes with ordinary React composition but implementation starts a
  managed geometry handle instead of Path A.
- The gate failure is aesthetic, placement-policy-only, or hypothetical future
  reuse rather than a native geometry or contribution-lifecycle failure.
- Marker provenance or collapsed edit tracking is presented as Path B evidence;
  both are source-proven minimal work already isolated from the gate.
- A correct consumer requires reserving vertical space, replacing a text row,
  variable-height virtualization, or arbitrary Editor-mounted DOM.
- The contract needs more than one anchor/range, multiple rect fragments,
  renderer callbacks, surface kinds/slots, sizing modes, or a provider
  registry. Those are a different plan.
- A zero-width diagnostic cannot be represented without changing piece-table
  anchor semantics. Return with evidence rather than expanding core semantics.
- A gate-proven rect failure cannot be corrected inside the existing
  `inputSelectionController.rangeClientRect()` path and its focused test. Stop
  before changing virtualization/rendering internals or adding a second rect
  implementation.
- Linked Platform dependencies do not resolve the rebuilt Editor facades.
- A required change overlaps user-owned dirty files or falls outside the
  explicit scope.
- A focused verification fails twice after one reasonable correction, or a
  real-browser geometry result contradicts the contract.

## Gate record

Fill this in during Step 0 before any production edit:

```text
Decision: UNRUN (Path A / NO-GO MANAGED GEOMETRY, or Path B / GO MANAGED GEOMETRY)
Date / Platform SHA / Editor SHA:
Gate test command:
Current public APIs used:
First failed invariant, or all invariants passed:
Smallest native geometry/lifecycle primitive (Path B only):
Known provenance and point-tracking gaps excluded from decision: yes/no
Forbidden Platform-local reconstruction used: no
Scratch test removed: yes/no
Production diffs still clean: yes/no
```

## Maintenance notes

- This plan intentionally does not prove S3 as a universal substrate. It proves
  one E2 consumer. Any later consumer must first show that ordinary React and
  the exact landed primitive are insufficient before extending it.
- If Path B is selected, do not merge its geometry handle with LSP's private
  `anchoredSurface`. That helper owns Editor-package DOM placement; Platform
  owns this product surface. Similar names do not mean identical behavior.
- If plan 057 later moves marker command dispatch into Platform, preserve the
  producer event and single ownership path; do not open a second peek directly
  from the bus.
- Reviewers should scrutinize claim revocation/consumer cleanup ordering, point
  diagnostics, BiDi first-fragment semantics, and FocusService restoration
  races before UI polish.
