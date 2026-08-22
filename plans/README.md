# Implementation plans

Only unfinished implementation plans live in this directory. Completed plans are deleted; git
history is the archive. Draft or outdated strategy documents remain under `docs/` until they are
reviewed, rewritten, or promoted into an executable plan.

Before executing a plan, reconcile its drift check and line references against current source.
Verification uses per-workspace baseline deltas; never gate completion on an absolute test count or
a bare root `bun run verify`.

## Proposed tackle order

| Order | Plan                                                                                | State                          | Why here                                                                                                                                                                               |
| ----: | ----------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | [050 — Multi-server LSP](050-multi-server-lsp.md)                                   | **Active work to reconcile**   | The current dirty worktrees in both repos already overlap its connection-pool and editor-plugin scope. Reconcile and finish that work before starting another cross-repo change.       |
|     2 | [049 — JSON language server for settings](049-json-language-server-for-settings.md) | **TODO**                       | Medium-sized P2 follow-up; the cleanest design depends on the multi-server shape settled by 050.                                                                                       |
|     3 | [052 — Wire file-tree capabilities](052-wire-file-tree-capabilities.md)             | **READY — reconcile first**    | The React runtime and focus/keyboard seams are settled; wire search, real focus/reveal, toolbar composition, batches, mutation events, git patches, and measured prepared-input reuse. |
|     4 | [053 — Prune tree package API](053-prune-tree-package-api.md)                       | **TODO — blocked on 052**      | Collapse wildcard subpaths to one reviewed root API, retain the wired/future fast paths, and delete or internalize only proven residue.                                                |
|     5 | [038 — Collapse editor document layer](038-collapse-editor-document-layer.md)       | **READY, reconcile first**     | Its broken absolute-count gates were repaired, but its old file references need checking against the current editor/LSP work before execution.                                         |
|     6 | [Editor BiDi geometry](../../Editor/docs/plan-bidi-geometry.md)                     | **TODO / separate investment** | The only unfinished Editor plan. It is broad and geometry-risky, so treat it as a deliberate project rather than cleanup follow-through.                                               |

This order is a working recommendation, not a dependency lock. If the current LSP changes are being
paused intentionally, execute 052 and prune the resulting surface in 053 before moving to 049.

## Cleanup policy

- Delete a plan once its implementation and completion checks are verified.
- Keep incomplete plans even when their paths or assumptions are stale; update them before execution.
- Do not preserve a completed-plan ledger here. Use git history and the implementation's tests/docs.
- When deleting a completed plan, replace live backlinks with current code, tests, or stable reference docs.
