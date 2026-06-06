# Editor Layout Manager Research Findings

Date: 2026-06-05

This document captures layout research across the local reference repositories for
the next Platform editor layout manager. The goal is not to clone VS Code, Zed,
or Dockview. The goal is to understand what existing editors and window managers
got right, preserve the muscle memory users expect, and design a layout system
that is more workflow-native, more programmable, and more adaptable to agent,
git, terminal, diff, and search work.

## Source Map

Local references reviewed:

- Dockview: `references/dockview`
- React Layman: `references/react-layman`
- React Mosaic: `references/react-mosaic`
- GitButler: `references/gitbutler`
- T3Code: `references/t3code`
- Athas: `references/athas`
- Hyprland: `references/hyprland`
- i3: `references/i3`
- Zellij: `references/zellij`
- VS Code: `references/vscode` and `/Users/shaul/Desktop/D/Editors/vscode`
- Zed: `/Users/shaul/Desktop/D/Editors/zed`

Relevant existing Platform docs:

- `docs/dockview-workbench-prd.md`
- `docs/t3code-reference.md`
- `docs/tiling-surface-manager/prd.md`

External product UX research supplied for this planning pass:

- Raycast Window Management command palette, settings, hotkey, preset, custom
  command, and layout command flows.

## Decision Amendment - 2026-06-06

After implementation planning, Platform changed the V1 minimize model:

- Collapse/minimize is presentation state. It keeps the window in the split tree
  and renders it as a fixed accordion header.
- The rail is command/status UI, not layout storage for collapsed panes.
- Close removes a surface/window from visible layout, but close does not itself
  define runtime behavior.
- Surface registry policy independently decides whether collapsed, hidden,
  background, or closed surfaces keep running, unmount UI, suspend, or dispose
  resources.

Older research notes below may mention the surveyed rail-as-collapsed-storage
pattern. The product plan should follow this amendment and the canonical
PRD/technical design.

## Executive Readout

The strongest direction is a product-owned tiling surface manager: close to
"Hyprland in the browser", but designed for code work and easy mouse use. Every
meaningful artifact should be a surface: editor, diff, terminal, search,
diagnostics, git changes, agent plan, logs, review, preview, inspector. A tab,
window, rail item, dock panel, sheet, or floating layer is only a presentation
of that surface.

The important product move is to treat sidebars as a taskbar/rail for surfaces,
not as a fixed set of panels. Search, diff, file tree, terminals, agents, and
git views should be able to open together, split, tab, collapse, expand, and
participate in auto-tiling. The system should preserve old editor experiences
for adoption, but the default mental model should be "arrange my work surfaces"
rather than "toggle one sidebar and one bottom panel."

The TypeScript references point to a clear implementation direction: keep a
pure layout tree with n-ary splits, explicit tab/window nodes, controlled state,
normalization after every structural operation, and tested tree transforms.
React Mosaic has the strongest TS implementation patterns. React Layman is
smaller and easier to read, but its path-only identity and deep-clone reducer
would not be enough for Platform without a stronger surface registry and stable
window IDs.

The native window-manager references add the missing product grammar. Hyprland
confirms layout policies/algorithms per workspace. i3 confirms that a tree of
containers with split, stacked, tabbed, scratchpad, parent focus, and parent-edge
drop behavior creates powerful structure from simple rules. Zellij confirms that
developer workspaces need panes, tabs, floating surfaces, stacked panes, layout
recipes, session restore, plugin panes, and mouse resizing/moving under one
workspace model.

Raycast adds the missing command-product reference. Its Window Management
experience is keyboard-first: users discover commands through the launcher,
assign hotkeys to the commands they repeat, optionally import familiar presets,
and then mostly stop seeing UI. For Platform, the command palette should not
only list editor commands; it should become the discoverable control surface for
window commands, custom single-window commands, recipes, layout commands, and
hotkey assignment.

The best local editor reference remains Athas because it already has a typed
pane tree, broad content union, MRU focus, bottom root, custom drop zones, and
resource-based persistence. The best product-feel reference remains GitButler:
its layout is workflow-native rather than a clone. The compatibility baseline
from VS Code and Zed is still non-negotiable: editor groups, splits, preview
tabs, pinned tabs, side docks, bottom terminals, keyboard navigation, focus/MRU
behavior, restore-on-reopen, and movable auxiliary views.

## Reference Findings

### Raycast Window Management

Raycast Window Management is the clearest UX reference for command-driven window
control. It is not a Rectangle-style edge-snap overlay. The primary flow is
keyboard-first: open Raycast, search for commands such as Left Half, Right Half,
Almost Maximize, Maximize, Last Third, First Two Thirds, or Toggle Fullscreen,
then execute the selected result. Command rows use the normal launcher
structure: icon, command name, category label, and shortcut display.

What to take:

- The command palette should be the first discovery surface for window
  management. A user should be able to type "left", "right", "maximize",
  "layout", "terminal bottom", or "review layout" and find the right command.
- Common commands should graduate into global hotkeys. The product ladder is
  search command, use command, bind hotkey, then rely on muscle memory.
- Window management commands should be broad enough to cover real geometry:
  fullscreen, maximize, almost maximize, maximize height/width, halves, thirds,
  fourths, quarters, sixths, center, restore, reasonable size, move to next or
  previous display, move between spaces where the host allows it, and focus or
  move by direction.
- Settings should expose a command table with Name, Type, Alias, Hotkey, and
  Enabled-style fields. The detail panel should manage extension-level options
  such as gap, cycling, display wrapping, OS integration compatibility toggles,
  and presets.
- Cycling is valuable for repeated left/right commands. One shortcut can cycle
  through widths such as half, two-thirds, and one-third, and later through
  displays when display support exists.
- Hotkey presets reduce migration cost. Platform should plan presets for
  familiar tools such as Rectangle, Magnet, Spectacle, VS Code-style editor
  splits, and optionally Hyprland/i3-style tiling grammar.
- Custom single-window commands should be creatable from search or settings.
  The command definition needs size, pinned position, offset, unit system
  points/percent, alias, enabled state, and optional hotkey.
- Layout commands should arrange multiple surfaces at once. The builder flow is:
  add surfaces/apps, assign target slots/displays when available, resize or
  choose percentages, optionally choose a URL/file/quicklink payload for
  surfaces that can open one, then save and bind a hotkey.

What not to copy blindly:

- Raycast's model is OS-window management. Platform's model is surface
  management inside a workflow shell. A Platform layout command should arrange
  registered surfaces first, then optionally integrate external URLs/files where
  a surface type supports them.
- Raycast does not replace mouse drag-to-edge snapping with previews. Platform
  still needs its planned mouse drag/drop, live layout preview, edge/center
  drops, background drops, and resize handles because the workbench is an
  interactive tiled surface editor, not only a global hotkey layer.
- Pro-gating is not a design requirement for Platform. The relevant takeaway is
  capability shape, not pricing.

Design implication:

The command palette should be upgraded from "search app/editor commands" to the
front door for workspace layout control. The surface manager needs a command
catalog layer above pure layout operations: built-in command definitions,
custom single-window command definitions, saved layout commands, aliases,
hotkeys, presets, disabled-state predicates, and command history for cycling.
Those definitions should execute layout operations, recipes, and policies rather
than owning layout state themselves.

### Dockview

Dockview provides panels and groups in a resizable grid. The API exposes
programmatic panel/group creation, active panel/group events, layout, focus,
floating groups, edge groups, and full save/restore through serialized layout
state.

Important files and docs:

- `references/dockview/packages/docs/docs/core/overview.mdx`
- `references/dockview/packages/docs/docs/core/state/save.mdx`
- `references/dockview/packages/docs/docs/core/state/load.mdx`
- `references/dockview/packages/docs/docs/core/panels/add.mdx`
- `references/dockview/packages/docs/docs/core/groups/add.mdx`
- `references/dockview/packages/docs/docs/core/groups/edgeGroups.mdx`
- `references/dockview/packages/docs/docs/core/groups/floatingGroups.mdx`
- `references/dockview/packages/dockview-core/src/dockview/dockviewComponent.ts`
- `references/dockview/packages/dockview-core/src/api/component.api.ts`
- `references/dockview/packages/dockview-core/src/dockview/types.ts`

What to take:

- It has mature geometry, group/tab behavior, drag/drop, and layout
  serialization.
- Edge groups are useful for side/bottom tool surfaces that should not behave
  like ordinary editor tabs.
