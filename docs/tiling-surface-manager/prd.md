# Tiling Surface Manager PRD

Date: 2026-06-05

## Summary

Platform should evolve into a tiling surface manager for code work. Editors,
diffs, terminals, search, file navigation, git changes, agents, diagnostics,
and future capabilities should all produce first-class work surfaces that can
be arranged as tiled windows, stacked as tabs, minimized into a rail, previewed
transiently, or promoted into durable workspace state.

The product direction is closer to a tiling surface manager for editor
workflows than to a traditional IDE panel system. The editor is not the only "real"
workspace surface. Search results, diff views, terminals, file trees, git
panels, and agent views should be able to coexist and be arranged by the user
without each feature inventing its own layout behavior.

This PRD is product-only. It defines the desired user experience, vocabulary,
scope, and open decisions. It does not choose a rendering library, state
architecture, persistence schema, or implementation plan.

## Product Direction Decision

Build this as an app-first Platform workbench capability, not as a standalone
generic "Hyprland for React" library.

The product should still be designed with a clean conceptual core: surfaces,
windows, tab stacks, splits, minimized state, focus, layout recipes, and
placement policy should be separable ideas. But the first product goal is to
make Platform workflows excellent, not to publish or optimize a reusable
external package.

This matters because the differentiated value is semantic, not just geometric.
Search preview, durable search results, diff preview, pinned diff, terminal
lifecycle, file navigator behavior, agent task surfaces, dirty editor close
behavior, and workflow recipes are product concepts. A generic tiling library
would not know enough to make those decisions well.

Extraction can be reconsidered later if the internal model proves stable and
general. Until then, app fit wins over generic reuse.

## Product Thesis

Users should think: "Every meaningful thing I open becomes a surface I can
arrange."

The layout system should preserve familiar editor behavior, but should not be
limited by classic VS Code or Zed chrome. A user should be able to work in a
classic layout, a review layout, an agent-pairing layout, a search-heavy
investigation layout, or a focused one-window layout without switching products
or fighting hardcoded sidebars.

## Problem

Traditional editor layouts treat surfaces inconsistently:

- Files are tabs.
- Terminals are bottom drawers.
- Search is a sidebar or panel.
- Diffs are sometimes editors and sometimes side views.
- File trees are fixed sidebars.
- Agent/chat views are often bolted beside the editor.

This makes the workspace predictable in old editors, but it also creates
unnecessary walls. Search cannot naturally sit beside a live preview. A diff
cannot easily be promoted from browsing state into a durable work surface. A
terminal spawned for a task is not obviously linked to that task. Agent output,
test output, diffs, and editors compete for fixed regions instead of becoming
arrangeable work objects.

Platform needs a layout model where the semantic object comes first and the
presentation comes second.

## Goals

1. Treat every major work artifact as a first-class surface.
2. Let users arrange surfaces with tiling-window-manager power and
   mouse-friendly ergonomics.
3. Support classic editor expectations: tabs, splits, side surfaces, bottom
   terminal, previews, pinned tabs, keyboard navigation, and layout restore.
4. Make search and diff semantics explicit: they can be previews, tabs, tiled
   windows, or minimized surfaces depending on intent and context.
5. Make the rail act like a surface shelf, taskbar, and scratchpad for
   minimized or hidden work.
6. Support workflow-specific layouts without making them separate products.
7. Keep transient browsing surfaces distinct from durable work surfaces.
8. Make layout behavior understandable without requiring users to learn a
   desktop window manager.

## Resolved Product Decisions

### First-Run Layout

The default first-run experience should be the full tiling surface manager, not
a classic fixed-sidebar IDE layout.

Classic editor behavior must still be available and credible, but the default
mental model should be tiled work surfaces plus rail. A new user should
immediately see that primary workspace capabilities are arrangeable surfaces rather
than fixed sidebars and drawers.

### Search Placement

Opening search defaults to a small side-like tiled surface. It should feel
lightweight and familiar, but it is still a real surface. Users can promote,
move, tab, split, maximize, or restore search as a full window/tab when the
workflow calls for it.

Search should be stateful. Opening search should focus or restore the existing
search surface for the workspace when one exists, preserving query, filters,
selection, and results state. Starting a fresh search or clearing the search is
a separate intent.

### Diff Placement

Diffs should default to tab-like behavior, similar to opening a file. A diff can
be previewed or durable, but its default placement should not require a special
diff-only side region in V1.

