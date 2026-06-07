# Tiling Surface Manager Technical Design

Date: 2026-06-05

Status: draft. This document is the place for implementation discussion. The
product decisions live in `prd.md`; the research notes live in
`research-findings.md`.

## Direction

Build the custom, app-first tiling workspace layer for Platform's workflow
shell. Do not build a standalone generic "Hyprland for React" package first,
and do not use Dockview as the product model.

The implementation should still keep a clean internal core so we can extract or
reuse pieces later if the model proves stable.

The core technical bet is:

- Platform owns surface identity, lifecycle, command routing, persistence, and
  placement policy.
- Workflow surfaces own their internal experience, such as git/review lanes,
  search result browsing, or future agent task navigation.
- The renderer owns pointer interaction, rect measurement, animation, resize
  handles, and accessibility affordances.
- Libraries can help with mechanics only after those boundaries are explicit.

## Reference Grounding

These are the concrete examples from the research that shape this design:

- Dockview proves the value of a mature grid renderer, edge groups,
  floating/popout groups, active panel events, and save/restore. It also proves
  why Platform should not delegate product identity to a third-party panel
  model.
- React Mosaic gives the best TypeScript shape for n-ary split nodes, explicit
  tabs nodes, controlled state, pure drag transforms, normalization, and
  release-time persistence hooks.
- React Layman gives a small readable reducer for five structural destinations:
  top, bottom, left, right, and center. Its path-only addressing is useful for
  rendering but too fragile for durable Platform state.
- GitButler shows how a code workspace can be workflow-native: unassigned
  changes, optional preview diff, horizontal stack lanes, folding, panning,
  lane reordering, and overlay sashes.
- T3Code shows that a single surface identity can have responsive
  presentations. Its diff panel is route/search-state driven on desktop and can
  become a mobile sheet without becoming a different product object.
- Athas is the closest local custom editor reference: typed pane content,
  split/group tree, bottom root, MRU pane tracking, preview/pin state, explicit
  structural move actions, and resource-based workspace persistence.
- Zed separates editor-like `Item` contracts from dock `Panel` contracts and
  lets terminal panels host their own internal pane group. That is the right
  model for Platform surfaces that contain nested layout.
- VS Code is the compatibility baseline: named workbench parts, serializable
  editor groups, movable view containers, multiple memento scopes, restore
  orchestration, and command coverage.
- Hyprland shows that layout can be policy-driven by workspace algorithms, not
  only stored geometry. New target placement, master/detail ratios, cursor
  placement, and custom layout providers map directly to Platform recipes.
- i3 gives the cleanest structural tiling grammar: containers, split/tabbed/
  stacked presentations, parent focus, scratchpad, placeholder restore, and
  center/edge/parent-edge structural moves.
- Zellij shows developer workspace depth: layout files, swap layouts, tiled
  panes, floating panes, stacked panes, plugin panes, session serialization,
  mouse resizing, and exact/logical-position restore matching.
- Raycast Window Management grounds the command UX: searchable window commands,
  command rows with category and shortcut metadata, per-command hotkey
  recording, cycling behavior, preset import, custom single-window commands,
  and multi-item layout commands.

## Core Model Draft

```ts
type WorkspaceLayout = {
  version: number
  surfaceRegistryVersion: number
  surfacesById: Record<SurfaceId, Surface>
  windowsById: Record<WindowId, WorkbenchWindow>
  nodesById: Record<LayoutNodeId, LayoutNode>
  rootNodeId: LayoutNodeId
  rail: RailState
  recipesById: Record<RecipeId, WorkspaceRecipe>
  policiesById: Record<LayoutPolicyId, LayoutPolicyState>
  windowCommandsById: Record<WindowManagementCommandId, WindowManagementCommand>
  layoutCommandsById: Record<LayoutCommandId, WorkspaceLayoutCommand>
  hotkeyPresetsById: Record<HotkeyPresetId, WindowManagementHotkeyPreset>
  activeHotkeyPresetId?: HotkeyPresetId
  commandCycleState?: CommandCycleState
  activeSurfaceId?: SurfaceId
  activeWindowId?: WindowId
  mruSurfaceIds: SurfaceId[]
  mruWindowIds: WindowId[]
  activeRecipeId: RecipeId
  dragPreview?: DragPreviewState
  overlaysById?: Record<OverlayId, OverlayState>
}

type Surface = {
  id: SurfaceId
  type: SurfaceType
  title: string
  lifecycle: 'transient' | 'durable' | 'running' | 'placeholder'
  cardinality: 'singleton' | 'multi'
  resourceKey?: string
  stateKey?: string
  ownerSurfaceId?: SurfaceId
  ownerContextKey?: string
  placement?: SurfacePlacementHint
  capabilities: SurfaceCapabilities
}

type RecipeSlotId = string

type WorkbenchWindow = {
  id: WindowId
  surfaceIds: SurfaceId[]
  activeSurfaceId: SurfaceId
  previewSurfaceId?: SurfaceId
  pinnedSurfaceIds: SurfaceId[]
  mode: 'normal' | 'maximized' | 'fullscreen' | 'collapsed'
}

type LayoutNode =
  | {
      id: LayoutNodeId
      kind: 'split'
      axis: 'horizontal' | 'vertical'
      childIds: LayoutNodeId[]
      sizes: number[]
    }
  | { id: LayoutNodeId; kind: 'window'; windowId: WindowId }

type RailState = {
  pinnedSurfaceIds: SurfaceId[]
  backgroundSurfaceIds: SurfaceId[]
  visibleSingletonSurfaceIds: SurfaceId[]
  runningSurfaceIds: SurfaceId[]
  recipeIds: RecipeId[]
}
```

## Canonical Representation Decision

V1 has one canonical durable layout representation: the normalized
`surfacesById`, `windowsById`, `nodesById`, and `rootNodeId` model in this
document.

