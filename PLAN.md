# Cross-Project Execution Roadmap

> **Status:** reconciled against Platform `e1228cff`, Editor `0f4f8f4`, and
> `ghostty-webgpu` `3c3e07e` on 2026-08-27. Re-run each executable plan's drift check before editing.

This file is the sole source of cross-project execution order. [`plans/README.md`](plans/README.md)
is the Platform executable-plan inventory. Strategy documents under `docs/` describe product scope
but do not authorize implementation. A completed executable plan is deleted after its checks pass;
Git history is the archive.

## Verified completed foundations

- Platform's one-document representation and deterministic file-sync cutover are live. Completed
  plan 038 has been deleted.
- Editor BiDi geometry Tiers A and B are complete; Editor has no standalone BiDi execution plan.
- Multi-server-per-document LSP and schema-aware settings JSON support are live. Do not rebuild a
  one-server compatibility layer.
- Conflict-proof settings persistence is live: normal writes use one semantic intent pipeline,
  confirmed and projected state are separate, raw JSON retains compare-and-swap conflicts, and the
  consolidated appearance provider owns transient preview plus commit handoff. Completed plan 059
  has been deleted.
- Editor-parity wave E0 is complete.
- The sole typed command/focus runtime is live. `platformCommands` is the command definition table,
  `CommandBus` owns synchronous claims plus non-rejecting async settlement, and `FocusService` owns
  deepest registered targets, actual DOM focus, and explicit origin restoration. The superseded
  draft and completed implementation plan have been deleted.
- Lockstep WorkspaceEdit transactions are live in Editor and Platform. Editor owns typed LSP edit
  parsing, planning, inversion, and document application; Platform owns preview, filesystem commit,
  recovery, undo/redo, mutation coordination, and product integrations. Completed plan 063 has been
  deleted.
- Platform's terminal now uses the native `ghostty-webgpu` integration. This does not close Plan 055:
  its remaining physical keyboard, IME, clipboard, and VoiceOver acceptance is still an operator gate.

## Shared runtime boundary

The typed command/focus foundation is landed in `apps/web/src/keymap/table.ts`,
`apps/web/src/keymap/state/command-bus.ts`, `apps/web/src/keymap/providers/command-provider.tsx`, and
`apps/web/src/lib/focus/`. Settings commands submit through the semantic intent API and await its
`settled` result; no command may add another settings mutation or error-reporting path.

No later Platform editor milestone may create an active-Editor pointer, a second settings mutation
path, a React-effect transaction coordinator, or a compatibility shim for the deleted architecture.

## Independent package closeout

**Plan 055 — `ghostty-webgpu` DOM/input** may finish at any time. Its implementation and automated
gates have landed; only the physical hardware/operator acceptance in
`ghostty-webgpu/docs/phase-3-acceptance.md` remains. Do not repeat its implementation milestones.
When the gate passes, update the stable package evidence and Platform brief, then delete plan 055.

The `ghostty-webgpu` xterm-facade program is a separate package lane. Plan 008 is complete with its
accepted divergences transferred to the later certification gate. Plan 009 is blocked because the
required parser/Unicode, inactive-buffer, row-marker, and OSC 8 APIs are not public. Plan 010's CPU
gate has passed, but it remains blocked on Plan 009 and physical operator evidence. Plans 011–015
remain in package-defined dependency order and are not prerequisites for current Platform work.

## Proposed Ghostty appearance lane

Plans 065–067 are an independent proposed lane and are not authorized until root scheduling is
explicitly approved:

1. **Plan 065 — prove the pinned Ghostty config resolver.** A bounded four-target feasibility proof;
   `FAIL` is an acceptable result. It also requires Zig 0.16.0 exactly.
2. **Plan 066 — package the resolver.** Runs only after a complete Plan 065 `Decision: PASS`; produces
   one reviewed, unpublished `ghostty-webgpu@0.1.2` release candidate.
3. **Plan 067 — integrate Ghostty appearance.** Runs only against those exact reviewed bytes, then
   pauses for explicit publication authority before the final registry pin.

Do not replace this lane with a TypeScript Ghostty parser, `ghostty +show-config`, a maintained fork,
browser-visible host paths, or cold-start reads triggered by a disabled workbench setting.

## Ordered Platform editor lane

For one implementer, use this order. Items marked lockstep must finish and verify in both repositories
before either half is treated as landed.

1. **Plan 060 — persisted visible editor snapshot (Platform + Editor).** Reconcile both old commit
   stamps first. It owns only a capped, unvalidated visual first-paint cache.
