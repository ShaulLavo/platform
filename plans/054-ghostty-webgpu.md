# Plan 054: `ghostty-webgpu` — full Ghostty terminal for the web on WebGPU

## Status

**Phase 0 READY; later phases are a brief, not yet executable.** Revised 2026-08-22 after external
review; the review's findings are folded in below (callback bridge, scheduler spec, blink-aware
gates, transparency contract, real seam inventory, atlas generations, pass topology, corrected
perf diagnosis, phase split).

Planned at: platform `cf070159`; references cloned into `references/` (gitignored):
`ghostty-web` @ `1858a59` (coder/ghostty-web, source of our vendored `ghostty-web@0.4.0`),
`ghostling` @ `63842bf` (ghostty-org/ghostling), which pins upstream ghostty
`f64f4aca2c29b554d111b36c3d946a9bddd159ff` — the rev all C-API claims below were read at.

Only **Phase 0** in this document is executable. Phases 1–6 are the project brief; each gets its
own numbered plan (with drift check, commands, step gates) when its predecessor completes.

## Why this matters

Measured 2026-08-22 (memory `ghostty-render-loop-gpu`): with the wallpaper disabled, an **idle**
terminal showing static output drives the browser's shared GPU process to ~63% whenever the tab is
visible, dropping to ~0% the moment the tab hides (rAF throttling) — which masks the cost exactly
when people check. Confirmed causes in `ghostty-web`:

1. `startRenderLoop()` (`references/ghostty-web/lib/terminal.ts:1167`) runs `renderer.render(...)`
   on **every** `requestAnimationFrame` from `open()` until dispose. There is no idle state.
2. The renderer is pure Canvas 2D (`fillText`/`fillRect`; the only contexts requested are `"2d"`).

**Diagnosis precision (corrected):** the renderer is _not_ naively full-grid — `renderer.ts:424`
builds `rowsToRender` from dirty/selection/hyperlink rows (plus adjacent rows for glyph overflow)
and redraws only those; scrolled viewports force full redraws. So the idle burn comes from the
standing per-frame loop and whatever per-frame work survives the dirty-row filter (render-state
polling, cursor pass, canvas flush/composite), not from re-rasterizing every cell. How much of the
63% is _scheduling_ vs _Canvas 2D itself_ is unknown — Phase 0 measures exactly that before the
rewrite is committed (S4 below).

## Goal and non-goals

**Goal:** a standalone project `ghostty-webgpu` — upstream libghostty-vt compiled to wasm driving
a damage-scheduled WebGPU renderer modeled on Ghostty's native Metal renderer. It lives in **its
own repository** as a sibling of platform (`/Users/shaul/Desktop/D/ghostty-webgpu`), Editor-style:
platform consumes it via root `overrides` + `bun link:`, compiled against its `dist`. Publishable
to npm on its own (unscoped name `ghostty-webgpu`).

**Non-goals (explicit):**

- No WebGL2/Canvas fallback renderer inside the package. The rollout fallback is platform's
  existing `ghostty-web` path behind a setting, kept **through Phase 5 plus a parity soak** —
  Kitty graphics and the protocol audit land in Phase 5, so removal before that would strand
  features. Removal is Phase 6's first gate.
- No tmux-style multiplexing, no search — native Ghostty doesn't own these either.
- Custom user shaders (Ghostty's GLSL cursor/background shaders) are out of scope for all phases
  in this document; WebGPU speaks WGSL and translation is its own project.

## Load-bearing facts from the reference read

Verified at the pins above; re-verify in each phase's drift check:

1. **Upstream libghostty-vt builds to wasm unpatched.** ghostling links it via `zig build lib-vt`
   (CMake `FetchContent` on the ghostty repo, no patch step); coder's `build-wasm.sh` uses the
   same target as `zig build lib-vt -Dtarget=wasm32-freestanding -Doptimize=ReleaseSmall`
   (Zig 0.15.2+, ~20s) _plus a patch that predates the official `ghostty_terminal_*` API_.
2. **BUT the C API is callback-shaped, and that is the feasibility risk.** Essential behavior
   arrives through C function pointers installed with `ghostty_terminal_set`:
   `GHOSTTY_TERMINAL_OPT_WRITE_PTY` (query replies — without it DA/DSR/size queries are silently
   dropped and vim/htop degrade or hang), `OPT_SIZE`, plus title, bell, clipboard (OSC 52), and
   PNG decode effects (`references/ghostling/main.c:1312-1340`). Checking exported `ghostty_*`
   symbols is **insufficient**; JS must be able to install functions the wasm side can call —
   funcref table entries / trampolines, and allocator-owned buffers for the PNG-decode path.
   Phase 0 S1 proves or falsifies this before anything else is built.
3. **The render API has the damage primitives, but no reference implementation of damage
   scheduling exists.** `ghostty_render_state_update` snapshots terminal → render state; global
   dirty and per-row dirty are independent flags that the _consumer_ manages
   (`include/ghostty/vt/render.h`). ghostling is **not** that reference: its raylib loop calls
   `render_state_update` + `BeginDrawing` + full-row-iteration `render_terminal()` every frame
   and never reads `ROW_DATA_DIRTY` (`main.c:1542`, `:837`). Our scheduler is specified in this
   plan (below), not inherited.
4. **Kitty graphics implies layered drawing.** ghostling renders three image layers relative to
   the cell grid: below backgrounds, below text, above text (`main.c:827` area). "Two instanced
   draw calls" is the **text-only** fast path, not a renderer invariant.
5. **ghostty-web's TS layer remains prior art** for web-only concerns (fit sizing, link
   providers, selection UX, IME, bench scenarios) and its renderer's dirty-row bookkeeping is
   worth reading before writing ours. Steal designs, not code.