The nested `children: LayoutNode[]` sketch in the research doc is useful for
explaining and rendering a tree, but it is not the source of truth. Selectors may
materialize a nested tree for traversal, rect derivation, debugging, or tests.
Operations and persistence should use stable IDs and normalized maps.

V1 should not have separate top-level `leftDock`, `rightDock`, or `bottomDock`
roots. Classic side and bottom regions are ordinary split nodes created by the
classic recipe and guided by placement metadata. This prevents the product from
having two competing layout foundations: "the tiled workspace" and "special
docks."

The rail remains separate because pinned, running, background, recipe, and
status entries are not tiled layout nodes. Collapsed panes do stay in the split
tree as windows with `mode: 'collapsed'`; they do not move into rail state.
Drag preview/reflow state also remains separate because it is transient
renderer state, not committed workspace structure.

Lanes, stacked groups, floating windows, and far-future spatial windows are not
core V1 `LayoutNode` kinds. For V1, workflow lanes should be represented by
surface renderers or recipe-specific placement policies. If lanes later prove
general enough to become layout primitives, they should be added as an explicit
versioned extension to this normalized model.

Model rules grounded in the references:

- Stable IDs are durable. Paths are transient render addresses only. React
  Mosaic and React Layman both show why path adjustment becomes complex after
  remove, collapse, and move operations.
- Split nodes are n-ary. React Mosaic normalizes away same-direction split
  chains; i3 repairs percentages after every structural move.
- A window remains a window even when it contains one surface. Zed and VS Code
  both depend on group identity for focus, close fallback, restore, and command
  routing.
- A surface is not a tab, panel, sheet, dock, lane, or floating window. Those
  are presentations. T3Code's diff example and Zed's `Item`/`Panel` split both
  require this separation.
- Collapse/minimize is presentation state. It turns a visible window into a
  fixed accordion header in place and does not decide whether the surface keeps
  running, unmounts UI, suspends, or disposes resources.
- Close removes the represented surface/window from visible layout. Registry
  close policy independently decides whether state or sessions are disposed,
  kept in the background, suspended, or protected by confirmation.
- Running surfaces may stay mounted while collapsed, hidden, or backgrounded.
  T3Code keeps thread terminal drawers mounted, Athas keeps bottom terminal
  sessions alive, and Zellij serializes command panes and scrollback. The
  registry owns that runtime policy; layout operations do not infer it from
  collapse or close.
- Placeholder surfaces are allowed during restore. i3 layout placeholders and
  Zellij exact/logical-position matching are the reference behavior.

V1 should implement only the normalized surface/window/node/rail model.
Floating, stacked, lane, spatial, and dock-like projections can be represented
as optional adapters or surface internals later, but they should not expand the
V1 operation library unless a prototype proves they are required.

## State Direction

Use Zustand, but keep the store normalized and selector-driven.

Rendering rule:

> What happens on screen should match what happens in React. Moving one window
> should not rerender every surface.

Expected subscription boundaries:

- Workspace shell subscribes to root IDs and global mode only.
- Layout renderer subscribes to the layout node IDs it renders.
- Window frame subscribes to its own window, rect, active state, and tab IDs.
- Tab strip subscribes to that window's surface IDs and active surface ID.
- Surface host subscribes only to its surface record.
- Heavy surface content owns or subscribes to its own feature state.

Drag preview should be modeled separately from committed layout. Pointer moves
should update preview geometry in animation-frame-sized batches. Releasing the
pointer commits the previewed transform; cancelling restores committed layout.

Reference examples:

- React Mosaic fires `onChange` during interaction and `onRelease` when the user
  commits. Platform should use the same distinction for persistence and
  analytics.
- GitButler's `Resizer` persists preferred sizes only after intentional resize,
  not on every responsive layout pass.
- T3Code's sidebar rejects widths that would leave the main content invalid.
  Platform resize reducers need content-aware constraints, not only numeric min
  and max.
- Zellij separates durable layout templates from runtime pane geometry. Platform
  should keep durable layout pure and derive rects, solver results, snap
  destinations, and drag previews in renderer state.

## Renderer and Interaction Direction

Build a custom renderer first unless a Dockview-backed spike can prove that the
adapter boundary stays strict. The renderer should be heavily inspired by:

- React Mosaic for n-ary split rendering, tab reordering, resize throttling,
  and normalization after transforms.
- Platform's existing Chrome-style tab components for tab shape, active/inactive
  treatment, close affordances, title behavior, overflow feel, and tab-strip
  polish.
- Chromium's tab strip source for the specific in-strip slide/reorder behavior,
  vertical detach threshold, and drag-down progress animation before replacing
  the current editor-tab drag TODO.
- React Layman for the simple center/edge structural grammar and small
  reducer-style operation examples.
- i3 for center, sibling edge, and parent-edge structural behavior.
- GitButler for lane reordering, panning, folded lane states, and overlay sash
  layers that avoid overflow clipping.
- Zellij for stacked panes and floating panes as future modes, especially the
  distinction between one flexible pane and collapsed one-line panes.
- Athas for explicit pane move actions, pane container rendering, bottom root
  behavior, and MRU-driven focus fallback.

Do not make Dockview the source of truth. If Dockview is used later, it should
receive already-decided window, surface, and placement state from Platform and
return only renderer events such as resize, focus, and snap/reposition.

Required renderer behaviors:

- Render split children from derived rects, not stored DOM state.
- Render resize handles in an overlay layer. Drag previews should be shown by
  reflowing the actual window/tab geometry, not by drawing visible drop zones.
- Use live drag previews that show the layout that will be committed.
- Keep heavy surface content mounted or unmounted according to registry
  lifecycle, not according to incidental visibility.