2. **Plan 061 — Foresight prepared editor opens (Platform + Editor).** Requires 060 and the landed
   typed command runtime. Live
   prepared artifacts use exact revision identity and must not validate or promote 060's visual rows.
3. **Plan 064 — anchored diagnostic peek.** Uses the landed FocusService. Run its real-browser composition gate
   first. Use ordinary React composition if it passes; add the one named managed-geometry handle in
   Editor only if the gate proves it necessary. Never restore generic block surfaces.
4. **Plan 056 — multi-step chord keymap (Platform).** Extend the landed typed bus and FocusService
   integration with one chord state machine and no additional dispatch owner.
5. **Plan 057 — editor-native VS Code keymap (Platform + Editor).** Requires 056. Extend the
   same target/enablement runtime and complete the single-dispatcher takeover in lockstep.

Plans 056 and 064 are logically independent, but they should still be serialized in one
Platform worktree. Plans 060, 061, 064, and 057 all touch Editor-facing ownership or APIs and
must not be executed concurrently without a fresh overlap reconciliation.

## Environments and remote-access lane

[`docs/environments-and-remote-plan.md`](docs/environments-and-remote-plan.md) remains a reviewed
design, not an executable plan. Promote one milestone at a time into `plans/` with current file
paths, invariants, focused verification, cleanup instructions, and STOP conditions. Do not implement
directly from the strategy document.

The promotion and implementation order is:

1. **Environment M1 — runtime origin and one active environment.** No network exposure. Replace
   import-time client/transport ownership and add deterministic teardown.
2. **Environment M2 — identity and per-environment state.** Requires M1. Add server identity,
   identity-drift refusal, scoped persistence, and one QueryClient per environment. No migration
   layer; clear obsolete developer state.
3. **Environment M3 — selection UI and honest local failure.** Requires M2; titlebar
   and palette actions use the typed command runtime. Still loopback-only.
4. **Environment M4 — real sessions on loopback.** Requires M3. Pairing, revocation, short-lived WS
   credentials, rate limiting, fd-3 desktop bootstrap, and credential-log hygiene move together as
   one security boundary.
5. **Environment M5 — trusted-network remote access.** Requires M4. Relax loopback only behind
   explicit session-backed opt-in and TLS or a trusted mesh. Plaintext non-loopback access is a hard
   refusal.

Environment M1–M2 overlap the global client, query, and persistence seams used by plans 060–061;
serialize their implementation with those plans. M4–M5 form one security chain and must not be
split into independently deployable half-states. Environment M6 cross-environment simultaneous
reads is deferred until repeated product demand proves it necessary; do not add scoped-ref or
multi-origin compatibility machinery now.

## Verification boundaries

- **Platform-only:** verify the narrow Platform tests/typechecks named by the active plan. Plan 056
  stays inside this boundary.
- **Platform + Editor lockstep:** plans 060, 061, 057, and any plan-064 path that changes Editor
  require focused checks and diff review in both worktrees. Neither repository's half is complete
  alone.
- **`ghostty-webgpu`:** run its package gates in that repository. Plan 055 additionally requires the
  physical acceptance record and a Platform documentation/index closeout.
- **Environment M1–M3:** verify with two isolated loopback servers and distinct databases. No test
  or demo may bind non-loopback before M5.
- **Environment M4–M5:** treat auth, pairing, revocation, Origin enforcement, TLS/mesh refusal,
  secret storage, and log redaction as one end-to-end security boundary.
- Preserve pre-existing dirty work in every linked worktree. Use baseline deltas and the narrowest
  checks that can catch a plausible regression; never use a bare root test count as completion proof.

## Promotion, rewrite, defer, and deletion decisions

- **Deleted:** completed plan 038 and superseded plan 058.
- **Close and delete after physical evidence:** plan 055.
- **Rewrite before execution:** plans 060 and 061 need drift reconciliation. Plan 056's
  command/focus boundary is reconciled to the landed runtime but still requires its normal drift
  check; plan 064 already encodes its current architectural ownership and also requires a normal
  drift check.
- **Promote:** environment milestones M1–M5, one executable plan at a time.
- **Deferred:** environment M6 and all compatibility work for simultaneous origins or obsolete
  per-tab/active-editor/one-server architecture.
- **Proposed:** plans 065–067 require an explicit root scheduling decision and then run strictly in
  order; Plan 065 may close the lane with `FAIL`.
- **Package-blocked:** `ghostty-webgpu` plan 009 needs public native extension surfaces. Plan 010 is
  additionally waiting on that dependency and physical operator gates; plans 011–015 remain downstream.
