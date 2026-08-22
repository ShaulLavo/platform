# 12-Week State-Correctness Architecture Roadmap

## Summary

Build a staged remediation plan for one sequential implementer on a feature branch. Temporary breakage is acceptable inside the branch, but every milestone must end with typecheck/tests passing and the app usable for core editor workflows.

Primary goal: remove duplicated truth. The finished system has one authoritative workspace document model, deterministic file sync, explicit command/focus transitions, React as a renderer of projections, and workers/resources with clear ownership.

## Current execution order

This is the authoritative cross-project order. `plans/README.md` is an inventory of executable plans, not a second roadmap.

1. **Plan 049b — JSON language server for settings: ready, reconcile first.** Multi-server routing is complete. Its registry assumptions have since drifted because the generic JSON/CSS/HTML server and server-selection policy landed with the multi-server review fixes; reconcile those facts before executing its settings-schema and synthetic-document work.
2. **Editor BiDi geometry Tier B: open and independent.** Tier A M1-M5 is verified complete; M6-M7 may proceed without Plan 049b or environment work.
3. **Plan 055 — ghostty-webgpu DOM/input: ready.** Phase 2 is complete. Keep its package work isolated from Platform environment integration, which remains a later phase.

Completed prerequisite: Plan 050 now provides ordered server sets, runtime capability arbitration, composite diagnostics/status, and shared-pool diff-session leases across Editor and Platform. Do not recreate those concerns in Plan 049b.

Success criteria:

- One live text buffer per workspace document; tabs own view state only.
- Dirty, saved, conflict, revision, and undo state have one owner.
- File sync correctness no longer depends on watcher timing, debounce windows, or retry luck.
- React effects no longer coordinate document/save/conflict/command transactions.
- Command, keyboard, focus, worker, LSP, and persistence boundaries are explicit and testable.

## Key Architecture Changes

- Add `WorkspaceDocumentService` outside React. It owns `DocumentId`, `DocumentSession`, document version, dirty state, save state, conflict state, undo history, and per-view attachments.
- Replace per-tab cloned sessions with `DocumentViewState`: tab id, pane id, cursor/selection policy, scroll, folds, reveal target, and editor instance metadata.
- Add `FileSyncService` as the only bridge between document state and server files. Its API uses `{ path, version, writeId, origin }`, and file watcher events become invalidation hints, not correctness proof.
- Add a typed `CommandBus`. Commands declare id, target, preconditions, transaction effects, async behavior, and undo category. Keyboard handlers only resolve and dispatch commands.
- Replace focus counters and active-dispatch pointers with `FocusService`: current focus owner, requested transition, transition result, and explicit editor-focus acknowledgements.
- Keep TanStack Query for server state: tree, git, search results, metadata. Do not use query cache as authoritative document text.
- Keep Zustand only for UI projections and ephemeral UI state. It should subscribe to domain services, not own domain facts.
- Consolidate LSP behind one app-facing `LspService`. Server owns process/proxy/session lifecycle; editor packages own presentation plugins only.
- Keep plugin APIs internal unless rewritten as a capability-based extension protocol with lifecycle, ownership, async, and cleanup guarantees.
- Split persistence into durable workspace layout, session recovery, cache, and ephemeral UI. Do not persist runtime service internals.

## 12-Week Implementation Roadmap

- Week 1: Baseline and invariants.
  - Capture current behavior with characterization tests for open/edit/save/reopen, multi-tab same file, split panes, external file change, conflict markers, undo/redo, search buffer, LSP attachment, and dirty-close.
  - Write a short ownership document defining the single owner for text, dirty, conflict, save, focus, command, query, worker, and persistence state.
  - Establish milestone gate: `bun run typecheck`, `bun run test`, targeted web/server/editor tests.

- Weeks 2-3: Workspace document model.
  - Implement `WorkspaceDocumentService` with one `DocumentSession` per `DocumentId`.
  - Migrate editor document state behind an adapter so existing UI can read projections while writes go through the service.
  - Remove per-tab session cloning. Tabs attach view state to the shared document buffer.
  - Make dirty state derived from document service state only.
  - Gate: multi-tab same-file edits, undo/redo, save, close, and reopen behave identically or better than baseline.

