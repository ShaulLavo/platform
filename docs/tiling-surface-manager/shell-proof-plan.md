# Shell Proof Plan

Date: 2026-06-10

Status: planned. This is the execution plan for closing the "Dnd-Proof
Production Cutover Gaps" in `backlog.md` by building a second proof page that
rehearses the full future app shell — rail, recipe panes, bottom tool pane,
main view — with the new tiling drag mechanics and zero real content.

## Goal

`/dnd-proof` proves drag/snap mechanics on a throwaway local model. It does
not prove recipe semantics, and it carries debug chrome (toolbar, scenario
buttons, event log) the real app will not have.

The shell proof is the app without content: the exact composition the
production workbench will have after cutover, driven by the exact engine
modules production uses, but with placeholder surface bodies. When the shell
proof behaves correctly against `default-recipe.md` and
`behavior-contracts.md`, cutover becomes a rendering swap, not a behavioral
leap.

## Decisions (locked)

- **Name:** `shell-proof`. Route `/shell-proof`, feature folder
  `apps/web/src/features/shell-proof/`. Temporary, like `/dnd-proof`.
- **State:** the real engine store — `createWorkspaceLayoutStore` from
  `features/tiling-surface-manager/engine/surface-state.ts` with invariant
  checking enabled. No local `useState` model, no copy of layout logic.
- **Drag:** the new `useTilingDragController` from `@workspace/tiling`
  (sticky snapped preview, no drop zones), not the production
  `WorkbenchDragDropProvider`. The shell proof is where the new controller
  meets recipe semantics.
- **Content:** all placeholder bodies. Real surface _types_ and capabilities
  (`file-navigator`, `search-results`, `git-changes`, `chat`, `logs`,
  `terminal`, `diagnostics`, `file-editor`) created through the real
  `layout-builders` factories so recipe policy, rail state, and placement
  capability rules apply for real. No server, no xterm, no real files.
  Terminal is special only as placement policy, which placeholder bodies
  prove fully.
- **No proof toolbar.** No add-window/add-tab buttons, no scenario picker, no
  always-on event log. Surfaces open the way they will in the app: rail
  clicks, fake file navigator clicks, and keymap commands.
- **Debug stays available but hidden:** `layout-logging` keeps logging to the
  console; the drag debug log and the snap-destination outline overlay mount
  only behind a `?debug` query flag.
- **Rail clicks are visibility toggles.** A rail icon fully opens or fully
  closes the represented window. Collapse/expand to an accordion header is
  pane chrome only (the shrink/unshrink button on the window). The old
  collapse-on-active-click rule was a spec bug, now corrected in
  `default-recipe.md`; `railItemOperation` in `rail-model.ts` still
  implements it and must change (see Engine Work Items). Background-vs-dispose
  on close stays a registry policy decision, separate from the toggle.
- **Collapsed panes use the production tool header.** Extract
  `tool-pane-header.tsx` from the workbench rather than reusing the generic
  proof collapsed bar — but first verify feature and alignment parity with
  the proof bar (vertical alignment, expand/shrink button, close, title,
  icon, drag handle behavior). Fill any gaps in the tool header; do not keep
  both chromes.
- **No transient preview tabs.** Clicking a file in the navigator opens a
  regular tab, full stop. No single-click preview/replace mechanic anywhere
  in the proof.
- **The recipe owns its default layout.** First load renders the recipe's
  baked-in default shape (left tool group with Files, main editor view,
  Terminal+Problems bottom pane) — the seed is derived from the recipe
  definition, not hand-assembled page state. An `?empty` query flag starts
  from a bare rail to rehearse first-surface and terminal-first flows.

## Reuse Map

Use as-is (no changes expected):

- `createWorkspaceLayoutStore`, `layout-logging`, `layout-persistence` —
  `features/tiling-surface-manager/engine/`
- `useTilingDragController`, `useTilingDragDebugLog`, `deriveLayoutGeometry`,
  layout operations/normalize/selectors — `@workspace/tiling`
- Recipe machinery — `recipe-packing.ts`, `rail-model.ts`
  (`selectWorkbenchRailItems`, `railItemOperation`), `bottom-pane-model.ts`,
  `layout-policies.ts`, `layout-builders.ts`