- Floating groups and popouts are useful later, but should not be V1's core
  product model.
- Save/restore should gracefully reset invalid/corrupt layouts to a default.

What not to delegate:

- Product panel identity.
- Panel type registry.
- Dirty/close behavior.
- Terminal session ownership.
- Search/diff/editor lifecycle.
- Command palette semantics.
- Cross-device or cross-workspace migrations.

Design implication:

Dockview can be a renderer or accelerant, but Platform needs its own workbench
model above it. The existing `docs/dockview-workbench-prd.md` already points in
the right direction: Dockview should own geometry, while Platform owns panel
metadata and lifecycle.

### React Layman

React Layman is a compact TypeScript layout manager inspired by Replit,
LeetCode, and React Mosaic. It is valuable because the implementation is small
enough to understand end to end.

Important files:

- `references/react-layman/src/types.ts`
- `references/react-layman/src/Layman.tsx`
- `references/react-layman/src/LaymanReducer.ts`
- `references/react-layman/src/Window.tsx`
- `references/react-layman/src/WindowDropTarget.tsx`
- `references/react-layman/src/WindowToolbar.tsx`
- `references/react-layman/src/WindowTabs.tsx`
- `references/react-layman/src/Separator.tsx`
- `references/react-layman/src/LaymanContext.tsx`
- `references/react-layman/src/TabData.ts`

Product/API shape:

- `LaymanProvider` owns `initialLayout`, renderer registration, window
  mutability, and toolbar controls.
- It supports rows, columns, resize separators, draggable windows, tabbed
  windows, draggable tabs, delete window, auto-arrange, and corner heuristics.
- Drop placement is the familiar five-part grammar: `top`, `bottom`, `left`,
  `right`, and `center`.

Implementation details to take:

- The model is recursively typed as `LaymanLayout = LaymanWindow | LaymanNode |
undefined`.
- `LaymanWindow` holds `tabs`, `selectedIndex`, and optional `viewPercent`.
- `LaymanNode` holds `direction`, `viewPercent`, and `children`.
- `Children<T> = [T, T, ...T[]]` is a useful TS trick: split nodes must have at
  least two children.
- `LaymanPath = number[]` is used as the address for all tree operations.
- The reducer uses `klona` deep clone plus path helpers (`getLayoutAtPath`,
  `setAtPath`) for operations such as add window, remove window, move window,
  move tab, select tab, move separator, auto arrange, and heuristic add.
- `removeWindow` deletes an empty leaf, redistributes the removed percent,
  collapses a single-child parent, and merges same-direction grandparents.
- `addWindow` either inserts into an existing same-direction split and rescales
  siblings, or wraps the target leaf in a new split at 50/50.
- `moveWindow` removes the source, adjusts the destination path after removal,
  then either merges tabs on center drop or adds a split on edge drop.
- Rendering measures the root via `ResizeObserver`, traverses the tree, and
  converts percentages into absolute `Position` values for windows, tabs,
  toolbars, separators, highlights, and the dragged window preview.
- During whole-window drag, it temporarily renders siblings as if the dragged
  window were absent, rescales their percentages, then renders the dragged
  window separately.
- Drag/drop is built on `react-dnd`; drop targets are rendered over each window
  during a global drag, and the highlight is a single absolute overlay.
- Separator resize uses document `mousemove`/`mouseup`, clamps based on
  neighbor geometry, and updates adjacent sibling percentages only.

Implementation concerns:

- Path-only identity is fragile once operations remove/collapse nodes. Platform
  should use stable surface/window IDs and resolve paths only at operation time.
- There is no durable surface registry, typed surface lifecycle, preview/pinned
  state, command routing, versioned persistence, or migration story.
- Reducer-wide deep clone is simple but becomes expensive and hard to reason
  about as surface metadata and lifecycle grows.
- Content-aware min sizes are not part of the model beyond toolbar/separator
  constraints.

Design implication:

React Layman is a good small reference for reducer mechanics and edge/center
drop semantics, but Platform needs a stronger state model: stable IDs,
controlled store integration, typed surfaces, versioned persistence, and a
separate registry for surface lifecycle.

### React Mosaic

React Mosaic is the strongest TypeScript implementation reference. It is a
tiling window manager with controlled/uncontrolled state, n-ary splits, explicit
tabs nodes, drag/drop transforms, normalization, and serialization-friendly data
structures.

Important files:

- `references/react-mosaic/libs/react-mosaic-component/src/lib/types.ts`
- `references/react-mosaic/libs/react-mosaic-component/src/lib/Mosaic.tsx`
- `references/react-mosaic/libs/react-mosaic-component/src/lib/MosaicRoot.tsx`
- `references/react-mosaic/libs/react-mosaic-component/src/lib/Split.tsx`
- `references/react-mosaic/libs/react-mosaic-component/src/lib/MosaicDropTarget.tsx`
- `references/react-mosaic/libs/react-mosaic-component/src/lib/MosaicWindow.tsx`
- `references/react-mosaic/libs/react-mosaic-component/src/lib/MosaicTabs.tsx`
- `references/react-mosaic/libs/react-mosaic-component/src/lib/DraggableTab.tsx`
- `references/react-mosaic/libs/react-mosaic-component/src/lib/RootDropTargets.tsx`
- `references/react-mosaic/libs/react-mosaic-component/src/lib/util/BoundingBox.ts`
- `references/react-mosaic/libs/react-mosaic-component/src/lib/util/mosaicUpdates.ts`
- `references/react-mosaic/libs/react-mosaic-component/src/lib/util/mosaicUtilities.ts`

Product/API shape:

- The public model supports `value` plus `onChange` for controlled use and
  `initialValue` for uncontrolled use.
- `onRelease` fires at the end of a committed interaction, which is important
  for debounced persistence and analytics.
- `CreateNode` can be sync or async, so new surfaces can be created lazily.
- Tab rendering is customizable through title, button, toolbar, and close-state
  renderers.
- `mosaicId` scopes drag/drop so two Mosaic instances do not accidentally
  accept each other's windows.

Implementation details to take:

- New model:
  - `MosaicSplitNode` has `type: "split"`, `direction`, `children`, and
    optional `splitPercentages`.
  - `MosaicTabsNode` has `type: "tabs"`, `tabs`, and `activeTabIndex`.
  - `MosaicNode<T>` is split node, tabs node, or leaf key.
  - `MosaicPath = number[]`.
- Legacy binary tree conversion exists, but the active model is n-ary. That
  avoids long chains of same-direction split nodes.
- `updateTree` applies immutable updates through `immutability-helper` and
  optionally normalizes after every operation.
- `normalizeMosaicTree` removes empty splits/tabs, collapses single-child
  splits, collapses one-tab tab nodes to leaves, flattens same-direction split
  nodes, recalculates `splitPercentages`, and clamps active tab index.
- `createRemoveUpdate` redistributes removed split percentage across remaining
  children and handles tab active-index repair.
- `createDragToUpdates` is the critical transform:
  - `tab-container` drop removes source, adjusts destination path, pushes the
    source into destination tabs, and activates it.
  - `tab-reorder` inserts at the target index and updates active tab.
  - `split` removes source, adjusts destination path, chooses direction from
    edge, inserts into an existing same-direction split if possible, otherwise
    wraps destination in a 50/50 split.
  - It includes fallbacks when the destination disappears after source removal.
- `createHideUpdate` provides reversible hidden state during drag, but this
  mutates layout state and must be treated carefully if persisted.
- `createExpandUpdate` bubbles desired percentages up through ancestors.
- Rendering is percentage-based: `MosaicRoot` recursively converts split nodes
  into `BoundingBox` percentages and renders each leaf as an absolutely
  positioned tile.
- `Split` throttles resize to 30fps, supports mouse/touch, uses document capture
  listeners, clamps by `minimumPaneSizePercentage`, calls `onChange` during drag,
  and calls `onRelease` on mouseup.
- `MosaicWindow` defers hide on drag start because browser DnD requires the
  source element to exist at drag start.
- `MosaicTabs` supports whole-tab-container drag, tab bar drop to add as tab,
  tab index drop targets for reorder, and a content-area blocker so nested
  window drop targets do not steal tab drops.

Implementation concerns:

- The path adjustment logic is necessarily complex because paths are positional.
  Platform should keep path operations pure but identify persistent entities by
  stable IDs.
- `createAddChildUpdate` resets split percentages equally, which may be
  surprising for an editor where existing pane sizes feel intentional.
