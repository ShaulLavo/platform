# Plan 072: Replace the Electrobun desktop shell with Electron

> **Executor instructions**: Read this plan completely, then read Platform `AGENTS.md` and root
> `PLAN.md`. Execute every gate in order.
>
> This plan replaces the cross-platform desktop shell on **all three platforms** — macOS, Linux, and
> Windows (Gate 0, resolved). A native macOS app is being built in a separate lane; the two coexist
> and neither blocks the other. Do not commit, push, create a branch, publish, or open a PR without
> explicit operator approval.

## Status

- **State**: Proposed — needs root scheduling
- **Priority**: P1 — the current shell burns one full CPU core continuously on Linux, on every run,
  whether or not the app is doing anything
- **Effort**: M
- **Risk**: MEDIUM — the shell surface is small and well understood; the risk is concentrated in
  packaging and distribution, which are net-new either way
- **Platform baseline**: `4b25f1ab28eab2da499ac0cf0fcc633af1ea6640`
- **Package pin**: `electron@43.x` (measured against `43.4.1`)
- **Spike branch**: `spike/electron-shell` — a working shared-dev shell, 78 lines
- **Reference implementation**: `references/t3code` (gitignored clone of `pingdotgg/t3code`) — an
  Electron app shipping today with the same `apps/{desktop,server,web}` shape; installed layout
  readable at `/usr/lib/t3code`
- **Targets**: macOS, Linux, Windows (Gate 0 resolved)

Root `PLAN.md` is authoritative for ordering. This is an independent desktop-shell lane; stop and
ask the operator where to schedule it if it has not been added there when execution is requested.

## Why

### The shell burns a core, permanently

`libNativeWrapper.so` (Electrobun 1.18.1) drives CEF from a fixed-interval timer:

```c
runCEFEventLoop():
    initializeGTK();
    g_timeout_add(10, cef_timer_callback);   // -> CefDoMessageLoopWork(), 100x/sec
    g_timeout_add(10, process_x11_events);   // -> XPending drain, 100x/sec
    sleep(1);
    gtk_main();
```

`cef_timer_callback` calls `CefDoMessageLoopWork()` unconditionally, every 10 ms. Electrobun does
export `browser_process_handler_on_schedule_message_pump_work`, so CEF is telling it when work is
actually due — that hint is ignored. Every call runs a full Chromium pump iteration including X
server round trips, so the glib loop never reaches a blocking poll.

Measured on a wedged 9-hour session (PID 116930) and reproduced 3/3 on fresh launches:

|                                    |                                     |
| ---------------------------------- | ----------------------------------- |
| main thread CPU                    | **~100% of one core, continuously** |
| CPU consumed over 9.2 h elapsed    | 6.6 h user + 2.6 h system           |
| process state                      | `R` — never sleeps                  |
| `voluntary_ctxt_switches` over 3 s | **0** — never blocks on anything    |
| threads hot                        | 1 of 37; `Chrome_IOThread` was idle |

Sampled stack, main thread:

```
g_main_loop_run -> g_main_context_iterate -> g_main_context_dispatch
  <- gtk_main <- runCEFEventLoop <- runEventLoop <- startEventLoop
```

Half the samples land in `recvmsg` -> `xcb_poll_for_reply` / `_XEventsQueued`, reached from
`libcef.so` — the X11 round trips inside each pump call. This is the documented CEF external
message pump trap, not a Platform bug: see CEF4Delphi #334 ("Linux: 100% CPU in the demos using an
external message pump") and cefpython #246.

Electron, measured on the same machine, same compositor, same vite URL, idle:

|                    | Electrobun 1.18.1 | Electron 43.4.1                         |
| ------------------ | ----------------- | --------------------------------------- |
| main process CPU   | ~100% of a core   | **0.20%** (2 jiffies / 10 s)            |
| whole process tree | —                 | **0.00%** over 5 s                      |
| state              | `R`, never sleeps | `S`, blocked in `poll_schedule_timeout` |
| voluntary switches | frozen at 0       | +27                                     |

Electron does not use CEF. It embeds Chromium directly, lets Chromium's message loop own the main
thread, and integrates libuv into it via a backend fd polled on a separate thread — event driven,
so the main thread blocks until there is real work.

### A second, independent defect

`bun Helper` aborts with `SIGABRT` on exit. It is **not** memory corruption:

|                                   | value                |
| --------------------------------- | -------------------- |
| canary saved in `main`'s prologue | `0x63a16c1dc2ae4400` |
| live TLS canary at `fs_base+0x28` | `0x665fcbd9b3049a00` |