- Support window drag and individual surface/tab drag.
- Enforce one sticky snapped drag grammar for all draggable layout objects.
  Whole windows, tab-stack/window groups, detached tabs, and surface moves
  should always preview a concrete grid, merge, edge, recipe-slot, or background
  destination. A pointer drag must not create a free-floating or popout state.
  The dragged object must not visually pop out of the layout; the surrounding
  tiles reflow and the screen shows the exact release result.
- Never render visible drop zones, target-zone overlays, placeholder drop slots,
  or any drag affordance that is separate from the snapped layout preview.
- The same no-target-chrome rule applies to non-layout app D&D such as file-tree
  moves. Those flows can keep private target resolution but must not expose
  separate drop-zone or drop-target presentation.
- Use the existing Chrome-style tab presentation as the default tab-strip
  treatment for window surface stacks. A surface is still not a tab; this is the
  visual and interaction presentation for stacked surfaces.
- Start individual surface/tab drag as a Chrome-like in-strip reorder. While the
  pointer stays within the detach threshold, keep the dragged tab in the strip
  and animate sibling tabs aside to show the release index. Do not show a
  floating drag image or pulled-out pane in this state.
- When the pointer crosses the vertical detach threshold, convert the gesture
  into a snapped workspace drag. The dragged surface becomes a new snapped
  window in preview unless it is merging back into a tab stack, and it should
  preview a concrete destination as a grid position, merge target, edge split,
  parent/root edge split, recipe slot, or background target. It should not hover
  unsnapped between destinations.
- Resolve center, edge, parent-edge, root-edge, recipe-slot, and background as
  internal snap destinations. They are not user-visible drop zones. Future
  floating windows are a separate command/policy mode, not a drag destination.
- Keep resize math constraint-aware. Adjacent percentage resizing is V1; a
  Zellij-style solver pass is a future escape hatch for fixed/stacked layouts.

## Keyboard Control Direction

Keyboard control should use a Hyprland/Wayland-inspired command grammar, with
i3 as the structural reference. The exact default key chords can be configured
in the keymap layer, but the layout system must expose first-class commands for:

- Directional focus: focus left, right, up, and down.
- Parent/child focus: focus enclosing split, active child, active window, and
  active surface.
- Surface movement: move active surface left, right, up, down, to parent edge,
  to root edge, into another window as a tab, or into background state.
- Window movement: move active window by direction or structural destination.
- Splitting: split active window left, right, up, or down.
- Tab control: next/previous surface in window, reorder surface, tear surface
  into a new window, and merge into the target window.
- Resize mode: keyboard-resize the active split by direction and step amount,
  with constraint-aware clamping.
- State commands: maximize/restore, collapse/expand window, close surface, close
  window, promote preview, and pin/unpin where supported.
- Recipe/workspace commands: apply recipe, reset recipe shape, focus rail, and
  restore previous layout state.

Do not bake browser-hostile or OS-reserved shortcuts into the layout core. The
core exposes commands; the keymap layer chooses bindings and can provide
Hyprland-like defaults where the platform allows them. Existing VS Code-style
command IDs and aliases should retarget to these surface operations for muscle
memory.

Current app integration should use the existing keymap architecture:

- Add layout commands to `WorkspaceCommandId` in
  `apps/web/src/keymap/types.ts`.
- Add command metadata and aliases in `apps/web/src/keymap/command-registry.ts`
  so the command palette and shortcut labels work.
- Add browser-safe default bindings in
  `apps/web/src/keymap/default-bindings.ts`. Hyprland-like bindings should be
  defaults/presets, not assumptions in layout code.
- Dispatch through `usePlatformCommandDispatch` in
  `apps/web/src/keymap/commands.ts`, then call surface/layout operations.
- Keep app-level registration in `useAppKeymap`; do not add renderer-local
  global keyboard listeners.
- Use the current pane-scoped model for V1, and leave richer Zed-style context
  predicates to the existing keymap roadmap.

## Command Palette And Layout Command Direction

Raycast Window Management should be treated as the reference for command-driven
layout control. Platform's command palette should expose window management as a
searchable command family, not only as hidden keybindings. The launcher row
needs enough metadata for power use: icon, title, category, alias match,
shortcut, enabled/disabled state, and a short description when useful.

Command UX rules:

- Searching "left", "right", "maximize", "third", "terminal bottom",
  "layout", or a saved layout name should return relevant layout commands.
- Built-in commands and user-authored commands should appear in the same
  command palette groups, with type metadata available for settings.
- Disabled states should come from active surface/window capabilities and
  workspace availability, not selected file path alone.
- Repeated commands may use cycling rules. Cycling state should key off command
  ID, active window/surface, display/workspace, and a short timeout so unrelated
  invocations do not surprise the user.
- Hotkey assignment and presets belong in the keymap/command management layer.
  Layout operations must stay shortcut-agnostic.
- Command definitions execute pure layout operations, recipes, and placement
  policies. They do not own a second layout tree.

Draft command catalog model:

