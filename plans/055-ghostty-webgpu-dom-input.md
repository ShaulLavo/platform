# Plan 055: Ship DOM input and an interactive terminal host for `ghostty-webgpu`

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in **STOP conditions**
> occurs, stop and report it; do not improvise. Work in the existing platform and
> `ghostty-webgpu` worktrees. Do not create a branch, commit, push, or open a PR unless the
> operator explicitly asks. Keep `core/` and `term/` free of browser globals, keep nesting at
> three levels or less, and do not copy coder/ghostty-web source.
>
> **Platform drift check (run first)**:
> `git -C /Users/shaul/Desktop/D/platform diff --stat 546a4c84..HEAD -- docs/ghostty-webgpu-brief.md plans/README.md plans/055-ghostty-webgpu-dom-input.md apps/web/src/features/terminal`
>
> **Package drift check (run first)**:
> `git -C /Users/shaul/Desktop/D/ghostty-webgpu diff --stat dd0fe1e..HEAD -- .github/workflows/ci.yml AGENTS.md README.md package.json bun.lock scripts/bridge.zig src demo docs/phase-3-acceptance.md tsconfig.json tsconfig.build.json vitest.config.ts vitest.browser.config.ts`
>
> If either command reports changes, compare the current-state excerpts below with the live code.
> Drift in platform's terminal feature is informational in this phase unless it changes the
> required package seam. Drift in any package file named in Scope or in root `bun.lock` is a STOP
> condition until this plan is reconciled. If CI no longer performs the root frozen install and
> verify sequence described below, stop and reconcile the demo-dependency isolation before editing.
> Also run:
>
> ```bash
> git -C /Users/shaul/Desktop/D/platform/references/ghostty-web rev-parse --short HEAD
> git -C /Users/shaul/Desktop/D/platform/references/ghostling rev-parse --short HEAD
> rg -n "GHOSTTY_UPSTREAM_REVISION" /Users/shaul/Desktop/D/ghostty-webgpu/src/core/version.ts
> ```
>
> Expected: `1858a59`, `63842bf`, and upstream Ghostty
> `f64f4aca2c29b554d111b36c3d946a9bddd159ff`. If a pin differs, stop and reconcile the C ABI
> against the new pin before editing TypeScript.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Phase 2 at `ghostty-webgpu` commit `dd0fe1e`
- **Category**: direction
- **Planned at**: platform commit `546a4c84` and `ghostty-webgpu` commit `dd0fe1e`, 2026-08-22
- **Rebased onto**: `ghostty-webgpu` commit `504701e`, which bumped the upstream pin to
  `da5ddcb0857c0e4ddb32f7a089911e9038d040f3` (registers
  `GhosttyTerminalSelectionFormatOptions` in `ghostty_type_json`, unblocking Step 1's
  no-hardcoded-offsets rule) and migrated two breaking ABI changes: the generic
  `ghostty_wasm_alloc`/`ghostty_wasm_free` allocators (null on zero length) and the versioned
  `{schema, abi, types}` type manifest.

## Upstream deviations to carry

One known upstream inconsistency, worked around by cadence rather than by patching or by
reimplementing semantics in JS (see the mouse-encoder rule below):

- `ghostty_mouse_encoder_setopt_from_terminal` clears `last_cell` unconditionally, while the
  individual `.event`/`.format` setopts only clear it when the value actually changes
  (`src/terminal/c/mouse_encode.zig:195` vs `:146`/`:158`). Byte-identical at `f64f4ac`,
  `da5ddcb`, and upstream `main` as of 2026-08-22, so no pin bump fixes it. Worth reporting
  upstream; if it is fixed and pinned, per-encode sync becomes safe and the accepted residual
  below disappears. Re-check this in the drift check of any plan that bumps the pin.

## Why this matters

Phases 1 and 2 proved the upstream wasm ABI and the damage-scheduled WebGPU renderer, but the
package still cannot accept browser input or host an interactive terminal. This phase connects
the browser to libghostty-vt's native input, selection, viewport, and hyperlink APIs, adds the DOM
accessibility and fit layers, and leaves a package surface that Phase 4 can adapt into platform.

The important design choice is to use libghostty-vt as the single owner of terminal semantics.
The checked-in wasm already exports key and mouse encoders, paste and focus encoding, selection
gestures, selection formatting, grid references, OSC 8 hyperlink reads, and viewport scrolling.
Do not port ghostty-web's hand-written escape tables or its parallel absolute-row selection state.
Browser code normalizes DOM events; libghostty-vt decides what bytes and selection they mean.

## Current state

### Intent and phase boundary

- `platform/docs/ghostty-webgpu-brief.md:199-205` defines Phase 3 as key/mouse input, Kitty
  keyboard, IME, clipboard and bracketed paste, focus reporting, fit/resize, selection, links, and
  an accessibility mirror. Platform adapters, the renderer setting, and reconnect switching are
  Phase 4 and stay out of scope here.
- Phase 3 must preserve Phase 2's no-standing-loop invariant. A temporary timer while selecting,
  hiding the scrollbar, or blinking the focused cursor is allowed; an idle blink-off host must end
  with no queued rAF and no timer.

### Package gaps at `dd0fe1e`

- `src/core/abi.ts:11-49` already enumerates the relevant terminal options, including Bell `2`,
  ColorScheme `7`, Selection `21`, DefaultCursorStyle `22`, DefaultCursorBlink `23`,
  ClipboardWrite `26`, and Mode `34`; do not re-add or renumber them. `TerminalData` is currently
  sparse (`1-4`, `12-15`) and `RenderStateData` stops at `4`. Phase 3 must add the used pinned
  values, beginning with the `TerminalData` gap at `5-11`, later selection/viewport/scrollback/mode
  keys, and `RenderStateData` keys `5-17`. `ghostty_type_json` describes struct layout, not scalar
  enum values, so the pinned headers remain the source of truth.
- `GhosttyWasmExports` in `src/core/abi.ts:109-152` types only terminal and render-state functions.
  The artifact itself also exports `ghostty_key_*`, `ghostty_mouse_*`, `ghostty_paste_encode`,
  `ghostty_focus_encode`, `ghostty_selection_gesture_*`, `ghostty_terminal_selection_*`,
  `ghostty_terminal_grid_ref`, `ghostty_grid_ref_hyperlink_uri`,
  `ghostty_terminal_scroll_viewport`, and related functions.
- `src/core/types.ts:44-49` exposes only `writePty`, title, version, and device-attribute effects.
  It has no bell, color-scheme query, or clipboard-write effect.
