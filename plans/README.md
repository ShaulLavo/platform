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
| [063 — lockstep WorkspaceEdit transactions](063-lockstep-workspace-edit-transactions.md) | **NEXT — EDITOR LOCKSTEP**                    |
| [064 — anchored diagnostic peek](064-anchored-diagnostic-peek.md)                        | **SCHEDULED AFTER 061 — GO/NO-GO**            |
| [056 — multi-step chord keymap](056-multi-step-chord-keymap.md)                          | **SCHEDULED AFTER 064 — RECONCILE**           |
| [057 — editor-native VS Code keymap](057-editor-native-vscode-keymap.md)                 | **BLOCKED ON 056 — RUNTIME RECONCILED**       |
| [060 — persisted visible editor snapshot](060-persist-visible-editor-snapshot.md)        | **SCHEDULED AFTER 063 — RECONCILE**           |
| [061 — Foresight prepared editor opens](061-promote-foresight-file-open-pipeline.md)     | **SCHEDULED AFTER 060**                       |

## Dependency notes

- The sole command/focus runtime is landed in `keymap/table.ts`, `keymap/state/command-bus.ts`,
  `keymap/providers/command-provider.tsx`, and `lib/focus/`. Settings commands use the semantic
  submission returned by `use-settings-actions.ts` and await `settled`; do not restore persistent
  preview dispatch, duplicate settings error reporting, or a second mutation path.
- Plan 056 must extend that typed bus and acknowledged focus service instead of introducing another
  active-Editor dispatch owner.
- Execute 063 in the position scheduled by root `PLAN.md`. It adds explicit
  workspace undo/redo through the typed bus, consumes a lockstep sibling Editor API, and must not
  create a legacy command path, parse LSP in Platform, or ship either repository's half alone.
  Do not execute it concurrently with 060/061/064 because they overlap Editor attachment/provider,
  LSP-plugin, and document-service surfaces; reconcile whichever plan runs second.
- Plan 064's interactive React overlay uses the landed deepest-target FocusService and exact origin
  restoration. Its first step may
  reject a managed geometry handle if ordinary React composition passes the
  real-browser gate; the selected narrow path still lands the named diagnostic
  peek lockstep. Root `PLAN.md` schedules it after the 060 → 061 sequence.
- Plan 056 is reconciled to the landed command/focus runtime. Execute 057 only after 056; it must
  extend the same target registry and enablement evaluator rather than creating parallel ownership.
- Execute 061 only after 060. Its ready live/clean view must still
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
