# Default Recipe

Date: 2026-06-06

Status: canonical V1 default recipe spec. This document defines the intended
default placement behavior. The implementation must use ordinary
surface-manager primitives: surfaces, windows, split nodes, rail state, and
recipe policy. Do not add a sidebar, dock, lane, or compatibility model to
represent this recipe.

## Reference

![Default recipe reference](assets/default-recipe-reference.jpg)

Editable source:
[Default recipe Excalidraw](https://excalidraw.com/#json=BAGs6x7SfdOmOPEjg0mWH,ETjVHiwYfRZRVSK3G1krSA).

The sketch uses the label "sidebar" as product shorthand. In code and durable
state this is a nested pane shape made from ordinary windows and split nodes,
not a model primitive.

## Vocabulary

- Rail: command/status surface for focusing, expanding, collapsing, opening, and
  toggling surfaces or recipe-controlled panes. It is not layout storage and
  never stores collapsed panes.
- Collapsed pane: a normal recipe-placed window that remains in the split tree
  but renders as a fixed accordion header. Collapse is presentation state only.
- Tool surfaces: Files, Search, Git, Chat, and Logs.
- Main surfaces: file editors, diffs, and promoted previews.
- Bottom tool pane: Terminal and Problems grouped at the bottom of the
  editor/main panel. Terminal sessions are running surfaces; the bottom pane is
  recipe placement, not a temporary bridge.
- Nested panes: ordinary split-tree sublayouts that allow multiple windows on
  one side of the workspace without introducing `leftDock`, `rightDock`,
  `bottomDock`, `sidebar`, or lane node kinds.

## Default Shape

- The default recipe creates ordinary split nodes only.
- Tool surfaces prefer a left nested tool-pane group.
- Main surfaces prefer the main view to the right of the tool-pane group.
- The bottom tool pane is nested under the editor/main panel. It does not span
  under the left tool-pane group and excludes the rail.
- Terminal and Problems prefer the bottom tool pane when opened from the rail,
  command palette, or default terminal command.
- If Terminal is the first visible surface, it may temporarily use the available
  work area. Opening the first normal content or tool surface reshapes the
  recipe so Terminal/Problems move to the bottom of the editor/main panel unless
  the user has manually placed that terminal elsewhere.
- Recipe-managed tool surfaces are order-packed, not appended to whatever split
  happened to exist before. Files, Search, Git, Chat, and Logs are packed from
  the current visible recipe-managed set in stable recipe order whenever that
  set changes.
- Opening, closing, collapsing, or expanding a recipe-managed tool recomputes
  the left tool-pane group from the ordered visible set. It must not preserve
  accidental incremental split nesting that keeps shrinking older panes.
- User drag/repositioning or explicit move creates sticky manual placement and
  opts that tool surface out of automatic order packing while the target remains
  valid. Dragging uses the global sticky snapped preview: no visible drop zones
  are shown, and the current layout reflows to the exact release result.
- The same split-tree primitives must support:
  - three tool windows stacked on the left;
  - one main item taking the full right side;
  - Terminal/Problems nested below the main item, not below the left tools.

When no main surface is visible, the first tool surface may use the available
work area. Opening a main surface creates or restores the main view and moves
tool surfaces back into the left nested tool-pane group through recipe
placement.

## Rail Behavior

- Clicking a background or absent tool surface inserts or restores it into the
  left nested tool-pane group through recipe placement.
- Clicking a visible inactive expanded tool surface focuses it.
- Clicking the active expanded tool surface collapses its pane into an
  accordion header in place.
- Clicking a collapsed tool surface expands and focuses it.
- Clicking Terminal toggles the whole bottom tool pane under the editor/main
  panel, not only the Terminal tab.
- Terminal is special only as default recipe policy. Snapping a terminal to the
  left, right, or another split creates sticky manual placement; rail/default
  terminal actions should not force that terminal back to the bottom until the
  user resets the recipe or opens a new default bottom-pane terminal.
- Logs is a tool surface in the left nested tool-pane group. It is not part of
  the Terminal/Problems bottom pane.

## Close And Restore Rules

- Tab close closes only that surface/tab.
- Window or pane close acts on the whole represented pane/window when the chrome
  is pane-level.
- Collapse/minimize never decides whether a surface keeps running, unmounts UI,
  or disposes state. Surface registry lifecycle/render policy decides that.
- Close removes the represented surface/window from the visible layout. Registry
  close policy independently decides whether state or sessions are disposed,
  kept in the background, suspended, or protected by confirmation.
- Bottom tool pane close hides the Terminal/Problems pane and preserves its
  surfaces.
- Restore may reuse manual or sticky placement only when the memory was created
  by a user action, its target window still exists and is visible, the surface
  type is still valid for that placement, and current constraints pass.
- Constraint checks include editor minimum width, tool-pane minimum width and
  height, terminal minimum height, viewport size, and recipe limits such as
  maximum side columns or rows.
- Stale or constraint-failing placement memory is cleared or demoted before
  falling back to default recipe placement/order packing. Invalid memory must
  not keep retrying on later restores.
- Rail open/restore means "make the recipe place this surface," not "reuse the
  last raw window id."

## Implementation Constraints

- No `sidebar` code primitive.
- No `leftDock`, `rightDock`, or `bottomDock` roots.
- No generic lane node kind for this recipe.
- No compatibility shim or duplicate layout truth.
- If insertion helpers are missing, add nested split placement helpers over the
  existing normalized model instead of adding a new layout model.