### Minimize Versus Close

Minimize is only meaningful when there is a place to minimize to: the rail.
Minimizing preserves surface state and keeps the surface recallable. Closing
removes the surface from the workspace, subject to the surface's close rules
such as dirty-file prompts or running-process confirmation.

Transient previews generally should not emphasize minimize. They should be
closed, replaced, or promoted into durable surfaces.

### Default Workspace Style

Windows should have visible gaps by default. The workspace should also have a
wallpaper or background layer visible through those gaps.

The gap is part of the product language: it makes windows feel like movable
surfaces, helps drag/drop targets read clearly, and prevents the workspace from
feeling like a single flat IDE grid. The wallpaper should support the workspace
identity without reducing readability inside surfaces.

Windows should also have a very slight translucent background and background
blur. The effect should be subtle: enough to make surfaces feel layered over the
workspace, but not enough to hurt code readability, terminal contrast, or
performance.

### Agent Surfaces

Agent surfaces are deferred from the first product slice, but they must be an
explicit planning step. The tiling surface manager cannot be considered
complete until we have a product plan for how agent chat, plans, tasks, logs,
patches, artifacts, and terminals become surfaces and how that work connects to
the ongoing agent chat direction.

## Non-Goals

This PRD does not require:

- Choosing a specific layout library.
- Defining persistence schema or migration details.
- Supporting browser popout windows in the first product pass.
- Supporting third-party extension surfaces in the first product pass.
- Making every possible surface freely mixable in every possible location.
- Recreating every Hyprland feature.
- Recreating every VS Code workbench feature.
- Finalizing visual design.

## Core Vocabulary

### Surface

A surface is the product object the user opened or created.

Examples:

- File editor
- Diff view
- Search results
- Terminal session
- File navigator
- Git changes
- Agent chat (future)
- Agent plan (future)
- Diagnostics
- Test output
- Markdown preview

A surface has identity, title, lifecycle, capabilities, and relationship to the
thing it represents. It is not inherently a tab, window, sidebar, or panel.

### Window

A window is a tiled container in the workspace. It can hold one surface or a
stack of tabbed surfaces. A window can be split, resized, moved, focused,
minimized, maximized, or closed.

In this product, "window" means an in-app tiled window, not necessarily a
separate operating-system or browser window.

### Tab

A tab is a surface stacked inside a window. Tabs are useful when multiple
surfaces share context or when the user wants to keep related surfaces in one
region.

Tabs should not be the only way surfaces appear.

### Preview

A preview is a transient surface that can be replaced by the next selection in
the same context.

Examples:

- Selecting a search result previews the matching file.
- Selecting a changed file previews its diff.
- Selecting an agent patch previews the patch diff.

A preview can be promoted into a durable surface.

### Pinned Surface

A pinned surface is protected from replacement. Pinning a preview converts it
into a durable work surface.

### Minimized Surface

A minimized surface is still part of the workspace session but is not currently
visible in the tiled area. It appears in the rail and can be restored.

### Singleton Surface

A singleton surface is a durable surface type that normally has one primary
instance per workspace.

Examples:

- Search results
- File navigator
- Git changes
- Diagnostics

Opening a singleton surface should focus or restore the existing surface when
one exists. If it does not exist, the workspace creates one. This keeps
stateful surfaces like search and git changes from behaving like disposable
commands.

### Rail

The rail is the persistent workbench strip that combines:

- App-level navigation.
- Pinned surfaces.
- Running surfaces.
- Minimized surfaces.
- Workflow/layout entry points.

It should feel closer to a taskbar plus surface shelf plus scratchpad than a
static IDE activity bar. A minimized surface is not just a hidden tab; it is a
recallable workspace object.

### Layout Recipe

A layout recipe is a named arrangement and placement behavior for a workflow.

Examples:

- Classic editor
- Review and changes
- Agent pairing
- Search and investigation
- Focus mode

Recipes should guide default placement without preventing manual arrangement.
They are not only saved starting layouts. A recipe can also affect where new
surfaces open, which preview slot is reused, whether a terminal prefers bottom
or adjacent placement, and how the workspace recovers when surfaces close.

For V1, assume one active recipe per workspace at a time. Multiple saved layout
profiles per project can wait until the core surface model is proven.

### Restore Placeholder

A restore placeholder is a remembered slot for durable work whose backing
resource is not ready yet.

