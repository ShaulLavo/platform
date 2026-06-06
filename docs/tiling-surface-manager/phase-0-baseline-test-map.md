# Tiling Surface Manager Phase 0 Baseline And Test Map

Date: 2026-06-05

Status: Phase 0 tracking checklist for `implementation-plan.md`.

## Current Layout Owners

- [ ] `EditorWorkspaceStore` layout fields.
      Replacement phase: Phase 4 store creation, production cutovers in Phases
      7-12, with final deletion in Phase 15.
- [ ] `apps/web/src/features/editor/state/editor-pane-state.ts`.
      Replacement phase: Phase 3 pure operations, Phase 7 file/diff cutover,
      and Phase 15 deletion.
- [ ] `WorkbenchDockview` and `workbench-dockview-model.ts`.
      Replacement phase: Phase 6 renderer skeleton, Phase 7 production cutover,
      and Phase 15 deletion.
- [ ] `WorkspaceSidebar` and sidebar tab state.
      Replacement phase: Phase 8 rail, collapsed-pane, and singleton surface
      rehost.
- [ ] `WorkspaceFloatingTerminal` and terminal overlay store.
      Replacement phase: Phase 10 running terminal surface rehost.
- [ ] `WorkspaceSearchRuntime` sidebar/search-buffer enablement.
      Replacement phase: Phase 9 search surface lifecycle.
- [ ] `workspace-cache.ts`.
      Replacement phase: Phase 12 layout cache replacement.
- [ ] `keymap/commands.ts`.
      Replacement phase: Phase 11 command retargeting.
- [ ] `apps/web/src/keymap/command-registry.ts`,
      `apps/web/src/keymap/default-bindings.ts`, and
      `apps/web/src/keymap/active-bindings.ts`.
      Replacement phase: Phase 11 command palette, hotkey preset, and layout
      command upgrade.
- [ ] `apps/web/src/components/app-command-surface.tsx`.
      Replacement phase: Phase 11 command surface wiring upgrade.
- [ ] `apps/web/src/components/command-palette.tsx` and
      `apps/web/src/components/command-palette/*`.
      Replacement phase: Phase 11 Window Management command palette upgrade.
- [ ] `apps/web/src/features/workbench-spike`.
      Replacement phase: Phase 15 cleanup after tests capture useful learnings.

## Test Disposition

- Keep behavior tests for dirty close confirmation.
- Keep behavior tests for diff restore and invalid diff dropping.
- Keep behavior tests for search state preservation.
- Keep behavior tests for terminal close/runtime policy.
- Keep behavior tests for command IDs, aliases, and keymap routing.
- Keep behavior tests for command palette grouping, shortcut display, quick
  access modes, and command filtering.
- Keep behavior tests for workspace cache recovery and corrupt layout fallback.
- Keep behavior tests for focus fallback.
- Rewrite editor-pane split, move, reorder, close, resize, and active-pane tests
  as surface/window/node operation tests once Phase 3 lands.
- Rewrite fixed sidebar tab tests as rail, collapsed-pane, and singleton surface
  tests once Phase 8 lands.
- Rewrite Dockview sync and tab model tests as renderer adapter or custom
  renderer tests once Phase 6 lands.
- Rewrite floating terminal overlay tests as running surface lifecycle tests
  once Phase 10 lands.
- Rewrite command palette disabled-state tests so availability comes from
  surface/window capabilities instead of selected file path alone.
- Add tests for Window Management command rows, aliases, hotkey presets,
  cycling behavior, custom window commands, and saved layout command execution
  once Phase 11 lands.
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
