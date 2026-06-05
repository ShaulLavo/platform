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
- GitButler: `references/gitbutler`
- T3Code: `references/t3code`
- Athas: `references/athas`
- Hyprland: `references/hyprland`
- VS Code: `references/vscode` and `/Users/shaul/Desktop/D/Editors/vscode`
- Zed: `/Users/shaul/Desktop/D/Editors/zed`

Relevant existing Platform docs:

- `docs/dockview-workbench-prd.md`
- `docs/t3code-reference.md`

## Executive Readout

The strongest direction is a product-owned layout model rendered by a capable
layout engine, not a layout-library-owned product. Dockview is good at docking,
serialization, edge groups, floating groups, and drag/drop mechanics, but it
should not define panel identity, panel lifecycle, dirty state, persistence
semantics, terminal sessions, command routing, or workflow rules.

The best reference for a custom in-app editor layout model is Athas. It has a
clear split/group tree, typed pane contents, MRU pane tracking, preview/pinned
state, bottom pane separation, custom drop zones, fullscreen handling, and
workspace-session persistence that restores stable resources instead of volatile
React/editor instances.

The best reference for a fresh product feel is GitButler. Its layout is not a
generic IDE clone. It makes branch stacks, unassigned changes, preview diffs,
folded lanes, and drag affordances into the primary workspace grammar. That is
the lesson: the new Platform workbench should support classic editor behavior,
but its distinctive layouts should come from our core workflows.

The best non-editor reference is Hyprland. It treats layout as an algorithm
attached to a workspace, with configurable placement and resizing policy. That
suggests a better model than "tabs can be dragged anywhere": users and features
should be able to pick strategies for where new surfaces go, how splits are
chosen, when focus follows, and which workflows get lane/master/focus layouts.

The compatibility target from VS Code and Zed is clear: users expect editor
groups, splits, preview tabs, pinned tabs, side docks, bottom terminals,
keyboard navigation, focus/MRU behavior, restore-on-reopen, and movable
auxiliary views. We should support those experiences without inheriting the old
taxonomy as the only conceptual model.

## Reference Findings

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

## Cross-Cutting Learnings

1. Product identity must be separate from geometry.

   A surface is not a tab. A tab is one presentation of a surface. A terminal
   session, file editor, diff, agent plan, PR review, search result set, or
   git stack needs product metadata and lifecycle independent of where it is
   rendered.

2. Support classic layouts as compatibility, not as the whole system.

   Users expect editor groups, split panes, pinned tabs, preview tabs, sidebars,
   bottom terminals, command palette actions, and restore-on-reopen. We should
   support that, but our best layouts should be workflow-native.

3. The central area and tool surfaces need different contracts.

   VS Code and Zed both separate central editor groups from side/bottom panels.
   Athas shows that the boundary can be more flexible if both sides use typed
   content. We should model both without forcing everything into one bucket.

4. Some surfaces need nested layout.

   A terminal panel may contain split terminals. An agent panel may contain chat,
   plan, logs, and artifacts. A review surface may contain files, diffs,
   comments, and test output. "Panel contains a layout tree" should be legal.

5. Drop grammar should be explicit.

   Center drop, edge drop, lane drop, bottom drop, dock drop, and floating drop
   should be distinct operations. This is how Athas and GitButler keep dense
   layouts understandable.

6. Resizing must be constraint-aware.

   Min/max is not enough. Resize operations need to account for editor minimum
   width, composer space, terminal usability, preview readability, responsive
   mode, and sibling surfaces.

7. Persistence should store stable resources and policy, not live instances.

   Store surface type, resource identity, placement, active/MRU state, preview
   state, pin state, and restorable session keys. Do not persist React component
   state or volatile buffer IDs as the durable source of truth.

8. Focus and MRU are layout features.

   Close fallback, command targeting, keyboard navigation, split placement, and
   restore behavior all need active surface and MRU surface history.

9. Transient surfaces deserve first-class handling.

   Preview diff, peek references, search preview, inline terminal, mobile sheet,
   temporary agent artifact, and floating inspector should not be hacked in as
   permanent panels.

10. Layout policy should be programmable.

    Hyprland shows the value of separating the primitive operations from the
    policy that chooses placement. Platform should have placement policies and
    layout recipes, even if they start as internal presets.

## Proposed Platform Model

The core model should be a typed surface graph plus layout zones. A simplified
shape:

```ts
type SurfaceId = string

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
  | { kind: 'split'; direction: 'horizontal' | 'vertical'; sizes: number[]; children: LayoutNode[] }
  | { kind: 'stack'; activeSurfaceId?: SurfaceId; surfaceIds: SurfaceId[] }
  | { kind: 'lanes'; activeLaneId?: string; laneIds: string[] }

type WorkspaceLayout = {
  version: number
  surfaces: Record<SurfaceId, Surface>
  center: LayoutNode
  leftDock: DockState
  rightDock: DockState
  bottomDock: DockState
  overlays: OverlayState[]
  activeSurfaceId?: SurfaceId
  mruSurfaceIds: SurfaceId[]
  policies: LayoutPolicyState
}
```

This does not have to be the exact implementation shape, but the principles are
important:

- Surfaces own product identity.
- Layout nodes own placement.
- Docks are projections of surfaces into shell regions.
- Overlays are separate from durable layout.
- Policies decide where new surfaces go.
- A renderer can be swapped or mixed without changing product state.

## Layout Recipes To Explore

Classic IDE:

- Center editor stacks with splits.
- Left project/search/git dock.
- Right outline/agent/inspector dock.
- Bottom terminal/problems/output dock.
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
- Agent chat/plan/logs as right lane or right dock.
- Terminal/task output as bottom or embedded detail.
- Artifacts and patches as transient previews.
- Placement policy favors active work item instead of arbitrary last tab.

Search and investigate:

- Search query/result surface as primary.
- Preview/editor follows selection.
- Persistent result set with transient file preview.
- Ability to promote preview to real editor.

Focus mode:

- One active surface or one split group.
- Hidden docks, optional centered layout.
- Quick return to prior layout state.

## Compatibility Baseline

To feel credible as a code editor, V1 should preserve these familiar behaviors:

- Split editor left/right/up/down.
- Move editor between groups.
- Close active, close others, close left/right, close clean.
- Reopen closed editor.
- Preview editor promoted by edit/pin.
- Pinned tabs protected from ordinary close.
- Active group and MRU group navigation.
- Toggle left sidebar.
- Toggle bottom terminal/panel.
- Move focus left/right/up/down.
- Maximize/restore group or panel.
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

2. Workflow lanes.

   Borrow GitButler's confidence here. Branch stacks, PR review, agent tasks,
   and investigation threads all benefit from lanes more than from generic tabs.

3. Layout policies.

   Provide internal policies such as classic split, master/detail, lane stack,
   preview-adjacent, active-context, and cursor/drop-target. Later, expose them
   as user/project settings.

4. Context-linked transient previews.

   Preview surfaces should be linked to the selected list item, stack, search
   result, diagnostic, or agent artifact. Promotion to persistent surface should
   be explicit.

5. Portable surfaces.

   The same surface should be able to render as center tab, dock panel, bottom
   panel, sheet, drawer, floating window, or lane detail if its capabilities
   allow it.

6. Constraint-aware resizing.

   Resizers should know when a requested width would break the editor/composer
   and reject or clamp it.

7. First-class layout profiles.

   A project can remember "editing", "review", "agent", and "focus" profiles
   with separate placement policies and visibility.

8. Safer persistence and migrations.

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

   Should terminal tabs live beside file editors by default? Should agent panes
   be allowed inside editor stacks? Should git lanes accept arbitrary file
   editors? We need capability rules, not a single yes/no answer.

5. Do we want layout algorithms as user-visible settings?

   Hyprland suggests yes eventually. V1 can ship internal policies first:
   classic, preview-adjacent, master/detail, lane workflow, and focus.

6. How much of Dockview should remain?

   Option A: product-owned model rendered through Dockview for central docking.
   Option B: custom split/stack renderer from the start. Option A moves faster,
   but only if Dockview never becomes the product model.

7. What should the activity rail represent?

   VS Code uses view containers. GitButler uses workflow destinations. Platform
   may want activity items for workspace, changes, agents, search, review, and
   settings, with each opening a layout recipe rather than just a sidebar.

8. What is the lifecycle contract for terminals and agents?

   Some hidden surfaces must stay mounted. Others should serialize and dispose.
   We need explicit lifecycle rules per surface type.

9. How should extension-contributed surfaces work?

   Extensions should probably register surface types with capabilities and
   placement preferences, not arbitrary React nodes with global layout power.

10. How should multi-window, popout, and floating behave?

    Floating is useful, but it increases persistence, focus, and lifecycle
    complexity. It should follow after central/dock/bottom/sheet surfaces are
    solid.

11. What is the keyboard-first story?

    Layout commands should be complete: split, move, swap, focus, resize,
    maximize, promote preview, toggle dock, cycle surface, open recipe.

12. What visual identity should this have?

    We should avoid a VS Code clone and avoid a generic Dockview skin. The
    design should be quieter than marketing UI but fresher than old IDE chrome:
    workflow lanes, crisp resize affordances, clear active/focus state, and
    fewer nested boxes.

## Recommended Next Steps

1. Write the Platform workbench model spec.

   Define `Surface`, `SurfaceRegistry`, `LayoutNode`, `DockState`,
   `OverlayState`, lifecycle rules, capabilities, persistence, migration, and
   command routing.

2. Decide the renderer strategy.

   Choose between a Dockview-backed renderer for the center workbench or a
   custom Athas-style split/stack renderer. If Dockview stays, keep a strict
   adapter boundary.

3. Prototype two recipes.

   Build one classic IDE recipe and one distinctive Platform recipe, likely
   git/agent review lanes with contextual diff preview. This will reveal whether
   the model is expressive enough.

4. Define placement policies.

   Start with internal policies for active stack, adjacent preview, bottom
   terminal, lane append, master/detail, and focus mode.

5. Define persistence and recovery.

   Persist stable surface identities and layout version. Add fallback behavior
   for missing resources, missing surface types, corrupt trees, and orphaned
   surfaces.

6. Build command coverage early.

   Every layout operation should be command-addressable. This keeps the system
   keyboard-first and makes VS Code/Zed parity possible without coupling the UI
   to old editor chrome.

## Bottom Line

The layout manager should be ours at the product-model layer. Dockview can help
with mechanics, Athas gives the clean custom tree, Zed and VS Code define the
compatibility baseline, T3Code shows route/responsive/session handling,
GitButler shows how to make layout feel native to the workflow, and Hyprland
shows how to make placement policy and layout algorithms first-class.

The strongest vision is a typed, policy-driven surface manager with classic IDE
compatibility and distinctive workflow recipes. That gives us a path to support
what users already know while making the editor feel materially better than a
Zed or VS Code clone.
