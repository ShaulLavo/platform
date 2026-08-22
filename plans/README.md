# Implementation plans

Only unfinished implementation plans live in this directory. Completed plans are deleted; git
history is the archive. Draft or outdated strategy documents remain under `docs/` until they are
reviewed, rewritten, or promoted into an executable plan.

Before executing a plan, reconcile its drift check and line references against current source.
Verification uses per-workspace baseline deltas; never gate completion on an absolute test count or
a bare root `bun run verify`.

## Proposed tackle order

| Order | Plan                                                                                  | State                          | Why here                                                                                                                                                                                                                                                                                               |
| ----: | ------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|     1 | [049b — JSON language server for settings](049b-json-language-server-for-settings.md) | **READY**                      | The generic multi-server match path, feature exclusions, ready notifications, arbitration, and aggregate presentation are shipped. JSON can now coexist with Biome without adding another pool, queue, or route.                                                                                      |
|     2 | [038 — Collapse editor document layer](038-collapse-editor-document-layer.md)         | **READY, reconcile first**     | Its broken absolute-count gates were repaired, but its old file references need checking against the current editor/LSP work before execution.                                                                                                                                                         |
|     3 | [Editor BiDi geometry](../../Editor/docs/plan-bidi-geometry.md)                       | **TODO / separate investment** | The only unfinished Editor plan. It is broad and geometry-risky, so treat it as a deliberate project rather than cleanup follow-through.                                                                                                                                                               |
|     4 | [054 — ghostty-webgpu Phase 0](054-ghostty-webgpu.md)                                 | **READY (spike)**              | Feasibility spike with pre-registered kill numbers: wasm callback bridge (3 ABI shapes), WebGPU in CI + CEF desktop, scheduling-vs-WebGPU benchmarks. Decides whether the rewrite in [docs/ghostty-webgpu-brief.md](../docs/ghostty-webgpu-brief.md) proceeds, descopes to an upstream patch, or dies. |

## LSP foundation

The multi-server milestone is complete. The server and browser now expose ordered matches, feature
ranks, runtime arbitration, one composite Editor contribution, aggregate diagnostics/status, and a
dedicated diff lease from the existing browser pool. Plan 049b consumes those extension points and
must not add a second queue, ownership model, pool, or routing path.

Other rows are a working recommendation, not a dependency lock.

## Cleanup policy

- Delete a plan once its implementation and completion checks are verified.
- Keep incomplete plans even when their paths or assumptions are stale; update them before execution.
- Do not preserve a completed-plan ledger here. Use git history and the implementation's tests/docs.
- When deleting a completed plan, replace live backlinks with current code, tests, or stable reference docs.
