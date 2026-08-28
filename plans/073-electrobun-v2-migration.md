# Plan 073: Migrate the desktop shell to Electrobun 2.x

> **Executor instructions**: Read this plan completely, then read Platform `AGENTS.md` and root
> `PLAN.md`. Execute every gate in order.
>
> Gate 1 contains one setting that silently breaks the server if it is wrong. Read it before
> touching `electrobun.config.ts`. Do not commit, push, create a branch, publish, or open a PR
> without explicit operator approval.

## Status

- **State**: Proposed — needs root scheduling
- **Priority**: P1 — the current shell burns one full CPU core continuously on Linux, on every run,
  whether or not the app is doing anything
- **Effort**: S–M — a dependency and config migration, not a rewrite
- **Risk**: MEDIUM — the fix itself is verified upstream; the risk is in the v2 toolchain change
  (Hutch) and in one config default that would break the server
- **Platform baseline**: `68ac084e331e0d3223bb5ab7f4cc4eff34960ef3`
- **Version**: `electrobun` 1.18.1 → 2.0.1 (2.0.2-beta.12 is newer; pin a stable release)

Root `PLAN.md` is authoritative for ordering. This is an independent desktop-shell lane; stop and
ask the operator where to schedule it if it has not been added there when execution is requested.

## Why

### The shell burns a core, permanently

`libNativeWrapper.so` (1.18.1) drives CEF from a fixed-interval timer:

```c
runCEFEventLoop():
    initializeGTK();
    g_timeout_add(10, cef_timer_callback);   // -> CefDoMessageLoopWork(), 100x/sec
    g_timeout_add(10, process_x11_events);   // -> XPending drain, 100x/sec
    sleep(1);
    gtk_main();
```

`cef_timer_callback` calls `CefDoMessageLoopWork()` unconditionally every 10 ms. Electrobun does
export `browser_process_handler_on_schedule_message_pump_work`, so CEF is telling it when work is
actually due — the hint is ignored. Each call runs a full Chromium pump iteration including X server
round trips, so the glib loop never reaches a blocking poll.

Measured on a wedged 9-hour session (PID 116930), reproduced 3/3 on fresh launches:

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

This is the documented CEF external-message-pump trap, not a Platform bug: CEF4Delphi #334
("Linux: 100% CPU in the demos using an external message pump"), cefpython #246.

### v2 fixes it

Verified by disassembling `libNativeWrapper_cef.so` from the v2.0.1 GitHub release:

| Symbol                       | 1.18.1  | 2.0.1   |
| ---------------------------- | ------- | ------- |
| `CefDoMessageLoopWork` calls | 1       | **0**   |
| `CefRunMessageLoop` calls    | 0       | **1**   |
| `cef_timer_callback`         | present | removed |

v2's `runCEFEventLoop` calls `ensureXlibThreadSupport()`, initialises CEF, registers only the 10 ms
X11 drain, and then hands the thread to `CefRunMessageLoop()` — CEF's own blocking, event-driven
loop — falling back to `initializeGTK(); gtk_main()` only if CEF fails to initialise. This is the
correct shape, and it is the reason to upgrade rather than replace.

### Why not Electron

Evaluated and rejected. An Electron port was measured (0.20% idle main process vs ~100%) and a
working spike exists on `spike/electron-shell`, but Electrobun has one property Electron cannot
match for this codebase:

```text
// apps/desktop/src/bun/index.ts — spawnServer()
[process.execPath, '--env-file=.env', 'apps/server/src/index.ts']
```

`process.execPath` is the shell's own bundled Bun (98 MB). **`apps/server` runs on the shell's
runtime — Platform ships one runtime, not two.** Under Electron the main process is Node, so a Bun
server needs either a ~78–98 MB sidecar or a port off `bun:sqlite` (19 call sites) plus ~70 other
Bun calls. v2 keeps this for free. See Gate 1, which is where it can be lost by accident.

## Gate 1 — Dependency and config migration

**The load-bearing setting.** v2 introduces `build.mainProcess: "cottontail" | "bun"` and
**defaults to Cottontail**, a JSC-based runtime. If the default is taken, `process.execPath` is no
longer Bun and `spawnServer()` starts `apps/server` on JSC — which will fail on `bun:sqlite` and
every other Bun API. **Set `mainProcess: "bun"` explicitly.** Do not rely on the default, and do
not treat this as a preference: it is the property this plan exists to keep.

1. Bump `electrobun` to a pinned 2.0.x in `apps/desktop/package.json`.
2. `electrobun.config.ts` — remove the v1-only keys that no longer apply: `build.targets`,
   `build.useAsar`, `build.asarUnpack`, `build.cefVersion`, `build.wgpuVersion`,
   `build.bunVersion`, `build.bunnyBun`, `build.locales`. Add `build.mainProcess: "bun"`.
3. Establish where `bundleCEF` and `defaultRenderer` live in the v2 schema before editing — the
   published v2 config example shows only `app` and `build.mainProcess`, and the per-platform
   `mac`/`win`/`linux` blocks Platform uses today may have moved or been renamed. **This is
   unverified; confirm against the v2 docs or the shipped types, do not guess.** CEF must stay
   bundled on all three platforms: WebKitGTK is not an acceptable renderer for Platform.
