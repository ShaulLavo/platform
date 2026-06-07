# Tiling Surface Manager Implementation Plan

Date: 2026-06-05
Last audited: 2026-06-07

Status: implementation in progress. The production workbench now uses the
Platform-owned `WorkspaceLayout` model for file/diff/search/tool surfaces,
terminal running surfaces, command palette operations, drag/drop overlay wiring,
cache state, and workflow recipe metadata. Per-phase status notes below remain
the source of truth for completed slices and remaining gaps.

This plan is grounded in `prd.md`, `technical-design.md`, `research-findings.md`,
and the current app ownership points called out in the technical design.

## Current State Snapshot - 2026-06-07

Completed and verified for phases 1-7:

- Core normalized layout model exists under
  `apps/web/src/features/tiling-surface-manager/engine/`.
- Collapse is window presentation state through `collapseWindow` and
  `expandWindow`; background surfaces use `rail.backgroundSurfaceIds`.
- The old `minimizeSurface` operation and `rail.minimizedSurfaceIds` model are
  removed from the current durable model. Legacy `minimizedSurfaceIds` is read
  only as migration input and converted to `backgroundSurfaceIds`.
- Surface registry covers V1 file editor, diff, search results, search preview,
  terminal, file navigator, git changes, diagnostics/problems, chat, logs, and
  placeholders.
- Drop destinations include `window-center`, `window-edge`, `parent-edge`,
  `root-edge`, `recipe-slot`, and `background`.
- Persistence writes `WorkspaceLayout`; old `editorPaneLayout` is accepted only
  as optional migration input and is no longer written to cache payloads.
- Production file/diff rendering runs through workbench surfaces and the custom
  renderer. `WorkspaceView` no longer uses Dockview.
- `dockview-react`, the Dockview spike entry, and obsolete editor-pane renderer
  components have been removed.
- Dirty close and keymap command dispatch read editor tab state from
  `WorkspaceLayout` surface records instead of `workspace.editorPaneLayout`.
- Renderer coverage includes split layouts, Chrome tab presentation, collapse
  and expand, background hosts, lifecycle mount policy, search preview, and
  browser smoke coverage.
- Collapsed windows now receive fixed accordion-header allocation in split
  geometry instead of retaining their expanded body size.
- Sticky placements are validated against target visibility and surface
  placement capabilities before reuse; invalid sticky memory is cleared before
  recipe fallback can proceed.
- The rail now includes recipe entries and active recipe status in addition to
  surface states.
- Diagnostics/Problems now renders active editor language-server diagnostics
  when available instead of only showing a static placeholder.
- Cache persistence subscriptions now compare typed field snapshots instead of
  serializing the entire workspace/search state on every store change.
- Rail and hidden-surface renderer wrappers now subscribe to derived lists with
  equality checks; the main surface area still subscribes to the full layout
  because its geometry/tree derivation depends on the visible split model.

Migration-scoped compatibility that still intentionally exists:

- Legacy `minimizedSurfaceIds` is still read only as persisted-layout migration
  input and converted to `backgroundSurfaceIds`.
- `EditorWorkspaceStore` still exposes derived `openFilePaths` and
  `selectedFilePath` for document, tree, and file-event consumers. These values
  are recomputed from `WorkspaceLayout`; they are no longer persisted as
  top-level cache payload fields.
- The old `editor-pane-state.ts` module, `EditorPaneLayout` bridge helpers, and
  `editorPaneLayout` store/cache state are removed.

## Implementation Direction

Build the Platform-owned tiling workspace layer for the workflow shell. The plan
assumes the custom renderer path from `technical-design.md`. A short
Dockview-backed adapter spike is allowed only if it proves the strict boundary in
`technical-design.md`: Platform owns surfaces/windows/placement, and Dockview
returns renderer events only. Dockview must not become product state.

The durable V1 source of truth is the normalized model:

- `surfacesById`
- `windowsById`
- `nodesById`
- `rootNodeId`
- `rail`
- active and MRU state
- recipe and policy state

The rail stays separate because pinned, running, background, recipe, and status
entries are not tiled layout nodes. Collapsed panes remain in the split tree as
windows rendered as accordion headers; they do not move into rail state. Drag
previews and overlays also stay separate because they are renderer interaction
state.

No V1 top-level `leftDock`, `rightDock`, or `bottomDock` roots. Classic side and
bottom regions are ordinary split nodes created by the classic recipe and
placement policies. No V1 generic `lane`, `stacked`, `floating`, or `spatial`
layout node kinds. Workflow lanes live inside workflow surfaces or policies
until a prototype proves they need to become general primitives.

## Default Recipe Reference

The canonical default recipe spec is `default-recipe.md`. It uses the checked-in
sketch and editable Excalidraw source as the visual reference, but the code model
must remain ordinary surfaces, windows, split nodes, rail state, and recipe
policy. Do not add a `sidebar`, dock, lane, or compatibility model to represent
the default recipe.

## Technical Design Alignment

This plan should be read as the execution path for `technical-design.md`.

- Follow `technical-design.md` "Canonical Representation Decision" for the
  durable model: normalized maps are source of truth; nested trees are derived
  selector output.
- Follow `technical-design.md` "State Direction" for Zustand and selector
  boundaries. Renderer phases should not introduce broad workspace rerenders.
- Follow `technical-design.md` "Renderer and Interaction Direction" for the
  custom renderer, overlay layer, Chrome-style tab presentation, and drag/drop
  grammar.
- Follow `technical-design.md` "Surface Registry Draft" for lifecycle,
  singleton, preview, running, and mount/unmount semantics.
- Follow `technical-design.md` "Layout Operation API" for operation names,
  drop destinations, and normalization requirements.
- Follow `technical-design.md` "Keyboard Control Direction" for command IDs,
  keymap integration, Hyprland/i3-style layout actions, and browser-safe
  binding choices.
- Follow `technical-design.md` "Command Palette And Layout Command Direction"
  for Raycast-style command discovery, hotkey presets, cycling, custom
  single-window commands, and saved layout commands.
- Follow `technical-design.md` "Persistence and Restore" for serialized state,
  placeholder behavior, and corrupt-layout recovery.
- Follow `technical-design.md` "Repo-Specific Migration Notes" for what to
  keep, rehost, and delete in the current app.
- Resolve `technical-design.md` "Remaining Technical Questions" inside the
  relevant phases instead of creating side-channel architecture decisions.

## Non-Negotiables

- Platform owns surface identity, lifecycle, persistence, command routing, and
  placement policy.
- Surfaces are not tabs, panels, docks, lanes, sheets, or windows. Those are
  presentations.
- A window remains a window even with one surface.
- Stable IDs are durable. Tree paths are render addresses only; file paths may
  still be stable resource keys.
- Operations are pure TypeScript and normalize before commit.
- React components render state and dispatch operations; they do not own durable
  layout logic.
