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

| Plan                                                                                  | State                      |
| ------------------------------------------------------------------------------------- | -------------------------- |
| [049b — JSON language server for settings](049b-json-language-server-for-settings.md) | **READY, reconcile first** |
| [Editor BiDi geometry](../../Editor/docs/plan-bidi-geometry.md)                       | **TIER B OPEN**            |
| [055 — ghostty-webgpu DOM/input](055-ghostty-webgpu-dom-input.md)                     | **READY**                  |

## LSP foundation

The multi-server milestone is complete. The server and browser now expose ordered matches,
feature ranks, runtime arbitration, one composite Editor contribution, aggregate diagnostics/status,
and a dedicated diff lease from the existing browser pool. Plan 049b consumes those extension points
for JSON server registration, generated settings schema data, and settings-specific schema association.
It must not add a second queue, ownership model, pool, or routing path.

Plan 049b's registry assumptions now predate the generic JSON/CSS/HTML registration and visible
server-selection policy included with the multi-server review fixes. Reconcile that drift before
executing its settings-schema and synthetic-document work. The remaining ordering and all
cross-project promotion decisions come from [`PLAN.md`](../PLAN.md).

## Cleanup policy

- Delete a plan once its implementation and completion checks are verified.
- Keep incomplete plans even when their paths or assumptions are stale; update them before execution.
- Do not preserve a completed-plan ledger here. Use git history and the implementation's tests/docs.
- When deleting a completed plan, replace live backlinks with current code, tests, or stable reference docs.
