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

| Plan                                                                                    | State                                         |
| --------------------------------------------------------------------------------------- | --------------------------------------------- |
| [055 — ghostty-webgpu DOM/input](055-ghostty-webgpu-dom-input.md)                       | **IMPLEMENTED — PHYSICAL OPERATOR GATE OPEN** |
| [065 — prove Ghostty config resolver](065-prove-ghostty-config-resolver.md)             | **PROPOSED — ROOT GO/NO-GO SCHEDULING**       |
| [066 — package Ghostty config resolver](066-package-ghostty-config-resolver.md)         | **BLOCKED ON 065 PASS**                       |
| [067 — integrate Ghostty config appearance](067-integrate-ghostty-config-appearance.md) | **BLOCKED ON 066 REVIEWED ARTIFACT**          |
| [068 — app-owned shiki grammars](068-app-owned-shiki-grammars.md)                       | **PROPOSED — ROOT GO/NO-GO SCHEDULING**       |
| [069 — syntax highlight retry](069-syntax-highlight-retry.md)                           | **PROPOSED — SCHEDULE AFTER 068**             |
| [064 — anchored diagnostic peek](064-anchored-diagnostic-peek.md)                       | **SCHEDULED AFTER 061 — GO/NO-GO**            |
| [056 — multi-step chord keymap](056-multi-step-chord-keymap.md)                         | **SCHEDULED AFTER 064 — RECONCILE**           |
| [057 — editor-native VS Code keymap](057-editor-native-vscode-keymap.md)                | **BLOCKED ON 056 — RUNTIME RECONCILED**       |
| [060 — persisted visible editor snapshot](060-persist-visible-editor-snapshot.md)       | **NEXT — RECONCILE**                          |
| [061 — Foresight prepared editor opens](061-promote-foresight-file-open-pipeline.md)    | **SCHEDULED AFTER 060**                       |
| [072 — Electron desktop shell](072-electron-desktop-shell.md)                           | **PROPOSED — ROOT GO/NO-GO SCHEDULING**       |

## Dependency notes

- The sole command/focus runtime is landed in `keymap/table.ts`, `keymap/state/command-bus.ts`,
  `keymap/providers/command-provider.tsx`, and `lib/focus/`. Settings commands use the semantic
  submission returned by `use-settings-actions.ts` and await `settled`; do not restore persistent
  preview dispatch, duplicate settings error reporting, or a second mutation path.
- Plan 056 must extend that typed bus and acknowledged focus service instead of introducing another
  active-Editor dispatch owner.
- Plan 068 spans two repositories and must land as one change: it adds required fields to the
  shiki worker protocol in Editor `packages/editor`, and the resolver that fills them in
  Platform `apps/web`. Neither half is shippable alone. It has no dependency on any other plan.
- Plan 069 is Editor-only and independent of 068, but must not land before it: a retry loop
  running against a live permanent failure buries the cause it would otherwise surface.
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
- Plans 065–067 are one independent terminal lane and are not scheduled by root `PLAN.md` yet.
  Execute them strictly in order. Plan 065 is a bounded native feasibility proof and may end in
  `FAIL`; only a complete four-target `PASS` unlocks Plan 066. Plan 066 owns the host-only package
  resolver, renderer cursor-text parity, and one exact unpublished release tarball. Plan 067 first
  integrates Platform against those reviewed bytes, then pauses for an operator to publish that
  same tarball before the final registry pin and rerun.
- Plan 067 must wait for the user-owned edits originating from Plan 063 in
  `packages/contracts/src/index.ts`, `apps/server/src/tests/app.test.ts`, and
  `apps/web/test/server.ts` to land or be explicitly reconciled. The terminal-theme fixture must
  extend the live WorkspaceEdit-aware test-server options instead of restoring the baseline shape.
  The lane reads only a sanitized visual whitelist through the loopback backend; it
  must not add a TypeScript Ghostty parser, use `ghostty +show-config` as a dark-profile resolver,
  expose host paths to the browser, or let a persisted workbench opt-out trigger a cold-start read.
- Execute 060 before 061 so they share one authoritative-paint signal, one open benchmark, and one
  reconciliation pass through overlapping Editor attachment/API files. Plan 061 does not promote or
  validate Plan 060's persisted rows: that one-record cache is deliberately path/theme-only visual
  paint, while live prepared artifacts use exact file or document revision identity.
- Root `PLAN.md` schedules 060 → 061 next and before plan 064.
- Both 060 and 061 must preserve and reconcile the user-owned uncommitted selection, reveal,
  cursor-history, geometry, React, and Solid changes in the sibling Editor worktree.

## Cleanup policy

- Delete a plan once its implementation and completion checks are verified.
- Keep incomplete plans even when their paths or assumptions are stale; update them before execution.
- Do not preserve a completed-plan ledger here. Use git history and the implementation's tests/docs.
- When deleting a completed plan, replace live backlinks with current code, tests, or stable reference docs.