## Architecture (brief for Phases 1+)

Five layers, one package. Only `dom/` and `render/` may touch browser APIs; `core/` and `term/`
run under plain `vitest` in Node.

```
ghostty-webgpu/            (own repo, sibling of platform and Editor)
  src/
    core/     wasm loading + typed bindings over the libghostty-vt C ABI,
              including the callback/effects bridge from Phase 0. Zero DOM.
    term/     Terminal orchestrator: write() → vt_write, resize, viewport
              scroll, selection model, render-state ownership, OSC 8 links,
              title/bell/clipboard effects surfaced as events.
    render/   WebGPU renderer (spec below).
    dom/      host wiring: keyboard/IME → key encoder, mouse → mouse encoder,
              clipboard, ResizeObserver fit, scrollbar UI from
              GHOSTTY_TERMINAL_DATA_SCROLLBAR, accessibility mirror.
  ghostty-vt.wasm          committed artifact (consumers never need Zig)
  scripts/build-wasm.ts    pinned upstream rev; unpatched `zig build lib-vt`
  AGENTS.md                own instructions — the repo does NOT inherit
                           platform's CLAUDE.md; must carry the never-nester
                           control-flow rules and the comments policy.
```

### Render scheduling (the actual algorithm, not "like ghostling")

State: `framePending: boolean`, `blinkTimer` (armed only when cursor-blink is on AND focused AND
document visible), `needsFullRebuild` (resize, theme, scroll-position change, atlas generation
bump, device restore).

1. Wake sources — vt bytes written, blink tick, selection change, scroll, resize, focus/theme
   change, atlas/device invalidation — call `schedule()`. If `framePending`, they return (damage
   coalescing: at most one pending frame); else set it and `requestAnimationFrame(frame)`.
2. `frame()`: clear `framePending`; call `ghostty_render_state_update`; read global dirty. If
   nothing is dirty and no overlay (cursor/selection/scrollbar fade) changed, submit nothing.
3. Rebuild instance data only for rows whose `ROW_DATA_DIRTY` is set (or all rows when
   `needsFullRebuild`); after painting, clear each row's dirty flag and reset the global dirty
   flag — the acknowledgement protocol the C API expects the consumer to run.
4. No standing loop exists anywhere: an idle, unfocused terminal has zero armed timers and zero
   rAF callbacks. This is asserted by test, with blink-aware gates (Phase 2 gates below).

### Renderer spec

- **Text fast path: two instanced draws** (bg-cell rects, then glyph quads from the atlas),
  per-cell instances in a storage buffer, `writeBuffer` deltas per dirty row. Kitty graphics
  (Phase 5) inserts its three textured-quad layers around these; the pass count is whatever
  z-order requires that frame.
- **Glyph atlas with generation tracking.** Shelf-packed pages (grayscale + color), rasterized
  via OffscreenCanvas 2D scratch. Every atlas page carries a generation; instance records carry
  the generation they were built against. **Eviction bumps the generation and marks every row
  whose instances reference the evicted page for rebuild — LRU eviction without invalidation
  corrupts clean rows.** GPU device loss reuses the same path: bump all generations,
  `needsFullRebuild`, re-upload. The CJK/emoji eviction stress test belongs to the phase that
  introduces eviction (Phase 2), not later.