- `scripts/bridge.zig:1-32` and `src/core/bridge.ts:13-20` install six callbacks. Phase 3 needs
  three more callback shapes: bell (void), color scheme (bool plus out value), and clipboard write
  (enum result plus a sized borrowed struct). Parse struct offsets from `ghostty_type_json`; do not
  hard-code wasm32 struct offsets.
- `src/core/terminal.ts:66-109` provides title, VT write, resize, and reset only. It does not expose
  terminal modes, cursor state, scrollbar state, selection, links, scrollback limits, or viewport
  movement.
- `src/core/render-state.ts` reads rows and damage but not render-state cursor data. The pinned
  render API exposes visual style, visibility, blink, and viewport x/y as data keys 10-17.
- `src/render/renderer.ts:126-155` initializes a static cursor from options, and
  `src/render/renderer.ts:188-220` relies on callers to push cursor, focus, theme, and grid state.
  It has no device-pixel-ratio contract and no successful-frame notification for an accessibility
  mirror.
- `src/index.ts:1-29` exports `core/` and `render/` only. `src/term/` and `src/dom/` do not exist.
- `.github/workflows/ci.yml` runs root `bun install --frozen-lockfile` followed by `bun run verify`.
  A native PTY package added to root `devDependencies` would therefore become part of the package
  CI critical path even though it is only needed for manual acceptance.

### Primary API facts at the pinned Ghostty revision

Read the headers at the exact upstream pin before implementing:

```text
include/ghostty/vt/key/event.h
include/ghostty/vt/key/encoder.h
include/ghostty/vt/mouse/event.h
include/ghostty/vt/mouse/encoder.h
include/ghostty/vt/paste.h
include/ghostty/vt/focus.h
include/ghostty/vt/selection.h
include/ghostty/vt/grid_ref.h
include/ghostty/vt/point.h
include/ghostty/vt/terminal.h
include/ghostty/vt/render.h
```

Load them from a verified checkout, not from Ghostty `main`. The load-bearing rules are:

- Call `ghostty_key_encoder_setopt_from_terminal` before each key encode so DECCKM,
  ModifyOtherKeys, and Kitty keyboard flags come from live terminal state.
- Call `ghostty_mouse_encoder_setopt_from_terminal` **after each `vt_write` batch, not before each
  mouse encode**; set current geometry and button state per event as usual. The encoder owns
  X10/UTF-8/SGR/URxvt/SGR-pixel details and motion deduplication, so enable
  `GHOSTTY_MOUSE_ENCODER_OPT_TRACK_LAST_CELL` and never dedupe in JS.
  Why the cadence: `setopt_from_terminal` clears `last_cell` **unconditionally**
  (`src/terminal/c/mouse_encode.zig:195`, in `setopt_from_terminal` at `:187` — byte-identical at both pins and upstream `main`), so
  syncing per event defeats the encoder's own motion dedup and emits duplicate same-cell motion
  reports. A write-batch sync is correct by construction: `flags.mouse_event` / `flags.mouse_format`
  are only mutated while parsing VT bytes (`src/terminal/stream_terminal.zig` DECSET/DECRST), so
  modes cannot change between two mouse events without an intervening write. Also sync after any
  explicit mode change we make through the C API.
  Accepted residual: a write batch that does not touch mouse modes still clears `last_cell`, so at
  most one redundant motion report may follow terminal output. Harmless — motion reports are
  idempotent position reports.
- Do not share a padding-adjusted pointer coordinate between selection and mouse encoding. Start
  from raw surface physical pixels. The mouse event receives those raw x/y values while
  `GhosttyMouseEncoderSize` carries all four paddings. Selection grid-ref lookup subtracts top/left
  padding to derive the viewport cell, but `GhosttySurfacePosition` retains the surface x/y with
  top padding baked in; `GhosttySelectionGestureGeometry` has `padding_left` and full
  `screen_height`, but no `padding_top`.
- `ghostty_paste_encode` mutates its input buffer, strips unsafe control bytes, converts newlines
  outside bracketed mode, and adds bracket markers in bracketed mode. Copy JS input into owned wasm
  memory before calling it.
- Emit focus bytes only when DEC private mode 1004 is enabled. `ghostty_focus_encode` merely encodes
  the event; the embedder owns the mode gate.
- Native selection gestures own tracked anchors. Returned `GhosttySelection` values and untracked
  grid references become stale after terminal mutation, so install or format them synchronously;
  never cache their raw wasm fields in JavaScript.
- `ghostty_terminal_grid_ref` with a viewport point is the correct bridge from pointer coordinates
  to selection and OSC 8 hyperlink lookup. Do not scan every cell through grid-reference APIs in a
  render loop.
- OSC 52 and iTerm2 Copy writes reach the synchronous clipboard callback as decoded MIME
  representations. Clipboard reads are ignored upstream. The web host must be default-deny and
  must not pretend it can synchronously observe the result of `navigator.clipboard.write()`.
- `GHOSTTY_TERMINAL_DATA_SCROLLBAR` is intended to be polled once per write/frame batch and diffed;
  it does not emit a change callback. Poll only from existing wake paths, never from a standing
  timer.
- `GhosttyTerminalScrollbar` is a 24-byte, 8-byte-aligned struct of three `uint64_t` fields. Read
  its `ghostty_type_json` offsets with `DataView.getBigUint64(..., true)`; never decode those fields
  as 32-bit numbers or call `Number()` before a safe-range check.

### Prior art and platform seam

- `references/ghostling/main.c:304-562` demonstrates the native key/mouse encoders and
  `references/ghostling/main.c:1475-1499` demonstrates the mode-gated focus path. Match the call
  sequence, not its polling loop.
- `references/ghostty-web/lib/terminal.ts:340-525` is prior art for a canvas, hidden input, focus,
  links, and pointer wiring. Its standing render loop and hand-maintained terminal semantics are
  not patterns to carry over.
- `references/ghostty-web/lib/input-handler.ts:405-555` hand-encodes many keys and bypasses the
  native encoder for printable/simple keys. Do not reproduce that split; every physical key event
  with a known `KeyboardEvent.code` goes through libghostty-vt.
- Platform currently needs construction/open, write/writeln, data and resize events, focus,
  mutable appearance through an adapter, selection, paste/input, scroll commands, line reads, and
  custom link providers. Evidence is in
  `apps/web/src/features/terminal/components/panel.tsx:248-317,388-443`,
  `hooks/use-links.ts:49-81`, `utils/capture.ts:7-50`, and `utils/commands.ts:28-70`.
  Phase 3 should expose capabilities for those operations, but it must not import `ghostty-web` or
  edit platform's feature yet.

## Commands you will need

Run package commands from `/Users/shaul/Desktop/D/ghostty-webgpu` unless a command says otherwise.

