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
|     1 | [050 — Multi-server LSP](050-multi-server-lsp.md)                                     | **READY**                      | The shipped pools own connections but not collection matching, feature arbitration, composite editor surfaces, or aggregate status and diagnostics. This plan supplies those shared primitives without another pool, queue, or multiplexer.                                                            |
|     2 | [049b — JSON language server for settings](049b-json-language-server-for-settings.md) | **BLOCKED ON 050**             | JSON overlaps Biome, and synthetic settings documents need generic match-path, feature-exclusion, and ready-notification support. It is the first narrow consumer after 050, not a competing architecture.                                                                                             |
|     3 | [038 — Collapse editor document layer](038-collapse-editor-document-layer.md)         | **READY, reconcile first**     | Its broken absolute-count gates were repaired, but its old file references need checking against the current editor/LSP work before execution.                                                                                                                                                         |
|     4 | [Editor BiDi geometry](../../Editor/docs/plan-bidi-geometry.md)                       | **TODO / separate investment** | The only unfinished Editor plan. It is broad and geometry-risky, so treat it as a deliberate project rather than cleanup follow-through.                                                                                                                                                               |
|     5 | [054 — ghostty-webgpu Phase 0](054-ghostty-webgpu.md)                                 | **READY (spike)**              | Feasibility spike with pre-registered kill numbers: wasm callback bridge (3 ABI shapes), WebGPU in CI + CEF desktop, scheduling-vs-WebGPU benchmarks. Decides whether the rewrite in [docs/ghostty-webgpu-brief.md](../docs/ghostty-webgpu-brief.md) proceeds, descopes to an upstream patch, or dies. |

## LSP dependency decision

The required order is **050, then 049b**. The existing server and browser pools already supply
independent per-server connections, lifecycle, initialization sharing, document ownership, fanout,
and disposal. They do not supply document-level multi-match discovery, feature ownership, runtime
arbitration, composite diagnostics, or aggregate editor status. Because JSON must coexist with
Biome and settings buffers need generic routing and diagnostics exclusions, implementing JSON first
would create one-off versions of responsibilities that belong to the general architecture.

Plan 050 therefore owns the shared match descriptor, feature ranks, one composite Editor
contribution, document targets, and aggregate state. It also moves the diff session's distinct
document owner onto a dedicated lease from the existing browser pool, removing its copied socket,
handshake, queue, request IDs, and timeout. Plan 049b owns only JSON server registration, generated
settings schema data, and settings-specific schema association. Do not run them in parallel and do
not preserve two queue, ownership, or routing paths.

Other rows are a working recommendation, not a dependency lock.

## Cleanup policy

- Delete a plan once its implementation and completion checks are verified.
- Keep incomplete plans even when their paths or assumptions are stale; update them before execution.
- Do not preserve a completed-plan ledger here. Use git history and the implementation's tests/docs.
- When deleting a completed plan, replace live backlinks with current code, tests, or stable reference docs.
