# Placement Policy Follow-Up Plan

Date: 2026-06-07

Status: follow-up plan after real snapped drag/reflow and basic tiling behavior
are proven.

## Scope

The current model records sticky placement only from explicit user moves and
falls back to recipe placement when that memory is invalid. This follow-up turns
that behavior into an explicit policy contract with richer validation and
constraint handling.

## Policy Inputs

- Active recipe and recipe slot for the surface type.
- Surface capabilities and valid placement kinds.
- Manual placement memory created by user drag/repositioning or explicit move
  commands.
- Target existence and visibility for window, parent, and root destinations.
- Current layout geometry, viewport size, collapsed state, and split sizes.
- Surface-specific minimums for editor, tool, terminal, preview, and review
  surfaces.

## Placement Memory

Replace raw sticky placement records with versioned placement memory:

- `placement`: the concrete `SurfacePlacementHint`.
- `source`: `manual` for user-created memory.
- `recipeId`: the recipe active when memory was created.
- `updatedAtMs`: optional timestamp for future diagnostics and pruning.
- `lastValidatedAtMs`: optional timestamp if validation becomes expensive.

Existing persisted raw placement records can migrate to manual memory when they
were written by move operations. Invalid or ambiguous records should be dropped
with a restore warning rather than retried forever.

## Validation Rules

- The target window or parent path still exists.
- The target is visible and not collapsed in a way that prevents insertion.
- The surface type allows the placement kind.
- The active recipe still allows the requested recipe slot.
- Geometry constraints pass, including editor minimum width, tool-pane minimum
  width and height, terminal minimum height, and preview size.
- Recipe limits pass, including maximum side columns or packed tool rows if
  those limits are introduced.

## Policy Result

Each placement decision should return one of:

- Reuse manual placement.
- Demote manual placement and fall back to recipe placement.
- Clear invalid memory and fall back to recipe placement.
- Send the surface to rail or background when no visible placement is valid.

The result should include a reason code so tests and diagnostics can explain why
manual memory was reused, demoted, or cleared.

## Test Plan

- Manual placement overrides recipe defaults only when every validation rule
  passes.
- Invalid target, hidden target, invalid surface type, invalid recipe slot, and
  failed geometry constraints clear or demote memory.
- Recipe placement still order-packs left tool surfaces after invalid memory is
  cleared.
- Singleton restore reuses the last useful valid placement without moving
  durable surfaces unexpectedly.
- Running terminals preserve user-created placement unless reset by recipe or a
  new default terminal command.
