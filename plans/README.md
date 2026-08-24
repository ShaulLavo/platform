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

| Plan                                                                                  | State                                      |
| ------------------------------------------------------------------------------------- | ------------------------------------------ |
| [Editor BiDi geometry](../../Editor/docs/plan-bidi-geometry.md)                       | **TIER B OPEN**                            |
| [055 — ghostty-webgpu DOM/input](055-ghostty-webgpu-dom-input.md)                     | **READY**                                  |
| [059 — conflict-proof optimistic settings](059-conflict-proof-optimistic-settings.md) | **READY — EXECUTE BEFORE 058**             |
| [058 — typed CommandBus and FocusService](058-command-bus-focus-service.md)           | **BLOCKED ON 059 — RECONCILE**             |
| [056 — multi-step chord keymap](056-multi-step-chord-keymap.md)                       | **BLOCKED ON 058 — RECONCILE**             |
| [057 — editor-native VS Code keymap](057-editor-native-vscode-keymap.md)              | **BLOCKED ON 058 + 056 — RECONCILE**       |
| [060 — persisted visible editor snapshot](060-persist-visible-editor-snapshot.md)     | **READY — UNSCHEDULED; RECONCILE**         |
| [061 — Foresight prepared editor opens](061-promote-foresight-file-open-pipeline.md)  | **AFTER 060 — UNSCHEDULED; RECONCILE 058** |

## Dependency notes

- Execute 059 before 058 because both plans touch theme commands, command-palette
  preview, and `useSettingsActions`. Reconcile 058 onto 059's async intent API,
  theme context location, and preview/commit boundary; do not restore persistent
  preview dispatch or a second mutation path.
- Execute 058 before 056 so the chord machine targets the typed command bus and acknowledged
  focus service instead of introducing another active-Editor dispatch pointer.
- Reconcile 056 against 058 before execution, then reconcile and execute 057 against both. Plan
  057 must extend the same target registry and enablement evaluator rather than creating parallel
  ownership.
- Plan 061 and Plan 058 overlap the file-tab activation command boundary. Whichever lands second must
  preserve 061's invariant that a ready live/clean view is claimed and ensured before active
  selection publication: if 058 lands first, 061 targets its typed CommandBus handler; if 061 lands
  first, 058 ports the transaction out of `useEditorCommands()` and keeps the focused ordering test.
  Root `PLAN.md` must choose the actual relative order before either overlapping implementation.
- Plan 055 is independent of the command/focus sequence.
- Execute 060 before 061 so they share one authoritative-paint signal, one open benchmark, and one
  reconciliation pass through overlapping Editor attachment/API files. Plan 061 does not promote or
  validate Plan 060's persisted rows: that one-record cache is deliberately path/theme-only visual
  paint, while live prepared artifacts use exact file or document revision identity.
- The root `PLAN.md` does not yet schedule 060/061. Its current execution order is authoritative, so
  add this proposed 060 → 061 sequence there before either implementation begins; this index records
  the dependency but does not silently amend the roadmap.
- Both 060 and 061 must preserve and reconcile the user-owned uncommitted selection, reveal,
  cursor-history, geometry, React, and Solid changes in the sibling Editor worktree.

## Cleanup policy

- Delete a plan once its implementation and completion checks are verified.
- Keep incomplete plans even when their paths or assumptions are stale; update them before execution.
- Do not preserve a completed-plan ledger here. Use git history and the implementation's tests/docs.
- When deleting a completed plan, replace live backlinks with current code, tests, or stable reference docs.