- Zustand state is normalized and selector-driven.
- Collapse is presentation state. It collapses a visible window in place into an
  accordion header and is independent from runtime lifecycle.
- Backgrounding removes a surface from visible windows and keeps it addressable
  through rail state when policy allows it.
- Close removes the represented surface/window from visible layout. Registry
  close policy independently decides whether state or sessions are disposed,
  suspended, kept in the background, or protected by confirmation.
- Running surfaces stay mounted while collapsed, hidden, or backgrounded only
  when registry render policy requires it.
- Transient previews are replaced, promoted, or closed. They generally do not
  collapse.
- Once a behavior is rehosted on the surface manager, delete the old owner in
  the same phase. No long-term compatibility shims, aliases, or duplicate layout
  truth.

## Current Module Shape

The pure surface-manager implementation currently lives under:

`apps/web/src/features/tiling-surface-manager/`

Workbench React integration and production surface renderers live under:

`apps/web/src/features/workbench/`

Pure modules:

- `layout-types.ts`
- `layout-ids.ts`
- `layout-builders.ts`
- `layout-invariants.ts`
- `layout-normalize.ts`
- `layout-operations.ts`
- `layout-selectors.ts`
- `layout-geometry.ts`
- `layout-persistence.ts`
- `layout-policies.ts`
- `layout-command-catalog.ts`
- `layout-command-cycling.ts`
- `layout-command-presets.ts`
- `surface-registry.ts`
- `surface-state.ts`
- `surface-commands.ts`

React modules:

- `layout-renderer.tsx`
- `split-node.tsx`
- `window-frame.tsx`
- `tab-strip.tsx`
- `surface-host.tsx`
- `rail.tsx`
- `drop-overlay.tsx`
- `resize-overlay.tsx`
- `hidden-surface-hosts.tsx`
- surface renderers such as `file-editor-surface.tsx`,
  `diff-editor-surface.tsx`, `search-results-surface.tsx`,
  `search-preview-surface.tsx`, `terminal-surface.tsx`,
  `file-navigator-surface.tsx`, `git-changes-surface.tsx`, and
  `diagnostics-surface.tsx`.

Keep each exported React component in its own file. Keep hooks in their own
files. Keep pure helpers out of component and hook files.

## Phase 0 - Baseline And Test Map

Goal: freeze current behavior expectations before changing ownership.

Work:

- List all current layout owners and their replacement phase:
  - `EditorWorkspaceStore` layout fields.
  - `editor-pane-state.ts`.
  - `WorkbenchDockview` and `workbench-dockview-model.ts`.
  - `WorkspaceSidebar` and sidebar tab state.
  - `WorkspaceFloatingTerminal` and terminal overlay store.
  - `WorkspaceSearchRuntime` sidebar/search-buffer enablement.
  - `workspace-cache.ts`.
  - `keymap/commands.ts`.
  - `features/workbench-spike`.
- Mark tests as keep, rewrite, or delete.
- Keep behavior tests for dirty close, diff restore, search state, terminal
  disposal, command aliases, cache recovery, and focus fallback.
- Plan deletion for tests that only assert old editor-pane, fixed-sidebar,
  Dockview-spike, or floating-terminal implementation details.

Exit criteria:

- A small tracking checklist exists in the implementation PR or project issue.
- No production code changes yet.

## Phase 1 - Core Types, IDs, Builders, And Invariants

Status: completed and re-audited 2026-06-06. The durable model supports
collapsed windows, background surfaces, active/MRU state, rail state, recipes,
policies, custom commands, hotkey presets, overlays, and transient preview owner
fields. The current model uses `backgroundSurfaceIds`; old minimized rail state
is migration input only.

Goal: land the durable normalized model without wiring it to React.

Work:

- Define `SurfaceId`, `WindowId`, `LayoutNodeId`, `RecipeId`,
  `LayoutPolicyId`, `WindowManagementCommandId`, `LayoutCommandId`,
  `HotkeyPresetId`, and `OverlayId`.
- Define `WorkspaceLayout`, `Surface`, `WorkbenchWindow`, `LayoutNode`,
  `RailState`, `WorkspaceRecipe`, `LayoutPolicyState`,
  `WindowManagementCommand`, `WorkspaceLayoutCommand`,
  `WindowManagementHotkeyPreset`, and `CommandCycleState`.
- Define lifecycle, cardinality, placement hints, capabilities, close policy,
  renderer lifecycle, and serialized version types.
- Include transient owner fields on `Surface`: `ownerSurfaceId` and
  `ownerContextKey`.
- Add ID helpers that produce stable, typed prefixes for files, diffs, search,
  search previews, terminals, file navigator, git changes, diagnostics, windows,
  and nodes.
- Add builders for an empty workspace and the classic first-run recipe.
- Add invariant checks:
  - every window references existing surfaces;
  - every visible surface appears in exactly one visible window;
  - collapsed windows remain visible in the split tree and keep valid surface
    membership;
  - background surfaces are not visible in windows;
  - active surface belongs to active window when both exist;
  - split child count and size array length match;
  - no same-axis split chains after normalization;
  - no orphan transient preview owners;
  - layout command slots reference registered surface types;
  - hotkey presets reference known window/layout command IDs.

Tests:

- Builder snapshots for empty and classic layouts.
- Invariant tests for missing surfaces, duplicate surface references, bad active
  IDs, invalid split sizes, orphan previews, invalid layout command slots, and
  hotkey presets that reference missing commands.

Exit criteria:

- New core model compiles and is covered by pure unit tests.
- Existing app has moved beyond the original "old layout state" staging point:
  `WorkspaceLayout` is now the production runtime source for workbench layout.

## Phase 2 - Surface Registry Contract

Status: completed and re-audited 2026-06-06. The registry covers V1 surfaces,
including search preview, and exposes the current capability names:
`canCollapse`, `canUnmountWhenNotExpanded`, and `closeRuntimePolicy`.

Goal: replace the early `WorkbenchPanel` vocabulary with the real surface
contract.

Work:

- Implement `surface-registry.ts`.
- Register V1 surface types:
  - file editor;
  - diff;
  - search results;
  - search preview;
  - terminal;
  - file navigator;
  - git changes;
  - diagnostics/problems.
- Carry forward useful existing behavior from `workbench-registry.ts`:
  - file dirty close confirmation;
  - diff restore from stable diff document IDs;
  - terminal close/runtime policy;
  - search singleton restore.
- Add capability checks:
  - `canClose`;
  - `canSplit`;
  - `canCollapse`;
  - `canFloat` with V1 false by default;
  - `supportsPreview`;
  - `canUnmountWhenNotExpanded`;
  - `closeRuntimePolicy`;
  - `validPlacements`;
  - `defaultRecipeSlot`;
  - `serialize`;
  - `restore`.