```ts
type WindowManagementCommand = BuiltInWindowManagementCommand | CustomWindowManagementCommand

type BuiltInWindowManagementCommand = {
  id: WindowManagementCommandId
  kind: 'built-in'
  title: string
  category: 'Window Management'
  icon: CommandIcon
  aliases: string[]
  operationFactory: WindowCommandOperationFactory
  cycleRule?: CommandCycleRule
  capabilityPredicate: CommandCapabilityPredicate
}

type CustomWindowManagementCommand = {
  id: WindowManagementCommandId
  kind: 'custom-window'
  title: string
  category: 'Window Management'
  icon: CommandIcon
  aliases: string[]
  enabled: boolean
  targetFrame: CustomWindowFrame
  cycleRule?: CommandCycleRule
}

type CustomWindowFrame = {
  unit: 'percent' | 'points'
  width: number
  height: number
  anchor:
    | 'top-left'
    | 'top'
    | 'top-right'
    | 'left'
    | 'center'
    | 'right'
    | 'bottom-left'
    | 'bottom'
    | 'bottom-right'
  offsetX: number
  offsetY: number
}

type WorkspaceLayoutCommand = {
  id: LayoutCommandId
  title: string
  icon: CommandIcon
  aliases: string[]
  enabled: boolean
  slots: LayoutCommandSurfaceSlot[]
  hotkeyId?: HotkeyBindingId
}

type LayoutCommandSurfaceSlot = {
  id: string
  surfaceType: SurfaceType
  resourceKey?: string
  stateKey?: string
  payload?: { kind: 'url' | 'file' | 'quicklink'; value: string }
  displayHint?: DisplayPlacementHint
  frame: CustomWindowFrame
}

type CommandCycleRule = {
  scope: 'window' | 'surface' | 'workspace'
  steps: CustomWindowFrame[]
  resetMs: number
  wrapDisplays?: boolean
}

type WindowManagementHotkeyPreset = {
  id: HotkeyPresetId
  title: string
  source: 'platform' | 'rectangle' | 'magnet' | 'spectacle' | 'vscode' | 'hyprland-i3'
  bindings: Record<WindowManagementCommandId | LayoutCommandId, string>
}
```

The built-in catalog should cover the command names users expect from Raycast
and desktop window managers:

- Size/state: fullscreen, maximize, almost maximize, maximize height, maximize
  width, restore, reasonable size, and center.
- Fractions: left/right/top/bottom halves, thirds, two-thirds, fourths,
  quarters, sixths, and common center fractions.
- Movement: move left/right/up/down, move to parent edge, move to root edge,
  move to background, and move to next/previous display when display support
  exists.
- Focus: focus left/right/up/down, focus parent, focus child, focus rail, and
  restore previous surface/window.
- Recipes/layouts: apply recipe, reset recipe, create window command, create
  layout command, and run saved layout command.

Settings direction:

- Reuse the existing command metadata source where possible, but add a command
  management surface for layout commands with Name, Type, Alias, Hotkey, and
  Enabled-style fields.
- Provide a detail/config panel for the Window Management command family:
  default gap, cycling mode, wrap displays, OS compatibility toggles where
  applicable, and hotkey presets.
- The custom command editor should support size, pinned position, offsets,
  percent/point units, alias, enabled state, icon, and hotkey.
- The layout command editor should support adding surfaces, assigning frames,
  ordering/focusing slots, optional URL/file/quicklink payloads, and hotkey
  binding. Multi-display hints can be stored before full multi-monitor
  execution ships.

Current app integration expands beyond the keymap files:

- `apps/web/src/components/command-palette.tsx` and
  `apps/web/src/components/command-palette/*` need mode/group support for
  window management commands and saved layout commands.
- `apps/web/src/components/app-command-surface.tsx` remains the global command
  overlay owner, but disabled states and dispatch should consult layout
  selectors and command capabilities.
- `apps/web/src/keymap/command-registry.ts` remains the command metadata entry
  point, but it needs command-family/type metadata for settings and command
  palette grouping.
- `apps/web/src/keymap/default-bindings.ts` should provide browser-safe default
  bindings plus optional preset bindings. Presets are data applied by settings,
  not baked into layout operations.

## Surface Registry Draft

| Surface        |          Cardinality | Lifecycle          | Default Placement            | Rail/status | Notes                                                                  |
| -------------- | -------------------: | ------------------ | ---------------------------- | ----------- | ---------------------------------------------------------------------- |
| File Editor    |                multi | durable or preview | active window tab            | visible/bg  | edit or pin promotes preview                                           |
| Diff           |                multi | durable or preview | like file tab                | visible/bg  | no special default side zone                                           |
| Search Results |            singleton | durable            | left nested tool pane        | yes         | restore query, filters, selection, results; may unmount when collapsed |
| Search Preview | singleton/contextual | transient          | near search or active window | no          | owned by search context; replaced by selection                         |
| Terminal       |                multi | running            | recipe decides               | yes         | runtime policy decides keep-mounted/dispose behavior                   |
| File Navigator |            singleton | durable            | left nested tool pane        | yes         | restore expanded tree and selection                                    |
| Git Changes    |            singleton | durable            | left nested tool pane        | yes         | restore selection, filters, staged state                               |
| Diagnostics    |            singleton | durable            | recipe decides               | yes         | links to editor/preview                                                |
| Test Output    |   singleton or multi | running/durable    | bottom/adjacent              | yes         | close and runtime rules are policy-driven                              |
| Agent Surfaces |               future | mixed              | agent recipe                 | yes         | needs separate product plan                                            |

Registry behavior examples:

- File editor and diff should follow Zed and VS Code item semantics: dirty
  state, close rules, preview promotion, pinning, split/move commands, and MRU
  fallback.
- File navigator, search, git changes, diagnostics, terminal, and agent should
  follow a panel-like contract where valid placements and lifecycle are
  explicit, as in Zed panels and VS Code view containers.
- Terminal can contain nested layout later. Zed's terminal panel has an
  internal pane group, Athas models terminals as typed panes, and Zellij treats
  command panes as first-class session members.
- Search results should be a durable singleton, while search preview is
  transient. T3Code's diff visibility and GitButler's preview diff demonstrate
  contextual preview without losing the underlying surface identity.
- Search Results durability is state durability, not render durability. Query,
  filters, selected result, result list metadata, scroll position, and preview
  relationship should live in search surface state. The expensive search UI and
  virtualized result rendering may unmount when collapsed, hidden, or
  backgrounded unless the registry explicitly requires it to stay mounted.
- Search Preview must have an owner/context, such as `ownerSurfaceId` pointing
  to Search Results and `ownerContextKey` pointing to the selected result key.
  Selection changes replace the preview in place. Closing or resetting the
  owning Search Results surface should close the preview unless it has been
  promoted to a durable file/diff surface. Normalization should reject orphaned
  transient previews.