The frame is intact — saved `rbx`/`rbp`/`r12`/`r13` and the return address all resolve, and gdb
walks cleanly back to `__libc_start_main`. Chromium's `--change-stack-guard-on-fork=enable` (present
in the helper's own argv) rotates the TLS canary during `CefExecuteProcess`; `main` captured the old
value, so its epilogue check fails. 37 core dumps, 160 MB in `/var/lib/systemd/coredump`.

Functionally this is noise — the abort happens at helper exit, after the work is done — but it
produces a 2.5 MB core per helper and pollutes crash reporting.

### Why not just upgrade to Electrobun 2.0.1

Verified by disassembling the 2.0.1 `libNativeWrapper_cef.so` from the GitHub release:

| Symbol                       | 1.18.1  | 2.0.1   |
| ---------------------------- | ------- | ------- |
| `CefDoMessageLoopWork` calls | 1       | **0**   |
| `CefRunMessageLoop` calls    | 0       | **1**   |
| `cef_timer_callback`         | present | removed |

v2 **fixes the CPU spin** — it hands the thread to CEF's own blocking loop. It does **not** fix the
helper abort: `process_helper`'s `main` still does capture-canary -> `CefExecuteProcess` ->
compare -> `__stack_chk_fail`.

Upgrading is therefore a partial fix that still costs a migration: v2 is a restructure, not a
version bump — the npm package is a stub that resolves a "Hutch" toolchain from GitHub releases,
with its own migration guide. Given a migration is required either way, the question becomes which
shell to migrate _to_.

### Why Electron rather than Electrobun v2 or a hand-rolled shell

Electrobun's value proposition is a ~14 MB bundle using the system webview. `electrobun.config.ts`
sets `bundleCEF: true` on **mac, win, and linux** — so Platform already ships ~100 MB of Chromium
and collects none of that benefit, while carrying a young runtime's defects. Two native bugs
surfaced in a single day, one of which is still unfixed upstream.

A hand-rolled shell does not change the engine question, only who maintains the window. With
"bundle Chrome" as a product requirement, a hand-rolled shell means hand-rolling a CEF host — which
is the same class of work that produced the bug above, plus helper-process lifecycle, sandbox,
signing, and Chromium's ~4-week CVE cadence. The window is the cheap part; the engine lifecycle is
not.

The surface being replaced is small. `apps/desktop/src` is 879 lines and uses six Electrobun APIs:

| Electrobun                            | Uses | Electron                           |
| ------------------------------------- | ---- | ---------------------------------- |
| `BrowserWindow`                       | 3    | `BrowserWindow`                    |
| `BrowserView.defineRPC`               | 2    | `ipcMain.handle` + `contextBridge` |
| `Utils.quit`                          | 2    | `app.quit()`                       |
| `Utils.openFileDialog`                | 1    | `dialog.showOpenDialog`            |
| `Electrobun.events.on('before-quit')` | 1    | `app.on('before-quit')`            |
| `Electroview` (preload)               | 1    | `contextBridge.exposeInMainWorld`  |

The spike on `spike/electron-shell` reimplements the entire bridge in 78 lines and was measured
above. `PlatformBridge` in `shared/rpc.ts` is already the seam that made that possible; it stays.

## Design

`window.platformBridge` is the contract, and it does not change. The web layer must not learn which
shell it is running in.

One mechanism does change. Electrobun injects `backdrop` as source text ahead of the preload bundle
(`handoffPrelude`), so the page knows its backdrop before first paint. Electron's equivalent is
`webPreferences.additionalArguments`, read synchronously from `process.argv` in the preload. Both
satisfy the same requirement — the answer must not wait on, or be lost to, the RPC transport coming
up — and `shared/window.ts` keeps owning the `shellBackdrop()` decision.

The main process moves from Bun to Node. `apps/desktop/src/bun/` uses `Bun.env` (15), `Bun.spawn`
(3), `Bun.sleep` (3), `Bun.file` (1) and `bun:ffi` (1); all but the FFI binding map directly onto
`process.env`, `child_process.spawn`, `timers/promises`, and `fs`. The server keeps running on Bun.

## Gate 0 — Target matrix — RESOLVED

**All three platforms.** Electron targets macOS, Linux, and Windows. The native macOS app is a
separate lane and does not remove macOS from this one.

Consequences, binding on later gates:

- `titleBarStyle: 'hiddenInset'` and `trafficLightOffset` are ported, not deleted (Gate 3).
- `apps/desktop/native/vibrancy.m` and `scripts/build-native.ts` survive. The binding moves from
  `bun:ffi` to a Node-side FFI path — evaluate `koffi` or a small N-API addon; do not assume
  `bun:ffi` has a drop-in equivalent.
- Gate 4 covers signing and notarization for macOS as well as Windows.

## Gate 1 — Shell parity in shared dev