- Add lifecycle rules:
  - search results are durable singleton state;
  - search preview is transient and owner/context scoped;
  - terminals are running surfaces;
  - running surfaces have `canUnmountWhenNotExpanded: false` only when their
    renderer must stay mounted;
  - durable stateful surfaces such as Search Results may set
    `canUnmountWhenNotExpanded: true`;
  - file and diff can be durable or preview.

Tests:

- Registry duplicate type rejection.
- Surface creation IDs are stable by resource/session key.
- Close policies match existing dirty-file and terminal semantics.
- Restore drops invalid or out-of-workspace resources.
- Search preview is rejected without a valid owner/context.

Exit criteria:

- New registry covers everything currently represented by `WorkbenchPanel`, plus
  file navigator, git changes, and diagnostics.
- Old registry/rendering ownership has been superseded by workbench surface
  renderers and the surface-manager registry.

## Phase 3 - Pure Layout Operations And Normalization

Status: completed and re-audited 2026-06-06. Operations are pure TypeScript,
normalize before commit, support `background` and `recipe-slot` destinations,
and no longer expose a core `minimizeSurface` operation. Collapse/expand are
window mode operations.

Goal: implement the risky tree mechanics outside React.

Work:

- Implement `layout-normalize.ts`:
  - remove empty windows;
  - collapse empty split nodes;
  - flatten same-axis split nodes;
  - repair size arrays;
  - clamp active surface/window IDs;
  - prevent duplicate visible surfaces;
  - route orphan durable or running surfaces to background state or fallback
    window according to registry policy;
  - drop invalid transient previews.
- Implement `layout-operations.ts`:
  - `openSurface`;
  - `closeSurface`;
  - `collapseWindow`;
  - `expandWindow`;
  - `restoreSurface`;
  - `splitWindow`;
  - `moveSurface`;
  - `moveWindow`;
  - `tabSurface`;
  - `reorderSurface`;
  - `resizeSplit`;
  - `maximizeWindow`;
  - `restoreWindow`;
  - `applyRecipe`;
  - `applyCustomWindowCommand`;
  - `applyLayoutCommand`.
- Implement explicit `DropDestination` support:
  - `window-center`;
  - `window-edge`;
  - `parent-edge`;
  - `root-edge`;
  - `recipe-slot`;
  - `background`.
- Reject self and descendant moves.
- Preserve stable window IDs where possible.
- Keep windows alive as windows even with one surface.
- Move user-created manual placement into sticky state for later policy
  decisions.
- Validate sticky placement before reuse: target exists, target is visible,
  placement was user-created, surface type is allowed there, and layout
  constraints pass.
- Clear or demote invalid sticky placement memory before falling back to recipe
  placement or order packing. Do not leave invalid memory to retry forever.
- Compile custom window commands into target-frame changes against the active or
  requested window.
- Compile saved layout commands into open/focus/place operations for their
  surface slots, then normalize once before commit.

Tests:

- React Mosaic-inspired tab container drops, tab reorder, split insert, and
  destination repair after source removal.
- React Layman-inspired remove last window, same-axis merge, percentage
  redistribution, center tabbing, and edge wrapping.
- i3-inspired parent-edge drop, self/descendant rejection, percent repair, close
  fallback, and focus parent/child preparation.
- Surface-specific tests for singleton duplicate prevention, preview promotion,
  and orphan transient cleanup.
- Raycast-inspired custom window command application, saved layout command
  surface slot placement, and command cycling step selection.

Exit criteria:

- Pure operation coverage is high enough that renderer work is mostly wiring.
- No React or DOM imports in operation modules.

## Phase 4 - Selectors, Geometry, Policies, And Store

Status: completed and re-audited 2026-06-06. Selectors, geometry, policies,
command catalog/presets/cycling, and store dispatch are implemented. Collapsed
windows are represented as fixed accordion-header allocations in geometry.
Rail and hidden-surface renderer wrappers use derived-list equality selectors;
the main surface area remains the intentional full-layout subscriber. The cache
persistence hot path has been narrowed with typed snapshot equality.

Goal: make the model usable by a renderer and command layer.

Work:

- Implement selectors:
  - materialized nested tree from normalized maps;
  - node/window/surface path resolution;
  - active window and surface;
  - visible surfaces;
  - MRU fallback;
  - window neighbors;
  - capability-filtered command targets;
  - command palette rows for built-in window commands, custom window commands,
    and saved layout commands;
  - command disabled-state reasons from active surface/window capabilities.
- Implement geometry:
  - root rect to split/window rect derivation;
  - visible gap handling;
  - resize handle rects;
  - drop zone rects;
  - root-edge and parent-edge hit zones.
- Implement policies:
  - `classicPolicy`;
  - `previewAdjacentPolicy`;
  - `masterDetailPolicy`;
  - `focusPolicy`;
  - internal placeholder for `laneWorkflowPolicy` that routes into workflow
    surfaces rather than adding V1 lane nodes.
- Implement initial command catalog helpers:
  - built-in window command list;
  - command alias search metadata;
  - hotkey preset data;
  - cycling step selection and reset state.
- Create the Zustand store for `WorkspaceLayout`.
- Add `dispatchLayoutOperation` that runs operation, normalization, and
  invariant checks in development.
- Add selector hooks with narrow subscription boundaries.

Tests:

- Geometry derivation for horizontal and vertical n-ary splits.
- Policy placement for file, diff, search, terminal, git, navigator, and
  diagnostics.
- Command row derivation for built-in commands, custom commands, and saved
  layouts.
- Cycling state reset by command, active window/surface, and timeout.
- MRU fallback after close/collapse/expand.
- Store dispatch does not mutate old objects unexpectedly.

Exit criteria:

- New layout store can be created from an empty root and can run pure operations.
- Store is now production source of truth for workbench layout. Derived
  `openFilePaths` and `selectedFilePath` remain only as convenience state for
  older editor/document consumers.

## Phase 5 - Persistence And Restore V1

Status: completed and re-audited 2026-06-06. Workspace cache writes serialized
`WorkspaceLayout` and no longer writes `editorPaneLayout`. Restore accepts old
`editorPaneLayout` and old `minimizedSurfaceIds` only as migration input.

Goal: define the new serialized layout before production wiring.

Work:

- Implement `layout-persistence.ts`.
- Persist:
  - layout version;
  - surface registry version;
  - surface type, lifecycle, resource key, state key, and restorable state;
  - windows, active surface, preview/pin state, and MRU;
  - split nodes, sizes, and collapsed window mode;
  - active recipe and sticky manual placements;
  - rail state;
  - user-authored custom window commands;
  - saved layout commands;
  - active hotkey preset ID and user hotkey overrides.
- Do not persist:
  - React component state;
  - DOM rects;
  - drag previews;
  - command cycling runtime state;
  - durable tree path addresses;
  - transient previews unless the registry explicitly marks them restorable;
  - mounted/unmounted UI state.