- Git changes and review surfaces should allow lane-like workflow recipes
  implemented by the surface renderer or placement policy. GitButler's stack
  lanes are the strongest local product example, not a required V1 node kind.
- Diagnostics and references should link to transient previews first, then
  promote to durable editors when the user opens, edits, pins, or tabs them.

The registry owns capability checks such as `canClose`, `canSplit`,
`canCollapse`, `canFloat`, `supportsPreview`, `canUnmountWhenNotExpanded`,
`closeRuntimePolicy`, `validPlacements`, `defaultRecipeSlot`, `restore`, and
`serialize`. `canUnmountWhenNotExpanded` should be false for running surfaces
that must keep an interactive renderer mounted. It can be true for durable
stateful surfaces such as Search Results when preserving state is enough and
keeping the heavy UI mounted would create unnecessary work. `closeRuntimePolicy`
must be independent from collapse policy.

## Recipe Draft

A recipe is placement behavior plus a reset shape, not just a saved layout.

The canonical default recipe spec is `default-recipe.md`. It defines the
checked-in sketch, editable Excalidraw source, vocabulary, and V1 behavior.
The default recipe must be implemented with ordinary surfaces, windows, split
nodes, rail state, and recipe policy. It must not introduce a `sidebar`, dock,
lane, or compatibility model.

Examples:

- Classic/default: the rail is a command surface; Files, Search, Git, Chat, and
  Logs prefer left nested tool panes; file editors, diffs, and promoted previews
  prefer the main view; Terminal and Problems prefer the bottom of the
  editor/main panel. The nested tool-pane shape is ordinary split tree
  structure, not a sidebar model. Terminal is special only as default recipe
  policy: default terminal commands target the editor/main panel bottom, while
  user drag/repositioning or explicit move commands create sticky manual
  placement in any ordinary split. This preserves VS Code and Zed muscle memory
  while still using Platform surfaces internally.
- Recipe-managed left tool panes are derived from the ordered visible set, not
  from incremental append history. Opening, closing, collapsing, or expanding
  Files/Search/Git/Chat/Logs should repack the recipe-managed subset in stable
  recipe order; manual sticky placement opts a surface out of this automatic
  packing while the target remains valid.
- Search: search results open as a durable singleton in the left nested
  tool-pane group, selection opens a transient preview adjacent to the search or
  active editor, and Enter promotes the preview. This borrows from T3Code
  responsive diff presentation and VS Code search preview behavior without
  making search a fixed sidebar.
- Review: Git Changes is visible, diffs open like file tabs by default, and
  branch/PR stacks can use lane-like workflow surfaces when the workflow needs
  sequence. GitButler's unassigned changes, preview diff, stack lanes, folding,
  and panning are the grounding example.
- Agent pairing: editor or diff is the main surface, agent chat/plan/logs are
  recipe-placed tool panes, terminal/test output attaches to the task context,
  and artifacts/patches open as transient previews. Zellij plugin panes and
  Athas agent panes ground the surface model; Hyprland grounds the placement
  policy.
- Dense execution: terminals, task logs, and agent output can become a stacked
  group later. Zellij's stacked panes are the reference: one flexible active
  pane plus collapsed one-line panes.
- Focus: active surface dominates, other durable surfaces collapse in place or
  move to background according to policy, and restore returns to the prior
  recipe state. VS Code zen mode and Zed zoomed panels are compatibility
  references.

For V1, assume one active recipe per workspace.

Recipe policy examples:

- `classicPolicy`: open editor-like surfaces in the main view; place terminal
  and Problems at the bottom of the editor/main panel; route Files, Search, Git,
  Chat, and Logs into order-packed left nested tool panes; restore singleton
  tools through default recipe placement when their last concrete window
  placement is stale; if Terminal is opened first, allow it to temporarily fill
  available space, then reshape it into the editor/main panel bottom when the
  first normal content/tool surface opens unless sticky manual placement exists.
- `previewAdjacentPolicy`: put transient previews near the selected list,
  search result, diagnostic, git file, or agent artifact.
- `fullscreenOwnerPolicy`: when a command opens a related surface from a
  maximized/fullscreen owner or active window, tab it into that same window by
  default so it cannot open behind the fullscreen context. Explicit user
  placement commands may override this.
- `laneWorkflowPolicy`: route git, review, or agent work items into a
  lane-capable workflow surface or adjacent split, and keep contextual preview
  near that workflow context.
- `masterDetailPolicy`: keep active editor/diff as master and place related
  tools as detail surfaces.
- `focusPolicy`: maximize active window and collapse secondary windows in place
  or move surfaces to background according to explicit policy.

Hyprland's workspace algorithm matcher is the reference for selecting policies
per workspace or recipe. Zellij swap layouts are the reference for choosing a
layout shape based on surface count and role.

## Layout Operation API

Structural operations should be pure TypeScript functions with no React or DOM
dependencies:

```ts
type LayoutOperation =
  | { type: 'openSurface'; surface: Surface; policyId?: LayoutPolicyId }
  | { type: 'closeSurface'; surfaceId: SurfaceId }
  | { type: 'collapseWindow'; windowId: WindowId }
  | { type: 'expandWindow'; windowId: WindowId }
  | { type: 'restoreSurface'; surfaceId: SurfaceId; placement?: SurfacePlacementHint }
  | {
      type: 'splitWindow'
      windowId: WindowId
      edge: LayoutEdge
      surfaceId?: SurfaceId
      sourceWindowId?: WindowId
    }
  | { type: 'moveSurface'; surfaceId: SurfaceId; destination: SnapDestination }
  | { type: 'moveWindow'; windowId: WindowId; destination: SnapDestination }
  | { type: 'tabSurface'; surfaceId: SurfaceId; targetWindowId: WindowId; index?: number }
  | { type: 'reorderSurface'; windowId: WindowId; fromIndex: number; toIndex: number }
  | { type: 'resizeSplit'; splitId: LayoutNodeId; handleIndex: number; deltaPx: number }
  | { type: 'maximizeWindow'; windowId: WindowId }
  | { type: 'restoreWindow'; windowId: WindowId }
  | { type: 'applyRecipe'; recipeId: RecipeId }
  | {
      type: 'applyCustomWindowCommand'
      command: CustomWindowManagementCommand
      targetWindowId?: WindowId
    }
  | { type: 'applyLayoutCommand'; command: WorkspaceLayoutCommand }
```

