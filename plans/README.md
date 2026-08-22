# Implementation plans

Only unfinished implementation plans live in this directory. Completed plans are deleted; git
history is the archive. Draft or outdated strategy documents remain under `docs/` until they are
reviewed, rewritten, or promoted into an executable plan.

Before executing a plan, reconcile its drift check and line references against current source.
Verification uses per-workspace baseline deltas; never gate completion on an absolute test count or
a bare root `bun run verify`.

## Proposed tackle order

| Order | Plan                                                                                    | State                             | Why here                                                                                                                                                                         |
| ----: | --------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | [050 — Multi-server LSP](050-multi-server-lsp.md)                                       | **Active work to reconcile**      | The current dirty worktrees in both repos already overlap its connection-pool and editor-plugin scope. Reconcile and finish that work before starting another cross-repo change. |
|     2 | [049 — JSON language server for settings](049-json-language-server-for-settings.md)     | **TODO**                          | Medium-sized P2 follow-up; the cleanest design depends on the multi-server shape settled by 050.                                                                                 |
|     3 | [036 — Reconcile tree with Pierre upstream](036-reconcile-tree-with-pierre-upstream.md) | **TODO — prerequisite**           | Audit from the exact imported fork/base, restore licensing, and hand-port applicable upstream fixes before changing the fork's structure or runtime.                             |
|     4 | [039 — Split FileTreeView/controller](039-filetreeview-controller-split.md)             | **PARTIAL — blocked on 036**      | Steps 0–2 landed; resume Step 3 only after upstream behavior is reconciled and this plan's drift/baselines are refreshed.                                                        |
|     5 | [051 — Migrate tree internals to React](051-migrate-tree-internals-to-react.md)         | **TODO — blocked on 036/039**     | Migrate and further decompose the reconciled post-split surface, then remove Preact and the package-wide React Compiler exemption.                                               |
|     6 | [052 — Wire file-tree capabilities](052-wire-file-tree-capabilities.md)                 | **TODO — blocked on 036/039/051** | Make search, real focus/reveal, toolbar composition, batches, mutation events, git patches, and prepared-input reuse actual workspace features before pruning.                   |
|     7 | [053 — Prune tree package API](053-prune-tree-package-api.md)                           | **TODO — blocked on 052**         | Collapse wildcard subpaths to one reviewed root API, retain the wired/future fast paths, and delete or internalize only proven residue.                                          |
|     8 | [037 — Normalize chat thread state](037-normalize-chat-thread.md)                       | **PARTIAL**                       | Characterization tests landed; Steps 3–7 remain and are now unblocked by baseline-delta gates.                                                                                   |
|     9 | [038 — Collapse editor document layer](038-collapse-editor-document-layer.md)           | **READY, reconcile first**        | Its broken absolute-count gates were repaired, but its old file references need checking against the current editor/LSP work before execution.                                   |
|    10 | [Editor BiDi geometry](../../Editor/docs/plan-bidi-geometry.md)                         | **TODO / separate investment**    | The only unfinished Editor plan. It is broad and geometry-risky, so treat it as a deliberate project rather than cleanup follow-through.                                         |

This order is a working recommendation, not a dependency lock. If the current LSP changes are being
paused intentionally, execute 036, finish 039, execute 051, wire the resulting product surface in
052, and prune it in 053 before moving to 049 or 037.

## Cleanup policy

- Delete a plan once its implementation and completion checks are verified.
- Keep incomplete plans even when their paths or assumptions are stale; update them before execution.
- Do not preserve a completed-plan ledger here. Use git history and the implementation's tests/docs.
- When deleting a completed plan, replace live backlinks with current code, tests, or stable reference docs.