4. `apps/desktop/tsconfig.json` — extend `./.hutch/devkit/tsconfig.json`.
5. Hutch downloads its paired toolchain on first command and caches it; npm scripts are unchanged.
   Add `.hutch/` to `.gitignore` if it lands in the tree.

**Exit**: `bun run desktop:dev` builds and opens the window, and `apps/server` starts — confirm the
server is on Bun by asserting a `bun:sqlite`-backed route responds, not merely that the process
launched.

## Gate 2 — Prove the spin is gone

The whole point of the migration. Measure; do not assume.

1. With the app idle and a document open, sample the main process for at least 10 s:
   - `awk '{print $14+$15}' /proc/<pid>/stat` delta must be < 5% of one core.
   - `voluntary_ctxt_switches` must **increase** — a frozen counter is the exact signature of the
     bug being fixed, and is the single most reliable check here.
   - process state must be `S`, not `R`.
2. Confirm the loop shape changed, so a future regression is attributable:
   `nm -D --defined-only <app>/bin/libNativeWrapper.so | grep cef_timer_callback` must return
   nothing, and `objdump -d -C … | grep -cE 'call.*<CefRunMessageLoop'` must be 1.
3. Record the numbers in this plan before deleting it.

## Gate 3 — Build and CI

Hutch **builds only for the host platform — there is no cross-compilation.** Platform targets
macOS, Linux and Windows, so this is a real constraint, not a footnote.

1. `.github/workflows/ci.yml` has no desktop job today. Adding one means a matrix with a runner per
   target OS.
2. Verify the v1 → v2 update path if any build has been distributed: apps built with 1.18.1+ can
   take v2 updates provided app name, identifier and base URL are unchanged. Platform configures no
   updater today, so this is likely moot — confirm rather than assume.
3. The temporary `production` environment name is `stable` in v2; update any script that passes it.

## Gate 4 — The helper abort (upstream, not blocked by this plan)

`bun Helper` aborts with `SIGABRT` on exit. **Not** memory corruption:

|                                   | value                |
| --------------------------------- | -------------------- |
| canary saved in `main`'s prologue | `0x63a16c1dc2ae4400` |
| live TLS canary at `fs_base+0x28` | `0x665fcbd9b3049a00` |

The frame is intact — saved `rbx`/`rbp`/`r12`/`r13` and the return address all resolve, and gdb
walks cleanly back to `__libc_start_main`. Chromium's `--change-stack-guard-on-fork=enable` (present
in the helper's own argv) rotates the TLS canary during `CefExecuteProcess`; `main` captured the old
value, so its epilogue check fails. 37 core dumps, 160 MB in `/var/lib/systemd/coredump`.

**This is not fixed in 2.0.1** — `process_helper`'s `main` still does capture-canary →
`CefExecuteProcess` → compare → `__stack_chk_fail`. It is cosmetic (the abort happens at helper
exit, after the work is done) but it dumps a 2.5 MB core per helper and pollutes crash reporting.

1. Open an upstream issue on `blackboardsh/electrobun` with the canary evidence above. The fix is
   one line: `_exit(exit_code)` instead of `return exit_code`, or `-fno-stack-protector` on that
   translation unit.
2. Do not block the migration on it.

## Risks and rejected alternatives

- **Cottontail default silently breaks the server.** The highest-probability failure in this plan,
  and it fails at runtime rather than at build time. Gate 1 step 1 exists for this.
- **v2 is a restructure, not a version bump.** The npm package is now a stub resolving a Hutch
  toolchain from GitHub releases. Budget for toolchain friction, not just a version edit.
- **Host-only builds.** Gate 3. Affects release engineering more than development.
- **Rejected — migrate to Electron.** Measured at 0.20% idle vs ~100%, spike on
  `spike/electron-shell`, and t3code (`references/t3code`) is a working precedent with the same
  `apps/{desktop,server,web}` shape. Rejected because v2 already fixes the spin, and Electron would
  cost the single-runtime property described in Why — a ~78–98 MB Bun sidecar, or a port off
  `bun:sqlite`. Revisit only if v2 fails Gate 2.
- **Rejected — `defaultRenderer: 'native'`.** Removes the CEF timers entirely, but puts WebKitGTK
  on Linux. Chrome-first is a product requirement and Platform's engine-sensitive surface is large:
  13 `@singapor/*` editor packages plus Lexical `contenteditable` with four custom plugins.
- **Rejected — stay on 1.18.1 and patch around it.** There is no supported way to change the pump
  interval from application code; the timer is compiled into `libNativeWrapper.so`.

## Out of scope

- **The native macOS app.** Separate lane; the two coexist.
- **The `bun --watch` zombie leak.** `apps/server` accumulates defunct children in dev: `bun --watch`
  reloads the module in-process — same PID, fresh JS context — so children spawned by the previous
  instance survive with their `once('exit')` handler discarded, and nothing reaps them. Confirmed by
  controlled test: a pre-reload child killed becomes `Z`, a post-reload child is reaped cleanly.
  Every spawn site in `apps/server` is individually correct. Dev-only, and a zombie holds a PID
  table entry and nothing else. Worth its own plan or a Bun upstream report.

## Open questions for the operator

1. Where do `bundleCEF` and `defaultRenderer` live in the v2 config schema? Gate 1 step 3 —
   unverified, and it must be settled before the config is edited.
2. Pin 2.0.1, or take 2.0.2-beta? 2.0.1 is the newest stable; the beta line is already at
   2.0.2-beta.12.