- Restore matching order:
  - stable resource key and surface type;
  - state/session key;
  - previous surface ID if still valid;
  - logical window or recipe slot;
  - background/default stack fallback.
- Add placeholder surface support for resources that are valid but not ready.
- Add corrupt-state recovery that preserves restorable surfaces when tree
  recovery fails.

Tests:

- Valid layout round trip.
- Unsupported version fallback.
- Invalid tree with restorable surfaces routes to fallback.
- Out-of-workspace file and diff resources are dropped.
- Running terminals restore by session key.
- Invalid transient previews are dropped.
- Placeholder matching by resource key.
- Custom window commands and saved layout commands round trip.
- Invalid command slots or preset bindings are dropped or disabled with a clear
  recovery path.

Exit criteria:

- New persistence has tests before old cache is touched.
- Old cache ownership has been touched and narrowed: `editorPaneLayout` is
  optional read-only migration input, while `WorkspaceLayout` is the persisted
  layout payload.

## Phase 6 - Custom Renderer Skeleton

Status: completed and re-audited 2026-06-06. The custom renderer is the
production workbench renderer for current surfaces. It covers split rendering,
Chrome-style tabs, frames, collapse/expand controls, accordion collapsed
windows, maximized windows, overlays, background hosts, and lifecycle
mount/unmount policy.

Goal: render the new model with no heavy surface migration yet.

Work:

- Implement `workbench-layout-renderer.tsx` and children.
- Render split children from derived rects.
- Render windows absolutely inside the layout root.
- Render one overlay layer for resize handles and drop targets.
- Implement window frame, Chrome-style tab strip, active state,
  close/collapse/maximize controls, collapsed accordion-header rendering, and
  surface host. Reuse or adapt the
  existing `chrome-*` tab components rather than inventing a second tab visual
  language.
- Implement `WorkbenchSurfaceHost` using registry renderers and lifecycle
  mount/unmount rules.
- Add basic keyboard focus attributes and ARIA labels for windows, tabs,
  separators, and rail targets.
- Add visual gaps and subtle translucent/blurred window background without
  hurting editor or terminal contrast.

Tests:

- Component smoke tests for empty layout, one window, split windows, tabs,
  collapsed accordion window, and rail status item.
- Browser test for nonblank rendering and basic focus.

Exit criteria:

- Renderer can display fixture surfaces from the new store.
- Production cutover has happened for file/diff and current V1 workbench
  surfaces.

## Phase 7 - File And Diff Surface Cutover

Status: completed and re-audited 2026-06-07. Runtime file/diff layout is owned
by `WorkspaceLayout`; file, diff, empty-editor, and search-preview rendering is
hosted by workbench surfaces. Dirty close and keymap dispatch now read editor tab
records from `WorkspaceLayout` surfaces. Cache persistence writes
`WorkspaceLayout` only. Production `WorkspaceView` no longer uses Dockview, and
the old editor-pane compatibility model has been deleted.

Goal: replace editor-pane layout and Dockview for file/diff editor workflows.

Work:

- Rehost file editor rendering in the file editor surface.
- Rehost diff rendering in the diff surface.
- Convert `selectFile`, definition open, quick open, diff open, tab select,
  close, reopen closed, split, move, and reorder to surface operations.
- Preserve editor document state, dirty-file handling, LSP, diff cache seeding,
  and editor rendering.
- Replace path-like diff tabs with diff surfaces using stable `resourceKey` and
  `stateKey`.
- Wire dirty close through registry close policy.
- Switch `WorkspaceView` center from `WorkbenchDockview` to the custom
  renderer for file and diff surfaces.

Delete in this phase:

- Production use of `WorkbenchDockview`.
- `workbench-dockview-model.ts` production sync from `EditorPaneLayout`.
- Old file/diff tab ownership in `EditorWorkspaceStore`.

Keep temporarily only if still imported by tests or not-yet-rehosted code:

- Pure ideas from `editor-pane-state.ts` tests until equivalent surface-manager
  tests fully replace them. This is complete as of the 2026-06-07 re-audit:
  editor tests now use direct `WorkspaceLayout` fixtures and surface selectors.
- The Dockview spike has been removed. `editor-pane-state.ts` was deleted after
  its remaining fixture and selector coverage moved to surface-native tests.

Tests:

- Open file focuses existing surface instead of duplicating.
- Split editor creates a new window.
- Diff opens as file-like surface.
- Dirty close still asks before disposing the last file surface.
- Reopen closed editor uses surface history.
- MRU active surface fallback works after closing.

Exit criteria:

- File and diff editing no longer depend on Dockview. Runtime layout ownership is
  `WorkspaceLayout`; `EditorPaneLayout` compatibility state has been deleted.

## Phase 8 - Rail And Classic Singleton Surfaces

Status: partially complete and re-audited 2026-06-06. The default rail exposes
surface states, classic singleton surfaces are registered, left tool panes
order-pack through recipe-managed split nodes, and stale or invalid sticky
placements are cleared before recipe fallback. The Diagnostics/Problems surface
now renders active editor diagnostics when available. Remaining Phase 8 work is
to remove the temporary classic bottom-pane one-off and complete true
terminal/problems singleton ownership in later terminal/search phases.

Goal: turn fixed sidebar concepts into rail commands and recipe-controlled
nested tool panes in the surface manager.

Work:

- Implement `WorkbenchRail`.
- Register rail entries/status for visible expanded, visible collapsed,
  background, running, pinned, and singleton surfaces. Keep recipe state in the
  layout model and command layer; do not add a visible default rail recipe
  button.
- Rehost File Navigator as durable singleton surface.
- Rehost Git Changes as durable singleton surface.
- Rehost Diagnostics/Problems as durable singleton surface.
- Rehost Logs as a separate rail surface if the existing Logs panel remains
  part of V1; do not fold Logs into the temporary Terminal/Problems bottom-pane
  handle.
- Register Chat only as a current UI surface if needed; keep full agent surface
  semantics in the required follow-up agent plan.
- Implement the default recipe from `default-recipe.md`:
  - Files/Search/Git/Chat/Logs prefer left nested tool panes;
  - file editors, diffs, and promoted previews prefer the main view;
  - terminal/problems stay in one classic bottom tool pane nested under the
    editor/main panel, with the Terminal rail entry acting as the pane handle
    and Problems remaining a tab in that pane;
  - opening Terminal first may temporarily use the available work area, but
    opening the first normal content/tool surface reshapes Terminal/Problems
    into the bottom of the editor/main panel unless the terminal has sticky
    manual placement;
  - a manually moved terminal stays in its chosen split/side placement until the
    user resets the recipe or opens a new default bottom-pane terminal;
  - the recipe uses ordinary nested split nodes only, with no sidebar/dock/lane
    layout primitive;
  - first tool surface can occupy the available work area when no main surface
    is visible;
  - opening a main surface creates/restores the main view and places tool
    surfaces into the left nested tool-pane group;
  - recipe-managed Files/Search/Git/Chat/Logs are order-packed from the current
    visible set in stable recipe order whenever that set changes;
  - order packing rebuilds the left tool-pane group shape from recipe-managed
    tools instead of appending to stale incremental split history;
  - user drag/drop or explicit move creates sticky manual placement and opts
    that tool surface out of automatic order packing while its target remains
    valid;
  - multiple tool surfaces may be visible on the left as separate nested
    windows/panes;
  - tabs where users expect them.