Examples:

- A terminal session reconnecting.
- An agent run still loading.
- A diff whose resources are not hydrated yet.
- A search surface restoring query and result state.

Placeholders let the layout restore meaningful shape before every surface is
fully available.

## Product Principles

### Surface First, Presentation Second

Search is not "a sidebar." Diff is not "an editor tab." Terminal is not "a
bottom drawer." Each is a surface that can be presented in different ways.

### Tiling By Default, Mouse Friendly Always

The workspace should have the power of a tiling manager, but the basic actions
must be obvious with a mouse:

- Drag to split left, right, top, or bottom.
- Drop in the center to tab-stack.
- Drag to the rail to minimize or pin.
- Drag from the rail to restore into the layout.
- Resize with visible, forgiving handles.

Advanced mouse behavior can grow over time. A future refinement should consider
parent-edge drops, where dropping on an outer edge inserts relative to a larger
parent region instead of only splitting the immediate target.

### Drag And Drop Is A Live Layout Preview

Dragging a surface should feel like moving through possible snapped layouts, not
like dragging a floating card over a static page.

As the user drags a surface across the workspace:

- Existing windows should rearrange around the potential drop target.
- The preview should stay snapped to the tiling grid.
- The workspace should communicate the resulting layout before drop.
- Center targets should preview tab-stacking.
- Edge targets should preview directional splits.
- Rail targets should preview minimize/pin behavior.
- Invalid targets should clearly reject the drop.

The ideal feeling is that the workspace is continuously offering valid layouts
as the pointer moves. Releasing the pointer commits the currently previewed
layout. Cancelling the drag restores the prior layout.

### Classic Is A Recipe

The classic editor layout should exist and feel natural: file tree left,
editors in the center, terminal bottom, search/problems as familiar surfaces. But
classic should be one recipe, not the whole architecture.

### Intent Determines Opening Behavior

The same surface type may open differently depending on what the user is doing.
Browsing opens previews. Explicit commands open durable surfaces. Split-open
commands create new windows. Dragging controls final placement.

### Transient Work Should Stay Transient

Browsing search results, git changes, references, diagnostics, or agent patches
should not create dozens of permanent tabs by default. The user should promote
only what matters.

### Layout Should Remember Work, Not Noise

The workspace should restore durable surfaces and meaningful minimized/running
surfaces. It should avoid restoring throwaway previews unless the workflow
requires it.

When durable work cannot be restored immediately, the layout should preserve a
placeholder so the user's workspace shape does not collapse or reorder while
resources load.

### Surfaces Have Capabilities

Not every surface needs every placement. A file editor can be tabbed, split,
previewed, or pinned. A file navigator may prefer narrow side placement. A
terminal may need a minimum usable size. The product should make these
constraints feel natural rather than arbitrary.

### Presentation Modes Are Product Semantics

The initial product should focus on tiled windows, tab stacks, previews, and
minimized rail items. Future presentation modes can include floating surfaces
and stacked groups. A stacked group is different from a tab stack: it shows one
expanded surface plus collapsed sibling rows, which may be useful later for
terminals, logs, agent output, tests, and other dense running surfaces.

### Transient Versus Durable Visual Language

Preview state must be visible, but it should not make the workspace feel noisy.
The best direction is layered cues:

- Preview surfaces get a subtle preview marker in the title/tab area.
- Preview surfaces use a lighter or less solid active indicator than durable
  surfaces.
- Preview surfaces expose an obvious pin/promote action.
- Durable surfaces use the normal title/tab treatment and appear as durable
  work when minimized.
- Running surfaces show running state separately from durable state.

The UI should not rely on color alone. Preview/durable state should be
recognizable through iconography, title treatment, and available actions. The
important user message is: "this can be replaced" versus "this is part of my
workspace."

## User Jobs

### Code Editing

As a developer, I want to open files, split editors, move tabs, and restore my
workspace so I can work with familiar editor muscle memory.

### Search Investigation

As a developer, I want search results and file previews visible at the same
time so I can inspect matches quickly without filling my editor with temporary
tabs.

### Diff Review

As a developer, I want changed files and diffs arranged together so I can review
work without constantly switching between a source list and a diff tab.

### Agent Pairing (Future)

As a developer, I want agent chat, plan, terminal output, patches, and files to
live in one arranged workspace so I can understand and steer the agent's work.

