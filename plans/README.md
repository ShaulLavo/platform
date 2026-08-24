# Implementation plans

Only unfinished implementation plans live in this directory. Completed plans are deleted; git
history is the archive. Draft or outdated strategy documents remain under `docs/` until they are
reviewed, rewritten, or promoted into an executable plan.

Cross-project dependencies and execution order are authoritative in [`PLAN.md`](../PLAN.md). This
index lists executable plans only; it does not define a second roadmap.

Before executing a plan, reconcile its drift check and line references against current source.
Verification uses per-workspace baseline deltas; never gate completion on an absolute test count or
a bare root `bun run verify`.

## Executable plan inventory

| Plan                                                                                     | State                                         |
| ---------------------------------------------------------------------------------------- | --------------------------------------------- |
| [055 — ghostty-webgpu DOM/input](055-ghostty-webgpu-dom-input.md)                        | **IMPLEMENTED — PHYSICAL OPERATOR GATE OPEN** |
| [059 — conflict-proof optimistic settings](059-conflict-proof-optimistic-settings.md)    | **RECONCILE DRIFT — THEN EXECUTE BEFORE 062** |
| [062 — typed CommandBus and FocusService](062-typed-command-focus-cutover.md)            | **BLOCKED ON 059 — THEN RECONCILE**           |
| [063 — lockstep WorkspaceEdit transactions](063-lockstep-workspace-edit-transactions.md) | **AFTER 062 — EDITOR LOCKSTEP**               |
| [064 — anchored diagnostic peek](064-anchored-diagnostic-peek.md)                        | **SCHEDULED AFTER 061 — GO/NO-GO**            |
| [056 — multi-step chord keymap](056-multi-step-chord-keymap.md)                          | **SCHEDULED AFTER 064 — RECONCILE**           |
| [057 — editor-native VS Code keymap](057-editor-native-vscode-keymap.md)                 | **BLOCKED ON 062 + 056 — RECONCILE**          |
| [060 — persisted visible editor snapshot](060-persist-visible-editor-snapshot.md)        | **SCHEDULED AFTER 063 — RECONCILE**           |
| [061 — Foresight prepared editor opens](061-promote-foresight-file-open-pipeline.md)     | **SCHEDULED AFTER 060 + 062**                 |

## Dependency notes

- Execute 059 before 062 because both plans touch theme commands, command-palette
  preview, and `useSettingsActions`. Plan 062 consumes 059's async intent API,
  theme context location, and preview/commit boundary; it must not restore
  persistent preview dispatch or a second mutation path. Plan 062 is the sole
  command/focus cutover plan; its earlier superseded draft has been deleted.
- Execute 062 before 056 so the chord machine targets the typed command bus and acknowledged
  focus service instead of introducing another active-Editor dispatch pointer.
- Execute 063 only after 062, in the position scheduled by root `PLAN.md`. Plan 063 adds explicit
  workspace undo/redo through the typed bus, consumes a lockstep sibling Editor API, and must not
  create a legacy command path, parse LSP in Platform, or ship either repository's half alone.
  Do not execute it concurrently with 060/061/064 because they overlap Editor attachment/provider,
  LSP-plugin, and document-service surfaces; reconcile whichever plan runs second.
- Plan 064 follows 062 because its interactive React overlay needs the landed
  deepest-target FocusService and exact origin restoration. Its first step may
  reject a managed geometry handle if ordinary React composition passes the
  real-browser gate; the selected narrow path still lands the named diagnostic
  peek lockstep. Root `PLAN.md` schedules it after the 060 → 061 sequence.
- Reconcile 056 against 062 before execution, then reconcile and execute 057 against both. Plan
  057 must extend the same target registry and enablement evaluator rather than creating parallel
  ownership.
- Execute 061 only after both 060 and 062. Its ready live/clean view must still
  be claimed and ensured before active selection publication, but that
  transaction stays in the shared Editor domain action used by local UI and the
  typed bus; do not add a bus-only activation implementation.
- Plan 055's DOM/input implementation has landed. Only its real-hardware keyboard, IME, clipboard,
  and assistive-technology acceptance gate remains; do not reimplement the browser terminal host.
  This gate is independent of the command/focus sequence.
- Execute 060 before 061 so they share one authoritative-paint signal, one open benchmark, and one
  reconciliation pass through overlapping Editor attachment/API files. Plan 061 does not promote or
  validate Plan 060's persisted rows: that one-record cache is deliberately path/theme-only visual
  paint, while live prepared artifacts use exact file or document revision identity.
- Root `PLAN.md` schedules 060 → 061 after plan 063 and before plan 064.
- Both 060 and 061 must preserve and reconcile the user-owned uncommitted selection, reveal,
  cursor-history, geometry, React, and Solid changes in the sibling Editor worktree.

## Cleanup policy

- Delete a plan once its implementation and completion checks are verified.
- Keep incomplete plans even when their paths or assumptions are stale; update them before execution.
- Do not preserve a completed-plan ledger here. Use git history and the implementation's tests/docs.
- When deleting a completed plan, replace live backlinks with current code, tests, or stable reference docs.