- Replace activity bar sidebar toggles with rail focus/open/collapse/expand
  operations.

Delete in this phase:

- Fixed files/search/git/logs/chat mutual-exclusion assumptions from
  `WorkspaceSidebar`.
- `workspacePanelTab` as layout truth.
- `sidebarVisible` as layout truth.
- `gitPanelOpen` as layout truth.

Tests:

- Multiple singleton tool surfaces can be visible at once.
- Multiple tool windows can be visible in the left nested tool-pane group.
- Left nested tool panes can coexist with a full-height main window on the
  right.
- Opening Files, Search, and Git through rail/default commands order-packs them
  into the recipe-managed left tool-pane group instead of stacking each new tool
  below the previous split.
- Closing, collapsing, or expanding one recipe-managed tool repacks the
  remaining visible recipe-managed tools without stealing height from unrelated
  panes or preserving stale split ratios.
- Manual placement opts a tool out of order packing while the concrete target
  remains valid.
- Collapse keeps durable singleton tool panes in the split tree as accordion
  headers.
- Expand returns collapsed singleton surfaces to their prior pane size.
- Open/restore returns background or absent singleton surfaces to recipe
  placement.
- Restore ignores stale placements that target missing or hidden windows and
  returns singleton surfaces through default recipe placement.
- Restore ignores and clears user-created sticky placement when current
  constraints fail, including editor/tool/terminal minimum sizes and recipe
  side-pane limits.
- Clicking an active expanded rail item collapses the corresponding tool pane.
- Clicking a collapsed rail item expands and focuses the corresponding tool
  pane.
- Terminal rail toggles the whole classic bottom tool pane, preserving the
  Problems tab and terminal session.
- Terminal opened first moves to the bottom of the editor/main panel when
  another normal surface opens through recipe placement.
- A terminal manually moved to the left or right is not forced back to the
  bottom by later recipe placement.
- File Navigator and Git Changes preserve selection/state hooks.
- Classic first-run layout still feels familiar.

Exit criteria:

- The old fixed sidebar is deleted or reduced to rail/tool presentation with no
  independent layout state.
- The new default recipe has no `sidebar`, dock, lane, compatibility shim, or
  duplicate layout truth in code.

## Phase 9 - Search Results And Search Preview Lifecycle

Goal: implement the PRD search decisions exactly.

Work:

- Move search runtime ownership to Search Results surface lifecycle.
- Store search query, filters, selected result, result metadata, scroll
  position, and preview relationship as search surface state.
- Allow collapsed, hidden, or background Search Results to unmount heavy UI and
  rehydrate from surface state when registry render policy allows it.
- Implement Search Preview as contextual transient surface:
  - owner is Search Results surface;
  - context key is selected result key;
  - selection changes replace the preview;
  - close/reset owner closes unpromoted preview;
  - edit/open/pin promotes preview to durable file or diff surface.
- Route surfaces opened from a maximized/fullscreen owner or active window into
  that same window as a tab by default. Do not open child or full-mode search
  surfaces behind the active fullscreen context unless the command explicitly
  asks for a different placement.
- Opening a search result should dispatch `openSurface`, not `selectFile`.

Delete in this phase:

- `WorkspaceSearchRuntime` dependency on `sidebarVisible`,
  `workspacePanelTab`, or fake selected search-buffer editor documents.
- Search-buffer document IDs as editor-tab layout state.

Tests:

- Search Results is durable singleton.
- Collapsed, hidden, or background search preserves state without requiring
  mounted UI.
- Selection creates or replaces one Search Preview.
- Owner close/reset drops unpromoted Search Preview.
- Promotion turns preview into durable file/diff surface.
- Opening full Search or another child surface from a maximized/fullscreen
  Search window creates or focuses a tab in that same window, not a hidden
  surface behind it.
- Explicit user placement commands can still override the fullscreen tab
  default.

Exit criteria:

- Search behavior is state-durable and presentation-independent.

## Phase 10 - Terminal Running Surfaces

Goal: move terminal overlay tabs into the surface manager.

Work:

- Represent each terminal session/tab as a running terminal surface.
- Delete the temporary Phase 8 bottom-pane one-off once terminal sessions are
  true running surfaces and the terminal pane/group target is modeled properly.
- Route terminal creation through `openSurface`.
- Collapse terminal windows into accordion headers in place.
- Close terminal removes it from visible layout and asks registry close policy
  whether to dispose, suspend, or keep the server session in the background.
- Set `canUnmountWhenNotExpanded: false` for terminal surfaces whose renderer
  must stay mounted and enforce it in `WorkbenchSurfaceHost`.
- Place terminals through recipe policy. In the default recipe, default
  terminal commands target the bottom of the editor/main panel.
- Distinguish default terminal placement from manual terminal placement:
  default terminal commands target `bottom-tools`; user drag/drop or explicit
  move commands create sticky manual placement while the target remains valid.
- Preserve terminal transport, theme sync, and server session semantics.

Delete in this phase:

- `WorkspaceFloatingTerminal`.
- `workspace-terminal-store.ts`.
- terminal overlay height persistence.
- terminal overlay tab strip ownership.
- the internal terminal tab strip/store still embedded in the current terminal
  surface renderer.

Tests:

- Collapse preserves process/session when registry runtime policy says the
  session remains running.
- Close behavior follows registry close policy: dispose, suspend, or background.
- Collapsed/hidden terminals stay mounted only when registry render policy
  requires it.
- Multiple terminals restore by session key.
- Default terminal placement follows classic bottom-pane policy.
- Manual terminal placement overrides classic bottom-pane policy while the
  concrete target remains valid.

Exit criteria:

- No separate terminal overlay state remains.

## Phase 11 - Command Palette, Hotkeys, Presets, And Layout Commands

Goal: keep muscle-memory command IDs while upgrading the command palette into a
Raycast-style control surface for window management, custom window commands, and
saved layout commands.

Work:

- Add new tiling workspace commands to `WorkspaceCommandId` in
  `apps/web/src/keymap/types.ts`.
- Add command metadata in `apps/web/src/keymap/command-registry.ts` so the
  command palette, shortcut labels, and aliases work.
- Extend command metadata with command family/type information for Window
  Management, built-in commands, custom window commands, saved layout commands,
  and settings/editing commands.