### Terminal Work

As a developer, I want terminals to behave like real work surfaces so I can put
them beside files, stack them, minimize them, or keep them attached to a task.

### Focus

As a developer, I want to temporarily focus one surface or one small group of
surfaces, then return to my prior layout.

## Opening Semantics

Opening behavior should be based on intent and context.

### File Editor

Default behavior:

- Opening a file from ordinary navigation opens it as a tab in the active
  editor window.
- Opening a file from preview-oriented navigation may reuse a preview surface.
- Split-open creates or targets a separate tiled window.
- Dragging a file into a drop zone controls final placement.

Expected promotions:

- Editing a previewed file promotes it.
- Pinning a previewed file promotes it.
- Explicit open commands create durable surfaces.

### Search

Search should have at least two product surfaces:

- Search results surface.
- Search preview surface.

Default behavior:

- Opening global search creates or focuses a small side-like search results
  surface.
- Selecting a result shows a linked preview surface.
- Pressing Enter or explicitly opening a result promotes it into an editor
  surface.
- The search results surface can be tiled, tabbed, minimized, or pinned like
  other durable surfaces.
- Search can be promoted to a larger tiled window or tabbed into an existing
  window.

Important behavior:

- Browsing results should not create one durable tab per selection.
- The preview should be easy to promote.
- Search should work in classic layout and in search/investigation recipe.

### Diff

Diff should have preview and durable forms.

Default behavior:

- Selecting a changed file from git or review context opens a diff like a file
  tab by default.
- Browsing-oriented contexts may mark that diff as replaceable preview state.
- Explicitly opening or pinning a diff creates a durable diff surface.
- Pinning a diff preview promotes it.
- A durable diff can remain a tab, become a tiled window, or be minimized like
  any other durable surface.

Important behavior:

- A diff should preserve its semantic identity: working tree diff, staged diff,
  branch comparison, PR file diff, agent patch diff, or arbitrary two-resource
  diff.
- Diff preview should be linked to the source selection that produced it.
- V1 should avoid a special default diff-only side region unless a recipe
  explicitly chooses one.

### Terminal

Default behavior:

- Opening a terminal creates a terminal surface.
- Recipe and context decide whether it appears bottom, adjacent, current
  window, or minimized/running.
- Terminals should be restorable from the rail if minimized.

Important behavior:

- A terminal spawned by an agent/task should remain associated with that
  workflow.
- Hiding or minimizing a running terminal should not imply stopping it.

### File Navigator

Default behavior:

- File navigator is a durable navigation surface, usually focused or restored
  from the rail and commonly placed in a narrow side window.
- It can be visible alongside search, diff, and editors when the user wants
  that arrangement.

Important behavior:

- The file navigator should not be hardcoded as the only left-side object.
- It should remain easy to restore to classic placement.
- Opening the file navigator should restore its existing workspace state when
  possible, including expansion and selection.

### Git Changes

Default behavior:

- Git changes is a durable singleton workspace surface.
- Opening Git Changes focuses or restores the existing git surface when one
  exists.
- Its state should preserve useful workflow context such as selected file,
  grouping, staged/unstaged view, filters, and linked diff selection.
- Selecting a changed file opens a diff like a file tab by default.

Important behavior:

- Git Changes should not be hardcoded as a fixed sidebar.
- Git Changes can be tiled beside search, diffs, terminals, and editors.
- Review/change recipes may choose a stronger git-focused arrangement, but the
  surface remains the same product object.

### Agent Surfaces (Future)

Agent work may include multiple surfaces:

- Chat.
- Plan.
- Tasks.
- Logs.
- Terminal output.
- Patches.
- Artifacts.

Default behavior:

- Agent recipe should arrange related surfaces together.
- Agent-generated diffs and artifacts should preview first and promote on
  intent.
- Agent surfaces should be restorable and recognizable from the rail.

This is a required follow-up product plan, not an initial implementation
surface set.

## Rail Requirements

The rail should support:

1. Focusing or restoring primary workspace surfaces.
2. Showing active/running durable surfaces.
3. Showing minimized surfaces.
4. Restoring minimized surfaces into the current layout.
5. Pinning important surfaces.
6. Making hidden work discoverable.
7. Supporting keyboard navigation and command palette actions.
8. Preserving scratchpad-like minimized work without treating it as closed.

The rail should not become a dumping ground of every transient preview. It
should show meaningful durable or running work.