- Collapsing one-tab tabs nodes to leaves may not match Platform if every
  visible editor-like window should always have a tabstrip/container identity.
- JSON-string matching of tab arrays is not a pattern to copy for product state.

Design implication:

For our TypeScript implementation, React Mosaic is the best starting point:
n-ary split nodes, explicit tabs/window nodes, pure update transforms,
normalization, controlled value support, drag grammar, and resize release events.
Platform should improve it with stable IDs, a surface registry, stronger
capability checks, content-aware minimums, and app-owned persistence.

### GitButler

GitButler is the strongest example of a fresh layout because it is not generic.
Its workspace is shaped around branch-stack work: unassigned changes on the
left, optional preview diff, horizontal stack lanes, folding, panning, and
workflow-specific drop zones.

Important files:

- `references/gitbutler/apps/desktop/src/components/views/AppLayout.svelte`
- `references/gitbutler/apps/desktop/src/components/views/AppSidebar.svelte`
- `references/gitbutler/apps/desktop/src/components/views/WorkspaceView.svelte`
- `references/gitbutler/apps/desktop/src/components/views/MainViewport.svelte`
- `references/gitbutler/apps/desktop/src/components/views/MultiStackView.svelte`
- `references/gitbutler/apps/desktop/src/components/views/StackPanel.svelte`
- `references/gitbutler/apps/desktop/src/components/views/UnassignedView.svelte`
- `references/gitbutler/apps/desktop/src/components/shared/SashLayer.svelte`
- `references/gitbutler/apps/desktop/src/components/shared/Resizer.svelte`
- `references/gitbutler/apps/desktop/src/lib/floating/FloatingModal.svelte`
- `references/gitbutler/apps/desktop/src/lib/floating/snapPointManager.ts`
- `references/gitbutler/apps/desktop/src/lib/floating/resizeSync.ts`

What to take:

- The primary layout should express the user's work, not just container
  mechanics.
- A preview pane can be contextual and transient rather than a permanent dock.
- Horizontal lanes are powerful for git stacks, agents, tasks, review queues,
  and other workflows where "sequence of related work" matters more than
  "open file tabs."
- Folded lanes, pagination, drag panning, and drop zones make dense workflows
  manageable without resorting to nested tabs everywhere.
- Overlay sash layers avoid clipping resize handles inside overflow-hidden
  panes.
- Resizers should persist preferred sizes only after intentional user resize,
  not on every responsive adjustment.
- Floating surfaces should have viewport constraints and useful snap points.

Design implication:

Platform needs workflow layouts. "Classic IDE" should be one mode, not the
ceiling. A Git/agent/review workspace can use lanes, preview surfaces, and
context-linked panels while still allowing files and terminals to split when
needed.

### T3Code

T3Code is useful for route-backed UI state, responsive panel behavior, and
server-driven shell/detail projection. The chat route owns diff visibility
through search params, switches side panels between inline desktop views and
mobile sheets, and uses resizers that can reject sizes when downstream content
would become invalid.

Important files:

- `references/t3code/apps/web/src/routes/_chat.$environmentId.$threadId.tsx`
- `references/t3code/apps/web/src/components/ui/sidebar.tsx`
- `references/t3code/apps/web/src/components/AppSidebarLayout.tsx`
- `references/t3code/apps/web/src/components/ChatView.tsx`
- `references/t3code/apps/web/src/components/chat/ChatHeader.tsx`
- `docs/t3code-reference.md`

What to take:

- Some layout state belongs in route/search state, especially shareable
  visibility such as `diff=1`.
- Responsive surfaces should change presentation, not identity. The same diff
  panel can be an inline right sidebar on desktop and a sheet on small screens.
- Resizers need content-aware constraints. A valid width is not just min/max; it
  must leave room for the composer/editor/work area.
- Expensive panels should lazy mount after first open when possible.
- Stateful long-running surfaces, especially terminals, may need to stay mounted
  while hidden.
- The shell/detail pattern maps well to layout: cheap panel metadata and
  placement can be available before heavyweight content streams in.

Design implication:

The layout manager should support presentation adapters. A surface should be
able to render as docked, inline, sheet, drawer, floating, or hidden without
losing identity.

### Athas

Athas is the strongest local reference for a custom editor layout manager. It
uses a typed pane tree with split nodes and pane groups, a broad discriminated
union of pane content types, a separate bottom root, MRU pane tracking,
fullscreen overlays, explicit drop zones, and workspace-session persistence.

Important files:

- `references/athas/src/features/panes/types/pane.ts`
- `references/athas/src/features/panes/types/pane-content.ts`
- `references/athas/src/features/panes/stores/pane-store.ts`
- `references/athas/src/features/panes/utils/pane-tree.ts`
- `references/athas/src/features/panes/utils/pane-drop-zones.ts`
- `references/athas/src/features/panes/utils/pane-drop-actions.ts`
- `references/athas/src/features/panes/components/split-view-root.tsx`
- `references/athas/src/features/panes/components/pane-node-renderer.tsx`
- `references/athas/src/features/panes/components/pane-container.tsx`
- `references/athas/src/features/layout/components/main-layout.tsx`
- `references/athas/src/features/layout/components/resizable-pane.tsx`
- `references/athas/src/features/layout/components/bottom-pane/bottom-pane.tsx`
- `references/athas/src/features/window/stores/workspace-pane-session.ts`
- `references/athas/src/features/window/stores/workspace-ui-session.ts`

What to take:

- A layout tree should be explicit: `PaneGroup` for tabbed buffers and
  `PaneSplit` for binary horizontal/vertical splits.
- Pane contents should be typed. Athas models editor, terminal, agent, web
  viewer, new tab, diff, image, pdf, database, pull request, diagnostics,
  references, previews, and more as explicit content types.
- The bottom pane can be its own root instead of just a special child in the
  central tree.
- MRU pane IDs matter for focus, close fallback, keyboard navigation, and
  command routing.
- Same-direction nested splits can be flattened for resize UX without changing
  the persisted logical tree.
- Drop grammar should be explicit: center means add/move tab, edges mean split,
  bottom can mean move into bottom root.
- Persistence should restore stable resources, not volatile buffer IDs. Athas
  serializes paths/session types, then maps them back to current buffers during
  hydration.
- Terminals should remain mounted when the bottom pane hides if sessions must
  keep running.

Design implication:

If we build custom, start from an Athas-like tree and improve it with Dockview's
drag/drop polish, GitButler's workflow lanes, and Hyprland-style policies.

### Zed

Zed separates central editor items from docked panels. Editor panes contain
items with tab behavior, preview state, pinned count, close semantics, dirty
state, split/clone/move behavior, and MRU tracking. Panels implement a separate
contract with valid dock positions, default sizes, zoom state, activation
priority, icons, toggle actions, and optional internal panes.

Important files:

- `/Users/shaul/Desktop/D/Editors/zed/crates/workspace/src/item.rs`
- `/Users/shaul/Desktop/D/Editors/zed/crates/workspace/src/pane.rs`
- `/Users/shaul/Desktop/D/Editors/zed/crates/workspace/src/pane_group.rs`
- `/Users/shaul/Desktop/D/Editors/zed/crates/workspace/src/dock.rs`
- `/Users/shaul/Desktop/D/Editors/zed/crates/workspace/src/persistence/model.rs`
- `/Users/shaul/Desktop/D/Editors/zed/crates/workspace/src/persistence.rs`
- `/Users/shaul/Desktop/D/Editors/zed/crates/workspace/src/workspace_settings.rs`
- `/Users/shaul/Desktop/D/Editors/zed/crates/panel/src/panel.rs`
- `/Users/shaul/Desktop/D/Editors/zed/crates/terminal_view/src/persistence.rs`
- `/Users/shaul/Desktop/D/Editors/zed/crates/terminal_view/src/terminal_panel.rs`
- `/Users/shaul/Desktop/D/Editors/zed/docs/src/visual-customization.md`
- `/Users/shaul/Desktop/D/Editors/zed/docs/src/migrate/intellij.md`

What to take:

- `Item` and `Panel` are different contracts. Editors/diffs/search results are
  item-like; project/terminal/git/agent are panel-like.
- Panels can move between left, bottom, and right docks, but individual panels
  can reject invalid positions.
- Editor panes support classic expectations: split left/right/up/down, split
  modes, close other/clean/right/left, reopen closed, preview tabs, pinned tabs,
  tab activation settings, dirty checks, and focus restoration.