| Purpose           | Command                                                                                                                                                                                                          | Expected on success                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Install           | `bun install --frozen-lockfile`                                                                                                                                                                                  | exit 0; no lockfile diff before dependencies intentionally change |
| Inspect wasm      | `bun -e "const m=await WebAssembly.compile(await Bun.file('ghostty-vt.wasm').arrayBuffer()); console.log(WebAssembly.Module.exports(m).map((x)=>x.name).filter((x)=>/(key                                        | mouse                                                             | paste     | focus       | selection     | grid_ref   | scroll_viewport)/.test(x)).sort().join('\\n'))"` | lists all Phase 3 exports named above |
| Unit tests        | `bun run test:unit -- src/core/tests/input.test.ts src/core/tests/terminal.test.ts src/core/tests/selection.test.ts src/term/tests/session.test.ts demo/tests/authorization.test.ts demo/tests/protocol.test.ts` | all selected tests pass in Node; demo tests are discovered        |
| Browser tests     | `bun run test:browser -- src/dom/tests/terminal-input.browser.test.ts src/dom/tests/pointer-selection.browser.test.ts src/dom/tests/terminal-ui.browser.test.ts`                                                 | all selected tests pass in real Chromium/WebGPU                   |
| Demo install      | `bun install --cwd demo --frozen-lockfile`                                                                                                                                                                       | exit 0 using `demo/bun.lock`; root `bun.lock` unchanged           |
| Demo typecheck    | `bun run --cwd demo typecheck`                                                                                                                                                                                   | exit 0, no diagnostics                                            |
| Typecheck         | `bun run typecheck`                                                                                                                                                                                              | exit 0, no diagnostics                                            |
| Lint              | `bun run lint`                                                                                                                                                                                                   | exit 0, no diagnostics                                            |
| Formatting        | `bun run format:check`                                                                                                                                                                                           | exit 0, no changed files                                          |
| Build             | `bun run build`                                                                                                                                                                                                  | exit 0; `dist/` contains the new public declarations and JS       |
| Full package gate | `bun run verify`                                                                                                                                                                                                 | exit 0; unit, browser, and existing renderer gates pass           |
| Node import gate  | `node -e "import('./dist/index.js')"`                                                                                                                                                                            | exit 0 without DOM globals installed                              |
| Layer gate        | `rg -n "\\b(document                                                                                                                                                                                             | window                                                            | navigator | HTMLElement | KeyboardEvent | MouseEvent | ResizeObserver)\\b" src/core src/term`           | no matches                            |

Do not run platform's root `bun run verify` in this phase. Platform source is not changing and the
repository requires per-workspace gates.

## Suggested executor toolkit

- Invoke the `never-nester` skill before editing. Maximum nesting depth is three, with guard
  clauses, `continue`, and extracted helpers.
- Use the checked-in real wasm in Node tests and real Chromium in browser tests. Do not mock package
  modules or emulate WebGPU.
- Use `references/ghostling/main.c` for native encoder call order and
  `references/ghostty-web/lib/*.test.ts` only as a list of browser edge cases. Reimplement from the
  pinned Ghostty headers and observed behavior; do not copy source.

## Scope

### In scope

The executor may modify or create only these package paths unless a step explicitly narrows them:

- `scripts/bridge.zig`, `scripts/build-bridge.ts` (create), `bridge.wasm`
- `src/core/abi.ts`, `src/core/bridge.ts`, `src/core/error.ts`, `src/core/memory.ts`,
  `src/core/render-state.ts`, `src/core/runtime.ts`, `src/core/terminal.ts`, `src/core/types.ts`
- `src/core/input.ts`, `src/core/selection.ts` (create)
- `src/core/tests/input.test.ts`, `src/core/tests/terminal.test.ts`,
  `src/core/tests/selection.test.ts`, and focused additions to `src/core/tests/runtime.test.ts`
- `src/render/renderer.ts`, `src/render/atlas/canvas-rasterizer.ts`, and directly affected renderer
  tests
- `src/term/events.ts`, `src/term/links.ts`, `src/term/session.ts`, `src/term/types.ts`, and
  `src/term/tests/session.test.ts` (create)
- `src/dom/accessibility.ts`, `src/dom/elements.ts`, `src/dom/fit.ts`, `src/dom/input.ts`,
  `src/dom/links.ts`, `src/dom/pointer.ts`, `src/dom/scrollbar.ts`, `src/dom/selection.ts`,
  `src/dom/terminal.ts`,
  `src/dom/types.ts`, `src/dom/tests/terminal-input.browser.test.ts`,
  `src/dom/tests/pointer-selection.browser.test.ts`, and
  `src/dom/tests/terminal-ui.browser.test.ts` (create)
- `src/index.ts`, `README.md`, `package.json`, `tsconfig*.json`, `vitest*.ts`
- `demo/` and `docs/phase-3-acceptance.md` (create; development/acceptance harness only)
- On completion only: platform `docs/ghostty-webgpu-brief.md`, `plans/README.md`, and this plan

New files may be split further only to preserve one responsibility per module or the three-level
nesting limit. Do not add barrel files below `src/index.ts`.

### Out of scope

- Any edit under `platform/apps/`, `platform/packages/`, platform build config, platform settings,
  or platform dependency manifests. Those belong to Phase 4.
- An xterm/ghostty-web compatibility class. Phase 4 owns the platform-local structural contract
  and two adapters.
- Kitty graphics/image layers, glyph protocol, scrollbar visual polish beyond a functional
  accessible thumb, protocol audit, HarfBuzz shaping, ligatures, font fallback, npm publishing, or
  removing `ghostty-web`.
- A Canvas/WebGL fallback, worker/offscreen migration, search, or multiplexing.
- A production remote-shell server. The Phase 3 PTY harness must bind to loopback, authenticate its
  WebSocket upgrade, and remain excluded from the published package files.
- Root `bun.lock` dependency changes or adding the demo's native PTY package to root
  `devDependencies`. The demo owns an isolated manifest and lockfile under `demo/`.
- Importing browser types or globals into `core/` or `term/`.

## Git workflow

- Use both current worktrees. Do not create another worktree or branch.
- Preserve unrelated dirty files in platform. At the latest review these include user-owned edits
  to `apps/web/src/keymap/editor-commands.ts` and `plans/README.md`, plus untracked
  `docs/log-audit-prompts.md`.
- Do not commit unless asked. If commits are later requested, use one logical package commit for
  Phase 3 and a separate platform docs close-out commit.
- Do not push or open a PR unless asked.

## Steps

### Step 1: Reconcile and type the pinned Phase 3 ABI

1. Create a temporary checkout with `mktemp -d`, fetch the exact upstream revision, and read the
   headers listed above. Remove the temporary checkout when finished. Do not change the
   upstream revision or rebuild `ghostty-vt.wasm` in this phase.