- `Rail` and `ResizeOverlay` — `features/workbench/components/` (both already
  generic: items + dispatch in, operations out)
- `SurfaceIcon` — `features/workbench/components/surface-icon.tsx`
- Window chrome — the `Proof*` window components from `features/dnd-proof/`
  (`ProofWindow`, `ProofTabStrip`, `ProofTab`, `ProofDragOverlay`,
  `ProofPreviewWindow`, `ProofSnapDestination`). They take layout + window +
  callbacks and are already feature-agnostic. Import them directly rather
  than copying; both proofs are temporary and duplication would just mean
  fixing drag chrome bugs twice. If a piece must diverge (tool-pane accordion
  header, pane-level bottom-pane chrome), extract that one component, do not
  fork the set.

Build new (inside `features/shell-proof/`):

- The page view composing rail + surface area + drag controller over the
  engine store
- Seed layout for the default recipe shape
- Placeholder surface bodies (one generic body + a fake file navigator body)
- Keymap wiring for window-management commands scoped to the page

Likely engine/package work (the real gaps the proof exists to flush out —
see "Engine Work Items"):

- Recipe-slot snap destinations in the drag pipeline
- Placement capability rules in the drop resolver
- Sticky manual placement interplay with drag commits

## Feature Layout

```
apps/web/src/features/shell-proof/
  components/
    view.tsx                 # route component: providers, rail, surface area
    surface-area.tsx         # geometry + drag controller + window rendering
    surface-body.tsx         # generic placeholder body (type-aware visuals)
    file-navigator-body.tsx  # fake file list that opens fake editor surfaces
    debug-panel.tsx          # drag/state log, mounted only with ?debug
  state/
    store.ts                 # createWorkspaceLayoutStore wiring + dispatch helpers
  utils/
    seed.ts                  # default-recipe seed layout + fake file fixtures
    open-surface.ts          # surface factories for rail/file/keymap opens
  tests/
    recipe.browser.tsx       # browser tests for recipe behaviors
    rail-flows.test.tsx      # dom tests for rail click state machine
```

Route registration follows the existing pattern in
`apps/web/src/components/app-content.tsx`: a `shellProofRoute()` pathname
check for `/shell-proof` next to the `/dnd-proof` check.

## Phases

### Phase 0 — Scaffold and seed

- Add the `/shell-proof` route branch to `app-content.tsx`.
- `state/store.ts`: create the engine store per page mount
  (`checkInvariants: true`, invariant violations logged via
  `layout-logging`).
- `utils/seed.ts`: derive the first-load layout from the recipe's baked-in
  default shape (Files tool pane on the left, one fake editor in the main
  view, Terminal + Problems in the bottom tool pane, rail showing all tool
  entries). If the engine has no "default layout for recipe" helper yet, add
  it to `@workspace/tiling` rather than hand-assembling the tree here.
  Support `?empty` for a bare-rail start.
- `view.tsx`: full-viewport page (`h-svh`), rail on the left via the
  production `Rail` component fed by `selectWorkbenchRailItems`, surface area
  filling the rest. No top bar.

Exit: page loads with the default recipe shape rendered statically (no drag
yet), rail items reflect layout state.

### Phase 1 — Drag and resize on the engine store

- `surface-area.tsx`: port the dnd-proof composition —
  `useLayoutRootRect` → `deriveLayoutGeometry` → absolute-positioned
  `ProofWindow`s — but read layout from the engine store.
- Wire `useTilingDragController` with `onCommitLayout` →
  `store.replaceLayout` (which normalizes and runs invariants — this is the
  point: every drag commit now passes through production validation).
- Wire `ResizeOverlay` → `dispatchLayoutOperation`.
- Tab activate/close, window close, collapse/expand dispatch the same
  operations dnd-proof uses, but through the store.

Exit: everything `/dnd-proof` can do interaction-wise works here on the real
store, minus the debug toolbar.

### Phase 2 — Rail + tool-pane recipe semantics

Make every rule in `default-recipe.md` § "Rail Behavior" (as corrected
2026-06-10) observable:

- Rail click is a pure visibility toggle: absent/background tool → recipe
  placement into the left nested tool-pane group; visible tool (expanded or
  collapsed) → closed out of the visible layout, with registry policy
  deciding background-vs-dispose. Update `railItemOperation` first (see
  Engine Work Items) — it still encodes the old collapse-on-active-click
  spec.