**Rewrite `apps/desktop/` in place** on a branch. The workspace keeps its name and its position in
`package.json` workspaces; the Electrobun entrypoints are replaced, not parallelised. There is no
`apps/desktop-electron/` in the final tree — the working spike lives on `spike/electron-shell` and
is reference material only.

1. `main.ts` — `BrowserWindow` at 1440x960, `waitForHttp` against `SERVER_URL/health` and `WEB_URL`
   with the existing 30 s deadline, `app.on('before-quit')` running the same teardown.
2. `preload.ts` — `contextBridge.exposeInMainWorld('platformBridge', …)` satisfying
   `PlatformBridge` exactly: `backdrop` read synchronously from `additionalArguments`, and
   `pickEntry` over `ipcRenderer.invoke`.
3. `ipcMain.handle('platform:pickEntry')` mapping `PlatformPickOptions` onto
   `dialog.showOpenDialog` — `mode: 'folder'` -> `openDirectory`, `multiple` -> `multiSelections`,
   `startingPath` -> `defaultPath`. Return `{ paths: [] }` on cancel; the web layer already treats
   an empty array as "no selection".
4. Reuse `shared/rpc.ts` and `shared/window.ts` unchanged. `RPCSchema` is the only Electrobun type
   imported by `shared/rpc.ts`; replace it with a local structural type in the same pass.
5. Port `observability.ts` and `structured-errors.ts` — the shell must keep emitting
   `desktop.*` events into `logs/`.

**Exit**: `PLATFORM_DESKTOP_SHARED_DEV=1` with server and web already running opens the app, the
file picker returns paths, and `logs/<today>.jsonl` contains `desktop.window.backdrop`.

## Gate 2 — Standalone mode

Port the half of `bun/index.ts` the spike does not cover:

1. `spawnServer` / `spawnWeb` via `child_process.spawn`, with the same child tracking and the same
   rule that a child exiting quits the app.
2. `releasePlatformPort` — the `lsof`-based reclaim, `isPlatformProcess` root check, SIGTERM then
   SIGKILL with the 2.5 s waits. This is load-bearing: without it a stale dev server silently
   takes the port.
3. `withNode22Path` / `latestNode22Bin` — re-evaluate. It exists because vite needed a Node the Bun
   shell did not provide; under Electron the main process already is Node. Delete it if it is dead,
   do not port it speculatively.

**Exit**: `bun run desktop:dev` with nothing else running brings up server, web, and window.

## Gate 3 — Window chrome and backdrop

All three platforms, per Gate 0.

1. `shellBackdrop()` keeps deciding. `compositor` on Linux stays the default and stays opaque.
2. `window.transparency: 'window'` maps to Electron's `transparent: true`. Re-measure the cost —
   the 5.5 MB-per-paint figure in `shared/window.ts` describes CEF's offscreen path and does not
   transfer. Update that comment with a measured Electron number or mark it CEF-historical.
3. macOS chrome: `titleBarStyle: 'hiddenInset'` plus `trafficLightPosition` (Electron's name for
   `trafficLightOffset`). Re-point the vibrancy binding per Gate 0 — note that Electron has a
   first-class `vibrancy` / `backgroundMaterial` window option, so `vibrancy.m` may be deletable
   rather than re-bound. Establish that before porting the FFI.

## Gate 4 — Packaging and distribution

Net-new; nothing exists today (`electrobun.config.ts` configures no updater, and CI has no desktop
job).

`references/t3code` (gitignored clone of `pingdotgg/t3code`) is a working reference for this gate:
same `apps/{desktop,server,web}` shape, Electron, electron-builder, shipping today. Its installed
layout is readable at `/usr/lib/t3code`.

1. Choose electron-builder or Electron Forge. t3code uses electron-builder with
   `app-update.yml` → `provider: github`; that is the shortest path to a working updater.
2. **How the server ships.** t3code's answer is the important finding: it bundles the server with
   vite into a self-contained JS bundle, keeps native addons external and staged beside it, ships it
   as a sidecar (`resources/server.asar` on Windows), and runs it **via `ELECTRON_RUN_AS_NODE` —
   reusing Electron's own binary as the Node runtime, so no second runtime is shipped at all.**

   Platform cannot copy that directly: `apps/server` is Bun, not Node — `bun:sqlite` (19 call
   sites), `Bun.spawn` (22), `Bun.env` (17), `Bun.write` (12), `Bun.file` (11), plus
   `Bun.FileSink`, `Bun.Subprocess` and `Bun.resolveSync`. Three options, to be decided before
   this gate starts:

   | Option                                      | Extra artifact | Cost                                                    |
   | ------------------------------------------- | -------------- | ------------------------------------------------------- |
   | Port server to Node, `ELECTRON_RUN_AS_NODE` | none           | port off `bun:sqlite` (`node:sqlite`) and ~70 Bun calls |
   | Ship the Bun binary as a sidecar            | ~78 MB         | server code unchanged                                   |
   | `bun build --compile` to one executable     | ~80 MB         | server code unchanged, single file                      |

   Note the second-order effect: `terminal/service.ts` spawns a real Node today solely because
   node-pty's native addon does not work under Bun. Under Electron the main process already is
   Node, and t3code ships `node-pty` in `app.asar.unpacked`. Porting the server to Node deletes
   that bridge; the sidecar options keep it.