Internal snap destinations should be explicit. They are hit-tested privately by
the renderer and must never be rendered as visible drop zones:

```ts
type SnapDestination =
  | { kind: 'window-center'; windowId: WindowId; tabIndex?: number }
  | { kind: 'window-edge'; windowId: WindowId; edge: LayoutEdge }
  | { kind: 'parent-edge'; nodeId: LayoutNodeId; edge: LayoutEdge }
  | { kind: 'root-edge'; edge: LayoutEdge }
  | { kind: 'recipe-slot'; slot: RecipeSlotId }
  | { kind: 'background' }
```

Reference grounding:

- React Mosaic's `createDragToUpdates` covers tab-container moves, tab reorder,
  split moves, path adjustment, and fallbacks when the destination disappears.
- React Layman's `moveWindow`, `addWindow`, and `removeWindow` are the compact
  version of the same tree edits.
- i3 adds parent-edge movement and focus-parent semantics, which are important
  for deliberate structural editing.
- Athas adds bottom-root behavior and explicit pane move actions.
- Raycast adds command-catalog execution, custom window frames, cycling, and
  saved layout commands. These should resolve to ordinary layout operations and
  recipe policy calls before commit.

Every operation must normalize before commit:

- Remove empty windows and invalid tabs.
- Collapse empty split nodes.
- Preserve collapsed windows as valid split children with fixed header geometry.
- Flatten same-axis split nodes.
- Repair size arrays and normalize percentages.
- Clamp active surface/window IDs.
- Preserve stable IDs where possible.
- Route orphaned durable or running surfaces to background state or a fallback
  window according to registry policy.

## Persistence and Restore

Persist product state, not renderer state:

- layout version and surface registry version;
- surface type, lifecycle, resource key, state key, and restorable state;
- window membership, active surface, preview/pin state, and MRU;
- split tree, sizes, collapsed window mode, active recipe, and sticky manual
  placements;
- rail state for pinned, running, background, recipe, and singleton surfaces.

Do not persist:

- React component state;
- live DOM rects;
- drag preview state;
- path addresses as durable identity;
- transient preview surfaces unless the registry explicitly says they are
  restorable.
- mounted/unmounted UI state for durable surfaces such as Search Results.

Restore matching order:

1. Match by stable resource key and surface type.
2. Match by state key or session key when the resource is not file-based.
3. Match by previous surface ID only if it is still valid in the current
   workspace.
4. Match by logical window or recipe slot.
5. Route unmatched durable or running surfaces to background state or the
   default stack according to registry policy.
6. Drop invalid transient surfaces.
7. Drop transient previews whose owner/context no longer exists, unless the
   preview has been promoted to a durable surface.

Reference grounding:

- Dockview's `fromJSON` can reuse existing panels and recover from invalid
  layouts, which is the right failure posture.
- VS Code's layout service and mementos show that restore timing and state
  scopes must be deliberate.
- Athas persists paths/session types and hydrates them back to current buffers,
  avoiding volatile buffer IDs.
- i3 placeholders "swallow" matching windows after restore. Platform should use
  placeholder surfaces for files, terminals, agent runs, or remote resources
  that are not ready yet.
- Zellij applies layouts by exact run match, logical-position match, then best
  effort. That maps well to Platform surface restore.

## Implementation Modules

- `surface-registry.ts`: surface type registration, capabilities, placement
  defaults, lifecycle, close behavior, restore handlers, renderers, and icons.
- `layout-types.ts`: durable state types, operation types, geometry types, and
  serialized version schemas.
- `layout-operations.ts`: pure operation reducer for open, split, move, tab,
  reorder, close, collapse, expand, restore, resize, maximize, and recipe
  application.
- `layout-normalize.ts`: empty-node cleanup, same-axis flattening, size repair,
  active ID repair, duplicate-surface prevention, orphan routing, and invariant
  checks.
- `layout-selectors.ts`: ID-to-path resolution, rect derivation, focus
  neighbors, MRU fallback, snap-destination calculation, and
  capability-filtered command targets.
- `layout-persistence.ts`: serialization, migration, corrupt-state recovery,
  placeholder surfaces, and restore matching.
- `layout-policies.ts`: classic, preview-adjacent, lane workflow, master/detail,
  active-context, root-edge, and focus policies.
- `WorkbenchSurfaceHost.tsx`: renders one surface by registry entry and applies
  mount/unmount rules.
- `WorkbenchWindowFrame.tsx`: frame, Chrome-style tab strip, active state,
  resize affordance, close/collapse/maximize controls, accordion-header
  rendering, and drag handles.
- `WorkbenchLayoutRenderer.tsx`: recursive split/window rendering and overlay
  coordination.

React components dispatch commands and subscribe to slices. They should not
own durable layout logic.

## Current Platform App Cleanup Plan

The current app already has useful pieces, but its state ownership is split
across a classic workspace shell, an editor pane tree, fixed sidebar tabs, a
terminal overlay store, and a Dockview renderer adapter. The tiling surface
manager should migrate the reusable content and delete the old layout ownership
after the new store is active.

Current app facts:

- `apps/web/src/components/workspace/workspace-view.tsx` renders the production
  shell: activity bar, persisted horizontal resizable group, fixed sidebar,
  center `WorkbenchDockview`, floating terminal overlay, and search runtime.
