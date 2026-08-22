# Implementation plans

Only unfinished implementation plans live in this directory. Completed plans are deleted; git
history is the archive. Draft or outdated strategy documents remain under `docs/` until they are
reviewed, rewritten, or promoted into an executable plan.

Before executing a plan, reconcile its drift check and line references against current source.
Verification uses per-workspace baseline deltas; never gate completion on an absolute test count or
a bare root `bun run verify`.

## Proposed tackle order

| Order | Plan                                                                                | State                          | Why here                                                                                                                                                                         |
| ----: | ----------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | [050 — Multi-server LSP](050-multi-server-lsp.md)                                   | **Active work to reconcile**   | The current dirty worktrees in both repos already overlap its connection-pool and editor-plugin scope. Reconcile and finish that work before starting another cross-repo change. |
|     2 | [049 — JSON language server for settings](049-json-language-server-for-settings.md) | **TODO**                       | Medium-sized P2 follow-up; the cleanest design depends on the multi-server shape settled by 050.                                                                                 |
|     3 | [039 — Split FileTreeView/controller](039-filetreeview-controller-split.md)         | **PARTIAL — resume Step 3**    | Steps 0–2 landed; the correction block resolves the dependency warning conflict by allowing stable ref objects in dependency arrays.                                             |
|     4 | [051 — Migrate tree internals to React](051-migrate-tree-internals-to-react.md)     | **TODO — blocked on 039**      | Migrate the smaller post-split surface, then remove Preact and the package-wide React Compiler exemption without mixing runtime and behavioral refactors.                        |
|     5 | [037 — Normalize chat thread state](037-normalize-chat-thread.md)                   | **PARTIAL**                    | Characterization tests landed; Steps 3–7 remain and are now unblocked by baseline-delta gates.                                                                                   |
|     6 | [038 — Collapse editor document layer](038-collapse-editor-document-layer.md)       | **READY, reconcile first**     | Its broken absolute-count gates were repaired, but its old file references need checking against the current editor/LSP work before execution.                                   |
|     7 | [Editor BiDi geometry](../../Editor/docs/plan-bidi-geometry.md)                     | **TODO / separate investment** | The only unfinished Editor plan. It is broad and geometry-risky, so treat it as a deliberate project rather than cleanup follow-through.                                         |

This order is a working recommendation, not a dependency lock. If the current LSP changes are being
paused intentionally, finish 039 and then execute its dependent React migration, 051, before moving
to 049 or 037.

## Cleanup policy

- Delete a plan once its implementation and completion checks are verified.
- Keep incomplete plans even when their paths or assumptions are stale; update them before execution.
- Do not preserve a completed-plan ledger here. Use git history and the implementation's tests/docs.
- When deleting a completed plan, replace live backlinks with current code, tests, or stable reference docs.