Rail items should be visually distinguishable by category:

- Surface: stateful work object that already exists.
- Recipe: workspace mode or placement behavior.

Surface creation actions still exist in commands and local UI affordances, but
they are not the primary rail object. The rail should bias toward stateful
surfaces: Search Results with its query, Git Changes with its selected file,
Terminal with its session, and File Navigator with its expanded tree.

## Tiling Experience Requirements

Users should be able to:

1. Split a window left, right, top, or bottom.
2. Drop a surface onto a window center to tab it.
3. Tear a tab into a new tiled window.
4. Move a surface from one window to another.
5. Resize windows with mouse handles.
6. Maximize and restore a window.
7. Minimize a window to the rail.
8. Restore a minimized surface from the rail.
9. Close a surface.
10. Close a window.
11. Move focus directionally.
12. Cycle through surfaces by MRU order.
13. Reset to a recipe layout.

Mouse behavior should be forgiving. Dragging should live-preview the resulting
snapped layout before the user releases the pointer. The layout preview should
make it clear whether the surface will split, tab-stack, minimize to rail, pin,
or be rejected.

Keyboard behavior should be complete enough that power users can operate the
layout without touching the mouse.

## Layout Recipes

### Classic Editor

Expected shape:

- File navigator in a left-side region.
- Editor windows in the center.
- Terminal/problems/output in a bottom region.
- Search can appear in a familiar side or panel location.
- Diffs can behave like editor tabs or split views.

Purpose:

- Preserve familiar VS Code/Zed muscle memory.
- Provide a safe default for users who do not want a new mental model on day
  one.

### Search And Investigation

Expected shape:

- Search results visible as a small side-like durable surface by default.
- Search preview visible beside results.
- Promotion path from preview to editor is clear.
- Multiple durable findings can be collected without losing the result set.

Purpose:

- Make large-codebase navigation faster.
- Avoid temporary-tab clutter.

### Review And Changes

Expected shape:

- Git changes, PR files, or branch stack list visible.
- Diff opens like a file tab by default, with preview state when browsing.
- Durable diffs can be pinned.
- Test output or terminal can sit beside or below the review.

Purpose:

- Make git review and change inspection feel native.
- Capture the fresh GitButler-like workflow without copying its exact UI.

### Agent Pairing

Expected shape:

- Agent chat and/or plan visible.
- Active file/diff visible.
- Terminal/task output visible or easy to restore.
- Agent patches and artifacts preview before promotion.

Purpose:

- Make agent work understandable and steerable.
- Keep generated work, logs, and files in one coherent workspace.

### Focus Mode

Expected shape:

- One surface or one small surface group takes priority.
- Other surfaces are hidden or minimized without being destroyed.
- Returning to previous layout is easy.

Purpose:

- Support deep editing, reading, debugging, and review.

## Surface Lifecycle

### Transient

Transient surfaces are replaceable and usually not restored permanently.

Examples:

- Search preview.
- Git diff preview.
- Reference preview.
- Agent patch preview (future).

### Durable

Durable surfaces are intentional work objects.

Examples:

- Open file editor.
- Pinned diff.
- Search results.
- Running terminal.
- Agent chat (future).
- File navigator.

### Running

Running surfaces represent active processes or sessions.

Examples:

- Terminal session.
- Agent task (future).
- Test run output.

Running surfaces should remain visible in the rail when hidden or minimized.

### Placeholder

Placeholder surfaces represent durable work that is known to the workspace but
not fully hydrated yet.

Examples:

- Terminal reconnecting.
- Agent task loading (future).
- Diff resources loading.
- Search state restoring.

Placeholders should preserve the user's layout shape and then resolve into the
real surface when available.

## Classic Compatibility Requirements

The product should support:

- Open file.
- Open file to side.
- Split left/right/up/down.
- Move tab to new window.
- Move tab between windows.
- Preview tab behavior.
- Pin tab behavior.
- Close active surface.
- Close other surfaces in a tab stack.
- Reopen closed surface.
- Toggle file navigator.
- Toggle terminal.
- Toggle search.
- Focus left/right/up/down.
- Maximize/restore active window.
- Restore previous workspace layout.
- Reset to classic layout.

These behaviors can be presented through the new surface model; they do not
require copying old editor internals.

## Product Boundaries

### Surfaces That Should Be First-Class In The Initial Product

