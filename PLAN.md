# Cross-Project Execution Roadmap

> **Status:** reconciled against Platform `64928b42`, Editor `c8c36b9`, and
> `ghostty-webgpu` `09e4147` on 2026-08-24. Re-run each executable plan's drift check before editing.

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
- Editor-parity wave E0 is complete.
- The earlier command/focus draft, plan 058, is deleted. Plan 062 is the only command/focus cutover.

## Shared prerequisites

1. **Plan 059 — conflict-proof optimistic settings.** Reconcile its stamped paths and assumptions
   against current source, then implement it before plan 062. It owns semantic settings intents,
   confirmed-versus-projected state, raw-JSON conflicts, and the preview/commit boundary.
2. **Plan 062 — typed CommandBus and FocusService.** Execute only after 059 is verified and deleted.
   It becomes the sole command definition, dispatch, enablement, focus-target, and async-settlement
   path used by later editor-parity work.

No later Platform editor milestone may create an active-Editor pointer, a second settings mutation
path, a React-effect transaction coordinator, or a compatibility shim for the deleted architecture.

## Independent package closeout

**Plan 055 — `ghostty-webgpu` DOM/input** may finish at any time. Its implementation and automated
gates have landed; only the physical hardware/operator acceptance in
`ghostty-webgpu/docs/phase-3-acceptance.md` remains. Do not repeat its implementation milestones.
When the gate passes, update the stable package evidence and Platform brief, then delete plan 055.

The `ghostty-webgpu` xterm-facade program is a separate package lane. Plan 008 is partially landed
but blocked because the pinned native ABI cannot implement xterm's row-preserving `clear()` exactly.
Resolve that native/upstream contract honestly before continuing. Plans 009–015 remain in their
package-defined dependency order and are not prerequisites for current Platform work.

## Ordered Platform editor lane after plan 062

For one implementer, use this order. Items marked lockstep must finish and verify in both repositories
before either half is treated as landed.

1. **Plan 063 — lockstep WorkspaceEdit transactions (Platform + Editor).** Highest-priority shared
   correctness milestone. Land the Editor primitive and Platform transaction/applicator as one
   change. Do not run it concurrently with 060, 061, or 064.
2. **Plan 060 — persisted visible editor snapshot (Platform + Editor).** Reconcile both old commit
   stamps first. It owns only a capped, unvalidated visual first-paint cache.
3. **Plan 061 — Foresight prepared editor opens (Platform + Editor).** Requires 060 and 062. Live
   prepared artifacts use exact revision identity and must not validate or promote 060's visual rows.
4. **Plan 064 — anchored diagnostic peek.** Requires 062. Run its real-browser composition gate
   first. Use ordinary React composition if it passes; add the one named managed-geometry handle in
   Editor only if the gate proves it necessary. Never restore generic block surfaces.
5. **Plan 056 — multi-step chord keymap (Platform).** Reconcile against the landed typed bus and
   FocusService, then implement one chord state machine without another dispatch owner.
6. **Plan 057 — editor-native VS Code keymap (Platform + Editor).** Requires 056 and 062. Extend the
   same target/enablement runtime and complete the single-dispatcher takeover in lockstep.

Plans 056 and 064 are logically independent after 062, but they should still be serialized in one
Platform worktree. Plans 063, 060, 061, 064, and 057 all touch Editor-facing ownership or APIs and
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
3. **Environment M3 — selection UI and honest local failure.** Requires M2 and plan 062 so titlebar
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
- **Platform + Editor lockstep:** plans 060, 061, 063, 057, and any plan-064 path that changes Editor
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
- **Rewrite before execution:** plans 059, 056, 060, and 061 need drift reconciliation; plans 062,
  063, and 064 already encode their current architectural ownership but still require normal drift
  checks.
- **Promote:** environment milestones M1–M5, one executable plan at a time.
- **Deferred:** environment M6 and all compatibility work for simultaneous origins or obsolete
  per-tab/active-editor/one-server architecture.
- **Package-blocked:** `ghostty-webgpu` plan 008 until an exact native `clear()` contract exists;
  plans 009–015 remain downstream.
