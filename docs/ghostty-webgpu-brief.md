# ghostty-webgpu — project brief (Phases 1–6)

Strategy document per `plans/README.md`: this is the architecture and phase brief for the
`ghostty-webgpu` project. It is **not executable**. The executable feasibility spike is
[Plan 054](../plans/054-ghostty-webgpu.md); each phase below gets its own numbered plan (with
drift check, commands, step gates) only after its predecessor — and Phase 0's go decision —
completes. Facts here were verified at the pins recorded in Plan 054's Status block.

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
  features. Removal is Phase 6's first gate. _Exception clause:_ if Plan 054's S2 finds WebGPU
  unusable in CI or the shipping CEF desktop build, this non-goal is rewritten as part of the
  go/no-go, not silently violated.
- No tmux-style multiplexing, no search — native Ghostty doesn't own these either.
- Custom user shaders (Ghostty's GLSL cursor/background shaders) are out of scope for all phases
  in this document; WebGPU speaks WGSL and translation is its own project.

## Load-bearing facts from the reference read

Verified at Plan 054's pins; re-verify in each phase plan's drift check:

1. **Upstream libghostty-vt builds to wasm unpatched.** ghostling links it via `zig build lib-vt`
   (CMake `FetchContent`, no patch step); the wasm target is
   `zig build lib-vt -Dtarget=wasm32-freestanding -Doptimize=ReleaseSmall` (Zig 0.15.2+, ~20s).
   coder/ghostty-web still applies a patch that predates the official `ghostty_terminal_*` API.
2. **The C API is callback-shaped, across three ABI shapes** (`references/ghostling/main.c:1324`
   installs `userdata`, `write_pty`, `size`, `device_attributes`, `xtversion`, `title_changed`,
   `color_scheme`; PNG decode is **process-global** via
   `ghostty_sys_set(GHOSTTY_SYS_OPT_DECODE_PNG, …)` at `main.c:1273`, required before any
   terminal exists — a real constraint for a per-tab wasm design):
   - `void (terminal, userdata, ptr, len)` — `write_pty`; JS reads wasm memory. Easiest.
   - `bool` with an out-struct pointer — `size`, `device_attributes`; JS writes versioned
     `GHOSTTY_INIT_SIZED` C structs at the correct wasm32 layout.
   - **struct returned by value** — `effect_xtversion` returns `GhosttyString`
     (`main.c:1154`); under the wasm C ABI this lowers to a hidden sret pointer argument, so a
     JS funcref must match the lowered signature exactly. Most likely to break.
     Whether bell / OSC 52 clipboard callbacks exist must be read from `include/ghostty/vt/
terminal.h`, not inferred from ghostling (it installs neither).
3. **The render API has the damage primitives; the acknowledgement calls have a reference, the
   scheduling does not.** Global dirty and per-row dirty are independent consumer-managed flags
   (`include/ghostty/vt/render.h`). ghostling _does_ run the acknowledgement half — clears row
   dirty via `GHOSTTY_RENDER_STATE_ROW_OPTION_DIRTY` (`main.c:939`) and global dirty via
   `GHOSTTY_RENDER_STATE_OPTION_DIRTY` (`main.c:1015`) — those are the exact call shapes to
   crib. But it never _gates_ on them: its raylib loop updates render state and draws every row
   every frame (`main.c:1542`, `:837`). The damage _scheduler_ below is ours.
4. **Kitty graphics implies layered drawing.** ghostling renders three image layers relative to
   the cell grid: below backgrounds, below text, above text (`main.c:827` area). "Two instanced
   draw calls" is the **text-only** fast path, not a renderer invariant.
5. **ghostling is not a transparency reference either:** it hardcodes window background alpha to
   255 (`main.c:1550`). The transparency contract below is derived from platform's requirements,
   not from either reference.
6. **ghostty-web's TS layer remains prior art** for web-only concerns (fit sizing, link
   providers, selection UX, IME, bench scenarios) and its renderer's dirty-row bookkeeping
   (`renderer.ts:424`) is worth reading before writing ours. Steal designs, not code.

## Architecture

Five layers, one package. Only `dom/` and `render/` may touch browser APIs; `core/` and `term/`
run under plain `vitest` in Node.

