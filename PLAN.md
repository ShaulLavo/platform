# Cross-Project Execution Roadmap

> **Status:** reconciled against Platform base `4b25f1ab`, Editor base `b0919967`, and
> `ghostty-webgpu` `3c3e07e` on 2026-08-27, including the verified paired working-tree paint
> contract below. Re-run each executable plan's drift check and capture its current HEAD plus full
> dirty diff before editing.

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
- The bounded last-visible-paint contract is live across Editor and Platform. Editor owns
  `EditorVisibleSnapshot`, `EditorInitialHighlightStatus`, and the generation-tagged
  `EditorInitialPaintEvent`; Platform owns the one-record, 256 KiB
  `editor-visible-snapshot-cache.ts`, inert overlay handoff, exact applied-theme guard, and
  `editor-open-benchmark.mjs` paint marks. This cache is unvalidated visual paint only: it never
  supplies text, tokens, revision truth, or a correctness decision to the live editor.
- The sole typed command/focus runtime is live. `platformCommands` is the command definition table,
  `CommandBus` owns synchronous claims plus non-rejecting async settlement, and `FocusService` owns
  deepest registered targets, actual DOM focus, and explicit origin restoration. The superseded
  draft and completed implementation plan have been deleted.
- Lockstep WorkspaceEdit transactions are live in Editor and Platform. Editor owns typed LSP edit
  parsing, planning, inversion, and document application; Platform owns preview, filesystem commit,
  recovery, undo/redo, mutation coordination, and product integrations. Completed plan 063 has been
  deleted.
- Platform's terminal now uses the native `ghostty-webgpu` integration. Phase 3 DOM/input is
  complete in `ghostty-webgpu@0.1.1` commit `50788b2`; its headed macOS
  keyboard, IME, clipboard, idle-rendering, and VoiceOver gate is PASS in
  `ghostty-webgpu/docs/phase-3-acceptance.md`. Platform remains on registry `0.1.0` because both
  installed wasm artifacts are byte-identical to the verified package.

## Shared runtime boundary

The typed command/focus foundation is landed in `apps/web/src/keymap/table.ts`,
`apps/web/src/keymap/state/command-bus.ts`, `apps/web/src/keymap/providers/command-provider.tsx`, and
`apps/web/src/lib/focus/`. Settings commands submit through the semantic intent API and await its
`settled` result; no command may add another settings mutation or error-reporting path.

No later Platform editor milestone may create an active-Editor pointer, a second settings mutation
path, a React-effect transaction coordinator, or a compatibility shim for the deleted architecture.

## Independent package lane

The `ghostty-webgpu` xterm-facade program is a separate package lane. Plan 008 is complete with its
accepted divergences transferred to the later certification gate. Plan 009 is blocked because the
required parser/Unicode, inactive-buffer, row-marker, and OSC 8 APIs are not public. Plan 010's CPU
gate has passed, but it remains blocked on Plan 009 and physical operator evidence. Plans 011–015
remain in package-defined dependency order and are not prerequisites for current Platform work.

## Independent lockstep syntax lane

Plan 070 is **SCHEDULED NOW** as an independent Platform + Editor lockstep lane. Platform owns
Shiki grammar and theme resolution; Editor receives resolved registrations through required
protocol fields and keeps its inline worker self-contained. Keep the existing Oniguruma engine
unless a current behavior measurement proves that the JavaScript engine preserves the exact
grammar behavior used by Platform. The Editor package build must reject any inline worker that
emits sibling chunks, and the same pass must delete every obsolete name-resolution path.

Neither repository half is complete alone. Verify Editor's focused package gates, the built `dist`
consumer in Platform, the inline worker's zero-sibling-chunk invariant, bounded grammar loading,
and live `editor.syntax` success/failure logs before deleting the executable plan. Plan 071 remains
ordered after this lane.

## Reopened Ghostty appearance lane

Plan 065's first proof found that the pinned normal loader can create a template when no config
exists. The operator accepted one narrow divergence on 2026-08-28: the resolver may derive the fixed
default candidates from explicit roots and pinned suffixes, freeze their paths and precedence in
tests, then open and parse them read-only through Ghostty. It must never call the template-writing
loader, a create-capable candidate builder, or duplicate any parser, include, theme, conditional,
diagnostic, color, or palette semantics.

The revised exact-Zig proof confirmed that divergence works, then found that Ghostty's only
official Config initializer and shared executable graph retain and initialize GUI-only
shader/renderer dependencies. On 2026-08-28 the operator accepted that as a second narrow
divergence: the heavy helper may be a stripped, platform-specific optional host dependency, loaded
and spawned only when the registered appearance feature is enabled. Its absence must degrade to
the existing Platform appearance without a config read, subprocess, download, or startup failure.