- Add built-in Window Management commands:
  - fullscreen;
  - maximize;
  - almost maximize;
  - maximize height/width;
  - restore;
  - reasonable size;
  - center;
  - halves;
  - thirds and two-thirds;
  - fourths and quarters;
  - sixths;
  - move/focus by direction;
  - move to background;
  - move to next/previous display when display support exists.
- Add browser-safe default bindings in `apps/web/src/keymap/default-bindings.ts`.
  Use Hyprland/i3-style grammar where practical, but keep exact chords in the
  keymap layer rather than the layout core.
- Add hotkey preset data for Platform defaults plus migration-friendly presets
  such as Rectangle, Magnet, Spectacle, VS Code-style splits, and optionally
  Hyprland/i3-style commands.
- Add handlers in `apps/web/src/keymap/commands.ts` that dispatch layout
  operations through the surface manager.
- Keep `useAppKeymap` as the app-level registration point. Do not add
  renderer-local global keyboard listeners.
- Keep the current pane-scoped focus model for V1, extended with any needed
  workbench/window/rail focus areas. Do not block this phase on the future
  full context-predicate keymap runtime.
- Extend `apps/web/src/components/command-palette.tsx` and
  `apps/web/src/components/command-palette/*` so command rows can show Window
  Management category labels, icons, aliases, shortcut labels, and saved layout
  commands alongside ordinary workspace/editor commands.
- Update command palette disabled states to use active surface/window
  capabilities instead of selected path alone.
- Add command palette entries for:
  - create custom window command;
  - create layout command;
  - edit window management settings;
  - apply hotkey preset;
  - run saved layout command.
- Implement custom single-window command definitions with size, pinned
  position, offsets, percent/point units, alias, enabled state, icon, and
  optional hotkey.
- Implement saved layout command definitions with multiple surface slots,
  frames, focus order, optional URL/file/quicklink payloads for compatible
  surfaces, alias, enabled state, icon, and optional hotkey.
- Implement command cycling for repeated commands such as Left Half and Right
  Half. Cycling should reset by command, active window/surface, workspace, and
  timeout.
- Add a Window Management settings surface or settings detail panel with
  Name/Type/Alias/Hotkey/Enabled-style command table, default gap, cycling
  mode, display wrapping, OS compatibility toggles where applicable, and
  hotkey presets.
- Retarget workspace commands to surface operations:
  - close active surface;
  - close others;
  - close saved/clean;
  - split editor/window;
  - move surface/window;
  - focus window left/right/up/down;
  - focus parent/enclosing split;
  - focus child/active surface;
  - keyboard resize active split by direction and step;
  - move active surface/window by direction;
  - move active surface/window to parent or root edge;
  - tab active surface into target window;
  - tear active tab into a new window;
  - quick open previous surface;
  - reopen closed editor;
  - toggle file navigator/search/git/terminal/problems surfaces;
  - maximize/restore;
  - collapse/expand window.
- Keep VS Code command aliases, but remove old sidebar/editor-pane mutations.
- Route file lifecycle commands through active file-backed surface.

Tests:

- New tiling commands have command-registry metadata.
- Window Management commands appear in command palette groups with category,
  aliases, icons, shortcut labels, and disabled states.
- New default bindings resolve through `activePlatformKeyBindings`.
- Hotkey presets apply deterministic command bindings and can be replaced.
- Pane-scoped bindings override global bindings where expected.
- Existing command aliases still dispatch.
- Commands reject invalid active surface types.
- Focus and MRU commands use layout selectors.
- Toggle sidebar/panel aliases map to rail/surface collapse, expand, and open
  operations.
- Custom window command applies the expected frame and normalizes layout.
- Saved layout command opens/focuses/places all compatible surface slots.
- Cycling commands advance and reset predictably.

Exit criteria:

- `keymap/commands.ts` no longer reads `editorPaneLayout`, `workspacePanelTab`,
  `sidebarVisible`, or `gitPanelOpen`.
- Command palette no longer derives layout command availability from selected
  path alone.
- Users can discover and run built-in window management commands from the
  command palette.
- Users can define at least one custom window command and one saved layout
  command, then run each from the command palette.
- No layout shortcut is owned by `WorkbenchLayoutRenderer` or window-frame
  component-level global listeners.

## Phase 12 - Workspace Cache Replacement

Goal: make `WorkspaceLayout` the persisted workspace state.

Work:

- Replace `workspace-cache.ts` with versioned surface layout persistence.
- Persist layout and surface registry versions.
- Persist singleton surface state, rail state, MRU, recipe, windows, split
  nodes, resource keys, state keys, custom window commands, saved layout
  commands, active hotkey preset ID, and user hotkey overrides.
- Wire `useWorkspaceCachePersistence` to the layout store plus feature surface
  state serializers.
- Normalize cache mismatch policy: server-backed caches may reset and refetch,
  but local-only UI state must either migrate explicitly or be intentionally
  dropped. Every local-only persisted schema needs a version and clear mismatch
  behavior.
- Because repo policy says no backward compatibility shims, do not keep old
  cache schema branches long term.
- If a one-time conversion is desired, land it in the same phase and delete the
  old schema immediately after the conversion code is no longer needed.

Delete in this phase:

- Old cache shape:
  - `editorPaneLayout`;
  - `openFilePaths`;
  - `selectedFilePath`;
  - `sidebarVisible`;
  - `workspacePanelTab`;
  - `gitPanelOpen`;
  - old search-buffer editor-tab persistence;
  - any command palette disabled-state assumptions tied to selected file path
    instead of surface capabilities.
- Old tests that preserve obsolete cache behavior.

Tests:

- New layout cache round trip.
- Corrupt layout recovery.
- Search singleton state persistence.
- Terminal session persistence.
- Custom window command and saved layout command persistence.
- File/diff resource filtering.
- Registry-version fallback.

Exit criteria:

- Reload restores the surface workspace without old editor-pane cache fields.

## Phase 13 - Drag, Drop, Live Preview, And Resize

Status: completed and re-audited 2026-06-07. Editor tab dragging now uses a
pointer-driven in-strip gesture for visible tabs, keeps the dragged tab inside
the strip below the detach threshold, and hands detached pointer drags to
snapped `DropOverlay` destinations. Whole-window header drags use the same
overlay and commit snapped `moveWindow` operations. Snapped drag/drop previews
derive an uncommitted layout from the current move operation, while drop/cancel
clears preview state and release commits only the snapped operation. The mouse
detach threshold follows Chromium `TabDragController::kVerticalDetachMagnetism`
at 15 px; touch follows `kTouchVerticalDetachMagnetism` at 50 px; reattach
hysteresis is 4 px; drag motion uses immediate pointer-follow transforms while
sibling/drop slot movement uses existing Chrome-tab transition timing. Resize
dragging previews handle movement locally at animation-frame cadence, commits
split sizes only on release, and clamps editor, terminal, and tool panes with
content-aware minimums.