- `apps/web/src/features/editor/state/editor-workspace-state.tsx` currently
  owns `editorPaneLayout`, `openFilePaths`, `selectedFilePath`,
  `sidebarVisible`, `workspacePanelTab`, and `gitPanelOpen`.
- `apps/web/src/features/editor/state/editor-pane-state.ts` is the old editor
  layout model: split/leaf nodes, tab IDs, path-backed tabs, max split depth,
  center/edge snap operations, resize sizes, normalization, and active pane.
- `apps/web/src/features/workbench/workbench-dockview.tsx` renders Dockview,
  but `apps/web/src/features/workbench/workbench-dockview-model.ts` derives
  Dockview panels from the old `EditorPaneLayout`. Dockview is currently a
  renderer over old editor pane state, not the durable workbench model.
- `apps/web/src/features/workbench/workbench-registry.ts` has useful early
  registry ideas for file, diff, terminal, and search panels, including close
  policy and restore functions. Today, the production Dockview panel renderer
  only handles file and diff panels.
- `apps/web/src/components/workspace/workspace-sidebar.tsx` hard-codes files,
  search, git, logs, and chat as mutually exclusive sidebar tabs.
- `apps/web/src/components/workspace/workspace-floating-terminal.tsx` and
  `apps/web/src/components/workspace/workspace-terminal-store.ts` own terminal
  tabs, collapse state, overlay height, and active terminal selection outside
  the workbench model.
- `apps/web/src/components/workspace/workspace-search-runtime.tsx` starts the
  search runtime when the sidebar search tab is visible or when a search buffer
  document is selected as an editor tab.
- `apps/web/src/lib/workspace-cache.ts` persists the old cache shape:
  editor pane layout, open paths, selected path, sidebar state, git panel open,
  active sidebar tab, diff mode, and search buffer state.
- `apps/web/src/keymap/commands.ts` routes workspace commands to old editor
  pane actions and fixed sidebar actions.
- `apps/web/src/components/command-palette.tsx` and
  `apps/web/src/components/command-palette/*` render quick access modes,
  command groups, file/symbol/editor/view groups, row metadata, filtering, and
  disabled states that currently depend heavily on workspace presence and the
  selected file path.
- `apps/web/src/components/app-command-surface.tsx` owns the global command
  palette open/search state and wires `usePlatformCommandDispatch` into the
  command surface.
- `apps/web/src/keymap/command-registry.ts`,
  `apps/web/src/keymap/default-bindings.ts`, and
  `apps/web/src/keymap/active-bindings.ts` are the current command metadata,
  default binding, and active binding sources that layout commands should
  extend instead of bypassing.
- `apps/web/src/features/workbench-spike` is a phase-0 Dockview spike with its
  own storage key and metrics. It is useful as research, but should not remain
  as production architecture.

Keep and rehost:

- Keep editor document state, dirty-file handling, editor rendering, LSP, and
  file sync. Rehost editor instances as file editor surfaces.
- Keep `GitDiffViewer`, diff document parsing, and blob diff cache seeding.
  Rehost diffs as diff surfaces instead of path-like editor tabs.
- Keep search buffer state and search result rendering. Rehost search results
  as a durable singleton surface and search previews as transient surfaces.
- Keep git status, staging, discard, branch, and commit components. Rehost Git
  Changes as a singleton surface or review recipe slot.
- Keep terminal transport, terminal theme sync, and server session semantics.
  Rehost each terminal tab/session as a running surface.
- Keep file tree loading, prefetch, and tree rendering. Rehost File Navigator
  as a singleton surface.
- Keep command palette registration and VS Code command aliases. Retarget them
  to surface operations.

Cleanup after the surface manager lands:

1. Replace `EditorWorkspaceStore` layout fields with `WorkspaceLayout`.

   `editorPaneLayout`, `openFilePaths`, `selectedFilePath`, `sidebarVisible`,
   `workspacePanelTab`, and `gitPanelOpen` should stop being layout truth. The
   new store should expose `activeSurfaceId`, `activeWindowId`, MRU state,
   rail state, recipe state, and surface/window/node records. File selection
   should become "open or focus file editor surface" instead of "select path in
   active editor pane."

2. Retire the old editor pane tree as product state.

   `editor-pane-state.ts` can inform the first layout operation tests, but it
   should not survive as a parallel layout model. Delete obsolete pane-drop,
   tab-reorder, max-depth, active-pane, and path-tab tests once equivalent
   surface/window/node tests exist.

3. Remove the Dockview sync layer or turn it into a strict renderer adapter.

   If V1 uses the custom renderer, delete `WorkbenchDockview`,
   `workbench-dockview-model.ts`, Dockview tab model glue, and Dockview CSS.
   If a short Dockview adapter remains, it must consume `WorkspaceLayout`
   surfaces/windows directly and must not derive panels from `EditorPaneLayout`.
   Either way, the pane-to-panel sync code should go away.

4. Rehost fixed sidebar tabs as recipe-placed singleton tool surfaces.

   Files, Search, Git, Logs, and Chat should register as surfaces with
   placement and collapse rules. `WorkspaceSidebar`, `WorkspaceSidebarResizablePanel`,
   `WorkspaceActivityBar`, and `workspacePanelTab` utilities should be deleted
   or reduced to rail presentation after their content components are rehosted.

5. Move search runtime ownership to the Search Results surface.

   Search runtime should be enabled by search surface lifecycle, not by
   `sidebarVisible`, `workspacePanelTab`, or a selected fake search-buffer
   editor document. Opening a search result should create a transient preview
   or durable editor surface through `openSurface`, not `selectFile`.
   Collapsed, hidden, or background Search Results should preserve state without
   requiring the heavy search UI to remain mounted. Search Preview should be
   owned by the search context and replaced or cleaned up on selection/search
   reset instead of accumulating orphan transient surfaces.

6. Move git diff opening to surface commands.

   `useOpenDiffDocument` should open a diff surface with a stable resource key
   and seeded diff query data. Diff document IDs can remain as state keys, but
   they should no longer pretend to be file paths inside editor tab state.