- Collapse/expand to accordion header happens only through the pane's own
  shrink/unshrink chrome. Extract `tool-pane-header.tsx` from the workbench
  for the collapsed state after checking parity with the generic proof bar
  (alignment, expand button, close, title, icon); close the gaps in the tool
  header.
- Order packing: opening/closing/collapsing recipe-managed tools recomputes
  the left group from the ordered visible set (Files, Search, Git, Chat,
  Logs) — no accidental incremental nesting that shrinks older panes.
- Manual drag of a tool surface creates sticky placement and opts it out of
  packing; verify rail restore respects it while valid.

Exit: rail toggles and pane-chrome collapse/expand match the corrected recipe
spec, including packing order after arbitrary drag interleavings.

### Phase 3 — Bottom tool pane (Terminal/Problems)

- Rail Terminal item toggles the whole bottom pane via
  `bottomPaneRailOperation` — under the main view, never spanning under the
  left tool group, rail excluded.
- Terminal-first flow: with an empty main view, Terminal may take the work
  area; opening the first main/tool surface reshapes it to the bottom pane.
- Snapping a terminal elsewhere creates sticky manual placement; rail/default
  terminal actions stop forcing it back to the bottom until reset.
- Bottom pane close hides the pane, preserves the surfaces (visible again in
  rail state as background/running).

Exit: every Terminal rule in `default-recipe.md` is demonstrable by hand on
the page.

### Phase 4 — Fake file navigator and main surfaces

- `file-navigator-body.tsx`: static fake tree (a dozen fake paths from
  `seed.ts`). Click opens a `file-editor` surface with that fake
  `resourceKey` via recipe placement into the main view; clicking an
  already-open file focuses its surface instead of duplicating.
- Generic `surface-body.tsx` for everything else: type icon + title +
  muted skeleton blocks, so windows are visually distinguishable without
  content. Tailwind tokens only.
- No preview/transient tab mechanics: a click opens a regular tab, always.

Exit: main surfaces are opened the way the real app opens them, and recipe
placement (tools left, main right, terminal bottom) holds as files open.

### Phase 5 — Keymap commands

- Mount a page-scoped key handler that maps the existing
  `builtInWindowManagementCommands()` catalog (via
  `layout-command-catalog.ts` / `frame-commands.ts` / `layout-dispatcher.ts`)
  to store dispatches: split left/right/up/down, focus movement, maximize/
  restore, collapse/expand, toggle side tools, toggle bottom terminal.
- This proves the contracts line "every layout operation is
  command-addressable" without pulling in the full app command palette.

Exit: the compatibility-baseline layout commands work from the keyboard on
the proof page.

### Phase 6 — Recipe-aware drag (engine work surfaces here)

This is the heart of the backlog gap list; expect package changes, with the
shell proof as the test bed:

- **Recipe-slot snap destinations:** geometry already models
  `recipe-slot` in `SnapDestination`; ensure `snap-destinations.ts` emits
  recipe slots (left tool group, bottom pane) when the drag source is
  eligible, and the resolver prefers them per the spec.
- **Placement capability rules:** which surface types may tab-merge into
  which windows (e.g., terminal tabs do not mix into file-editor windows by
  default). Enforce in `drop-target-resolver.ts` / `drag-targets.ts` as
  capability checks, not UI-side filtering.
- **Recipe-aware fallback:** when a drop target is invalid for the surface
  type, fall back to the nearest valid recipe placement instead of refusing
  the drop or corrupting the tree.
- **Sticky placement on commit:** drag commits record manual placement hints
  so rail/restore behavior (Phases 2–3) keeps honoring them.

Exit: dragging any surface type anywhere either lands in a spec-valid place
or visibly snaps to the recipe fallback; no invalid merge is possible.

### Phase 7 — Persistence

- Persist the layout through the engine's `layout-persistence` under a
  shell-proof-specific key (localStorage); restore on load, with a keymap
  "reset layout" command that reseeds.
- This exercises the persistence contract (stable keys, corrupt-state
  recovery, orphan routing) with recipe state included — restore must
  reproduce packing and sticky placements, not just the tree.

Exit: reload restores the exact layout; a corrupted stored payload resets
gracefully to the seed.

### Phase 8 — Tests and docs