2. Run the wasm inspection command from **Commands you will need** and compare exported names with
   the pinned headers. Record the comparison in a short table at the top of
   `src/core/tests/input.test.ts`; the test itself must assert required exports through the runtime
   rather than trusting prose.
3. Extend `GhosttyWasmExports` and internal enums in `src/core/abi.ts` for only the used Phase 3
   calls and values. Preserve all existing `TerminalOption` numbers. Copy scalar enum numbers from
   the pinned headers because `ghostty_type_json` does not carry them:
   - key event/encoder lifecycle, setters, and encode;
   - mouse event/encoder lifecycle, setters, reset, and encode;
   - paste and focus encode;
   - terminal mode queries through `ghostty_terminal_get(GHOSTTY_TERMINAL_DATA_MODE)` (the pinned
     artifact does not export a separate `ghostty_terminal_mode_get`), scrollbar/cursor reads,
     scroll viewport, scrollback option, grid ref, hyperlink, selection gesture, selection format,
     select-all, and selection clear/install;
   - render-state cursor data.
4. Model sized/union structs from `runtime.layouts` (`ghostty_type_json`). Add a `requireLayout` call
   for every struct crossing the ABI. It is acceptable to encode documented scalar enums in TS;
   it is not acceptable to guess struct offsets or copy mutable containers to appease types.
5. Add reusable wasm buffer and safe-integer helpers in `src/core/memory.ts` only when they remove
   real repeated ownership/decoding code. Use `createGhosttyError` from `src/core/error.ts` for
   invalid ABI values. Every allocation must have a same-function `finally` or an owned wrapper
   with deterministic dispose.

**Verify**:

```bash
bun run typecheck
bun run test:unit -- src/core/tests/input.test.ts
```

Expected: both exit 0; the test proves all required exports exist and at least one key, mouse,
paste, and focus call crosses the real wasm boundary.

### Step 2: Add native input, terminal state, and callback bridge wrappers

1. Add `src/core/input.ts` with owned `GhosttyKeyEncoder` and `GhosttyMouseEncoder` wrappers plus
   pure normalized event types. These types describe physical key id/action/modifiers/text and
   pointer action/button/modifiers/surface pixels; they contain no DOM types.
2. Before every key encode, sync from the terminal. Set action, physical key, modifiers, consumed
   modifiers, composition flag, UTF-8, and unshifted codepoint on the reusable native event. Retry
   `GHOSTTY_OUT_OF_SPACE` with the reported size. Return a copied `Uint8Array`, including an empty
   array when the native encoder intentionally emits nothing.
3. Before every mouse encode, sync from the terminal and set geometry, currently pressed buttons,
   and last-cell tracking. Use surface-space physical pixels consistently. Reuse native event and
   encoder handles and free them exactly once.
4. Wrap `ghostty_paste_encode` and `ghostty_focus_encode`. Query DEC mode 2004 before paste and DEC
   mode 1004 before focus. Unsafe paste data is sanitized by the native encoder; expose
   `isPasteSafe` only as policy information, not as a reason to bypass encoding.
5. Extend `GhosttyTerminal` with typed getters/actions for cursor state, terminal mode, scrollbar,
   scrollback length/limit, viewport movement, selection clear/select-all/format, grid-ref link
   lookup, default foreground/background/cursor/palette colors, and default cursor style/blink.
   Theme colors must enter libghostty-vt for inverse/minimum-contrast/palette semantics even though
   canvas transparency remains a separate renderer concern. Keep raw pointers and enums internal.
   Decode each scrollbar `uint64_t` from its parsed field offset with little-endian
   `getBigUint64`. Public row counts remain `number`, so reject any field above
   `Number.MAX_SAFE_INTEGER` with a `GhosttyError` before calling `Number()`; apply the same maximum
   when accepting a JS scrollback-line limit. Do not silently round, truncate, or saturate.
6. Extend `scripts/bridge.zig`, `BridgeWasmExports`, and `CallbackBridge` for:
   - bell → synchronous `TerminalEffects.bell()`;
   - color-scheme query → write the current light/dark value to the out pointer;
   - clipboard write → copy all borrowed MIME/data bytes into JS-owned arrays before invoking the
     callback and return its synchronous `ClipboardWriteResult`.
7. Add `scripts/build-bridge.ts` and a `build:bridge` script so future bridge-only changes do not
   rebuild libghostty-vt. It must use the same Zig target/options as `build:wasm`, validate wasm
   magic, and replace only `bridge.wasm`. Run it after changing `bridge.zig`.
8. Browser clipboard policy stays outside `core/`. Core simply exposes a synchronous semantic
   effect and copies borrowed data before returning.

Tests in `src/core/tests/input.test.ts`, `terminal.test.ts`, and `runtime.test.ts` must cover:

- normal key press, Ctrl+C, application-cursor arrows, key repeat/release, and Kitty keyboard flags;
- SGR mouse press/release/motion/wheel and no output when tracking is disabled;
- plain and bracketed multi-line paste, unsafe-control sanitization, focus gated off/on;
- bell fires once, color-scheme queries receive the configured value;
- OSC 52 yields copied `text/plain` content and the configured result; a test must prove the copy
  remains valid after the VT write callback returns;
- scrollbar decoding covers values above `2^32`, exactly `Number.MAX_SAFE_INTEGER`, and rejection
  of `Number.MAX_SAFE_INTEGER + 1` before numeric conversion;
- every owned encoder/event is safe to dispose twice and fails clearly after disposal.

**Verify**:

```bash
bun run build:bridge
bun run test:unit -- src/core/tests/input.test.ts src/core/tests/terminal.test.ts src/core/tests/runtime.test.ts
bun run typecheck
```

Expected: exit 0; `git diff -- bridge.wasm` shows only the regenerated bridge artifact, while
`git diff -- ghostty-vt.wasm` is empty.

### Step 3: Make libghostty-vt the selection, viewport, and link owner

1. Add `src/core/selection.ts` as the owned wrapper around one
   `GhosttySelectionGesture` and reusable press/release/drag/autoscroll event handles. Use viewport
   grid references produced immediately from pointer coordinates.
2. Apply each gesture result to `GHOSTTY_TERMINAL_OPT_SELECTION` before any later terminal mutation.
   On release with no result, retain the terminal-owned selection. Clear on explicit clear, reset,
   or user typing according to session policy.
3. Implement single-click drag, double-click word, triple-click line, rectangular modifier, and
   drag-edge autoscroll through native gesture behavior/options. Only a live drag may own an
   autoscroll timer; release, blur, reset, and dispose must cancel it.
4. Implement `getSelection()` through `ghostty_terminal_selection_format_*` as UTF-8 plain text.
   Implement selection coordinates by ordering the current selection and immediately converting
   its refs into screen coordinates. Return copied numbers, never raw refs.