- File editor.
- Diff.
- Search results.
- Search preview.
- Terminal.
- File navigator.
- Git changes or review list.
- Diagnostics/problems.

### Surfaces That Can Wait

- Extension-contributed custom views.
- Browser popout windows.
- Multi-monitor behavior.
- Deep saved profile management.
- User-authored layout scripts.
- Collaborative shared layout state.
- Agent surfaces implementation.

### Required Follow-Up Product Plans

- Agent surfaces plan: define how agent chat, plans, tasks, logs, patches,
  artifacts, terminals, and generated diffs map to surfaces and recipes.
- Placement policy plan: choose the best automatic placement behaviors from the
  reference set after the basic tiling interactions are proven.

### Presentation Modes That Can Wait

- Floating surfaces.
- Stacked groups.
- User-authored layout scripts or algorithms.
- Multi-window browser popouts.

## UX Risks

### Too Much Freedom

Arbitrary tiling can become confusing. Recipes, placement defaults, and clear
drop previews are required.

### Losing Classic Muscle Memory

Users should not feel punished for expecting editor tabs, sidebars, and bottom
terminals. Classic layout must be credible.

### Tab Explosion Becomes Window Explosion

The system must prevent browsing actions from creating durable surfaces by
default. Preview semantics are critical.

### Rail Overload

The rail should show important durable/running/minimized surfaces, not every
temporary selection.

### Tiny Useless Windows

Surfaces need sensible placement constraints and clear feedback when a surface
cannot be meaningfully placed in a small area.

### Ambiguous Close/Minimize Behavior

Closing, minimizing, hiding, and stopping a running process must be visibly
different actions.

## Success Criteria

The feature is successful when:

1. Users can arrange files, search, diffs, terminals, and workspace
   capabilities as peer surfaces.
2. Search and diff browsing uses previews without creating clutter.
3. Users can promote previews into durable surfaces.
4. Users can tear tabs into tiled windows and tab windows back together.
5. The rail makes minimized and running work easy to find.
6. Classic editor workflows still feel familiar.
7. At least one non-classic recipe feels meaningfully better than a VS Code/Zed
   clone.
8. Users can understand mouse drag/drop outcomes before committing.
9. Dragging a surface previews snapped layouts and rearranges surrounding
   windows before drop.
10. The layout restores meaningful work without restoring throwaway noise.
11. Restore placeholders preserve meaningful layout shape while durable
    surfaces hydrate.
12. Keyboard-driven users can operate core layout actions through commands.

## Open Product Questions

1. Which surfaces are allowed to tab together by default?
2. Should file navigator be minimizable like every other surface, or should it
   have special always-available behavior?
3. What visual language makes tiling obvious without looking like desktop
   window chrome?
4. How should users distinguish transient preview from durable surface at a
   glance beyond the proposed marker, title treatment, and pin action?
5. Which agent surfaces belong in the agent surfaces plan, and which are
   blocked by ongoing agent chat work?
6. How much automatic placement should happen before it feels like the product
   is fighting the user?
7. Which advanced mouse interactions, such as parent-edge drop, should wait
   until after the basic edge/center drop model is proven?
8. Which future presentation modes, especially stacked groups, are important
   enough to influence V1 vocabulary even though they are deferred?
9. How much live rearrangement during drag feels helpful before it becomes
   visually distracting?

## Recommended Product Slice

The first product slice should prove the central model:

1. File editor, search results, search preview, diff preview, durable diff,
   terminal, and file navigator are surfaces.
2. Surfaces can appear as tiled windows or tabs.
3. Tabs can be torn into tiled windows.
4. Search and diff browsing use replaceable previews.
5. Previews can be promoted.
6. Windows can be minimized to and restored from the rail.
7. Classic recipe is usable.
8. Restore placeholders exist for durable surfaces that are not ready
   immediately.
9. Stacked groups and floating surfaces are explicitly deferred.
10. Agent surfaces have a dedicated product plan, even though implementation is
    deferred.
11. One distinctive recipe, likely review/search, demonstrates
    why this is better than a clone.

## Relationship To Prior Workbench Direction

The prior dockable workbench direction correctly identified that editors,
diffs, terminals, and search should be peer work surfaces. This PRD expands the
product vision from "dockable panels" to "tiling surface manager."

The product requirements here should be treated as the higher-level direction.
Any docking, splitting, or tabbing technology should serve this product model,
not define it.