- Weeks 4-5: Deterministic file sync.
  - Introduce `FileSyncService` and server contract additions for file version, write id, origin, and monotonic event sequence.
  - Convert watcher events into “maybe stale” notifications that trigger deterministic reconciliation.
  - Model file states explicitly: clean, dirty, saving, saved, externally changed, conflicted, deleted, recreated.
  - Remove correctness dependencies on fixed retry delays and debounce timing.
  - Gate: fake-timer and integration tests prove save/external-change/conflict ordering without relying on wall-clock sleeps.

- Weeks 6-7: Commands, keyboard, focus, and undo boundaries.
  - Add `CommandBus` and migrate editor/workspace commands into typed command definitions.
  - Add `FocusService` and replace focus request counters/active editor dispatch pointers.
  - Route keyboard input through target resolution: editor, tree, search, terminal, command palette, global.
  - Define undo categories: text edit, view-only action, file operation, workspace operation. Only text edit undo is in `DocumentSession`; cross-resource undo is explicit and separate.
  - Gate: command tests cover disabled states, focus transitions, conflicting shortcuts, async command failure, and dirty-close behavior.

- Weeks 8-9: React shell cleanup.
  - Split the workspace file viewer into rendering components plus service adapters. UI components do not directly coordinate query cache, document service, conflict service, and command execution in one place.
  - Move transaction logic out of effects into domain services and event handlers.
  - Use React effects only for subscription lifecycle, DOM integration, and non-critical resource loading.
  - Apply React performance rules while refactoring: avoid derived-state effects, avoid inline component definitions, subscribe to narrow selectors, and defer expensive non-urgent rendering with transitions where useful.
  - Gate: React tests verify rendering from service projections; no lost edits during mount/unmount, pane changes, or tab switches.

- Week 10: Worker and async ownership.
  - Add a `WorkerManager` abstraction with service name, owner document id, priority, cancellation signal, memory budget, and stale-result policy.
  - Move syntax, tree-sitter, minimap, and LSP requests behind explicit ownership and cancellation.
  - Keep version guards, but add real cancellation where supported and budget enforcement where cancellation is cooperative.
  - Gate: tests cover stale worker results, document close while work is pending, rapid edits, large-file syntax, and minimap invalidation.

- Week 11: Package and plugin boundaries.
  - Collapse duplicate LSP-facing app APIs into one route through `LspService`.
  - Move shared protocol types into contracts where they cross app/server/editor boundaries.
  - Keep editor plugin host internal. Any plugin-facing API must use explicit capabilities, stable ids, lifecycle cleanup, and async phase boundaries.
  - Gate: package dependency graph has no duplicate public LSP story and no app-level imports that bypass the chosen service boundary.

- Week 12: Hardening, deletion, and acceptance.
  - Delete compatibility shims for old per-tab document sessions, old dirty sets, timing-based sync fallbacks, and obsolete command/focus paths.
  - Run full validation, large-file manual smoke tests, and regression scenarios from Week 1.
  - Produce final architecture notes documenting ownership, state transitions, sync protocol, and command/focus model.
  - Gate: branch is mergeable with no known correctness regressions in core editor workflows.

## Test Plan

- Run after every milestone: `bun run typecheck`, `bun run test`, plus targeted package tests for web, server, and editor.
- Add service-level tests for document ownership, file sync state transitions, command dispatch, focus transitions, persistence hydration, and worker cancellation.
- Add race tests with fake timers and controlled promises for save vs external edit, watcher event ordering, stale worker responses, tab close during save, and conflict resolution.
- Add integration tests for core workflows: open file, edit, save, reopen, split pane, same file in two tabs, search result open, LSP hover/definition, external delete/recreate, dirty close.
- Keep performance checks as acceptance gates, not the main driver: large file open, rapid typing, syntax update latency, minimap update latency, search buffer responsiveness.

## Assumptions

- Existing dirty worktree changes are user-owned and must not be reverted.
- The implementation happens on a feature branch where temporary breakage is allowed between milestones.
- React 19, Vite, Bun, TanStack Query, Zustand, and the existing editor packages remain in use; their responsibilities change rather than being replaced wholesale.
- The 12-week plan prioritizes correctness and ownership over UI polish or feature expansion.
- Public extension/plugin support is not promised in this overhaul; plugin APIs remain internal unless explicitly redesigned.
