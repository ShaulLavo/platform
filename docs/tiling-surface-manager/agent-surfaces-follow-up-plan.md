# Agent Surfaces Follow-Up Plan

Date: 2026-06-07

Status: follow-up plan for agent-native surfaces after the first workflow recipes.

## Scope

This plan covers the surfaces needed for agent workflows without adding lane,
dock, or sidebar primitives. Each item must remain a normal surface registry
entry with explicit lifecycle, owner context, placement, persistence, and close
policy.

## Surface Inventory

- Chat: existing durable singleton surface. The Agent Pairing recipe places it
  in the left tool pane as the primary coordination surface.
- Plans: future durable surface, probably singleton per workspace or per agent
  run. It should store structured plan steps and expose command actions for
  focus, accept, reject, and archive.
- Tasks: future durable surface for queued or running agent work. It should be
  context-owning so logs, patches, artifacts, and terminals can attach through
  `ownerSurfaceId` and `ownerContextKey`.
- Logs: existing durable singleton surface. Future per-run logs should either be
  singleton-per-context logs or child surfaces owned by a task surface.
- Patches: future reviewable patch surfaces. Prefer generated `diff` surfaces
  first; add a dedicated patch surface only when it carries state that a diff
  cannot model.
- Artifacts: future preview surfaces for generated files, images, documents, or
  structured output. Use singleton-per-context ownership when the artifact is
  tied to an agent run.
- Terminals: existing running surfaces. Agent-owned terminals should keep the
  current running lifecycle and attach to the owning task/run context.
- Generated diffs: use existing `diff` surfaces with stable resource keys until
  review workflows need richer patch metadata.

## Placement Model

- Agent Pairing recipe: Chat in the left tool pane, files and diffs in the
  editor center, logs and terminals in the bottom pane, supporting tools in the
  rail.
- Plans and tasks should open through recipe placement, not raw window IDs.
- Agent-owned logs, terminals, patches, artifacts, and generated diffs should
  prefer the owner task or chat context before falling back to the active recipe.
- User drag/repositioning of any agent-owned surface should create manual
  placement memory through the shared placement policy, not through
  agent-specific layout state. Agent surfaces follow the same sticky snapped
  preview rule as every other surface: no visible drop zones and no unsnapped
  floating drag state.

## Implementation Sequence

1. Add only the surface registry entries that have a renderer ready.
2. Define owner context keys for agent run, task, patch, artifact, and terminal
   surfaces before persistence is enabled.
3. Route the first agent task workflow through `WorkspaceLayoutCommand` and the
   Agent Pairing recipe.
4. Persist run/task surfaces with explicit close policies and restore warnings
   for missing owner contexts.
5. Add operation and persistence tests for owner cleanup, restore, focus order,
   generated diff review, and running terminal preservation.

## Non-Goals

- No GitButler-style lane primitive in V1.
- No synthetic placeholder surface types without renderers.
- No second layout tree for agent work.
- No agent-only sticky placement rules.
