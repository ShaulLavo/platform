# Tiling Surface Manager Phase 0 Baseline And Test Map

Date: 2026-06-05

Status: Phase 0 tracking checklist for `implementation-plan.md`.

## Current Layout Owners

- [ ] `EditorWorkspaceStore` layout fields.
      Replacement phase: Phase 5 store integration, with final deletion in Phase 9.
- [ ] `apps/web/src/features/editor/state/editor-pane-state.ts`.
      Replacement phase: Phase 3 pure operations and Phase 8 command migration.
- [ ] `WorkbenchDockview` and `workbench-dockview-model.ts`.
      Replacement phase: Phase 6 renderer cutover.
- [ ] `WorkspaceSidebar` and sidebar tab state.
      Replacement phase: Phase 7 rail and singleton surface rehost.
- [ ] `WorkspaceFloatingTerminal` and terminal overlay store.
      Replacement phase: Phase 7 running terminal surface rehost.
- [ ] `WorkspaceSearchRuntime` sidebar/search-buffer enablement.
      Replacement phase: Phase 2 registry contract and Phase 7 surface lifecycle.
- [ ] `workspace-cache.ts`.
      Replacement phase: Phase 5 layout persistence and restore.
- [ ] `keymap/commands.ts`.
      Replacement phase: Phase 8 command retargeting.
- [ ] `apps/web/src/features/workbench-spike`.
      Replacement phase: Phase 9 cleanup after tests capture useful learnings.

## Test Disposition

- Keep behavior tests for dirty close confirmation.
- Keep behavior tests for diff restore and invalid diff dropping.
- Keep behavior tests for search state preservation.
- Keep behavior tests for terminal close disposal.
- Keep behavior tests for command IDs, aliases, and keymap routing.
- Keep behavior tests for workspace cache recovery and corrupt layout fallback.
- Keep behavior tests for focus fallback.
- Rewrite editor-pane split, move, reorder, close, resize, and active-pane tests
  as surface/window/node operation tests once Phase 3 lands.
- Rewrite fixed sidebar tab tests as rail and singleton surface tests once Phase
  7 lands.
- Rewrite Dockview sync and tab model tests as renderer adapter or custom
  renderer tests once Phase 6 lands.
- Rewrite floating terminal overlay tests as running surface lifecycle tests
  once Phase 7 lands.
- Delete tests that only preserve old editor-pane implementation details after
  equivalent surface-manager behavior tests exist.
- Delete tests that only preserve fixed sidebar implementation details after
  equivalent rail behavior tests exist.
- Delete Dockview spike tests and fixtures after useful learnings are covered by
  the production surface-manager tests.

## Exit Criteria

- [x] Current layout owners are listed with replacement phases.
- [x] Tests are marked as keep, rewrite, or delete by behavior category.
- [x] No production code changes are required for Phase 0.