- Zed persists the center group as a serialized pane group and docks as left,
  right, bottom state with visibility, active panel, and zoom.
- Terminal panel is itself a panel that contains an internal pane group. This is
  important: a panel surface can have its own split/tab model.
- Zed exposes settings for bottom dock layout, pane split direction, centered
  layout, max tabs, tab bar controls, active pane border/inactive opacity, and
  resize-all-panels-in-dock.

Design implication:

Use separate contracts for central surfaces and dock/panel surfaces, but allow
surfaces to carry nested layout when the workflow demands it. A terminal area,
agent area, or review area may be more than one tab.

### VS Code

VS Code is the mature baseline for compatibility and the cautionary example for
complexity. It has named workbench parts, a workbench layout service, editor
groups in a serializable grid, pane composites for side/panel/auxiliary
containers, movable view containers, mementos, restore orchestration, zen mode,
and many years of legacy behavior.

Important files:

- `/Users/shaul/Desktop/D/Editors/vscode/src/vs/workbench/services/layout/browser/layoutService.ts`
- `/Users/shaul/Desktop/D/Editors/vscode/src/vs/workbench/browser/layout.ts`
- `/Users/shaul/Desktop/D/Editors/vscode/src/vs/workbench/browser/parts/editor/editor.ts`
- `/Users/shaul/Desktop/D/Editors/vscode/src/vs/workbench/browser/parts/editor/editorPart.ts`
- `/Users/shaul/Desktop/D/Editors/vscode/src/vs/workbench/browser/parts/editor/editorGroupView.ts`
- `/Users/shaul/Desktop/D/Editors/vscode/src/vs/workbench/browser/parts/editor/editorParts.ts`
- `/Users/shaul/Desktop/D/Editors/vscode/src/vs/workbench/browser/parts/paneCompositePart.ts`
- `/Users/shaul/Desktop/D/Editors/vscode/src/vs/workbench/browser/parts/paneCompositeBar.ts`
- `/Users/shaul/Desktop/D/Editors/vscode/src/vs/workbench/browser/parts/sidebar/sidebarPart.ts`
- `/Users/shaul/Desktop/D/Editors/vscode/src/vs/workbench/browser/parts/panel/panelPart.ts`
- `/Users/shaul/Desktop/D/Editors/vscode/src/vs/workbench/browser/parts/auxiliarybar/auxiliaryBarPart.ts`
- `/Users/shaul/Desktop/D/Editors/vscode/src/vs/workbench/browser/parts/views/viewPaneContainer.ts`

What to take:

- Named shell parts are useful: titlebar, activity bar, sidebar, panel,
  auxiliary bar, editor, statusbar.
- The editor area needs its own group model and serializable grid.
- View containers need to be movable between sidebar, panel, and auxiliary
  locations.
- Layout state has multiple scopes: workspace state, profile/machine sizing,
  user preferences, runtime/zen state.
- Focus, restore timing, and mementos are not afterthoughts. They are central to
  the editor feeling reliable.

What to avoid:

- Do not let historical categories define all future surfaces.
- Do not treat extension view containers, editor tabs, terminals, agents, and
  review flows as one generic "view" type.
- Do not copy the full layout service surface area before we have matching
  product needs.

Design implication:

Support VS Code muscle memory and keybindings, but build a cleaner model with
fewer legacy axes. We should support "side bar", "bottom panel", and "editor
groups" as compatibility projections over a stronger surface model.

### Hyprland

Hyprland is not an editor, but it is useful because its layout is algorithmic.
Targets belong to spaces; spaces have algorithms; algorithms split tiled and
floating behavior; workspace rules choose layouts; config controls split
policy, placement, focus, master ratios, scrolling columns, and custom Lua
layouts.

Important files:

- `references/hyprland/src/layout/LayoutManager.cpp`
- `references/hyprland/src/layout/space/Space.cpp`
- `references/hyprland/src/layout/algorithm/Algorithm.cpp`
- `references/hyprland/src/layout/algorithm/TiledAlgorithm.hpp`
- `references/hyprland/src/layout/supplementary/WorkspaceAlgoMatcher.cpp`
- `references/hyprland/src/config/values/ConfigValues.cpp`
- `references/hyprland/src/config/lua/layout/LuaLayoutProvider.cpp`
- `references/hyprland/src/config/lua/layout/LuaLayoutContext.cpp`

What to take:

- Layout can be an algorithm, not just stored geometry.
- Different workspaces can use different algorithms.
- Placement policy matters: new surface as master, slave, before/after active,
  drop at cursor, active-based split, cursor-based split, smart resizing.
- "Floating" and "tiled" are different behavior classes under one manager.
- Custom layout scripts can operate over a stable context: available area,
  targets, grid cells, rows, columns, and split helpers.

Design implication:

Platform should expose layout policies and recipes. For example, code editing
can use classic split/stack behavior, git review can use lanes plus preview,
agent pairing can use master/detail with terminal and plan surfaces, and search
can use a results-driven layout.

### i3

i3 is the clearest reference for a durable tiling tree and mouse-accessible
structural editing. It is worth studying because its product grammar is small
but powerful: split containers, tabbed containers, stacked containers, focus
parent/child, workspaces, scratchpad, and drag-to-restructure.

Important files and docs:

- `references/i3/docs/userguide`
- `references/i3/docs/layout-saving`
- `references/i3/include/data.h`
- `references/i3/include/con.h`
- `references/i3/src/tree.c`
- `references/i3/src/con.c`
- `references/i3/src/move.c`
- `references/i3/src/render.c`
- `references/i3/src/tiling_drag.c`

Product decisions to take:

- Every managed thing is a container. A container can host a real window or
  other containers.
- Split containers can be `splith` or `splitv`; tabbed and stacked are alternate
  presentations of the same underlying child set.
- Focus can move to parent and child containers, not only leaf windows. This is
  how users intentionally choose where the next window or split applies.
- Workspaces are created on demand, have a default orientation based on output
  aspect ratio, and can have a default layout of split, stacked, or tabbed.
- Scratchpad is a hidden workspace for surfaces that are "not in the layout
  right now" but quickly recallable. For Platform, this maps to background
  surfaces, while ordinary minimize maps to collapsed in-place windows.
- Layout save/restore creates placeholders that later swallow matching windows.
  Platform should copy the concept, not the X11 matching: restore placeholders
  for surfaces whose editor buffer, terminal session, agent run, or remote
  resource is not ready yet.
- Tiling drag has three drop meanings:
  - center drop moves into target, or swaps if the swap modifier is active;
  - edge drop inserts as a sibling, creating/changing a split if needed;
  - thinner outer edge drop promotes to the parent edge, then performs a
    directional move.

Implementation details to take:

- `struct Con` stores parent pointer, node children, focus order, floating
  children, layout, last split layout, workspace layout, percent, rects, window
  metadata, fullscreen state, sticky state, floating state, and scratchpad
  state.
- `layout_t` includes `L_SPLITH`, `L_SPLITV`, `L_STACKED`, `L_TABBED`,
  `L_DOCKAREA`, `L_OUTPUT`, and `L_DEFAULT`.
- `tree_open_con` opens new containers under the focused/target parent, assigns
  default split layout, then calls `con_fix_percent`.
- `tree_split` does not blindly wrap. If splitting an empty or one-child
  workspace, it changes orientation; if the parent split has only one child, it
  changes the parent orientation; otherwise it creates a new split container,
  replaces the target in node/focus queues, transfers percent, and moves the
  target under the new split.
- `tree_close_internal` recursively closes children, detaches the container,
  calls `con_fix_percent` on the parent for tiled nodes, renders to avoid gaps,
  activates the next focus, and lets parent cleanup remove empty containers.
- `con_fix_percent` is simple and important: missing child percentages are set
  proportionally, total zero falls back to equal distribution, and non-one totals
  are normalized.
- `insert_con_into` preserves focus semantics using the lowest common ancestor,
  detaches the source, fixes old percentages, inserts before/after target in
  both node and focus queues, sets source percent to zero, fixes destination
  percentages, then invokes old-parent cleanup.
- `con_move_to_target` refuses self/descendant moves, descends split targets to
  focused children, special-cases scratchpad and floating targets, and then
  reattaches with percent repair.
- `render_con_split` assigns each child rect from percentages; stacked and
  tabbed give children the same body rect and render focus/decoration
  differently.