5. Implement `selectAll()` with `ghostty_terminal_select_all` followed immediately by selection
   installation. The selection must include history, not merely visible rows.
6. Implement `linkAt({x,y, tag:'viewport'})` through `ghostty_terminal_grid_ref` followed by
   `ghostty_grid_ref_hyperlink_uri`. An OSC 8 URI always outranks regex/custom providers.
7. Add `src/term/links.ts` for the browser-independent provider contract and precedence only.
   Providers receive a copied visible line and a 0-based row and return ranges that are inclusive at
   both ends. Keep async-provider results generation-tagged so a late response cannot activate a
   link for a different row/viewport.

Tests in `src/core/tests/selection.test.ts` must build real terminal state and cover forward and
reverse drags, word and line selection, selection across scrollback, select-all, clear, selection
formatting with wide/combining graphemes, viewport scrolling, OSC 8 lookup, and stale-ref avoidance
after a write/resize.

**Verify**:

```bash
bun run test:unit -- src/core/tests/selection.test.ts
bun run typecheck
```

Expected: all tests pass under plain Node; no DOM global is installed.

### Step 4: Add the browser-independent terminal session

1. Add `src/term/session.ts` as the owner of one `GhosttyTerminal`, render state, key/mouse encoders,
   native selection gesture, and public event emitters. The session accepts an existing runtime so
   callers can share the process-global PNG decoder intentionally.
2. Add a small disposable event primitive in `src/term/events.ts`. Listener exceptions must not
   prevent later listeners or resource cleanup; surface them through a session error event rather
   than swallowing them.
3. Expose browser-neutral operations required by the future adapter:
   - write/writeln, user input bytes, paste, resize, reset, focus state;
   - cols/rows and cell geometry;
   - title, bell, data, resize, selection, scroll, and error events;
   - cursor/render state, scrollback length, scrollbar snapshot, scroll top/bottom/delta/row;
   - selection get/position/select-all/clear and link/provider registration.
4. Add explicit appearance setters for font/grid inputs, cursor defaults, cursor-blink preference,
   scrollback limit, color scheme, and renderer theme. A theme change updates both libghostty-vt's
   semantic default colors and the renderer-facing theme projection in the same operation.
5. Every terminal mutation emits one coalescible render request. Writes while scrolled preserve
   libghostty-vt's viewport behavior. Session events do not create rAFs or timers; DOM/render layers
   decide when to schedule.
6. When the session receives a clipboard write effect, copy data is already owned. Return the
   caller's immediate policy result. The default without a handler is `Denied`.
7. Dispose in dependency order: selection/encoders, render state, terminal. A session using a
   caller-owned runtime must not dispose the runtime. A convenience-created runtime must be clearly
   marked owned and disposed.

Tests in `src/term/tests/session.test.ts` must cover event order, write coalescing signal count,
query replies emitted as data, focus gating, paste, resize, scroll snapshots, title/bell/clipboard,
selection, custom link precedence, runtime ownership, and idempotent disposal.

**Verify**:

```bash
bun run test:unit -- src/term/tests/session.test.ts
rg -n "\b(document|window|navigator|HTMLElement|KeyboardEvent|MouseEvent|ResizeObserver)\b" src/core src/term
```

Expected: tests pass; `rg` prints nothing.

### Step 5: Make renderer state dynamic and device-pixel-ratio correct

1. Extend `GhosttyRenderState` with one batched cursor snapshot read using
   `ghostty_render_state_get_multi`: visual style, visible, blinking, viewport presence, x, and y.
   Map native hollow-block to renderer `outline`. Cursor data read after `update()` belongs to the
   same snapshot as rows.
2. Change `RenderStateSource` so the real and fake implementations provide cursor state. During a
   frame, `WebGpuTerminalRenderer` derives cursor position/style/visibility/blink from the render
   state. User cursor options set terminal defaults; they are not a permanent override that hides
   an application's DECSCUSR changes.
3. Add a logical-cell/device-pixel contract. Public cell dimensions and fit calculations are CSS
   pixels; backing textures, rasterization, and wasm pixel geometry use CSS dimensions multiplied
   by a finite positive `pixelRatio`. Set canvas CSS width/height separately from backing width and
   height. On ratio change, rebuild rasterizer, atlas/resources, and all rows exactly once.
4. Add an optional successful-frame callback carrying copied visible row text/cursor metadata for
   DOM accessibility and overlays. Invoke it only after GPU submission and damage acknowledgement.
   It must not expose mutable row arrays or force a frame when there is no damage/overlay change.
5. Preserve scheduler gates. Dynamic cursor blink may arm one timer only when terminal blink is on,
   user preference permits it, host is focused, and document is visible.

Tests must add:

- DECSCUSR block/bar/underline/hollow mapping and terminal-driven blink/visibility;
- a 2× pixel-ratio backing size with unchanged CSS-grid fit;
- ratio-change full rebuild coalescing;
- one successful-frame callback per submitted frame and none for clean scheduled frames;
- all existing idle, damage, transparency, atlas, and device-loss tests unchanged in meaning.

**Verify**:

```bash
bun run test:unit -- src/render/tests/scheduler.test.ts
bun run test:browser -- src/render/tests/renderer.browser.test.ts src/render/tests/text-pass.browser.test.ts
```

Expected: all selected tests pass; the existing idle assertions still report no standing rAF.

### Step 6A: Build DOM lifecycle, keyboard/IME input, and fit

1. Add a public `GhosttyWebGpuTerminal` in `src/dom/terminal.ts` with an async factory and explicit
   lifecycle:

   ```ts
   const terminal = await GhosttyWebGpuTerminal.create(options)
   await terminal.open(parent)
   terminal.onData((bytes) => pty.write(bytes))
   terminal.write(output)
   terminal.dispose()
   ```

   The exact name may change only during this step, before export, if the package already gained a
   conflicting public symbol. Construction creates/accepts runtime and session; `open` creates DOM
   and WebGPU resources. A failed or cancelled open must leave no elements, listeners, observers,
   wasm handles, devices, timers, or rAF callbacks.

2. Define options for font family/size/line height, theme, cursor style/blink, scrollback, initial
   grid, clipboard-write policy, link activation, runtime sharing, and renderer test injection.
   Applying or updating a theme must call the session appearance operation so terminal color
   semantics and renderer colors cannot drift apart.
3. Create the package-owned root, canvas, and offscreen textarea. Use an `AbortController` for
   event listener cleanup. Preserve host attributes/styles you did not create; remove only
   package-owned nodes and attributes on dispose. The accessibility and scrollbar nodes are added
   in Step 7.