- **Transparency contract — two color systems, kept apart.** `GhosttyColorRgb` has no alpha; the
  render-state background RGB is kept for _terminal color semantics_ (inverse video, minimum
  contrast, palette defaults). _Canvas compositing_ is separate: default (unset-background) cells
  are cleared to alpha 0; only cells with an explicit background paint opaquely; canvas context
  `alphaMode: 'premultiplied'` (which governs blending semantics only — it does not make an
  opaque clear transparent). Platform's pane already paints the ground and the terminal section
  deliberately paints none (`packages/ui/src/styles/globals.css:256`, a parse contract for
  ghostty's color reader — plain colors only, no `color-mix()`). Gates: a GPU readback assertion
  that empty-cell alpha is 0, plus a real workbench compositing test over a translucent pane
  (memory `terminal-ghostty-transparency` is the bug this prevents).
- **Decorations in-shader:** cursor styles, underline styles incl. undercurl, strikethrough,
  minimum-contrast — per-instance flags in the fragment shader.
- **Main thread first;** `render/` stays free of direct DOM event access so it can move behind
  `transferControlToOffscreen` later without redesign.

### Font pipeline (two stages, deliberate)

- Phase 1–4: per-cell grapheme clusters via `fillText` into the atlas — today's fidelity, no
  cross-cell ligatures. Atlas keys on (font, size, cluster/glyph-id) so the upgrade is additive.
- Phase 6 (parity): HarfBuzz-wasm shaping; glyph outlines via HarfBuzz draw API → `Path2D` →
  same atlas keyed by glyph id. Needs font _bytes_: bundled default (JetBrains Mono, as
  ghostling), user font URLs, `queryLocalFonts()` where granted; browser-shaped `fillText`
  remains the fallback for CSS-name-only fonts.

## The platform seam (corrected: it is NOT import-level)

Inventory of ghostty-web API platform consumes today (verify in the Phase 5 plan's drift check):

- `panel.tsx` — `new Terminal({allowTransparency, cursorBlink, cursorStyle, fontFamily,
fontSize, scrollback, smoothScrollDuration, theme})`, mutable `options` writes (cursor style
  patching, focus handover), `loadAddon(FitAddon)` + `fit()` + `observeResize()`, `open()`,
  `write`/`writeln`, `onData`, `onResize`, dispose lifecycle.
- `hooks/use-links.ts` — `ILink`, link providers, `buffer.active.getLine()` reads.
- `utils/commands.ts` + `utils/capture.ts` — `getSelection()`, `getScrollbackLength()`,
  `clear()`, paste/input, scrollback capture.

Consequence: define a **platform-local structural terminal contract** (a type in the terminal
feature covering exactly the consumed surface above) with **two adapters** — one over ghostty-web,
one over ghostty-webgpu — rather than pretending the new package can be swapped at the import.
The contract is also the checklist for what `term/`+`dom/` must implement.

**Renderer switching semantics (decided):** flipping the `terminal.renderer` setting recreates
the terminal view and reconnects to the same server-side PTY session (sessions already survive
socket reconnects); it does not attempt live in-place renderer swap and does not require an app
restart. Settings key registered in `packages/contracts/src/settings/keys.ts`, **application
scope** (selects an execution path; window scope is forbidden for that), wired in the same pass.

## Phase 0 — feasibility spike (EXECUTABLE)

Everything here is throwaway-quality code in `references/spike-ghostty-wasm/` (gitignored via
`references/`); the deliverable is answers, committed as updates to this plan. Prereq: `zig`
0.15.2+ on PATH (`brew install zig`).

### S1 — wasm callback bridge (the P0 blocker)

```bash
git clone --depth 1 https://github.com/ghostty-org/ghostty.git references/spike-ghostty-wasm/ghostty
git -C references/spike-ghostty-wasm/ghostty fetch --depth 1 origin f64f4aca2c29b554d111b36c3d946a9bddd159ff
git -C references/spike-ghostty-wasm/ghostty checkout f64f4aca2c29b554d111b36c3d946a9bddd159ff
cd references/spike-ghostty-wasm/ghostty && zig build lib-vt -Dtarget=wasm32-freestanding -Doptimize=ReleaseSmall
```

Expected: `zig-out/bin/ghostty-vt.wasm` builds with **no patch**. Then, in a Node script
(`node:fs` + `WebAssembly.instantiate`):

1. Enumerate exports; diff against the full symbol set ghostling consumes
   (`grep -oE 'ghostty_[a-z_]+' references/ghostling/main.c | sort -u`) **and** the
   `GHOSTTY_TERMINAL_OPT_*` callback constants in `include/ghostty/vt/terminal.h`.
2. Install a JS function as `OPT_WRITE_PTY` (exported funcref table + `WebAssembly.Function`, a
   wasm trampoline export, or — if neither exists — a minimal Zig shim module we compile
   alongside; document which). Feed `vt_write` a DA1 query (`\x1b[c`); **assert JS receives the
   reply bytes.** Repeat for title (OSC 0) and bell (BEL).
3. Prove the PNG-decode effect can hand back allocator-owned pixels (or record that Kitty
   graphics needs a JS-side decoder — acceptable, but it must be a recorded decision, not a
   surprise).
4. Instantiate the same artifact in a browser page (the running dev server is fine) — same
   results.

**STOP condition:** if the unpatched artifact cannot expose a workable callback bridge and a
small custom Zig wrapper module can't provide one cleanly either, halt the project here and
reassess (options: upstream contribution, coder-style patch as last resort).

### S2 — WebGPU in CI runners

Verify Playwright's pinned Chromium exposes `navigator.gpu` and can create a device headless on
macOS dev machines and Linux CI (`--enable-unsafe-webgpu`, `--enable-features=Vulkan` on Linux);
record exact flags. STOP-and-rethink (fallback: WebGL2 target or software Dawn) if CI cannot run
WebGPU at all.

### S3 — upstream packaging check

Check whether ghostty upstream has since shipped an official wasm/JS package for libghostty-vt
(repo, npm, ghostty.org docs). If yes, evaluate consuming it instead of building our own artifact
— this changes Phase 1's shape and must be answered before it.

### S4 — scheduler control benchmark (quantify before rewriting)

Patch **a local copy** of ghostty-web (never the vendored dep) with damage scheduling only:
`startRenderLoop` replaced by schedule-on-{write, blink tick, selection, scroll, focus}. Bench
stock-canvas vs damage-scheduled-canvas across: focused blinking idle, unfocused idle, burst
output (`yes`/vtebench-style), scrolling. Record browser GPU-process CPU for each (the
task-manager methodology from memory `ghostty-render-loop-gpu`). This tells us how much of the
63% is scheduling vs Canvas 2D itself — it sizes the WebGPU payoff honestly and gives Phase 2 its
baseline numbers. (It is a measurement control, not a shippable fix.)

**Phase 0 exit:** S1–S4 answers written into this plan; go/no-go recorded.

## Phases 1–6 (brief; each becomes its own numbered plan)

1. **Repo + core bindings.** Sibling repo bootstrap (contracts-style tooling, own AGENTS.md with
   never-nester + comments rules, MIT, dist-first build since platform compiles against `dist` —
   memories `editor-perf-and-linking`, `editor-dist-stale-after-pull`); committed wasm; `core/`
   bindings incl. the S1 callback bridge; node tests: VT corpora in, render-state cells asserted,
   dirty acknowledgement protocol correct. Platform CI provisioning gains the sibling repo
   (memory `ci-pipeline-environment`) when Phase 5 lands, not before.
2. **Damage-scheduled WebGPU renderer.** The scheduler spec + text fast path + atlas with
   generations/eviction (stress test here) + transparency contract + device-loss recovery.
   Gates: unfocused or blink-off idle → **zero** submitted frames over 10s (counter test);
   focused blinking idle → exactly one frame per blink transition, no standing rAF; damage
   coalescing → at most one pending frame under write storms; empty-cell alpha readback = 0;
   scroll throughput ≥ the S4 damage-scheduled-canvas baseline.
3. **DOM/input.** Key/mouse encoders (Kitty keyboard protocol), IME composition, clipboard incl.
   OSC 52 effect, bracketed paste, focus reporting, fit/resize, selection UX, OSC 8 + regex
   links, accessibility mirror. Gate: vim/htop/lazygit + kitty-keyboard test script behave.
4. **Platform adapter + dual-renderer rollout.** The structural contract + two adapters + the
   `terminal.renderer` setting (application scope) + recreate-and-reconnect switching. Gate:
   daily-drivable; before/after GPU numbers recorded against S4 baselines.
5. **Full-Ghostty surface.** Kitty graphics (three image layers, deferred texture destruction
   after `onSubmittedWorkDone`), scrollbar polish, protocol audit vs upstream docs. Gate: icat
   works; audit checklist complete. Then the parity soak starts.
6. **Shaping parity + release.** HarfBuzz shaping/ligatures/emoji pages/fallback chain; delete
   the ghostty-web path + dependency after the soak; README + demo, CI, npm publish, upstream-rev
   bump script. Gate: fresh Vite app outside the monorepo runs the published package.

## Risks

- **The callback bridge (S1) is the load-bearing unknown.** Everything else assumes it lands.
- **WebGPU availability:** Chromium ≥ 113 fine (dev browser, CEF desktop); WKWebView needs
  Safari 26+; CI is S2's question. The dual-renderer rollout keeps canvas until we choose.
- **Upstream API churn:** libghostty-vt is young; bump pins only when ghostling's moves.
- **Ligatures across cells** are known-hard; deferred to Phase 6 with the atlas keyed to survive.
- **Accessibility:** the `dom/` mirror ships with Phase 3 input work, not as polish.

## Drift check (before executing Phase 0)

- Re-read `panel.tsx`, `use-links.ts`, `utils/commands.ts` — the seam inventory above matches
  platform `cf070159`; re-inventory if the terminal feature moved.
- Confirm the reference clones still sit at the pins in Status (they are shallow; re-clone if
  pruned).
- `references/` is still gitignored (`.gitignore:37`).