- `tiling_drag.c` computes nearest edge thresholds, draws an indicator window,
  and commits center/sibling/parent behavior on mouse release.

Design implication:

Platform should copy i3's structural clarity: explicit parent/child operations,
normalized percentages, parent-edge drops, scratchpad/background state,
collapsed in-place windows, focus parent, and placeholder restore. For the
browser, those concepts should be presented visually through drop overlays, rail
targets, breadcrumbs, accordion headers, and keyboard commands rather than
requiring users to think in tree terms.

### Zellij

Zellij is a developer workspace rather than just a terminal grid. It combines
tabs, tiled panes, floating panes, stacked panes, layout files, swap layouts,
session serialization, plugin panes, mouse resizing/moving, collaboration, and
a web client.

Important files and docs:

- `references/zellij/README.md`
- `references/zellij/docs/ARCHITECTURE.md`
- `references/zellij/example/default.kdl`
- `references/zellij/example/layouts/multiple_tabs_layout.kdl`
- `references/zellij/zellij-utils/src/input/layout.rs`
- `references/zellij/zellij-utils/src/kdl/kdl_layout_parser.rs`
- `references/zellij/zellij-utils/src/pane_size.rs`
- `references/zellij/zellij-utils/src/session_serialization.rs`
- `references/zellij/zellij-server/src/tab/mod.rs`
- `references/zellij/zellij-server/src/tab/layout_applier.rs`
- `references/zellij/zellij-server/src/tab/swap_layouts.rs`
- `references/zellij/zellij-server/src/tab/mouse_handler.rs`
- `references/zellij/zellij-server/src/panes/tiled_panes/mod.rs`
- `references/zellij/zellij-server/src/panes/tiled_panes/pane_resizer.rs`
- `references/zellij/zellij-server/src/panes/tiled_panes/stacked_panes.rs`
- `references/zellij/zellij-server/src/panes/floating_panes/mod.rs`
- `references/zellij/zellij-server/src/session_layout_metadata.rs`

Product decisions to take:

- The product is a workspace for developers and ops users, not a generic pane
  widget.
- Beginner and power-user behavior coexist: good defaults, mouse support,
  modal keybindings, layouts, swap layouts, plugins, floating panes, stacked
  panes, and web-client access.
- Built-in panes such as tab bar, status bar, strider, session manager,
  configuration, plugin manager, layout manager, about, and share are plugins.
  Platform can use the same idea for file tree, search, git, agents, review,
  diagnostics, and settings: all are surfaces with registered capabilities.
- KDL layout files define tabs, panes, split directions, fixed/percent sizes,
  floating panes, default tab templates, external `children` insertion points,
  and plugin/command panes.
- Swap layouts are first-class layout recipes selected at runtime by pane-count
  constraints. This maps directly to Platform workspace recipes.
- `auto_layout`, `session_serialization`, `serialize_pane_viewport`,
  `scrollback_lines_to_serialize`, `stacked_resize`, `pane_frames`,
  `focus_follows_mouse`, and `mouse_hover_effects` are product-level layout
  settings, not implementation trivia.
- Stacked panes are not the same as tabbed panes. A stack shows one flexible
  main pane plus one-line collapsed panes; this is useful for dense terminal,
  log, task, or agent-output groups.
- Floating panes can be shown/hidden as a layer, pinned, moved, resized, and
  ordered with z-index. Pinned panes remain visible even when the floating layer
  is hidden.
- Session restore serializes tabs, tiled panes, floating panes, commands,
  plugins, cwd, focus, hide-floating state, swap layouts, and optional pane
  viewport/scrollback.

Implementation details to take:

- `Layout` contains tabs, focused tab index, default template, swap layouts,
  `swap_tiled_layouts`, and `swap_floating_layouts`.
- `TiledPaneLayout` contains child split direction, name, children, optional
  split size, run instruction, borderless/focus flags, external children index,
  `children_are_stacked`, `is_expanded_in_stack`, sync exclusions,
  `hide_floating_panes`, initial contents, and default colors.
- `FloatingPaneLayout` contains name, x/y/width/height, pinned, borderless, run
  instruction, focus, already-running state, initial contents, logical position,
  and default colors.
- `SplitSize` and `PercentOrFixed` explicitly support percent and fixed cell
  sizes. Platform should support percent and fixed pixel/min-content sizes.
- `PaneGeom` stores x/y, rows/cols `Dimension`, stacked ID, pinned state, and
  logical position. `Dimension` keeps both constraint and resolved inner value.
- Runtime tiled state is not only a tree. `TiledPanes` stores a map of `PaneId`
  to pane objects with concrete geometry; layout templates are flattened into
  geometry and applied to existing/new panes.
- `position_panes_in_space` recurses through `TiledPaneLayout`, supports
  truncating/extending layout to fit pane count, assigns stack IDs, validates
  minimum sizes, and returns leaf layout/geometry pairs in a breadth-first order.
- `split_space` handles stacked children by making every collapsed child fixed
  height 1 and one child flexible; it also distributes free percent across
  flexible children and adjusts rounding errors on the last flexible pane.
- `LayoutApplier` applies layouts by exact run match, then logical-position
  match, then best effort. This is valuable for Platform restore: match surfaces
  first by resource identity, then last known logical slot, then fallback stack.
- `ExistingTabState` drains current panes, sorts candidates by logical position,
  extracts exact content matches, extracts logical-position matches, and leaves
  unmatched panes for best-effort placement or close.
- `PaneResizer` uses a Cassowary solver to preserve flexible ratios and fixed
  sizes, then discretizes rounded sizes so there are no gaps or overlaps.
- `StackedPanes` treats a stack as one flexible pane plus one-line fixed panes,
  swaps which pane is flexible on focus, computes the stack rect, and preserves
  minimum stack height.
- `FloatingPanes` tracks desired pane positions, z-index order, pinned panes,
  visibility, and in-progress mouse movement separately from tiled panes.
- `MouseHandler` turns frame edges and cursor deltas into resize strategies,
  supports tiled and floating resize, marks swap layouts dirty when user changes
  geometry, supports floating drag, selection, scroll, focus-on-hover, click
  through, group toggles, and hover feedback.
- `SessionLayoutMetadata` can decide whether a session is dirty by comparing
  current pane count/commands with the base layout and excluding built-in
  management plugins from the count.

Design implication:

Zellij argues for a layered architecture: product surfaces and sessions, layout
recipes/templates, runtime geometry, and renderer interaction state are
different layers. For Platform we probably still want a pure TS layout tree as
the main source of truth, but Zellij's geometry-first runtime model is a useful
escape hatch for stacked panes, fixed-size toolbars, solver-backed resize, and
restore matching.

## Second-Pass Implementation Notes From Existing References

These are the implementation details from the original reference set that should
not get lost behind the product conclusions.

Dockview:

- Serialized state separates `grid`, `panels`, `activeGroup`, `floatingGroups`,
  `popoutGroups`, and `edgeGroups`.
- Panel state stores id, content component, tab component, title, params,
  renderer, and min/max dimensions.
- `toJSON` serializes geometry plus panel state; `fromJSON` can reuse existing
  panels, rebuild groups, and reset invalid layouts.
- `DockviewApi` exposes active group/panel events, `layout`, `focus`,
  `addPanel`, `removePanel`, `addGroup`, `removeGroup`, floating groups, edge
  groups, and save/restore.
- Edge groups are deliberately not normal editor groups. They cannot maximize,
  float, or pop out, which maps well to constrained tool regions.

GitButler:

- `AppLayout` and `AppSidebar` separate shell navigation from workspace content.
- `MainViewport` builds a three-way product split: left unassigned changes,
  optional preview diff, and main stack lanes.
- `MultiStackView` manages horizontal stack lanes, folded stacks, panning,
  pagination, drag reordering, and drop zones.
- `SashLayer` renders resize handles in an overlay to avoid overflow clipping.
- `Resizer` supports persisted IDs, sync names/groups, passive mode, edge
  offsets, pointer-driven resize, and requestAnimationFrame scheduling.
- `FloatingModal` uses snap-point management instead of arbitrary freeform
  placement.

T3Code:

- Diff visibility is route/search state (`diff=1`), making layout shareable.
- The same diff surface becomes an inline right panel on desktop and a sheet on
  mobile; identity survives presentation changes.
- The sidebar primitive supports controlled/uncontrolled open state, cookie
  persistence, localStorage width, pointer capture, requestAnimationFrame
  resize, and `shouldAcceptWidth` constraints.