```
ghostty-webgpu/            (own repo, sibling of platform and Editor)
  src/
    core/     wasm loading + typed bindings over the libghostty-vt C ABI,
              including the callback/effects bridge proven in Plan 054 S1
              and the process-global sys interface (PNG decode). Zero DOM.
    term/     Terminal orchestrator: write() → vt_write, resize, viewport
              scroll, selection model, render-state ownership, OSC 8 links,
              title/color-scheme/size effects surfaced as events.
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

### Render scheduling (the actual algorithm)

State: `framePending: boolean`, `blinkTimer` (armed only when cursor-blink is on AND focused AND
document visible), `needsFullRebuild` (resize, theme, scroll-position change, atlas generation
bump, device restore).

1. Wake sources — vt bytes written, blink tick, selection change, scroll, resize, focus/theme
   change, atlas/device invalidation — call `schedule()`. If `framePending`, they return (damage
   coalescing: at most one pending frame); else set it and `requestAnimationFrame(frame)`.
2. `frame()`: clear `framePending`; call `ghostty_render_state_update`; read global dirty. If
   nothing is dirty and no overlay (cursor/selection/scrollbar fade) changed, submit nothing.
3. Rebuild instance data only for rows whose dirty flag is set (or all rows when
   `needsFullRebuild`); after painting, clear each row's dirty flag
   (`ROW_OPTION_DIRTY` ← false) and reset the global dirty flag (`OPTION_DIRTY` ← false) — the
   acknowledgement protocol, same call shapes as ghostling `main.c:939`/`:1015`.
4. No standing loop exists anywhere: an idle, unfocused terminal has zero armed timers and zero
   rAF callbacks. Asserted by test, with blink-aware gates (Phase 2 gates below).

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
- **Parity with platform's shipped patch.** Platform patches the vendored dep
  (`patches/ghostty-web@0.4.0.patch`): transparent-background `clearRect` behavior and the
  `outline` cursor style. Both are product requirements ghostty-webgpu must reproduce, and
  Phase 6's deletion must remove `patchedDependencies` and the patch file, not just the import.
- **Decorations in-shader:** cursor styles (incl. `outline`), underline styles incl. undercurl,
  strikethrough, minimum-contrast — per-instance flags in the fragment shader.
- **Main thread first;** `render/` stays free of direct DOM event access so it can move behind
  `transferControlToOffscreen` later without redesign.

### Font pipeline (two stages, deliberate)

- Phase 1–4: per-cell grapheme clusters via `fillText` into the atlas — today's fidelity, no
  cross-cell ligatures. Atlas keys on (font, size, cluster/glyph-id) so the upgrade is additive.
- Phase 6 (parity): HarfBuzz-wasm shaping; glyph outlines via HarfBuzz draw API → `Path2D` →
  same atlas keyed by glyph id. Needs font _bytes_: bundled default (JetBrains Mono, as
  ghostling), user font URLs, `queryLocalFonts()` where granted; browser-shaped `fillText`
  remains the fallback for CSS-name-only fonts.

## The platform seam (it is NOT import-level)

Platform consumes ghostty-web across the terminal feature, not just `panel.tsx`. Known surface at
platform `2b503172` — but the Phase 4 plan must **generate the contract from a grep of the
feature**, not from this prose:

- `panel.tsx` — `new Terminal({allowTransparency, cursorBlink, cursorStyle, fontFamily,
fontSize, scrollback, smoothScrollDuration, theme})`, mutable `options` writes (cursor style
  patching incl. the patched `outline` style, focus handover), `loadAddon(FitAddon)` + `fit()` +
  `observeResize()`, `open()`, `write`/`writeln`, `onData`, `onResize`, dispose lifecycle.
- `hooks/use-links.ts` — `ILink`, `registerLinkProvider`, `buffer.active.getLine()` reads.
- `utils/commands.ts` + `utils/capture.ts` — `getSelection()`, `getSelectionPosition()`,
  `selectAll()`, `getScrollbackLength()`, `clear()`, `reset()`, `scrollToTop()`,
  `scrollToBottom()`, `cols`/`rows`, paste/input, scrollback capture.
- `utils/theme.ts` — `ITheme` type.
- Build config: `optimizeDeps.exclude: ['ghostty-web']` in `apps/web/vite.config.ts:27`; the new
  package needs the same exclusion (memory: without it, dep edits look like no-ops until a Vite
  restart).

Consequence: define a **platform-local structural terminal contract** (a type in the terminal
feature covering exactly the grep-generated surface) with **two adapters** — one over ghostty-web,
one over ghostty-webgpu. The contract is also the checklist for what `term/`+`dom/` must
implement.

**Renderer switching semantics (decided):** flipping the setting recreates the terminal view and
reconnects to the same server-side PTY session (sessions already survive socket reconnects); no
live in-place swap, no app restart. Settings key `terminal.integrated.renderer` (matching the
existing `terminal.integrated.*` namespace, `packages/contracts/src/settings/keys.ts:143`),
**application scope** — the honest justification: a workspace file ships inside a cloned
repository, and a cloned repo must not be able to force an experimental GPU path onto the host.
Registered and wired in the same pass.

## Phases

1. **Repo + core bindings.** Sibling repo bootstrap (contracts-style tooling, own AGENTS.md with
   never-nester + comments rules, MIT, dist-first build since platform compiles against `dist` —
   memories `editor-perf-and-linking`, `editor-dist-stale-after-pull`); committed wasm; `core/`
   bindings incl. the S1 callback bridge and sys interface; node tests: VT corpora in,
   render-state cells asserted, dirty acknowledgement protocol correct. Platform CI provisioning
   gains the sibling repo (memory `ci-pipeline-environment`) when Phase 4 lands, not before.
2. **Damage-scheduled WebGPU renderer.** The scheduler + text fast path + atlas with
   generations/eviction (stress test here) + transparency contract + patch-parity items
   (`outline` cursor, transparent clear) + device-loss recovery.
   Gates: unfocused or blink-off idle → **zero** submitted frames over 10s (counter test);
   focused blinking idle → exactly one frame per blink transition, no standing rAF; damage
   coalescing → at most one pending frame under write storms; empty-cell alpha readback = 0;
   scroll throughput ≥ the Plan 054 S4 damage-scheduled-canvas baseline.
3. **DOM/input.** Key/mouse encoders (Kitty keyboard protocol), IME composition, clipboard,
   bracketed paste, focus reporting, fit/resize, selection UX, OSC 8 + regex links,
   accessibility mirror. Gate: vim/htop/lazygit + kitty-keyboard test script behave.
4. **Platform adapter + dual-renderer rollout.** Grep-generated structural contract + two
   adapters + `terminal.integrated.renderer` + recreate-and-reconnect switching + Vite
   `optimizeDeps` exclusion. Gate: daily-drivable; before/after GPU numbers recorded against
   S4/S5 baselines, including the CEF desktop build.
5. **Full-Ghostty surface.** Kitty graphics (three image layers, deferred texture destruction
   after `onSubmittedWorkDone`, process-global PNG decode decision from S1), scrollbar polish,
   protocol audit vs upstream docs. Gate: icat works; audit checklist complete. Then the parity
   soak starts.
6. **Shaping parity + release.** HarfBuzz shaping/ligatures/emoji pages/fallback chain; delete
   the ghostty-web path — dependency, `patchedDependencies` entry, and
   `patches/ghostty-web@0.4.0.patch` — after the soak; README + demo, CI, npm publish,
   upstream-rev bump script. Gate: fresh Vite app outside the monorepo runs the published
   package.

## Risks

- **The callback bridge (Plan 054 S1) is the load-bearing unknown** — especially the
  sret-lowered struct-return shape. Everything else assumes it lands.
- **WebGPU availability:** dev-browser Chromium is fine; the shipping desktop is Electrobun CEF
  (`bundleCEF: true`, `defaultRenderer: 'cef'`) where WebGPU is unverified, and
  `WINDOW_TRANSPARENT: true` switches CEF to offscreen rendering — GPU canvas + OSR readback is
  exactly where WebGPU gets shaky (Plan 054 S2 measures both; memory
  `wallpaper-video-idle-gpu`). WKWebView needs Safari 26+. The dual-renderer rollout keeps
  canvas until we choose.
- **The perf payoff is unproven until Plan 054 S4/S5 report.** If damage-scheduled canvas clears
  the pre-registered thresholds, the honest outcome is a scheduling patch upstreamed to
  coder/ghostty-web and this project is re-justified (or not) on fidelity/protocol grounds alone.
- **Upstream API churn:** libghostty-vt is young; bump pins only when ghostling's moves.
- **Ligatures across cells** are known-hard; deferred to Phase 6 with the atlas keyed to survive.
- **Accessibility:** the `dom/` mirror ships with Phase 3 input work, not as polish.