3. Code signing and notarization for macOS and Windows.
4. Auto-update is explicitly deferred; record it as follow-up, do not scope-creep it here.

## Gate 5 — Verification and removal

1. **Measure, do not assume.** With the app idle and a document open, sample the main process for
   at least 10 s:
   - `awk '{print $14+$15}' /proc/<pid>/stat` delta must be < 5% of one core.
   - `voluntary_ctxt_switches` must **increase** — a frozen counter is the exact signature of the
     bug being fixed.
   - process state must be `S`, not `R`.
2. `coredumpctl list` must show no new helper aborts across a full session.
3. Full `bun run verify`. Per `plans/README.md`, use per-workspace baseline deltas; do not gate on
   an absolute test count.
4. Exercise the bridge end to end: open a folder through `pickEntry`, confirm the backdrop handoff
   reaches the page before first paint, confirm the terminal and editor work.
5. Delete the Electrobun remnants: `electrobun.config.ts`, the `electrobun` dependency, its
   `bun.lock` entry, and `apps/desktop/build/` (plus its `.gitignore` line). No compatibility shim,
   per the greenfield rule. `apps/desktop/` keeps its name throughout — there is no rename step.
6. Verify on all three platforms per Gate 0, not only Linux. The spin was Linux-specific; the
   packaging and chrome work is not.

## Risks and rejected alternatives

- **Runtime split.** The main process becomes Node while the server stays Bun. The monorepo is
  Bun-first (workspaces, catalog). Accepted: the shell is 879 lines and its Bun usage is shallow.
- **Packaging is net-new.** True under any option, including staying on Electrobun — nothing is
  configured today.
- **Rejected — upgrade to Electrobun 2.0.1.** Fixes the spin, verified by disassembly. Leaves the
  helper abort, still requires a migration, and keeps Platform on a runtime whose bundle-size
  benefit it already forfeits by setting `bundleCEF: true` everywhere.
- **Rejected — `defaultRenderer: 'native'`.** Removes the CEF timers entirely and would kill the
  spin, but puts WebKitGTK on Linux. Chrome-first is a product requirement, and Platform's
  engine-sensitive surface is large: 13 `@singapor/*` editor packages plus Lexical
  `contenteditable` with four custom plugins.
- **Rejected — hand-rolled CEF host.** Same engine lifecycle as above with none of Electron's
  maintenance, and it reintroduces exactly the message-loop integration that caused this plan.
- **Rejected — hand-rolled system-webview host (Tauri-shaped).** Same WebKit objection, plus the
  engine version is then unpinned and varies by distro.

## Out of scope

- **The native macOS app.** Separate lane. Per Gate 0 the two coexist: Electron ships macOS as well,
  and the native app is an alternative rather than a replacement. Nothing here blocks or depends on
  it.
- **The `bun --watch` zombie leak.** `apps/server` accumulates defunct children in dev: `bun --watch`
  reloads the module in-process — same PID, fresh JS context — so children spawned by the previous
  instance survive with their `once('exit')` handler discarded, and nothing reaps them. Confirmed by
  controlled test: a pre-reload child killed becomes `Z`, a post-reload child is reaped cleanly.
  Every spawn site in `apps/server` is individually correct. Dev-only — `--watch` appears only in the
  `dev` script — and a zombie holds a PID table entry and nothing else. Worth its own plan or a Bun
  upstream report; unrelated to the shell.
- **Reporting the helper canary bug upstream.** Worth doing regardless (the fix is `_exit(code)`
  instead of `return code`, or `-fno-stack-protector` on that translation unit), but it stops
  mattering to Platform once the shell is replaced.

## Open questions for the operator

Gate 0 (target matrix) and the workspace layout are both resolved above; only one remains.

1. **Which of Gate 4's three server-shipping options?** Porting `apps/server` to Node buys the
   cleanest artifact — no second runtime, and it deletes the node-pty bridge — at the cost of
   moving off `bun:sqlite` and ~70 other Bun calls. The two sidecar options keep the server
   untouched for ~78–80 MB. This does not block Gates 1–3, so it can be decided while the shell
   lands; it must be decided before Gate 4 starts.