- `AppSidebarLayout` rejects sidebar widths that would leave the main content
  too narrow.
- `ChatView` keeps terminal drawers mounted per thread while lazily mounting
  diff/plan sidebars.

Athas:

- The pane tree has `PaneGroup` for tab groups and `PaneSplit` for horizontal or
  vertical splits.
- `PaneContentType` is a large discriminated union: editor, terminal, agent,
  web viewer, new tab, diff, image, pdf, binary, database, PR, issue, action,
  markdown preview, HTML, CSV, external editor, global search, diagnostics,
  references, onboarding, and more.
- The pane store tracks root, bottom root, active pane, MRU pane IDs,
  fullscreen pane, preview/pin/lock state, reorder, resize, distribute,
  navigation, and session restore.
- `pane-tree.ts` normalizes and flattens same-direction splits for resize UX.
- Drop zones use a center/edge threshold grammar; bottom pane is a separate
  root, not just another child of the center tree.
- Workspace persistence stores path/session type and hydrates back to current
  buffers instead of persisting volatile buffer IDs.

Zed:

- `Item` models editor-like tab content with title/icon/tooltip, dirty state,
  capabilities, split/clone behavior, close behavior, and item events.
- `Panel` is a separate contract with persistent name/key, valid positions,
  default/initial size, flexible sizing support, icon, toggle, zoom, and active
  pane behavior.
- Docks track active panel, visibility, zoom, and position for left, right, and
  bottom regions.
- `PaneGroup` is a tree with axis members and pane members; panes contain items,
  active item, pinned count, preview item, and serialized item records.
- Terminal panel is itself a panel with an internal pane group, proving panels
  can host nested layout.

VS Code:

- The workbench has named parts: titlebar, banner, activity bar, sidebar,
  panel, auxiliary bar, editor, status bar, and related chat/sidebar areas.
- The layout service restores named parts through a serializable grid and
  multiple state scopes: workspace, profile, machine/user, runtime, and zen.
- `EditorPart` owns a serializable grid of editor groups, MRU active groups,
  persisted group state, and restore fallback.
- Pane composite parts manage active/pinned/visible view containers, while view
  containers can move between sidebar, panel, and auxiliary bar.
- The implementation shows why focus, restore timing, view container movement,
  and memento scope must be designed early.

Hyprland:

- A workspace owns targets and delegates placement to a selected layout
  algorithm.
- `WorkspaceAlgoMatcher` chooses tiled algorithms such as dwindle, master,
  scrolling, and monocle, with a separate floating algorithm.
- Dwindle and master expose policy knobs: split choice, smart split/resizing,
  active/cursor split, master ratio, new-on-top/active, orientation, and
  drop-at-cursor.
- Lua layout providers operate over a stable context with area, targets, grid
  cell, row, column, and split helpers.
- This argues for Platform layout policies as data/code over stable primitives,
  not one hard-coded placement heuristic.

## Cross-Cutting Learnings

1. Product identity must be separate from geometry.

   A surface is not a tab. A tab is one presentation of a surface. A terminal
   session, file editor, diff, agent plan, PR review, search result set, or
   git stack needs product metadata and lifecycle independent of where it is
   rendered.

2. A window should be a first-class concept.

   The user idea of "editor becomes a window" is directionally right. A window
   is the visible container that can split, tab, collapse, expand, float,
   maximize, and receive focus. A surface is the product artifact inside it.
   One window may contain many surfaces as tabs.

3. The rail should behave more like a taskbar than a fixed sidebar.

   File tree, search, diff, terminal, agents, git, diagnostics, and review
   should not fight for one sidebar slot. They should be openable surfaces that
   can be visible, collapsed, backgrounded, expanded, moved, split, or tabbed.
   Recipe-managed tool surfaces should be order-packed from the current visible
   set rather than incrementally appended to old split history.

4. Support classic layouts as compatibility, not as the whole system.

   Users expect editor groups, split panes, pinned tabs, preview tabs, sidebars,
   bottom terminals, command palette actions, and restore-on-reopen. We should
   support that, but our best layouts should be workflow-native.

5. The central area and tool surfaces need different contracts.

   VS Code and Zed both separate central editor groups from side/bottom panels.
   Athas shows that the boundary can be more flexible if both sides use typed
   content. We should model both without forcing everything into one bucket.

6. Some surfaces need nested layout.

   A terminal panel may contain split terminals. An agent panel may contain chat,
   plan, logs, and artifacts. A review surface may contain files, diffs,
   comments, and test output. "Panel contains a layout tree" should be legal.

7. Use n-ary splits and explicit tab/window nodes.

   React Mosaic and i3 both show why same-direction split chains should be
   flattened or avoided. N-ary splits make resizing, normalization, and
   serialization simpler. Explicit window/tab nodes keep container identity
   stable even when there is one tab.

8. Drop grammar should be explicit.

   Center drop, edge drop, parent/root-edge drop, recipe-slot drop, and
   background drop should be distinct operations. Floating windows are a future
   explicit command/policy mode, not a mouse drag destination. i3's
   center/sibling/parent drop model is the clearest mouse grammar for structural
   tiling; React Mosaic and React Layman provide the web implementation
   patterns.

9. Resizing must be constraint-aware.

   Min/max is not enough. Resize operations need to account for editor minimum
   width, composer space, terminal usability, preview readability, responsive
   mode, and sibling surfaces. Zellij's fixed/percent dimensions and solver
   pass are useful when simple adjacent percentage resizing is not enough.

10. Persistence should store stable resources and policy, not live instances.

Store surface type, resource identity, placement, active/MRU state, preview
state, pin state, and restorable session keys. Do not persist React component
state or volatile buffer IDs as the durable source of truth. i3 placeholders
and Zellij run/logical-position matching are good restore patterns.

11. Focus and MRU are layout features.

Close fallback, command targeting, keyboard navigation, split placement, and
restore behavior all need active surface and MRU surface history.

12. Transient surfaces deserve first-class handling.

Preview diff, peek references, search preview, inline terminal, mobile sheet,
temporary agent artifact, and floating inspector should not be hacked in as
permanent panels.

13. Layout policy should be programmable.

    Hyprland shows the value of separating the primitive operations from the
    policy that chooses placement. Platform should have placement policies and
    layout recipes, even if they start as internal presets.

14. Runtime geometry and durable layout are different layers.

    React Mosaic stores durable layout as a pure tree. Zellij stores runtime
    panes with concrete geometry and uses layout templates to position them.
    Platform should keep the durable app state pure, but allow derived geometry
    caches, solver passes, and drag previews as renderer/runtime state.

15. Command discovery is part of layout UX.

    Raycast shows that a powerful window manager can start as a searchable
    command catalog. Platform should make layout commands discoverable in the
    existing command palette with category labels, icons, aliases, shortcuts,
    disabled states, and command-specific metadata instead of hiding tiling
    power behind undocumented key chords.

16. Hotkeys, presets, cycling, and layout builders sit above operations.

    Built-in window commands, custom single-window commands, and saved layout
    commands should execute the same pure layout operations and recipe policies
    as drag/drop. Their definitions need aliases, enabled state, hotkeys,
    preset membership, optional cycling rules, and payloads, but they should not
    become a second layout state model.

## Proposed Platform Model

The core model should be a typed surface graph plus a normalized split tree.
Recipe policy can prefer left tool placement or a bottom tool pane, but those
preferences must compile into ordinary split/window nodes rather than dock,
sidebar, or lane roots. A simplified shape:

```ts
type SurfaceId = string
type WindowId = string
type LayoutNodeId = string

type SurfaceRole =
  | 'editor'
  | 'diff'
  | 'terminal'
  | 'search'
  | 'agent'
  | 'git'
  | 'review'
  | 'preview'
  | 'inspector'
  | 'custom'

type SurfaceLifecycle = 'persistent' | 'session' | 'transient'
type SurfacePlacement = 'split-tree' | 'background' | 'floating'
type RecipeSlot = 'left-tools' | 'main' | 'bottom-tools'

type Surface = {
  id: SurfaceId
  role: SurfaceRole
  type: string
  title: string
  resourceKey?: string
  lifecycle: SurfaceLifecycle
  dirty?: boolean
  pinned?: boolean
  preview?: boolean
  restorable?: boolean
  capabilities: SurfaceCapabilities
}

type LayoutNode =
  | {
      kind: 'split'
      id: LayoutNodeId
      direction: 'horizontal' | 'vertical'
      children: LayoutNode[]
      sizes: number[]
    }
  | {
      kind: 'window'
      id: WindowId
      surfaceIds: SurfaceId[]
      activeSurfaceId?: SurfaceId
      mode?: 'normal' | 'maximized' | 'collapsed'
      previewSurfaceId?: SurfaceId
      pinnedSurfaceIds?: SurfaceId[]
    }

type FloatingWindow = {
  id: WindowId
  surfaceIds: SurfaceId[]
  activeSurfaceId?: SurfaceId
  rect: { x: number; y: number; width: number; height: number }
  pinned?: boolean
  zIndex: number
}

type RailItem = {
  surfaceId: SurfaceId
  status: 'visible' | 'collapsed' | 'background' | 'running' | 'pinned' | 'available'
  recipeSlot?: RecipeSlot
  badge?: string
}

type WorkspaceLayout = {
  version: number
  surfaces: Record<SurfaceId, Surface>
  root: LayoutNode
  backgroundSurfaceIds: SurfaceId[]
  rail: RailItem[]
  floatingWindows: FloatingWindow[]
  overlays: OverlayState[]
  activeSurfaceId?: SurfaceId
  activeWindowId?: WindowId
  mruSurfaceIds: SurfaceId[]
  mruWindowIds: WindowId[]
  policies: LayoutPolicyState
}
```

This does not have to be the exact implementation shape, but the principles are
important:

- Surfaces own product identity.
- Windows own visible grouping, tabs, preview, and pinned state.
- Layout nodes own placement and geometry.
- Recipe slots are placement policy labels that project surfaces into ordinary
  split-tree positions.
- The rail reports available, background, running, pinned, and collapsed
  surfaces. It does not own collapsed pane placement.
- Overlays are separate from durable layout.
- Policies decide where new surfaces go.
- Node/window/surface IDs are stable; paths are transient render addresses.
- A renderer can be swapped or mixed without changing product state.

## TypeScript Implementation Guidance

The first implementation should be a Platform-owned store plus a pure layout
operation library. React components should render state and dispatch commands;
they should not own durable layout logic.

Recommended modules:

- `surface-registry.ts`: registers surface types, capabilities, default
  placement, title/icon/dirty/close behavior, restore handlers, and renderers.
- `layout-types.ts`: durable state types, operation types, geometry types, and
  serialized layout versions.
- `layout-operations.ts`: pure transforms such as split window, move surface,
  move window, tab surface, reorder tab, close surface, collapse window, expand
  window, restore surface, pack recipe-managed tools, maximize, resize, auto
  tile, normalize, and validate.
- `layout-normalize.ts`: collapse empty nodes, flatten same-direction splits,
  repair size arrays, remove duplicate surfaces, route orphaned surfaces to
  background/default window, clamp active IDs, and preserve stable IDs.
- `layout-selectors.ts`: resolve node/window paths from IDs, compute bounding
  boxes, find focus neighbors, find drop targets, calculate MRU fallbacks.
- `layout-persistence.ts`: versioned serialization, migration, restore matching,
  corrupt-state recovery, and placeholder surfaces.
- `layout-policies.ts`: classic, active-adjacent, master/detail, lane workflow,
  preview-adjacent, root-edge, and task/agent placement policies.

State rules:

- Persistent operations target IDs, not paths. Paths are fine as render-time
  addresses and patch locations after resolving the latest tree.
- Every structural operation should run `normalizeLayout` before committing.
- Split nodes should be n-ary. If an edge drop targets a child of a same-
  direction split, insert into that split instead of wrapping another split.
- Window nodes should remain window nodes even with one surface. This preserves
  tabstrip, preview, active-window, and close/move semantics.
- Surface registry entries should own product lifecycle. Layout code should ask
  capabilities questions such as "can close", "can split", "can float", "can
  collapse", "requires mounted while not expanded", and "supports preview".
- Drag state should be ephemeral. Do not persist hidden/drag-preview layout.
  Commit only on drop, with preview geometry shown through derived state.
- Chrome-style tab drag should be researched from Chromium's tab strip source
  before implementation. Preserve in-strip slide/reorder by default, vertical
  pull-down detach only after a threshold, and no unsnapped floating tab or pane
  while the user is still choosing a placement.
- The same snapped-drag invariant applies to whole-window drag and individual
  surface moves. Dragging should never create floating or popout state; future
  floating windows require explicit commands or placement policy.
- Resize should maintain percent sizes for flexible panes and pixel/fixed
  constraints for toolbars, rails, and minimum content. Use simple adjacent
  resize first; keep a solver option for stacked/fixed-heavy layouts.
- Persistence should store a surface registry version and layout version. On
  restore, match by stable resource key first, then previous surface ID if
  still valid, then logical/window position, then fallback background/default
  stack.
- Unit tests should cover pure tree operations heavily. The risky code is path
  adjustment, normalization, close fallback, duplicate prevention, restore
  migration, and drop grammar.

Initial operation grammar:

- `openSurface(surface, policy)`
- `splitWindow(windowId, direction, placement, newSurfaceOrWindow)`
- `moveSurface(surfaceId, destination)`
- `moveWindow(windowId, destination)`
- `tabSurface(surfaceId, targetWindowId, index?)`
- `reorderTab(windowId, fromIndex, toIndex)`
- `collapseWindow(windowId)` and `expandWindow(windowId)`
- `restoreSurface(surfaceId, placement?)`
- `resizeSplit(splitId, handleIndex, deltaPx)`
- `maximizeWindow(windowId)` and `restoreWindow(windowId)`
- `applyRecipe(recipeId)`

Drop destinations should be explicit:

```ts
type DropDestination =
  | { kind: 'window-center'; windowId: WindowId; tabIndex?: number }
  | { kind: 'window-edge'; windowId: WindowId; edge: 'top' | 'right' | 'bottom' | 'left' }
  | { kind: 'parent-edge'; nodeId: LayoutNodeId; edge: 'top' | 'right' | 'bottom' | 'left' }
  | { kind: 'root-edge'; edge: 'top' | 'right' | 'bottom' | 'left' }
  | { kind: 'recipe-slot'; slot: RecipeSlot }
  | { kind: 'background' }
```

This keeps the UX concrete: center means tab/merge, edge means split, parent
edge means promote to the enclosing split, recipe slot means place through the
active recipe's normal split-tree policy, background means remove from visible
layout while preserving state by policy. Floating windows are a future explicit
command/policy mode, not a pointer drag destination.

## Layout Recipes To Explore

Tiling surface manager:

- Every opened artifact becomes a surface in a window.
- Drag center to tab; drag edge to split; drag outer parent edge to promote.
- Rail shows visible, collapsed, background, running, pinned, or available
  surfaces.
- Search, diff, files, terminal, git, and agent can all be visible together.
- Auto-tiling policy places new surfaces by role and active context.
- Mouse resizing, keyboard focus movement, maximize, collapse, expand, and restore all
  operate on windows.

Classic IDE:

- Center editor stacks with splits.
- Left nested project/search/git tool panes.
- Right recipe-placed outline/agent/inspector panes where the active recipe
  calls for them.
- Bottom terminal/problems/output tool pane.
- Preview tabs and pinned tabs.
- VS Code/Zed-style keyboard commands.

Review and changes:

- Left changes/source-of-truth list.
- Center or right diff preview.
- Horizontal lanes for stack/branch/PR slices.
- Terminal/test output as a contextual bottom or lane detail.
- Comments and diagnostics linked to selected diff.

Agent pairing:

- Main editor or diff as master.
- Agent chat/plan/logs as recipe-placed right-side panes or workflow-internal
  lanes.
- Terminal/task output as bottom or embedded detail.
- Artifacts and patches as transient previews.
- Placement policy favors active work item instead of arbitrary last tab.

Search and investigate:

- Search query/result surface as primary.
- Preview/editor follows selection.
- Persistent result set with transient file preview.
- Ability to promote preview to real editor.

Dense execution/log mode:

- Stack terminals, task logs, and agent output as one flexible main pane plus
  collapsed one-line panes.
- Allow one log/output surface to expand without losing the rest of the stack.
- Good for build, test, agent, and deployment workflows.

Focus mode:

- One active surface or one split group.
- Hidden docks, optional centered layout.
- Quick return to prior layout state.

## Compatibility Baseline

To feel credible as a code editor, V1 should preserve these familiar behaviors:

- Split editor left/right/up/down.
- Move editor between groups.
- Move whole window between split positions.
- Move individual surface between windows.
- Tab a surface into another window.
- Drag whole window and drag individual tab/surface.
- Close active, close others, close left/right, close clean.
- Reopen closed editor.
- Preview editor promoted by edit/pin.
- Pinned tabs protected from ordinary close.
- Active group and MRU group navigation.
- Focus window left/right/up/down.
- Focus parent/enclosing split for structural commands.
- Swap windows or surfaces.
- Toggle left sidebar.
- Toggle bottom terminal/panel.
- Collapse a window to an accordion header and expand it.
- Open multiple tool surfaces at the same time.
- Move focus left/right/up/down.
- Maximize/restore group or panel.
- Toggle floating layer and pinned floating surfaces.
- Restore workspace layout after reload.
- Gracefully reset corrupt layouts.
- Command palette commands for every layout operation.

These are compatibility behaviors, not necessarily the internal architecture.

## Better-Than-Old Opportunities

1. Role-based placement.

   A diff opened from a git stack should go near that stack. A terminal spawned
   for an agent task should attach to that agent/task context. A search preview
   should be transient until promoted. The old "open beside active editor"
   heuristic is too weak.

2. Mouse-first structural tiling.

   Use i3-style center/edge/parent-edge drop zones with clear overlays. This
   gives users real tree control without making them learn the tree.

3. Workflow lanes.

   Borrow GitButler's confidence here. Branch stacks, PR review, agent tasks,
   and investigation threads all benefit from lanes more than from generic tabs.

4. Layout policies.

   Provide internal policies such as classic split, master/detail, lane stack,
   preview-adjacent, active-context, and cursor/drop-target. Later, expose them
   as user/project settings.

5. Rail as taskbar.

   The rail should show visible/collapsed/background/running/available
   surfaces, not just mutually-exclusive view containers. This makes "open
   search, diff, files, terminal, and agent all at once" feel natural.

6. Context-linked transient previews.

   Preview surfaces should be linked to the selected list item, stack, search
   result, diagnostic, or agent artifact. Promotion to persistent surface should
   be explicit.

7. Portable surfaces.

   The same surface should be able to render as center tab, dock panel, bottom
   panel, sheet, drawer, floating window, or lane detail if its capabilities
   allow it.

8. Constraint-aware resizing.

   Resizers should know when a requested width would break the editor/composer
   and reject or clamp it.

9. First-class layout profiles.

   A project can remember "editing", "review", "agent", and "focus" profiles
   with separate placement policies and visibility.

10. Safer persistence and migrations.

Persist layout version, surface registry version, and resource keys. On
invalid state, recover as much as possible and route orphaned surfaces to a
default stack.

## Open Vision Questions

1. What is the primary metaphor: panes, surfaces, workflows, or lenses?

   "Panes" is familiar but generic. "Surfaces" maps better to product identity.
   "Workflows" or "lenses" may better describe the next-level experience.

2. Should the default layout look classic or opinionated?

   Classic lowers adoption risk. Opinionated gives Platform a stronger identity.
   A likely answer is classic default plus workflow recipes that are easy to
   activate.

3. Which surfaces are first-class in V1?

   Minimum likely set: file editor, diff editor, terminal, search, agent/chat,
   git changes, diagnostics/problems, empty/new tab.

4. Which surfaces can mix freely?

   Terminal tabs should not live beside file editors by default in the classic
   recipe: default terminal commands target the bottom tool pane. User-driven
   terminal placement can still put terminals beside editors, and that manual
   placement stays sticky while valid. Agent panes and git lanes still need
   capability rules rather than a single yes/no answer.

5. What exactly is a window?

   Is every tab group a window? Does a dock panel become a window when undocked?
   Can a workflow lane contain windows? The implementation should answer this
   before coding because it determines IDs, MRU, close fallback, and drag/drop.

6. What belongs in the rail?

   Should the rail show collapsed surfaces, background surfaces, all running
   surfaces, all registered tools, or a mix? A taskbar-like rail is powerful,
   but it needs a clear rule so it does not become noisy.

7. Do we want layout algorithms as user-visible settings?

   Hyprland suggests yes eventually. V1 can ship internal policies first:
   classic, preview-adjacent, master/detail, lane workflow, and focus.

8. Should V1 use a pure tree runtime or derived geometry runtime?

   React Mosaic favors a pure tree. Zellij proves a geometry-first runtime can
   handle fixed/stacked/solver cases. Platform likely wants a pure durable tree
   plus derived geometry, but stacked panes and fixed toolbars may pressure this.

9. How much of Dockview should remain?

   Option A: product-owned model rendered through Dockview for central docking.
   Option B: custom split/stack renderer from the start. Option A moves faster,
   but only if Dockview never becomes the product model.

10. What should the activity rail represent?

VS Code uses view containers. GitButler uses workflow destinations. Platform
may want activity items for workspace, changes, agents, search, review, and
settings, with each opening a layout recipe rather than just a sidebar.

11. What is the lifecycle contract for terminals and agents?

Some hidden surfaces must stay mounted. Others should serialize and dispose.
We need explicit lifecycle rules per surface type.

12. How should extension-contributed surfaces work?

Extensions should probably register surface types with capabilities and
placement preferences, not arbitrary React nodes with global layout power.

13. How should multi-window, popout, and floating behave?

Floating is useful, but it increases persistence, focus, and lifecycle
complexity. It should follow after central/dock/bottom/sheet surfaces are
solid.

14. What is the keyboard-first story?

Layout commands should be complete: split, move, swap, focus, resize, maximize,
collapse, expand, promote preview, toggle recipe pane, cycle surface, and open
recipe.

15. What visual identity should this have?

We should avoid a VS Code clone and avoid a generic Dockview skin. The
design should be quieter than marketing UI but fresher than old IDE chrome:
workflow lanes, crisp resize affordances, clear active/focus state, and
fewer nested boxes.

## Recommended Next Steps

1. Write the Platform workbench model spec.

   Define `Surface`, `SurfaceRegistry`, `LayoutNode`, `Window`, `OverlayState`,
   lifecycle rules, capabilities, persistence, migration, and command routing.
   Include collapsed window mode, background state, rail command/status behavior,
   floating behavior, and what state is durable versus derived.

2. Build the pure layout operation library first.

   Implement IDs, split/window nodes, normalize, split, tab, move, reorder,
   collapse, expand, restore, close, resize, maximize, and recipe application as
   pure TypeScript functions with unit tests before wiring React.

3. Decide the renderer strategy.

   Choose between a Dockview-backed renderer for the center workbench or a
   custom Athas-style split/stack renderer. If Dockview stays, keep a strict
   adapter boundary.

4. Prototype two recipes.

   Build one classic IDE recipe and one distinctive Platform recipe, likely
   git/agent review lanes with contextual diff preview. This will reveal whether
   the model is expressive enough.

5. Prototype mouse drop grammar.

   Implement visual drop overlays for center, edge, parent edge, root edge,
   recipe slot, background, and floating. This is the fastest way to validate the
   "Hyprland in browser but easy with mouse" thesis.

6. Define placement policies.

   Start with internal policies for active stack, adjacent preview, bottom
   terminal, lane append, master/detail, and focus mode.

7. Define persistence and recovery.

   Persist stable surface identities and layout version. Add fallback behavior
   for missing resources, missing surface types, corrupt trees, and orphaned
   surfaces.

8. Build command coverage early.

   Every layout operation should be command-addressable. This keeps the system
   keyboard-first and makes VS Code/Zed parity possible without coupling the UI
   to old editor chrome.

## Bottom Line

The layout manager should be ours at the product-model layer. Dockview can help
with mechanics, React Mosaic gives the best TypeScript tree/update reference,
React Layman gives a compact reducer/drop reference, Athas gives the custom
typed pane model, Zed and VS Code define the compatibility baseline, T3Code
shows route/responsive/session handling, GitButler shows workflow-native
layout, Hyprland shows layout policies, i3 shows structural tiling and mouse
drop grammar, and Zellij shows developer-workspace recipes, stacked/floating
panes, plugins, and session restore.

The strongest vision is a typed, policy-driven tiling surface manager: classic
IDE compatibility underneath, a taskbar-like rail for surfaces, mouse-first
structural tiling, stable TypeScript layout operations, and distinctive workflow
recipes on top. That gives us a path to support what users already know while
making the editor feel materially better than a Zed or VS Code clone.