- `tests/recipe.browser.tsx` (browser project, plain Node runner): the
  high-value recipe flows — rail open/collapse/expand, terminal bottom-pane
  toggle and sticky override, packing order after open/close, file click →
  main view placement, capability-blocked merge.
- `tests/rail-flows.test.tsx` (dom project, `bun --bun`): rail item state
  machine against the store without layout/paint.
- Pure logic added to `@workspace/tiling` in Phase 6 gets unit tests next to
  the existing ones in `packages/tiling/src/utils/tests/`.
- Update `backlog.md`: mark cutover gaps as proven/closed as they land;
  update the README doc index to point here.

## Engine Work Items (expected, discovered properly during Phases 2–6)

Listed separately because they change `@workspace/tiling`, not the proof:

0. `rail-model.ts`: change `railItemOperation` from the old spec (collapse on
   active click, expand on collapsed click, activate on visible-inactive
   click) to a pure visibility toggle — visible window → close (registry
   policy decides background-vs-dispose), absent/background → open/restore.
   Update the `Rail` component labels in
   `features/workbench/components/rail.tsx` and the rail-state tests in the
   same change; production picks up the corrected behavior immediately.
1. `snap-destinations.ts`: emit `recipe-slot` candidates for tool group and
   bottom pane when absent or when the dragged surface prefers them.
2. `drop-target-resolver.ts`: surface-type capability gate on `window-center`
   (tab merge) candidates; recipe fallback resolution for invalid targets.
3. Placement hints: ensure drag commits write sticky placement consistently
   with what `recipe-packing.ts` (`stickyPlacementForSurface`,
   `placementCanRestoreSurface`) reads.
4. Whatever invariant gaps the engine store flags once real drag commits flow
   through `replaceLayout` — fix in operations/normalize, never by relaxing
   the invariant checks.

If any of these turn out to already work, delete the item — do not build
speculative layers.

## Out Of Scope

- Real content: server, xterm sessions, real file tree, real git/search/chat.
- Command palette UI (keymap commands only).
- Anything in `backlog.md` § "Deferred Beyond V1" (floating surfaces, lanes,
  popouts, multi-monitor, profiles).
- `placement-policy-follow-up-plan.md` (versioned placement memory) — this
  proof is its gate, not its implementation.
- Restyling the production workbench or touching `/dnd-proof` behavior,
  except extracting a shared component when the shell proof needs a variant.

## Exit Criteria

The shell proof is done when:

1. Every behavior in `default-recipe.md` can be demonstrated by hand on
   `/shell-proof` with no debug chrome.
2. The drag/snap interaction model from `/dnd-proof` works unchanged against
   the engine store with invariants on.
3. Capability rules make invalid tab merges impossible by construction.
4. Layout (including packing and sticky placements) survives reload.
5. The browser/dom test suites above pass in CI.

After that, production cutover means: swap the workbench's
`WorkbenchDragDropProvider` rendering path for the shell-proof composition
with real surface renderers, then delete `features/dnd-proof/`,
`features/shell-proof/`, and this plan in the same change — no compatibility
shims, per `behavior-contracts.md`.

## Resolved Questions (2026-06-10)

- Collapsed-pane chrome: production `tool-pane-header.tsx`, after a feature
  and alignment parity pass against the generic proof bar.
- Transient preview tabs: clicking a file in the navigator always opens a
  regular tab — there is no single-click-preview mechanic for the file tree,
  and none gets built. Clarified 2026-06-10: `transient-file-preview.ts` is a
  different, real mechanic — LSP "preview definition" (from
  `editor-surface-tab-body.tsx`) and Problems-panel diagnostic preview (from
  `diagnostics-surface.tsx`) open the target file as a `transient`-lifecycle
  surface via the preview-adjacent policy, and the engine reuses/replaces the
  transient slot on the next preview. That is what "preview editors promoted
  by edit or pin" in `behavior-contracts.md` refers to. It depends on LSP and
  stays out of the shell proof.
- Seed shape: the recipe's baked-in default layout, always. `?empty` exists
  only as a rehearsal aid for first-surface flows.
- Rail semantics: rail clicks fully toggle windows open/closed; collapse is
  pane chrome. `default-recipe.md` corrected accordingly; `rail-model.ts`
  change tracked in Engine Work Items.