4. Keep the textarea focusable and place its 1×1 CSS-pixel box at the current cursor so the OS IME
   candidate window appears near the terminal caret. Disable autocorrect, autocapitalize, and
   spellcheck. Do not make the whole host contenteditable.
5. Normalize `KeyboardEvent.code` to native Ghostty physical keys in `src/dom/input.ts`. Include
   location-specific modifiers, numpad, international keys, F1-F24, navigation, media/browser
   keys where the upstream enum has a match. Derive modifier and lock bits with
   `getModifierState`; set consumed modifiers for browser-produced text and an unshifted ASCII
   codepoint only where `code` defines one.
6. Send keydown, repeat, and keyup through the native encoder. Never hand-write an escape sequence.
   Prevent browser default only when the terminal consumes the event or for an explicitly handled
   terminal shortcut. Let Cmd/Ctrl+V reach the paste event. Cmd+C copies an active terminal
   selection; Ctrl+C without that platform-copy case reaches the encoder.
   **Keymap seam (see `plans/056-multi-step-chord-keymap.md` D2):** the old `ghostty-web`
   `stopPropagation`s every Ctrl/Meta key before document bubble, so the app keymap is dead in the
   terminal today. This host must not reproduce that blanket swallow. When the platform adapter
   lands, give the app keymap first refusal on a chord _arming_ stroke and register
   `terminal.integrated.allowChords` (`application` scope, default `true`, matching VS Code) in the
   same pass — not before, or it is an inert key. Note that on Linux/Windows `Mod+K` is readline's
   `kill-line`, which is exactly what that knob exists to give back.
7. Make textarea `input` the single commit path for IME/mobile text. During composition, key events
   carry `composing: true` but no committed UTF-8. On the one post-composition input, send the
   committed grapheme string once and clear the textarea. Add tests that fail on duplicate CJK,
   emoji, dead-key, and replacement-text commits. Do not use a time-window dedup heuristic.
8. Implement fit with `ResizeObserver`, measured monospace advance, configured line height, CSS
   padding, and scrollbar width. Coalesce resize notifications through one pending rAF. Refit when
   fonts finish loading and when DPR changes. Hidden/zero-size hosts do nothing and retry only on an
   actual observer/font/DPR event; there is no polling.
9. Resize session and renderer atomically, then emit one `{cols, rows}` event. Enforce at least 2
   columns and 1 row. If the computed grid is unchanged, submit no terminal resize and no frame.

Browser tests in `src/dom/tests/terminal-input.browser.test.ts` must use the real wasm and WebGPU
renderer and cover lifecycle cleanup, key bytes, Kitty press/repeat/release, IME single commit,
paste, focus-report mode, fit coalescing, zero-size host, DPR change, and no pending work after the
host settles.

**Verify**:

```bash
bun run test:browser -- src/dom/tests/terminal-input.browser.test.ts
bun run typecheck
```

Expected: all tests pass in real Chromium; disposing removes package-owned DOM and leaves zero
pending package rAF/timers/observers.

### Step 6B: Wire pointer input, native mouse encoding, and native selection

1. In `src/dom/pointer.ts`, compute one raw physical surface position from the DOM event by
   subtracting only the canvas bounds and multiplying by the current pixel ratio. Derive the two
   native projections explicitly:
   - mouse encoding receives raw surface x/y; `GhosttyMouseEncoderSize` receives physical screen,
     cell, and top/bottom/left/right padding values, so the encoder performs its own padding
     adjustment;
   - selection grid-ref lookup derives the viewport cell after subtracting top/left padding, but
     `GhosttySurfacePosition` receives the raw surface x/y. Keeping raw y here is the required
     top-padding bake-in because `GhosttySelectionGestureGeometry` has no `padding_top`; its
     `screen_height` is the full physical surface height and its `padding_left` is physical.
     Never pass content-relative y to both APIs.
2. Route pointer events in `src/dom/terminal.ts`:
   - scrollbar hit/drag consumes the event before terminal forwarding;
   - when terminal mouse tracking is active and Shift is not held, native mouse encoding owns
     press/release/motion/wheel;
   - otherwise left-button gestures own selection and wheel owns viewport scroll;
   - pointer capture keeps release outside the canvas paired with the active drag.
3. In `src/dom/selection.ts`, connect pointer gestures to the native selection wrapper. Emit one
   selection event per semantic change and call `renderer.notifySelectionChange()`. Copy uses the
   native formatted selection. Maintain autoscroll only while the pointer is captured beyond the
   top/bottom edge; release, blur, reset, and dispose cancel it.
4. Keep native mouse button state and last-cell tracking consistent across move, wheel, release,
   lost capture, blur, and dispose. A Shift transition during a tracked drag ends one owner before
   starting the other; never emit one DOM event to both native paths.

Browser tests in `src/dom/tests/pointer-selection.browser.test.ts` must cover SGR cell and pixel
mouse bytes, mouse tracking versus Shift selection, pointer capture/release, native selection
across scrollback, rectangular/word/line gestures, drag autoscroll cleanup, and wheel routing. Add
a regression with nonzero asymmetric vertical padding proving a click on the first visible row
selects row 0 while the same surface position encodes the expected native mouse row.

**Verify**:

```bash
bun run test:browser -- src/dom/tests/pointer-selection.browser.test.ts
bun run typecheck
```

Expected: all tests pass; the vertical-padding regression is green; release/blur/dispose leaves no
pointer capture, pressed-button state, autoscroll timer, package rAF, or observer.

### Step 7: Finish links, scrollbar, clipboard policy, and accessibility

1. In `src/dom/links.ts`, resolve OSC 8 first, then registered providers, then the built-in URL
   regex. Underline/change cursor only for the currently generation-matched hit. Activation is
   modifier-click by default; providers receive the original event and may impose stricter policy.
   Do not navigate directly without an explicit activation callback.
2. In `src/dom/scrollbar.ts`, diff the terminal scrollbar snapshot on write, scroll, resize, and a
   submitted frame. Support wheel, page click, and thumb drag to an absolute row. Use semantic
   `role="scrollbar"`, `aria-valuemin/max/now`, keyboard arrows/page/home/end, and one hide timeout
   after interaction. No timer runs while fully hidden and idle.
3. Clipboard behavior:
   - user paste always uses the native paste encoder;
   - user copy uses `navigator.clipboard.writeText` only from the initiating user gesture;
   - OSC 52 is denied by default;
   - an opt-in callback receives copied MIME data and may enqueue an async browser write, while its
     synchronous return reports only accepted/denied/unsupported policy. Async failure emits an
     error event and is never reported as completed synchronously.