Goal: deliver the interaction model from the PRD.

Work:

- Implement surface tab drag and whole-window drag.
- Enforce the global snapped-drag invariant: every pointer-driven move previews
  and commits a concrete snapped layout destination or explicit background
  target. This applies to whole-window drag, detached tab drag, and individual
  surface moves. Drag must never create a floating, popout, or unsnapped
  intermediate state.
- Replace the current editor-tab drag TODO with a pointer-driven Chrome-like
  tab drag model:
  - below the detach threshold, the dragged surface/tab remains inside the tab
    strip and sibling tabs slide aside to show the exact reorder position;
  - the implementation should not use a floating drag image or visually pull a
    pane out while the gesture is still an in-strip reorder;
  - before coding the threshold and drag-down animation, read Chromium's tab
    strip source under
    `chrome/browser/ui/views/tabs/` and document the chosen threshold,
    hysteresis, and easing/progress behavior.
- Convert a tab drag to workspace placement only after the pointer is pulled
  down past the detach threshold. Once detached, the surface previews a snapped
  destination as a new window, merge target, edge split, parent/root edge split,
  recipe slot, or background target.
  There should never be an unsnapped tab/pane hovering in the workspace.
- Implement live drag preview state separate from committed layout.
- Batch pointer move preview updates with animation-frame cadence.
- Commit previewed transform on release.
- Cancel restores committed layout.
- Support drop destinations:
  - center tab/merge;
  - window edge split;
  - parent edge split;
  - root edge split;
  - recipe-slot placement through the active recipe policy;
  - background target when a surface is intentionally removed from visible
    layout.
- Add resize handles in the overlay layer.
- Implement adjacent percentage resizing for V1.
- Add content-aware constraints for editor minimums, terminal usability, and
  nested tool-pane widths.
- Persist preferred sizes only on intentional resize release.

Tests:

- Whole-window drag always previews a snapped destination and never renders a
  floating or popout window preview.
- No pointer-drag path can create future floating-window state; floating windows
  must require an explicit command or policy when that mode exists.
- In-strip tab drag keeps the source tab in the strip, animates sibling slots,
  and commits only a reorder when the pointer never crosses the detach
  threshold.
- Pulling a tab down past the detach threshold switches to snapped workspace
  placement and exposes the exact destination that will be committed.
- Detach threshold tests cover the documented Chromium-derived threshold,
  hysteresis, and drag-down progress states.
- Detached tab drag never renders an unsnapped floating tab/pane preview.
- Drop target hit testing.
- Center drop tabs.
- Edge drop splits.
- Parent/root edge drops either work or are explicitly feature-gated with model
  support already tested.
- Drag preview does not persist.
- Resize clamps and normalizes percentages.
- Renderer does not rerender every surface on pointer movement.

Exit criteria:

- Drag/drop live-previewed snapped layouts are usable in production.
- Whole-window dragging follows the same snapped-layout rule as tab detaching
  and surface moves.
- Chrome-style tab dragging feels correct: reorder happens inside the strip by
  default, detach happens only after the vertical pull-down threshold, and every
  detached preview is snapped to a concrete workspace destination.

## Phase 14 - Accessibility, Visual Polish, And Performance

Goal: make the new workspace credible as a daily editor shell.

Work:

- Keyboard navigation:
  - focus window by direction;
  - focus parent;
  - focus child/active window;
  - cycle tabs/surfaces;
  - focus rail.
- ARIA:
  - tablist/tabs;
  - window labels;
  - resize separator labels;
  - rail item labels.
- Visual language:
  - visible gaps with wallpaper/background;
  - use `/Users/shaul/Pictures/6se14k41od671.png` as the default wallpaper
    source; when implemented, copy/package it as an app asset instead of
    depending on the absolute local path at runtime;
  - slight translucent/blurred windows;
  - clear active window and active surface state;
  - clear transient preview state;
  - clear collapsed/background/running rail state.
- Performance:
  - selector boundaries match the technical design;
  - heavy surfaces subscribe to feature state only;
  - drag preview updates do not rerender surface content;
  - terminal/editor contrast remains readable.

Tests:

- Browser screenshots for desktop and mobile widths.
- Focus traversal tests.
- Basic accessibility checks.
- Performance smoke around drag and resize.

Exit criteria:

- The custom renderer is visually and interactively production-ready.

## Phase 15 - Legacy Deletion And Dependency Cleanup

Status: completed and re-audited 2026-06-07 for old editor-pane, Dockview,
workbench-spike, floating-terminal, and old cache ownership. The old
`editor-pane-state.ts` module is deleted; tests now build surface-native
`WorkspaceLayout` fixtures; `rg` finds no old layout-owner source references
outside documented migration readers and cache assertions.

Goal: remove all old layout owners after their replacements have landed.

Delete:

- `apps/web/src/features/editor/state/editor-pane-state.ts` after equivalent
  surface-manager tests exist.
- Obsolete editor-pane component files:
  - `editor-pane-drop-context.ts`;
  - `editor-pane-drop-overlay.tsx`;
  - `editor-pane-drop-utils.ts`;
  - `editor-pane-leaf-content.tsx`;
  - `editor-pane-leaf-view.tsx`;
  - `editor-pane-node-view.tsx`;
  - `editor-pane-split-child.tsx`;
  - `editor-pane-split-view.tsx`;
  - old pane/tab helpers that no longer feed the renderer.
- Dockview production files:
  - `workbench-dockview.tsx`;
  - `workbench-dockview-model.ts`;
  - `workbench-dockview-panel.tsx`;
  - `workbench-dockview-tab*.ts*`;
  - `workbench-dockview.css`;
  - `use-dockview-panel-active.ts`.
- `apps/web/src/features/workbench-spike` after learnings are covered by tests
  or the new implementation.
- `WorkspaceSidebar` and fixed sidebar resizable panel files if reduced to rail
  replacements.
- Floating terminal overlay files.
- Old cache tests and old cache schema branches.
- `dockview-react` dependency and CSS imports if no longer used anywhere.

Tests:

- Full app test suite.
- Typecheck.
- Lint.
- Browser smoke for workbench startup, file open, split, search, terminal, and
  reload restore.

Exit criteria:

- There is one layout source of truth: `WorkspaceLayout`.
- No old editor-pane/sidebar/Dockview/terminal-overlay state remains.
- Triple-check that no legacy layout owners, migration branches,
  compatibility shims, compatibility aliases, or duplicate state truths remain.
- Triple-check that no temporary Phase 8 bottom-pane one-off, legacy terminal
  tab store, compatibility shim, or hidden duplicate pane model remains.

## Phase 16 - Workflow Recipes And Follow-Up Plans

