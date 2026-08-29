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

| Plan                                                                                    | State                                   |
| --------------------------------------------------------------------------------------- | --------------------------------------- |
| [066 — package Ghostty config resolver](066-package-ghostty-config-resolver.md)         | **PROPOSED — ROOT GO/NO-GO SCHEDULING** |
| [067 — integrate Ghostty config appearance](067-integrate-ghostty-config-appearance.md) | **BLOCKED ON 066 REVIEWED ARTIFACT**    |
| [068 — session domain model](068-session-domain-model.md)                               | **PROPOSED — ROOT GO/NO-GO SCHEDULING** |
| [069 — worktree lifecycle](069-worktree-lifecycle.md)                                   | **BLOCKED ON 068 AND ROOT SCHEDULING**  |
| [071 — syntax highlight retry](071-syntax-highlight-retry.md)                           | **PROPOSED — ROOT GO/NO-GO SCHEDULING** |
| [064 — anchored diagnostic peek](064-anchored-diagnostic-peek.md)                       | **SCHEDULED AFTER 061 — GO/NO-GO**      |
| [056 — multi-step chord keymap](056-multi-step-chord-keymap.md)                         | **SCHEDULED AFTER 064 — RECONCILE**     |
| [057 — editor-native VS Code keymap](057-editor-native-vscode-keymap.md)                | **BLOCKED ON 056 — RUNTIME RECONCILED** |
| [061 — Foresight prepared editor opens](061-promote-foresight-file-open-pipeline.md)    | **NEXT — RECONCILE**                    |
| [073 — Electrobun 2.x migration](073-electrobun-v2-migration.md)                        | **PROPOSED — ROOT GO/NO-GO SCHEDULING** |
| [074 — Bun-native PTY](074-bun-native-pty.md)                                           | **PROPOSED — ROOT GO/NO-GO SCHEDULING** |
| [075 — terminal renderer fallbacks](075-terminal-renderer-fallbacks.md)                 | **PROPOSED — BLOCKED ON TIER DECISION** |
| [076 — watch-reload child reaping](076-watch-reload-child-reaping.md)                   | **PROPOSED — ROOT GO/NO-GO SCHEDULING** |

## Dependency notes

- The sole command/focus runtime is landed in `keymap/table.ts`, `keymap/state/command-bus.ts`,
  `keymap/providers/command-provider.tsx`, and `lib/focus/`. Settings commands use the semantic
  submission returned by `use-settings-actions.ts` and await `settled`; do not restore persistent
  preview dispatch, duplicate settings error reporting, or a second mutation path.
- Plan 056 must extend that typed bus and acknowledged focus service instead of introducing another
  active-Editor dispatch owner.
- Plan 068 is the session-domain foundation: it replaces the current thread-shaped aggregate with
  explicit Project → Worktree → Session ownership, makes Claude's raw UUID the portable session
  identity, imports terminal-born Claude sessions through commands/events/receipts, and projects
  `needs-input` / `working` / `settled` for the sidebar. It deliberately resets obsolete greenfield
  orchestration state rather than maintaining compatibility aliases. Root `PLAN.md` has not
  scheduled it yet.
- Plan 069 executes strictly after Plan 068. It adds explicit current-branch versus new-worktree
  creation, durable provisioning and cleanup recovery, and shared worktree chips on the same event
  spine. It must not restore the checkout reactor's project-root fallback or implement the reserved
  Orca compare view. Root `PLAN.md` has not scheduled it yet.
- Plan 071 is an independent Editor-only resilience proposal. Its prerequisite is now stable:
  Platform owns Shiki registration resolution, Editor's Oniguruma worker is self-contained, and
  built-dist highlighting is covered by a real-browser and shared-log proof. Root `PLAN.md` has not
  scheduled the retry work yet.
- Plan 064's interactive React overlay uses the landed deepest-target FocusService and exact origin
  restoration. Its first step may
  reject a managed geometry handle if ordinary React composition passes the
  real-browser gate; the selected narrow path still lands the named diagnostic
  peek lockstep. Root `PLAN.md` schedules it after Plan 061.
- Plan 056 is reconciled to the landed command/focus runtime. Execute 057 only after 056; it must
  extend the same target registry and enablement evaluator rather than creating parallel ownership.
- Plan 061's ready live/clean view must still be claimed and ensured before active selection
  publication, but that transaction stays in the shared Editor domain action used by local UI and
  the typed bus; do not add a bus-only activation implementation.
- The config-resolver feasibility proof is complete with four native `PASS` rows and accepted
  package ceilings. Its stable records are
  `ghostty-webgpu/docs/config-resolver-feasibility.md` and
  `ghostty-webgpu/docs/config-resolver-feasibility.json`. Plan 066 is eligible only for a separate
  root go/no-go scheduling decision; the proof does not authorize packaging or publication. Plan
  067 remains blocked on Plan 066's reviewed artifact. If a future Ghostty fork is considered,
  prefer upstreaming read-only Config path and Config-only initializer/build boundaries first.
- Plan 067 must wait for the user-owned edits originating from Plan 063 in
  `packages/contracts/src/index.ts`, `apps/server/src/tests/app.test.ts`, and
  `apps/web/test/server.ts` to land or be explicitly reconciled. The terminal-theme fixture must
  extend the live WorkspaceEdit-aware test-server options instead of restoring the baseline shape.
  The lane reads only a sanitized visual whitelist through the loopback backend; it
  must not add a TypeScript Ghostty parser, use `ghostty +show-config` as a dark-profile resolver,
  expose host paths to the browser, or let a persisted workbench opt-out trigger a cold-start read.
- The paired paint contract is landed: Editor exposes `EditorVisibleSnapshot`,
  `EditorInitialHighlightStatus`, and the generation-tagged `EditorInitialPaintEvent`; Platform owns
  the one-record, 256 KiB `editor-visible-snapshot-cache.ts`, inert overlay handoff,
  `appliedThemeId`, and `editor-open-benchmark.mjs` marks. Plan 061 must reuse those exact seams and
  rerun their focused regressions. It must never promote or content-validate the cached rows; live
  prepared artifacts use exact file or document revision identity.
- Root `PLAN.md` schedules Plan 061 next and before Plan 064.
- Plan 061 must capture current Platform and Editor HEADs plus complete dirty diffs before editing,
  preserve the landed paint contract and every unrelated change, and reconcile overlapping Editor
  attachment/API files in place.

## Cleanup policy

- Delete a plan once its implementation and completion checks are verified.
- Keep incomplete plans even when their paths or assumptions are stale; update them before execution.
- Do not preserve a completed-plan ledger here. Use git history and the implementation's tests/docs.
- When deleting a completed plan, replace live backlinks with current code, tests, or stable reference docs.