The reopened proof then found that Ghostty's macOS Application Support candidate builders reach
Foundation directory lookup with `create: true`. This is not a terminal proof failure. It refines
the accepted fixed-candidate divergence: neither the writing loader nor a create-capable path
builder may run during discovery. Derive the fixed legacy/current candidates read-only from the
explicit isolated home/config roots and the pinned constant suffixes, freeze their exact paths,
load order, and duplicate behavior in tests, and pass only existing files to Ghostty's read-only
loader.

Plan 065 remains **IN PROGRESS AND SCHEDULED** through every remaining semantic, no-write,
four-native-target, compatibility, relocation, size, privacy, and strict-evidence gate. Plans
066–067 remain **NOT AUTHORIZED** until a complete `Decision: PASS` and separate root scheduling.
If Platform ever considers a Ghostty fork, prefer contributing a read-only Config path API and
Config-only initializer/build target upstream first; the optional-heavy allowance does not make the
current graph the preferred long-term boundary.

Do not replace this lane with a TypeScript Ghostty parser, `ghostty +show-config`, a maintained fork,
browser-visible host paths, or cold-start reads triggered by a disabled workbench setting.

## Ordered Platform editor lane

For one implementer, use this order. Items marked lockstep must finish and verify in both repositories
before either half is treated as landed.

1. **Plan 061 — Foresight prepared editor opens (Platform + Editor).** Reuse the landed paint
   event/marks/benchmark and the landed typed command runtime. Live prepared artifacts use exact
   revision identity and must not validate or promote the visual-only cached rows.
2. **Plan 064 — anchored diagnostic peek.** Uses the landed FocusService. Run its real-browser
   composition gate first. Use ordinary React composition if it passes; add the one named
   managed-geometry handle in Editor only if the gate proves it necessary. Never restore generic
   block surfaces.
3. **Plan 056 — multi-step chord keymap (Platform).** Extend the landed typed bus and FocusService
   integration with one chord state machine and no additional dispatch owner.
4. **Plan 057 — editor-native VS Code keymap (Platform + Editor).** Requires 056. Extend the
   same target/enablement runtime and complete the single-dispatcher takeover in lockstep.

Plans 056 and 064 are logically independent, but they should still be serialized in one
Platform worktree. Plans 061, 064, and 057 all touch Editor-facing ownership or APIs and
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

Environment M1–M2 overlap the global client, query, and persistence seams used by Plan 061 and the
landed editor-visible snapshot cache; serialize their implementation with Plan 061. M4–M5 form one
security chain and must not be split into independently deployable half-states. Environment M6
cross-environment simultaneous reads is deferred until repeated product demand proves it necessary;
do not add scoped-ref or multi-origin compatibility machinery now.

## Verification boundaries

- **Platform-only:** verify the narrow Platform tests/typechecks named by the active plan. Plan 056
  stays inside this boundary.
- **Platform + Editor lockstep:** plans 061, 057, and any plan-064 path that changes Editor
  require focused checks and diff review in both worktrees. Neither repository's half is complete
  alone.
- **`ghostty-webgpu`:** run its package gates in that repository.
- **Environment M1–M3:** verify with two isolated loopback servers and distinct databases. No test
  or demo may bind non-loopback before M5.
- **Environment M4–M5:** treat auth, pairing, revocation, Origin enforcement, TLS/mesh refusal,
  secret storage, and log redaction as one end-to-end security boundary.
- Preserve pre-existing dirty work in every linked worktree. Use baseline deltas and the narrowest
  checks that can catch a plausible regression; never use a bare root test count as completion proof.

## Promotion, rewrite, defer, and deletion decisions

- **Deleted:** completed plan 038 and superseded plan 058.
- **Rewrite before execution:** plan 061 needs drift reconciliation against the landed paint
  contract. Plan 056's command/focus boundary is reconciled to the landed runtime but still requires
  its normal drift check; plan 064 already encodes its current architectural ownership and also
  requires a normal drift check.
- **Promote:** environment milestones M1–M5, one executable plan at a time.
- **Deferred:** environment M6 and all compatibility work for simultaneous origins or obsolete
  per-tab/active-editor/one-server architecture.
- **Scheduled independently:** Plan 065 must skip Ghostty's writing loader and create-capable
  macOS path builders, derive the fixed candidates read-only, and continue every remaining proof
  gate. Plans 066–067 remain blocked and unauthorized until a complete four-target `PASS`; a future
  fork proposal must prefer upstreaming read-only Config path and Config-only build boundaries
  first.
- **Scheduled independently in lockstep:** Plan 070 moves grammar/theme resolution into Platform,
  keeps Editor's Oniguruma worker self-contained, rejects inline-worker sibling chunks at build
  time, and deletes obsolete name-resolution paths. Both repository gates and the built-dist live
  log check must pass before its plan is deleted; Plan 071 remains ordered after it.
- **Package-blocked:** `ghostty-webgpu` plan 009 needs public native extension surfaces. Plan 010 is
  additionally waiting on that dependency and physical operator gates; plans 011–015 remain downstream.