Status: completed and re-audited 2026-06-07. Workflow recipe metadata now
covers Classic, Search And Investigate, Review, Agent Pairing, and Focus. The
Review Workspace saved layout command applies the Review recipe before opening
its concrete surfaces, and old serialized layouts restore the default saved
layout command from fallback state. Required follow-up plans are documented in
`agent-surfaces-follow-up-plan.md` and `placement-policy-follow-up-plan.md`.

Goal: add the first distinctive Platform workflows after the foundation is
stable.

Work:

- Solidify internal recipe API around:
  - classic;
  - search/investigate;
  - review;
  - agent pairing placeholder;
  - focus.
- Expose useful recipes as saved layout commands where the command palette UX
  is the right entry point.
- Prototype Git/review workflow placement with contextual diff preview.
- Keep GitButler-style lanes inside git/review surfaces or policy behavior in
  V1.
- Write required follow-up agent surfaces plan:
  - chat;
  - plans;
  - tasks;
  - logs;
  - patches;
  - artifacts;
  - terminals;
  - generated diffs.
- Write required placement policy plan after real drag and basic tiling behavior
  are proven.

Tests:

- Recipe reset shape tests.
- Saved layout command applies the intended recipe shape and focus order.
- Sticky manual placement overrides recipe default only when it was user-created,
  its concrete target still exists and is visible, the placement remains valid
  for the surface type, and current layout constraints pass.
- Invalid sticky placement memory is cleared or demoted, then the surface falls
  back to recipe placement or order packing.
- Singleton surfaces restore last useful state and last valid placement.
- Durable surfaces do not jump unexpectedly.

Exit criteria:

- Classic singleton workflows are stable, and the first workflow-native recipe is
  ready to build without changing the core model.

## Suggested PR Slicing

The phases are intentionally larger than individual PRs. Suggested merge slices:

1. Core model and invariant tests.
2. Registry and surface descriptors.
3. Operations and normalizer.
4. Selectors, geometry, policies, and store.
5. Persistence schemas.
6. Renderer skeleton behind fixtures.
7. File/diff production cutover.
8. Rail plus file navigator and Git Changes.
9. Search Results and Search Preview lifecycle.
10. Terminal running surfaces.
11. Command palette, hotkey presets, custom window commands, and saved layout
    commands.
12. Cache replacement.
13. Drag/drop and resize.
14. Visual/accessibility/performance pass.
15. Legacy deletion and dependency cleanup.
16. First workflow recipe and follow-up plans.

## Verification Commands

Last verified: 2026-06-07.

Focused verification from the 2026-06-07 Phase 16 recipe/follow-up pass:

```sh
bun --bun vitest run --project node src/features/tiling-surface-manager/tests
bun run typecheck
bun run format:check
git diff --check
```

Focused verification from the 2026-06-06 re-audit/fix pass:

```sh
bun run typecheck
bun --bun vitest run --project node src/features/tiling-surface-manager/tests/layout-geometry.test.ts src/features/tiling-surface-manager/tests/layout-operations.test.ts src/hooks/tests/use-workspace-cache-persistence.test.ts
bun --bun vitest run --project node src/lib/tests/workspace-cache.test.ts src/features/editor/tests/editor-state.test.ts src/features/workbench/tests/editor-surface-layout.test.ts src/features/workbench/tests/editor-surface-dispatch.test.ts src/hooks/tests/use-workspace-cache-persistence.test.ts
bun --bun vitest run --project dom src/features/workbench/tests/layout-renderer.test.tsx
bun run lint
bun --bun vitest run --project node --project dom
git diff --check
```

Focused phase 1-7 regression gates:

```sh
bun --bun vitest run --project node --project dom src/features/tiling-surface-manager/tests src/features/workbench/tests
bun --bun vitest run --project node src/lib/tests/workspace-cache.test.ts src/features/editor/tests/editor-state.test.ts src/hooks/tests/use-workspace-cache-persistence.test.ts
bun --bun vitest run --project node src/components/workspace/editor-tabs/tests src/components/workspace/file-tree/tests
bun run test:browser -- src/features/workbench/tests/layout-renderer.browser.tsx
```

Full app gates:

```sh
bun run typecheck
bun run lint
bun --bun vitest run --project node --project dom
git diff --check
```

Audit scans:

```sh
rg -n "components/workspace/editor-panes|components/workspace/file-tree/components/file-viewer|FileViewer|EditorPaneTabBody|EditorTabBar|EditorTabList|TabCloseButton|workbench-spike|dockview|Dockview|canMinimize|minimizeSurface|minimizedSurfaceIds" apps/web/src apps/web/package.json apps/web/*.html package.json bun.lock -g '*'
```

Expected remaining scan hits:

- `layout-normalize.ts` and `layout-persistence.ts` may mention
  `minimizedSurfaceIds` only while reading old persisted layouts and migrating
  them to `backgroundSurfaceIds`.
- Chrome tab component names such as `ChromeEditorTabList` and
  `ChromeTabCloseButton` are current shared presentation components, not legacy
  editor-pane ownership.
- The browser runner may print Vite's post-success `The build was canceled`
  message after passing all tests; the command is considered passing when it
  exits with code 0.

## V1 Definition Of Done

- The production workbench is powered by `WorkspaceLayout` from first render.
- File editor, diff, search results, search preview, terminal, file navigator,
  Git Changes, and diagnostics are registered surfaces.
- Classic first-run layout is implemented as a recipe over the tiling model.
- Rail can focus, open, expand, collapse, and show status for
  durable/running/singleton surfaces.
- Window tab stacks use the existing Chrome-style tab presentation.
- Center and edge drag/drop work with live previews.
- Parent/root edge support is either implemented or model-ready and explicitly
  deferred from UI.
- Resize is constraint-aware enough for editor, terminal, and nested tool-pane
  surfaces.
- Search state is durable while heavy search UI can unmount when collapsed,
  hidden, or backgrounded.
- Terminal collapse preserves the visible layout position as an accordion
  header; terminal close/runtime behavior follows registry policy and is not
  inferred from collapse.
- GitButler-style lanes remain inside workflow surfaces or policies; there is no
  generic V1 lane layout node.
- Workspace reload restores by stable resource/session keys and recovers from
  corrupt layout state.
- Keymap and command palette aliases target surface operations.
- Command palette exposes a Window Management command family with built-in
  commands, aliases, shortcuts, capability-based disabled states, hotkey
  presets, cycling behavior, custom single-window commands, and saved layout
  commands.
- Old editor-pane, sidebar-tab, Dockview sync, floating-terminal, and old cache
  ownership are gone.

## Deferred Beyond V1

- Agent surface implementation beyond a required follow-up plan.
- Extension-contributed custom surfaces.
- Generic floating surfaces.
- Generic stacked groups.
- Generic lane layout node type.
- Browser popouts.
- Multi-window behavior and full OS-level multi-monitor display/space movement
  beyond stored display hints.
- Niri-like spatial mode.
- User-authored layout scripts or algorithms.
- Deep saved profile management.