4. In `src/dom/accessibility.ts`, maintain an offscreen visible-viewport mirror from the renderer's
   successful-frame callback. Give rows stable nodes and `role="listitem"` with positional
   metadata, update only changed rows unless scroll/resize requires a full mirror, expose cursor
   location, and label the textarea. Add a polite live region for newly produced output with a
   bounded queue; it must not announce full scrollback repeatedly.
5. Verify keyboard-only use: host focus, scrollbar controls, selection copy, link discovery, and
   screen-reader row reading. Do not hide the accessibility tree with `display:none`, `visibility:
hidden`, or `aria-hidden`.

Browser tests in `src/dom/tests/terminal-ui.browser.test.ts` must cover OSC 8 precedence over regex,
stale async link results, scrollbar ARIA/keyboard/drag, values above `2^32`, selection copy,
default-denied and opt-in OSC 52, mirror updates, bounded live announcements, and cleanup of
link/fade state.

**Verify**:

```bash
bun run test:browser -- src/dom/tests/terminal-ui.browser.test.ts
```

Expected: all tests pass. With cursor blink disabled and no active drag/fade, diagnostics show zero
pending package rAF and timers after the final frame.

### Step 8: Add a loopback PTY demo and execute the interactive gate

1. Add a development-only demo that serves the built package and a real PTY. Give it an isolated,
   private `demo/package.json`, `demo/bun.lock`, and `demo/tsconfig.json`; place
   `@lydell/node-pty` and demo-only tooling there, never in root `devDependencies` or root
   `bun.lock`. Generate the nested lock once with `bun install --cwd demo`, then use the frozen
   install gate below. Add the root `package.json` script `"demo": "bun run --cwd demo start"` in
   this step, before invoking it. The root CI install must remain unchanged. Use Bun's
   HTTP/WebSocket server and bind only `127.0.0.1` by default.
2. Generate a per-run random token, serve it only to the same-origin demo page, validate `Host` and
   `Origin`, and require the token on the WebSocket upgrade. Reject cross-origin/missing-token
   upgrades. Do not add permissive CORS. Kill PTYs on socket close and process shutdown.
3. Use binary WebSocket frames for PTY bytes and a discriminated JSON message only for resize.
   Resize the native PTY from the terminal's resize event. Do not decode PTY output as lines.
4. Add a checked-in `demo/kitty-keyboard-check.py` (or equivalently small POSIX script) that enters
   raw mode, enables Kitty keyboard reporting for press/repeat/release, prints received bytes in
   escaped form, and restores tty state in `finally`/signal cleanup.
5. Add pure tests at `demo/tests/authorization.test.ts` and `demo/tests/protocol.test.ts` for request
   authorization and message parsing without opening a network socket or importing the PTY server.
   Extend root `vitest.config.ts` from `src/**/*.test.ts` to
   `['src/**/*.test.ts', 'demo/**/*.test.ts']`; do not rely on a CLI filename bypassing `include`.
   The demo, nested manifest/lock, and PTY dependency must not appear in the package's published
   `files` list.
6. Run the demo in headed hardware Chromium and execute all manual cases. Record date, OS, browser,
   GPU adapter, exact commands, and pass/fail in `docs/phase-3-acceptance.md`:
   - `vim`: insert/navigation, Ctrl/Alt combinations, mouse mode, resize, focus, selection override;
   - `htop`: function keys, arrows, mouse, wheel, resize;
   - `lazygit`: navigation, text prompt, mouse, alternate screen, resize;
   - the checked-in Kitty script: press/repeat/release, Shift/Ctrl/Alt/Super, arrows, function keys;
   - IME: at least one CJK composition and one emoji/dead-key commit with no duplicate bytes;
   - copy/paste, OSC 8, plain URL, OSC 52 default denial/opt-in, scrollback selection, scrollbar,
     and screen-reader row navigation.
7. After each app exits, leave the host focused with blink disabled for 10 seconds and confirm
   submitted-frame metrics do not change. Focused blink-on must still submit exactly one frame per
   blink transition and no standing rAF.

**Verify**:

```bash
bun install --cwd demo --frozen-lockfile
bun run --cwd demo typecheck
bun run test:unit -- demo/tests/authorization.test.ts demo/tests/protocol.test.ts
git diff -- bun.lock
bun run demo
```

Expected: the nested frozen install, demo typecheck, and two discovered tests pass; root `bun.lock`
has no diff; the loopback URL opens; all acceptance cases are recorded PASS; cross-origin WebSocket
attempts are rejected; and shutting down leaves no PTY process. If `vim`, `htop`, `lazygit`, Python,
or the native PTY dependency is unavailable, stop and report the missing prerequisite rather than
silently weakening the gate.

### Step 9: Export, document, and close Phase 3

1. Export the public DOM terminal, session/options/event/link/selection types, and intentional core
   types from `src/index.ts`. Keep it the sole barrel. Do not export raw ABI enums, wasm pointers,
   or owned internal handles.
2. Update `README.md` with install/use/lifecycle examples, runtime sharing and PNG-global warning,
   byte-oriented `onData`, fit behavior, link and clipboard policies, accessibility behavior, and
   the no-standing-loop guarantee.
3. Review the `package.json` script added in Step 8 and keep `sideEffects: false` truthful: modules
   must not touch DOM or install listeners at import time. Root dependencies and root `bun.lock`
   must remain unchanged. Build `dist` after all source changes.
4. Run the complete done criteria below and review `git diff` in both repos. No platform app source
   may have changed.
5. Update `platform/docs/ghostty-webgpu-brief.md` Phase 3 to COMPLETE only after automated and manual
   gates pass. Record the package commit if the operator requested/created one; otherwise say
   `verified in worktree` and do not invent a SHA.
6. Change the Phase 3 row in `platform/plans/README.md` to DONE and add Phase 4 as NEEDS PLAN. Do not
   delete this plan until a commit exists that archives it in Git history; if working uncommitted,
   leave it DONE for the maintainer to archive after commit.

**Verify**:

```bash
bun run verify
node -e "import('./dist/index.js')"
rg -n "\b(document|window|navigator|HTMLElement|KeyboardEvent|MouseEvent|ResizeObserver)\b" src/core src/term
git status --short
git -C /Users/shaul/Desktop/D/platform status --short
```

Expected: verification and Node import exit 0; the layer grep prints nothing; package status lists
only files in Scope; platform status contains only the pre-existing user changes plus this plan,
the plan-index row, and the brief close-out.

## Test plan

### Node tests

- `src/core/tests/input.test.ts`: real wasm exports, key/mouse/paste/focus encoders, live terminal
  modes, allocation retry, disposal.
- `src/core/tests/runtime.test.ts`: bell, color scheme, OSC 52 callback bridge and copied borrowed
  data.