7. Promote terminal overlay tabs into running surfaces.

   The terminal store, floating terminal overlay, terminal tab strip, and
   terminal height persistence should be replaced by surface lifecycle,
   placement, and collapse policy. Collapsing a terminal window shows an
   accordion header in place. Closing a terminal removes it from visible layout;
   registry close policy independently decides whether the server session is
   disposed, suspended, or kept as a background running surface. Running
   surfaces should stay mounted while collapsed/hidden only when registry
   render policy requires it.

8. Replace workspace cache with versioned surface layout persistence.

   Add a new layout cache version that stores surface registry version,
   resource keys, windows, split nodes, rail state, MRU, recipe, and singleton
   surface state. Because the repo policy says no backward compatibility shims,
   old cache migration should be a one-time explicit conversion if needed; after
   the conversion lands, delete old cache schema branches and tests that
   preserve obsolete behavior.

9. Retarget keymap and command handlers.

   Commands such as split editor, close active editor, reopen closed editor,
   toggle sidebar, toggle panel, focus file tree, focus Git, and previous editor
   should dispatch layout operations against active surfaces/windows/rail
   items. The command IDs and aliases can remain for muscle memory, but the
   implementation should stop mutating fixed sidebar and editor pane state.

   The command palette should also grow a Raycast-style Window Management
   command family. Built-in layout commands, custom single-window commands, and
   saved layout commands should use the same `CommandSpec`/keymap machinery
   where possible, add type/category metadata for settings, and derive disabled
   state from surface/window capabilities instead of selected path alone.

10. Delete the Dockview spike after extracting learnings.

    `apps/web/src/features/workbench-spike` should be removed once its useful
    findings are represented in tests or the new implementation. Also remove
    the spike storage key and any spike-only CSS, metrics, fixture sessions, and
    route/entry wiring.

11. Remove unused dependencies and CSS.

    If the custom renderer replaces Dockview, remove `dockview-react` and
    Dockview CSS imports. Delete old workspace chrome styles for fixed sidebar,
    floating terminal overlay, legacy tab bars, and Dockview tab overrides after
    the new renderer styles own those states.

12. Update tests around behavior, not old structure.

    Keep tests for dirty close, diff restore, search state, terminal disposal,
    command aliases, cache recovery, and focus fallback. Delete tests that only
    assert old editor-pane, sidebar-tab, Dockview-spike, or floating-terminal
    implementation details after new surface-manager tests cover the same user
    behavior.

Cleanup rule:

> Once a surface-manager replacement lands for a behavior, remove the old
> behavior in the same pass. Do not keep old editor pane, sidebar, terminal
> overlay, Dockview spike, or cache aliases as long-term compatibility shims.

## Test Strategy

The risky code is pure layout logic, so test it outside React first:

- React Mosaic cases: tab-container moves, tab reorder, split insert,
  destination path repair after source removal, and normalize after every
  transform.
- React Layman cases: remove last window, merge same-axis splits, redistribute
  percentages, center snap tabbing, and edge snap wrapping.
- i3 cases: parent-edge movement, self/descendant move rejection, percent
  repair, close fallback, focus parent/child, collapse/expand, and background
  restore.
- Athas cases: typed surface restore, bottom-root moves, MRU focus fallback,
  preview/pin state, and resource-key hydration.
- T3Code cases: presentation switch from inline to sheet/drawer while preserving
  surface identity.
- GitButler cases: lane-like surface insertion/folding, contextual preview, and
  sash resize persistence.
- Zellij cases: stacked group sizing, fixed plus percent dimensions, exact
  session match, logical-position match, and best-effort fallback.
- VS Code/Zed compatibility cases: close active, close others, preview
  promotion, pinned protection, split/move commands, restore corrupted layout,
  and command palette coverage.
- Raycast cases: command palette rows for window management commands, aliases
  and shortcut display, capability-based disabled state, hotkey preset
  application, cycling reset behavior, custom window command frame application,
  and saved layout command execution.

Add renderer tests after the pure reducer is stable: snap-destination
resolution, no visible drop-zone rendering, keyboard focus movement, resize
handles, sticky drag preview/reflow rendering, collapsed accordion geometry, and
surface mounting rules for running terminals.

## Automation Rules

- User drag/repositioning wins.
- Manual placement becomes sticky only when it was created by an explicit user
  action and only while the concrete placement target still exists, is visible,
  accepts that surface type, and passes current constraints.
- Singleton surfaces restore their last useful state and last valid placement.
- Recipes provide defaults, not forced moves.
- Invalid sticky memory is cleared or demoted before fallback. Restore must not
  repeatedly retry memory that fails minimum editor width, tool-pane
  width/height, terminal height, viewport, or recipe side-pane limits.
- Default terminal commands prefer the `bottom-tools` recipe slot under the
  editor/main panel, but manual terminal placement wins until the user resets
  the recipe or opens a new default bottom-pane terminal.
- Transient previews can auto-replace.
- Durable surfaces should not jump unexpectedly.
- Live drag rearrangement is allowed because the user is actively controlling
  it.

## Remaining Technical Questions

These are the questions that still need implementation-level answers before or
during the operation-library spike:

- Exact surface capability schema.
- Rect computation and what geometry is cached versus derived.
- Sticky snapped drag preview data model.
- Placeholder serialization and restore matching details.
- Recipe and placement policy API shape.
- How much parent-edge and root-edge snap behavior is V1 versus follow-up.
- Exact command catalog schema and how it extends `CommandSpec` without
  coupling layout internals to command palette rendering.
- Cycling state scope and timeout defaults.
- Whether V1 layout commands launch URL/file/quicklink payloads or only store
  payloads for surface types that can already consume them.
- Settings UI ownership for the command table, hotkey presets, and layout
  command editor.
