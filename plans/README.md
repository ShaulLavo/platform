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

| Plan                                                                        | State                                |
| --------------------------------------------------------------------------- | ------------------------------------ |
| [Editor BiDi geometry](../../Editor/docs/plan-bidi-geometry.md)             | **TIER B OPEN**                      |
| [055 — ghostty-webgpu DOM/input](055-ghostty-webgpu-dom-input.md)           | **READY**                            |
| [058 — typed CommandBus and FocusService](058-command-bus-focus-service.md) | **READY — EXECUTE BEFORE 056**       |
| [056 — multi-step chord keymap](056-multi-step-chord-keymap.md)             | **BLOCKED ON 058 — RECONCILE**       |
| [057 — editor-native VS Code keymap](057-editor-native-vscode-keymap.md)    | **BLOCKED ON 058 + 056 — RECONCILE** |

## Dependency notes

- Execute 058 before 056 so the chord machine targets the typed command bus and acknowledged
  focus service instead of introducing another active-Editor dispatch pointer.
- Reconcile 056 against 058 before execution, then reconcile and execute 057 against both. Plan
  057 must extend the same target registry and enablement evaluator rather than creating parallel
  ownership.
- Plan 055 is independent of the command/focus sequence.

## Cleanup policy

- Delete a plan once its implementation and completion checks are verified.
- Keep incomplete plans even when their paths or assumptions are stale; update them before execution.
- Do not preserve a completed-plan ledger here. Use git history and the implementation's tests/docs.
- When deleting a completed plan, replace live backlinks with current code, tests, or stable reference docs.
