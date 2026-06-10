# Behavior Contracts

Date: 2026-06-10

Status: durable invariants for the tiling surface manager. These are the rules
that stay true across refactors. This doc replaces the contract content of the
deleted `implementation-plan.md` and `technical-design.md` (both recoverable
from git history). It intentionally contains no implementation detail — module
shapes, package versions, and mechanics drift, and the code is their source of
truth.

## Source Of Truth Map

- Layout model, operations, selectors, geometry, persistence:
  `apps/web/src/features/tiling-surface-manager/engine/` and its tests.
- Production workbench rendering and interaction:
  `apps/web/src/features/workbench/`.
- Drag/snap interaction direction (overlapping snap candidates, resolver
  priority/hysteresis, attached tab motion):
  `apps/web/src/features/dnd-proof/`. The proof supersedes any older written
  drag mechanics. Known proof gaps are tracked in `backlog.md`.
- Default placement and recipe semantics: `default-recipe.md` (canonical).
- Product requirements: `prd.md`.

## Model Non-Negotiables

- Platform owns surface identity, lifecycle, persistence, command routing, and
  placement policy.
- Surfaces are not tabs, panels, docks, lanes, sheets, or windows. Those are
  presentations.
- A window remains a window even with one surface.
- Stable IDs are durable. Tree paths are render addresses only; file paths may
  still be stable resource keys.
- The durable source of truth is the normalized model: `surfacesById`,
  `windowsById`, `nodesById`, `rootNodeId`, `rail`, active/MRU state, and
  recipe/policy state. Nested trees are derived selector output.
- Operations are pure TypeScript and normalize before commit.
- React components render state and dispatch operations; they do not own
  durable layout logic.
- Zustand state is normalized and selector-driven.
- No top-level `leftDock`, `rightDock`, or `bottomDock` roots. Classic side and
  bottom regions are ordinary split nodes created by recipe and placement
  policy. No generic `lane`, `stacked`, `floating`, or `spatial` node kinds
  until a prototype proves they must become general primitives.
- Once a behavior is rehosted on the surface manager, the old owner is deleted
  in the same change. No compatibility shims, aliases, or duplicate layout
  truth.

## Lifecycle Semantics

- Collapse is presentation state. It collapses a visible window in place into
  an accordion header and is independent from runtime lifecycle. Collapsed
  windows stay in the split tree; they do not move into rail state.
- Backgrounding removes a surface from visible windows and keeps it
  addressable through rail state when policy allows it.
- Close removes the surface/window from visible layout. Registry close policy
  independently decides whether state or sessions are disposed, suspended,
  kept in the background, or protected by confirmation.
- Running surfaces stay mounted while collapsed, hidden, or backgrounded only
  when registry render policy requires it.
- Transient previews are replaced, promoted, or closed. They generally do not
  collapse.
- The rail is a command/status surface, not layout storage. It never stores
  collapsed panes.

## Drag And Drop Contract

- All normal tabs in the app use the same Chrome-style tab implementation and
  interaction model. This is not editor-only.
- Locked, pinned, protected, or otherwise special tabs are modeled through
  explicit capabilities, never through one-off tab implementations.
- Tabs stay attached to their own tab bar by default. Horizontal drag reorders
  inside the strip; the dragged tab follows the pointer, siblings animate out
  of the way, and reorder commits only on release.
- A tab becomes a workbench surface/window drag only after the pointer crosses
  the detach threshold/buffer.
- Detached tabs immediately use the workbench snap-preview system. They do not
  float freely, pop out, or show an unsnapped pane preview.
- During a window/surface drag, the layout previews the snapped destination
  live. The destination can change while dragging; the operation commits only
  on release, and cancel restores the prior layout.
- Dragging over resize handles, split overlays, or panel handles must not
  cancel a drag.
- No native browser drag ghost, default browser drop animation, visible
  drop-zone layer, target-zone overlay, placeholder slot, or separate drop
  target chrome. The preview is the layout and the tabs themselves moving.
- Snap destinations (`window-center`, `window-edge`, `parent-edge`,
  `root-edge`, `recipe-slot`, `background`) are hit-tested privately. Logical
  hit candidates may overlap; resolver priority and hysteresis own intent
  instead of mutating candidate geometry to avoid overlaps.
- App code depends on `@dnd-kit/react` (plus `@dnd-kit/dom` where required).
  Lower-level dnd-kit packages are not imported directly by app code.
- Live drag preview state stays separate from committed `WorkspaceLayout`.

## Resize Contract

- Resize is live: pointer movement dispatches incremental `resizeSplit`
  operations immediately, both adjacent panes reflow, and the handle stays on
  the rendered split boundary. No transform-only resize previews.
- Stored split sizes remain normalized ratios; pointer-to-ratio conversion
  uses measured rendered split geometry, not a fixed reference constant.
- Resizers are constraint-aware: a requested size that would break a surface's
  minimums is rejected or clamped.

## Persistence Contract

- Persistence writes `WorkspaceLayout` with layout version and stable
  resource/session keys.
- Restore matches by stable keys, recovers as much as possible from corrupt
  layout state, and routes orphaned surfaces to a default location instead of
  failing.

## Compatibility Baseline

The workbench must keep feeling like a credible code editor. Familiar
behaviors that must not regress:

- Split editor left/right/up/down; move editors between groups; move windows
  and individual surfaces between split positions; tab a surface into another
  window.
- Drag whole windows and individual tabs/surfaces.
- Close active / others / left / right / clean; reopen closed editor.
- Preview editors promoted by edit or pin; pinned tabs protected from
  ordinary close.
- Active-group and MRU navigation; focus movement left/right/up/down.
- Maximize/restore, collapse/expand, toggle recipe panes (side tools, bottom
  terminal).
- Workspace layout restore after reload; graceful reset of corrupt layouts.
- Every layout operation is command-addressable through the command palette
  and keymap.