- `src/core/tests/terminal.test.ts`: terminal data/mode queries, scrollbar ABI offsets, exact u64
  decoding, and guarded conversion at the JavaScript safe-integer boundary.
- `src/core/tests/selection.test.ts`: native gestures, scrollback, formatting, wide/combining text,
  OSC 8, ref lifetime.
- `src/term/tests/session.test.ts`: orchestration, event order, ownership, render requests, links,
  scroll, selection, errors, disposal.
- Model structure after `src/core/tests/runtime.test.ts`; instantiate the committed wasm. Do not
  mock package modules.

### Real-browser tests

- `src/dom/tests/terminal-input.browser.test.ts`: lifecycle, WebGPU-backed host,
  keyboard/IME/paste/focus, fit/DPR, and idle cleanup.
- `src/dom/tests/pointer-selection.browser.test.ts`: native mouse versus selection routing,
  asymmetric-padding coordinates, pointer capture, scrollback selection, and autoscroll cleanup.
- `src/dom/tests/terminal-ui.browser.test.ts`: links, large scrollbar values, clipboard policy,
  accessibility, keyboard-only behavior, and overlay cleanup.
- Reuse the real-device setup and explicit clock patterns from
  `src/render/tests/renderer.browser.test.ts`.
- Tests that inspect scheduler state use injected clocks/observers, not wall-clock sleeps. One
  headed 10-second idle observation remains in manual acceptance because hardware behavior is the
  product gate.

### Manual acceptance

- `docs/phase-3-acceptance.md` is required evidence, not an optional checklist.
- All four interactive programs/scripts and the IME/accessibility/clipboard/link cases must pass in
  headed hardware Chromium.

### Demo tests

- `demo/tests/authorization.test.ts`: valid same-origin token upgrade plus missing token, foreign
  Host, foreign Origin, and permissive-CORS regressions.
- `demo/tests/protocol.test.ts`: binary PTY payloads, valid resize JSON, malformed/unknown messages,
  and numeric bounds without starting a socket or PTY.
- Root `vitest.config.ts` must discover both files during plain `bun run test:unit`; do not import
  `@lydell/node-pty` from either pure test subject.

## Done criteria

All must hold:

- [ ] The committed wasm pin remains `f64f4aca2c29b554d111b36c3d946a9bddd159ff` and
      `ghostty-vt.wasm` is unchanged.
- [ ] Key, mouse, paste, focus, native selection, viewport, hyperlink, bell, color-scheme, and OSC
      52 paths use pinned upstream APIs with real wasm tests.
- [ ] `core/` and `term/` contain no DOM/browser globals and their tests pass in Node.
- [ ] Printable, modified, repeat, and release keys all use the native key encoder; no manual
      terminal escape table exists in DOM code.
- [ ] IME/mobile commits emit exactly once for the named CJK/emoji/dead-key cases.
- [ ] Mouse tracking, Shift selection override, native selection across scrollback, paste, focus,
      OSC 8, regex/custom links, and scrollbar behavior pass browser tests.
- [ ] A real-browser regression with nonzero asymmetric vertical padding proves selection row 0
      and the mouse encoder's first terminal row agree without sharing one padding-adjusted
      coordinate.
- [ ] OSC 52 is default-deny and never claims synchronous completion of an async browser write.
- [ ] Accessibility rows, cursor position, live output, and scrollbar semantics pass browser tests.
- [ ] Scrollbar `uint64_t` values are read with `getBigUint64`; public conversion rejects values
      above `Number.MAX_SAFE_INTEGER` without rounding.
- [ ] Fit and DPR changes resize terminal + renderer once per semantic change; zero-size hosts do
      not loop.
- [ ] Idle blink-off has zero pending timers/rAF and zero frame growth over the manual 10-second
      gate; blink-on retains one frame per transition.
- [ ] `vim`, `htop`, `lazygit`, and the checked-in Kitty keyboard script are recorded PASS in
      `docs/phase-3-acceptance.md`.
- [ ] Demo authorization/protocol tests are discovered by the root unit command; the native PTY
      dependency exists only in `demo/package.json`/`demo/bun.lock`; root `bun.lock` is unchanged.
- [ ] `bun run verify`, `bun run build`, and the Node import gate exit 0.
- [ ] `dist` is rebuilt and the README documents the public surface and security policies.
- [ ] No platform app/package source changed; Phase 4 remains a separate NEEDS PLAN item.
- [ ] No files outside Scope are modified, excluding user-owned dirty files that predated execution.

## STOP conditions

Stop and report; do not improvise if:

- The pinned header and committed wasm export set disagree for any required function, enum, or
  struct, or `ghostty_type_json` lacks a required layout.
- The callback bridge cannot match bell, color-scheme, or clipboard-write's lowered wasm signature
  with a small Zig trampoline.
- Native selection gestures cannot represent viewport drag, word/line selection, autoscroll, or
  history-spanning selection. Do not replace them with a second JS selection model without review.
- A correct fit/DPR implementation requires changing shader instance semantics beyond the files in
  Scope; report the required renderer redesign first.
- IME text cannot be made single-commit in real Chromium without a timing heuristic. Record the
  actual browser event sequence and stop.
- The DOM host requires browser globals in `core/` or `term/`, or importing `dist/index.js` under
  Node evaluates browser globals.
- Any DOM feature introduces a standing rAF/polling loop or leaves a timer/observer after dispose.
- The loopback demo cannot provide a real PTY, cannot enforce same-origin token authorization, or a
  required acceptance program is unavailable.
- Phase 3 appears to require editing platform source, adding the renderer setting, or changing the
  PTY server contract. Those belong to Phase 4.
- A step's focused verification fails twice after a reasonable correction.
- An implementation requires touching an out-of-scope file.

## Maintenance notes

- Upstream libghostty-vt is explicitly unstable. Every upstream-revision bump must diff all Phase 3
  headers, re-run required-export tests, rebuild the bridge if callback shapes changed, and rerun
  the interactive keyboard/selection gate.
- Selection and grid references have strict mutation lifetimes. Review every future change for a
  raw ref or borrowed string escaping the synchronous wrapper call.
- Browser clipboard writes are permission- and user-activation-sensitive. Keep OSC 52 policy
  separate from user-initiated copy/paste even if browser APIs later become more permissive.
- The accessibility mirror and scrollbar may react to a submitted frame, but neither is allowed to
  become a scheduler. New overlay animations must preserve the no-standing-loop contract.
- Phase 4 must generate the live platform structural contract from a fresh grep. It should adapt
  the byte-oriented package events and explicit setters; it must not force ghostty-web compatibility
  into this package.
- Phase 5 owns scrollbar polish and Kitty image layers. Do not expand this functional DOM scrollbar
  into a second renderer pass in Phase 3.
