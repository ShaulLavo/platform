> [!IMPORTANT]
> **STATUS: 🔴 TODO (captured 2026-06-11).** Root-caused, not started. Needs a deliberate lifecycle policy — do not "fix" by blindly unmounting hidden editors or by keeping the current mount-everything behavior.

# Editor Tab Lifecycle Performance

Hidden (never-activated) editor tabs are fully alive: they load the document,
run a full tree-sitter parse, mount virtualized rows, and register token
highlight ranges into the page-global CSS Highlight registry — all while
`display: none`.

## Measured (2026-06-11, live session probe)

Session with 4 file tabs (1 active) plus navigator/diagnostics/terminal:

| surface                   | hidden | viewportH | rows | ranges |
| ------------------------- | ------ | --------- | ---- | ------ |
| electrobun.config.ts      | true   | 0         | 13   | 32     |
| performanceDiagnostics.ts | true   | 0         | 13   | 47     |
| editor-lsp/src/index.ts   | true   | 0         | 13   | 41     |
| positions.ts (active)     | false  | 532       | 47   | 161    |

Three never-clicked tabs contribute ~120 highlight ranges over `display:none`
text nodes, and each paid a full-document parse at workspace restore.

## Causal chain (all confirmed in code)

1. **Every tab is always mounted.** `WindowFrame` maps over all surfaces and
   mounts a `SurfaceHost` per tab; only the active one is visible
   (`apps/web/src/features/workbench/components/window-frame.tsx`, surfaces map).
   Hidden hosts get the `hidden` attribute (`surface-host.tsx`). The lazy
   escape hatch exists (`rendererLifecycle: 'unmount-when-not-expanded'`) but
   file editors do not use it.
2. **Editor init is visibility-independent.** A mounted editor loads the
   document and the tree-sitter worker parses the whole file regardless of
   whether anything paints.
3. **The virtualizer mounts rows at zero height.** The visible range is
   clamped to at least one row (`fixedRowVirtualizer.ts`, `Math.max(start + 1,
rawEnd)` clamp), and `DEFAULT_OVERSCAN = 12` extends it: 1 + 12 = the 13
   rows observed on every hidden tab. Those rows get real text and real token
   ranges in the shared `editor-shared-token-*` highlights
   (Editor repo: `packages/editor/src/virtualization/`).

Side effect worth keeping in mind: the brief "no highlights" flash when first
activating a tab is _not_ evidence the tab was cold — the 13 pre-mounted rows
were already tokenized; the flash is the dozens of newly mounted rows awaiting
their first token reconcile after the viewport gets real height.

## Constraints on the fix

- **No blind unmounting.** Keep-alive is valuable: editor instances hold undo
  history, scroll, selection, folds; instant tab switching matters.
- **No blind mount-everything either** (status quo): startup cost scales with
  restored tab count (full parse each), and the shared highlight registry
  accumulates ranges for invisible content (also a confound in the Firefox
  highlight-paint investigation — see Editor repo
  `docs/display/browser-quirks.md` and `geckoHighlightRepaint.ts`).
- A smart policy probably distinguishes "never revealed" (cold — defer
  everything) from "previously revealed" (warm — keep alive).

## Candidate directions, smallest first

1. **Zero-height mounts zero rows.** Drop the ≥1-row clamp + overscan when
   `viewportHeight === 0`. First check why the clamp exists (likely font
   metrics bootstrapping needs one mounted row). Editor-repo change.
2. **Skip highlight registration while the host is hidden.** Rows may mount,
   but don't push ranges into the shared registry until first reveal.
3. **Defer editor creation until first reveal.** Saves the full parse for
   never-clicked restored tabs. Needs an explicit warm-after-first-reveal
   keep-alive so tab switching stays instant, and a story for restoring
   scroll/selection lazily.
4. **MRU cap.** At most N warm editors; least-recently-used beyond that drop
   back to cold (serialize view state first). Only worth it if sessions with
   many tabs are common.

## Open questions

- Why does the virtualizer clamp to ≥1 row at zero height? (Metrics probe?
  Find the consumer before changing it.)
- Does a hidden editor re-tokenize on document changes from another view of
  the same file (split panes / same doc in two tabs)?
- What does workspace restore cost look like with 10–20 tabs? Measure before
  building direction 3/4.
