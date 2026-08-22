# Plan 054: ghostty-webgpu Phase 0 — feasibility spike and go/no-go

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. This repository deletes completed plans:
> once every done criterion is verified, record the S1–S5 answers and the go/no-go decision in
> `docs/ghostty-webgpu-brief.md`, then delete this file and update its row in `plans/README.md`
> in the same change.
>
> **Context**: The architecture and Phases 1–6 live in
> [docs/ghostty-webgpu-brief.md](../docs/ghostty-webgpu-brief.md). This plan is only the spike
> that decides whether that project proceeds, descopes, or dies. Do not start Phase 1 from this
> plan.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 2b503172..HEAD -- apps/web/src/features/terminal apps/web/vite.config.ts \
>   packages/ui/src/styles/globals.css packages/contracts/src/settings/keys.ts patches/
> git -C references/ghostty-web rev-parse --short HEAD   # expect 1858a59
> git -C references/ghostling rev-parse --short HEAD     # expect 63842bf
> grep -n "references/" .gitignore                        # expect a hit (line ~37)
> ```
>
> Committed drift touching the terminal feature or the ghostty-web patch is a re-inventory
> trigger, not a STOP. Missing reference clones: re-clone shallow from coder/ghostty-web and
> ghostty-org/ghostling and verify the ghostling pin still fetches upstream ghostty
> `f64f4aca2c29b554d111b36c3d946a9bddd159ff`.

## Status

- **Priority**: P1 — sizes/kills a large project before it starts
- **Effort**: ~2–3 focused days (S1 is the long pole)
- **Risk**: low (throwaway spike code; only measurement and one bench-only patch)
- **State**: READY
- **Category**: feasibility spike
- **Planned at**: platform `2b503172`; `references/ghostty-web` `1858a59`;
  `references/ghostling` `63842bf`; upstream ghostty pin
  `f64f4aca2c29b554d111b36c3d946a9bddd159ff` (ghostling's pin — all C-API claims read there)

## Why

Measured 2026-08-22 (memory `ghostty-render-loop-gpu`): an idle visible terminal drives the
browser's shared GPU process to ~63% via ghostty-web's standing rAF loop
(`references/ghostty-web/lib/terminal.ts:1167`). The proposed fix is a full rewrite
(`docs/ghostty-webgpu-brief.md`), but three things are unproven and each can kill or reshape it:

1. The libghostty-vt wasm **callback bridge** (the C API is function-pointer-shaped, in three ABI
   shapes; JS must satisfy all three).
2. **WebGPU in the environments we actually ship**: Playwright CI _and_ the Electrobun CEF
   desktop build — including the `WINDOW_TRANSPARENT` OSR mode that transparency work needs.
3. **The payoff**: how much of the 63% is scheduling (fixable with a patch) vs Canvas 2D itself
   (fixable only by the rewrite). Without a WebGPU floor measurement and a pre-registered kill
   number, "go/no-go recorded" is unfalsifiable.

## Scope

Throwaway spike code only, in `references/spike-ghostty-wasm/` (gitignored via `references/`).
One bench-only bun patch on a branch (S4). **No production files change** except this plan, the
brief, and `plans/README.md` at completion. Prereq: `zig` 0.15.2+ on PATH (`brew install zig`).

## Pre-registered kill thresholds (write results next to these; do not move them after measuring)

Descope to **a scheduling patch upstreamed to coder/ghostty-web** (and re-justify the rewrite on
fidelity/protocol grounds only, or drop it) if BOTH hold:

- **K1**: damage-scheduled canvas (S4) reaches GPU-process CPU ≤ **5%** on focused blinking idle
  and ≤ **1%** on unfocused idle, AND
- **K2**: damage-scheduled canvas burst-output and scroll scenarios land within **1.25×** of the
  WebGPU probe (S5) on the same scenarios, same machine, same methodology.

Hard STOPs are listed at the end. Thresholds may be revised only _before_ S4/S5 run, with the
revision committed to this file first.

## Steps

### S1 — wasm callback bridge (the P0 blocker)

```bash
git clone --depth 1 https://github.com/ghostty-org/ghostty.git references/spike-ghostty-wasm/ghostty
git -C references/spike-ghostty-wasm/ghostty fetch --depth 1 origin f64f4aca2c29b554d111b36c3d946a9bddd159ff
git -C references/spike-ghostty-wasm/ghostty checkout f64f4aca2c29b554d111b36c3d946a9bddd159ff
cd references/spike-ghostty-wasm/ghostty && zig build lib-vt -Dtarget=wasm32-freestanding -Doptimize=ReleaseSmall
```

Expected: `zig-out/bin/ghostty-vt.wasm` builds with **no patch**. Then, in a Node script
(`node:fs` + `WebAssembly.instantiate`):

1. **Symbol diff.** Enumerate wasm exports; diff against (a) the symbol set ghostling consumes —
   `grep -oE 'ghostty_[a-z_]+' references/ghostling/main.c | sort -u` — and (b) the constants the
   C headers define: every `GHOSTTY_TERMINAL_OPT_*` in `include/ghostty/vt/terminal.h`, plus
   `GHOSTTY_SYS_OPT_DECODE_PNG`, `GHOSTTY_RENDER_STATE_ROW_OPTION_DIRTY`, and
   `GHOSTTY_RENDER_STATE_OPTION_DIRTY` (do not assume names; read the headers). While there,
   record from `terminal.h` whether bell and OSC 52 clipboard callbacks exist at this rev —
   ghostling installs neither, so the header is the only ground truth.
2. **One callback per ABI shape** — the effects span three shapes and the easiest proves nothing
   about the others. Install a JS function for each (funcref table + `WebAssembly.Function`, a
   wasm trampoline export, or — if neither works — a minimal Zig shim module compiled alongside;
   document which mechanism won):
   - _pointer+length_: `OPT_WRITE_PTY` — `void (terminal, userdata, ptr, len)`; JS reads wasm
     memory.
   - _bool + out-struct pointer_: `OPT_DEVICE_ATTRIBUTES` (and `OPT_SIZE`) — JS writes a
     versioned `GHOSTTY_INIT_SIZED` struct into wasm memory at the correct wasm32 layout.
   - _struct returned by value_: `OPT_XTVERSION` returns `GhosttyString`
     (`references/ghostling/main.c:1154`) — under the wasm C ABI this lowers to a hidden sret
     pointer argument; the JS funcref must match the **lowered** signature.
     Expected result per shape: install succeeds and the callback observably fires (see step 3).
3. **End-to-end query replies.** With `write_pty` AND `device_attributes` installed (DA1 needs
   both — without `device_attributes` the test fails for the wrong reason), feed `vt_write` a DA1
   query (`\x1b[c`) and **assert JS receives the reply bytes**; send `CSI > q` and assert the
   xtversion string round-trips (proves the sret shape); send OSC 0 and assert the title-changed
   callback fires.
4. **PNG decode.** `ghostty_sys_set(GHOSTTY_SYS_OPT_DECODE_PNG, …)` is **process-global and must
   be installed before any terminal exists** (`references/ghostling/main.c:1273`) — record what
   that means for a multi-terminal single-wasm-instance design, and prove the decoder can hand
   back allocator-owned pixels (or record the decision that Kitty graphics uses a JS-side
   decoder instead).
5. **Same artifact in a browser page** (the running dev server is fine — never spawn a new one):
   same results for steps 2–3.

### S2 — WebGPU in the environments we ship

1. **CI runners:** verify Playwright's pinned Chromium exposes `navigator.gpu` and can create a
   device and submit a trivial frame headless on macOS dev machines and Linux CI
   (`--enable-unsafe-webgpu`, `--enable-features=Vulkan` on Linux); record exact flags.
2. **The shipping desktop:** Electrobun CEF (`apps/desktop/electrobun.config.ts:14` —
   `bundleCEF: true`, `defaultRenderer: 'cef'`). In the real desktop dev build, create a device
   and submit a frame. Then record behavior with `WINDOW_TRANSPARENT: true`
   (`apps/desktop/src/shared/window.ts`) — transparency flips CEF to offscreen rendering, and
   GPU canvas + OSR readback is exactly where WebGPU support gets shaky (memory
   `wallpaper-video-idle-gpu`). A broken transparent-mode result is a **recorded risk** for the
   brief, not necessarily a STOP (the opaque desktop path is current production).
3. If CI or CEF cannot run WebGPU at all: STOP-and-rethink. Any fallback direction adopted
   (WebGL2 target, software Dawn) **rewrites the brief's "no WebGL2 fallback" non-goal
   explicitly** as part of the go/no-go — the two must not silently coexist.

### S3 — upstream packaging check

Check whether ghostty upstream now ships an official wasm/JS package for libghostty-vt (repo,
npm, ghostty.org docs). If yes, evaluate consuming it instead of building our own artifact —
this reshapes Phase 1 and must be answered before it.

### S4 — scheduler control benchmark (on the build we actually ship)

The installed dep is **already patched** — `patches/ghostty-web@0.4.0.patch` adds
transparent-background `clearRect` and the `outline` cursor style — so do NOT bench coder's
unpatched source build (wrong build, and it drags in zig + their wasm patch). Instead, on a
bench-only branch, add a **second bun patch on the dist bundle** (same `patchedDependencies`
mechanism already in use; `startRenderLoop` is intact and readable in
`node_modules/ghostty-web/dist/ghostty-web.js:2662`) that replaces the standing loop with
schedule-on-{write, blink tick, selection, scroll, focus}.

Bench stock-patched vs damage-scheduled across: focused blinking idle, unfocused idle, burst
output (`yes`-style), sustained scroll. Reuse `references/ghostty-web/bench/versus.ts` scenario
design where it fits. Record browser GPU-process CPU per scenario (task-manager methodology from
memory `ghostty-render-loop-gpu`; sample ≥ 30s per scenario, tab visible). The branch is deleted
after numbers are recorded — it is a measurement control, not a shippable fix.

### S5 — WebGPU floor probe (sizes the payoff)

A minimal terminal-shaped WebGPU probe page — two instanced draws (bg rects + textured glyph
quads from a pre-filled atlas), ~200×50 cells at dpr 2 — driven at (a) idle/damage-only and
(b) full-refresh burst, measured with the **same** GPU-process methodology and on the same
machine as S4. This is the "what would the rewrite buy" floor that K2 compares against. Keep the
probe in the spike directory; it seeds Phase 2's renderer skeleton if the project proceeds.

## STOP conditions

- **S1**: the unpatched artifact cannot expose a workable callback bridge for **all three ABI
  shapes**, and a small custom Zig wrapper module can't provide one cleanly either → halt the
  project; reassess (upstream contribution; coder-style patch as last resort).
- **S2**: neither Playwright CI nor the CEF desktop build can run WebGPU at all → halt; the
  go/no-go must choose a different renderer target and rewrite the brief's non-goals.
- **S4/S5**: kill thresholds K1+K2 both met → descope to the upstream scheduling patch; the
  rewrite proceeds only if re-justified on fidelity/protocol grounds, recorded in the brief.
- Any step requires editing production platform code (beyond the bench branch) → out of scope
  here; stop and report.

## Done criteria

- [ ] S1 answers recorded: symbol diff, winning bridge mechanism per ABI shape, DA1/xtversion/
      title round-trips in Node AND browser, PNG-decode decision with the process-global
      constraint spelled out.
- [ ] S2 answers recorded: exact CI flags; CEF opaque-mode result; CEF transparent/OSR result
      logged as risk in the brief.
- [ ] S3 answer recorded (upstream package: yes/no/what).
- [ ] S4 + S5 numbers tabulated per scenario; K1/K2 evaluated against the pre-registered
      thresholds; bench branch deleted.
- [ ] Go / descope / no-go decision written into `docs/ghostty-webgpu-brief.md` with the numbers
      inline; this plan file deleted and `plans/README.md` updated in the same change (a "go"
      replaces this row with the Phase 1 plan when that plan is written).
