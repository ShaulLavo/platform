# Native Bench Harness — Plan 1

**Status:** done. `swift run -c release EditorBench` prints the baseline table with an empty native column, and the `os_signpost` → `xctrace` → `analyze_trace.py` pipeline is verified end to end on this machine.

This is the instrument that gates every later native editor plan. The doctrine it enforces: **no native editor decision is defended with a claim, only with a row in this table**. The native column is empty today and that is the correct output — it fills in as each plan lands the path it owns, and the gate is passed when every row it fills reads `pass`.

The harness lives in `apps/mac/Sources/EditorBench`; the keystroke instrument it defines lives in `apps/mac/Sources/EditorCore/LatencySignpost.swift` because the editor surface is what will emit it.

---

## 1. The rule

A native path ships when it meets or beats the web editor's number **for the same work on the same machine**. Three things make that checkable rather than rhetorical, and all three are the point of this document:

1. Every baseline names the corpus, the statistic, and the code that produced it (§2, §4).
2. Every baseline carries a **provenance tier** — a number nobody can re-run is a memory, not a baseline (§3).
3. The native measurement is defined precisely enough to be wrong (§6), including where its clock starts and stops.

---

## 2. The web harness, as it actually works

Two harnesses of different shapes, and they answer different questions. Conflating them is how "5.8 ms typing" turns into folklore.

### 2.1 Bun microbenches — `../Editor/packages/*/bench/*.ts`

Plain scripts, run by name (`bun run bench:piece-table`). Conventions worth porting, and ported:

- `performance.now()` around a batch; explicit `WARMUP_BATCHES` / `WARMUP_ITERATIONS` discarded, never averaged in.
- Deterministic corpora from a seeded LCG (`state = state * 1664525 + 1013904223`), so two runs benchmark the identical document. `Corpus.swift` uses the same constants.
- Self-asserting: `pieceTable-insertions.ts` throws if the growth ratio exceeds 4x, `foldMap.ts` if the average round trip exceeds 0.5 ms. A bench that only prints is a bench nobody notices regressing.
- Output is a labelled block of `%.4f ms` lines, not a chart.

They measure **storage and projection paths**, not what a user feels. `performance-baseline.md` says so itself: the typing row is "covered by the insertion bench as a storage-path proxy; a DOM typing harness is still needed."

### 2.2 Playwright interaction benches — `apps/web/scripts/editor-{typing,scroll}-benchmark.mjs`

These measure what a user feels, in a real browser, against the real app.

**A "typing iteration" is defined exactly as:**

- Setup: seed `localStorage` with a workspace + one open editor tab, load the app at `?editorPerfTrace=1`, wait for `.editor-virtualized-row` **and** ≥ 200 registered CSS highlight ranges **and** `document.fonts.ready` **and** two rAFs. Click row 20 at x=40, press `End`.
- Input: `page.keyboard.type('abcdefghijklmnopqrstuvwxyz0123456789abcd')` — 40 keys. `steady` uses `delay: 40` ms; `burst` uses `delay: 0`.
- **Clock start:** the `keydown` event's `event.timeStamp`, captured in a capture-phase listener on `window`.
- **Clock stop:** the timestamp of the **first `requestAnimationFrame` callback that runs after that keydown**.
- Latency = stop − start, per key. Reported as p50 / p95 / max over 40 keys, averaged across 3 trials.
- A second, independent number comes from the in-page diagnostics sink: `editor.view.applyEdit` mean/max, from `window.__editorPerfTrace.report().topDiagnostics`.
- Guard: if the editor applied fewer than 40 edits, the trial throws (focus was lost) rather than reporting a fast, meaningless number.

**This is not keystroke-to-photon.** It ends at the rAF callback — before style, layout, paint, composite, and scanout. It is the cheapest honest proxy the web platform offers, and it systematically _under_-reports by roughly one frame of pipeline. §6.1 says what the native equivalent measures instead, and why the two are still comparable.

**A "scroll iteration"** is: `scroller.scrollTop += 36`, dispatch a synthetic `scroll` event, await one rAF — 80 times. Frame durations come from a free-running rAF loop inside `performance-trace.ts` (`frameStats.meanMs/maxMs`, `slowFrames` ≥ 16.7 ms, `longFrames` ≥ 50 ms). Note this drives the _scroll handler and render path_, not the compositor — a real wheel gesture behaves differently, which is why the 7 fps wheel trace of 2026-08-15 found problems this bench did not.

### 2.3 Why chromium runs uncapped

`launchOptions()` uses `channel: 'chromium'` with `--disable-frame-rate-limit --disable-gpu-vsync`. Both halves matter:

- The default Playwright **headless shell** stalls its frame pipeline at ~2x vsync under sustained editor repaint, inflating frame means to ~27 ms. The `chromium` channel runs new headless on the real browser.
- Uncapped frames make the bench measure **throughput**, not vsync cadence. At 60 Hz a regression from 5 ms to 15 ms per frame hides entirely inside the 16.7 ms budget; uncapped, it shows up as a tripling. The native harness inherits this idea in §6.4: measure the work, then check it against the budget separately.

### 2.4 Calibration and drift

Every trial reports `meanCpuCalibrationMs` — a fixed 20M-iteration integer loop timed in-page immediately before sampling (~97 ms on this machine when mildly loaded). It exists because **this machine's tail latencies inflate roughly 2x after an hour of heavy benching**. The rules that follow from that are in §8, and they are not optional.

`--cpu-throttle=N` applies CDP `Emulation.setCPUThrottlingRate` _after_ the editor is ready, so only the measured interaction runs degraded. Measured June 2026: degradation is uniform scaling, no queueing or GC pathology.

---

## 3. Provenance — three tiers

`EditorBench` tags every row. The tier is the honest part of the table.

| Tier                   | Means                                                                                                                 | Worth                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **[1] checked in**     | `../Editor/docs/architecture/phase-0/performance-baseline.md` (2026-05-24, Bun 1.3.10) and the `bench/*.ts` it names. | Re-runnable by command. Strongest evidence, weakest relevance — storage-path proxies, not felt latency.                   |
| **[2] live gate**      | Threshold constants in `apps/web/scripts/editor-{typing,scroll}-benchmark.mjs`.                                       | The bar the web editor is _currently held to_, with a fully specified harness. But see §5 — the harness cannot run today. |
| **[3] session record** | Measured and dated in a working session; methodology known; no checked-in command reproduces it.                      | Real, provisional. Never quote one as settled without saying which session it came from.                                  |

**The 5.8 ms figure is tier 3.** It comes from the June 12 2026 typing-latency work: typing on a 1M-line file in Chromium went from ~90 ms to **4.4–5.7 ms p50, 6–9 ms p95** after three fixes (a `LineStartsView` on snapshots, packed SoA token transport across the tree-sitter worker boundary, and a minimap structural-scan skip). It is recorded nowhere in `../Editor`. The related **p95 6 ms viewport highlight** is also tier 3, from the 2026-08-22 tree-sitter transport benchmark: a viewport query (~960 tokens) costs 0.2 ms p50 across the worker boundary, 6 ms p95 on a 50K-line doc — versus 164 ms p95 over a WebSocket, which is why tree-sitter is client-side. The **scroll frame traces** are tier 3 too: 42.7 → 18.8 ms frame max on a PNG-as-text and 24.3 → 17.9 ms on a TSX after deleting the scroll-persistence plugin's listener (June 13 2026), and a 110–156 ms/frame wheel trace on 2026-08-15 whose fixes landed the same day.

Tier 3 numbers are in the table because they are the real bar. They are marked tier 3 so nobody mistakes them for something they can re-run.

---

## 4. The baseline table

`EditorBench` is the authority; this is the same data with the methodology attached. Everything in the "web (here)" column of the document table was re-measured on **2026-08-28, Apple M1 (4P+4E), 16 GiB, macOS 26.4, Bun 1.4.0** — the same machine and day this harness was written.

### 4.1 Interaction — what the user feels

| metric                   | corpus                                   | stat             | web            | tier | how                                             |
| ------------------------ | ---------------------------------------- | ---------------- | -------------- | ---- | ----------------------------------------------- |
| `typing.steady.p50`      | 1M-line TS, chromium, 40 ms key delay    | p50              | 4.4–5.7 ms     | 3    | keydown → next rAF (§2.2)                       |
| `typing.steady.p95`      | same                                     | p95              | 6–9 ms         | 3    | same                                            |
| `typing.burst.p95`       | 40 keys, no inter-key delay              | p95              | ≤ 12 ms        | 2    | `gateThresholds.chromium.maxBurstP95Ms`         |
| `typing.applyEdit.mean`  | `editor.view.applyEdit` diagnostic       | mean             | ≤ 3 ms         | 2    | `maxApplyEditMeanMs`; buffer mutation only      |
| `scroll.frame.mean`      | 80 steps × 36 px, uncapped frames        | median of trials | ≤ 10 ms        | 2    | `maxMedianFrameMeanMs`; uncapped baseline ~5 ms |
| `scroll.frame.max`       | wheel scroll, TSX / PNG-as-text          | max              | 17.9 / 18.8 ms | 3    | June 13 2026 A/B, plugin disabled control       |
| `highlight.viewport.p50` | tree-sitter viewport query, ~960 tokens  | p50              | 0.2 ms         | 3    | Aug 22 2026 worker-boundary bench               |
| `highlight.viewport.p95` | tree-sitter viewport query, 50K-line doc | p95              | 6 ms           | 3    | same                                            |

### 4.2 Document — the paths the port reimplements

| metric                          | corpus                                   | web (2026-05-24) | web (this machine) | reproduce                                                   |
| ------------------------------- | ---------------------------------------- | ---------------- | ------------------ | ----------------------------------------------------------- |
| `piecetable.insert.append`      | 2,000 × 1 KiB appends                    | 0.0048 ms/ins    | **0.0098 ms/ins**  | `cd ../Editor/packages/editor && bun run bench:piece-table` |
| `piecetable.insert.growth`      | last 3 / first 3 batches                 | 0.64x            | 0.42x              | same                                                        |
| `piecetable.walk.sequential`    | 30.7K chars, 3,856 pieces                | —                | 0.2587 ms          | `bun run bench:walker`                                      |
| `piecetable.seek.random`        | 5,000 seeks + 64-char reads              | —                | 3.2545 ms          | same                                                        |
| `piecetable.snapshot.build`     | 100K lines, incremental index            | —                | 72.0484 ms         | `bun run bench:anchors`                                     |
| `piecetable.anchor.resolve`     | 100K lines, 1,089 anchors                | —                | 0.0003 ms          | same                                                        |
| `foldmap.create`                | 100K lines, 100 folds                    | 6.8320 ms        | 6.6460 ms          | `bun run bench:fold-map`                                    |
| `foldmap.roundtrip.p95`         | 100 points, 1,000 iterations             | 0.1229 ms        | 0.0556 ms          | same                                                        |
| `virtualization.mount.large`    | 100K lines, 44 mounted rows              | 45.2990 ms       | **57.1580 ms**     | `bun run bench:virtualization`                              |
| `virtualization.mount.longline` | 50K-char line                            | 2.9140 ms        | 2.6820 ms          | same                                                        |
| `syntax.edit.total.10k`         | TypeScript 10K lines, parse + query      | 145.3300 ms      | 115.6800 ms        | `cd ../Editor/packages/tree-sitter && bun run bench:syntax` |
| `syntax.edit.parse.100k`        | TypeScript 100K lines, incremental parse | —                | 8.7200 ms          | same                                                        |
| `syntax.edit.total.100k`        | TypeScript 100K lines, parse + query     | 1732.8900 ms     | 1183.6000 ms       | same                                                        |
| `minimap.update.mean`           | 100K lines, 50 edits                     | 0.7487 ms        | **bench broken**   | `cd ../Editor/packages/minimap && bun run bench:update`     |

Three findings from re-running the checked-in table, and they are the argument for having a same-machine column at all:

- **Piece-table insertion is 2x slower than the checked-in number** (0.0098 vs 0.0048 ms). Different machine, different Bun (1.4.0 vs 1.3.10), three months apart — the direction is unexplained and nobody noticed, because nothing re-runs it. The native port is gated against **0.0098 ms**, the number this machine actually produces.
- **`virtualization.mount.large` also regressed** (45.3 → 57.2 ms), same caveat.
- **The minimap bench no longer runs at all** — `renderer.setDocument` throws `TypeError: undefined is not an object (evaluating 'document.lines.map')`. A row of the checked-in baseline table has been dead for some unknown period. Its gate is inherited as-written and flagged.

`syntax.edit.parse.100k` (8.72 ms) is the row that matters for plan 4: incremental **parse** is cheap and stable, and essentially all of the 1,183 ms edit total is **query** work. Port the scheduling, not the query volume.

---

## 5. Blocker — the web interaction harness cannot run today

Every tier-2 and most tier-3 numbers are unverifiable on this machine right now, and pretending otherwise would poison the whole table. The cause is specific:

`apps/web/scripts/bench-workspace.mjs` seeds flat `localStorage` keys under `platform.workspace-state.v14` (`.rootFolder`, `.workbenchPanels`, `.editorHistory`, …). The app is on **v19** and moved to **per-project slices**: `platform.workspace-state.v19.workspace:<rootPath>` holding `{ editorHistory, recentlyClosedEditorPaths, scrollPositionByPath, workbenchPanels }`, with `rootFolder` / `workspaces` / `workbenchLayout` as separate top-level keys (`apps/web/src/features/workspace/state/cache.ts`). A v14 seed writes keys nothing reads, no editor mounts, and the readiness wait times out. There was also no dev server running when this was written.

**The repair** (one focused change, not part of plan 1): teach `bench-workspace.mjs` to import `WORKSPACE_CACHE_STORAGE_KEYS` / `workspaceSliceStorageKey` from `cache.ts` instead of hardcoding a prefix, so the seeder cannot silently drift from the schema again. Then re-run both gates and promote the typing/scroll rows from tier 2/3 to tier 1.

Until that lands, `typing.*` and `scroll.*` read `not run` in the "web (here)" column. That is deliberate: an empty cell is information, a stale number is not.

---

## 6. Native methodology

### 6.1 Keystroke-to-photon, defined

Nothing in-process can see a photon. So the measurement is split, and both halves are named:

```
key event  →  ApplyEdit  →  Layout  →  Draw  →  Commit  ‖  compositor  →  scanout
└────────────── in-process, os_signpost ──────────────┘  └── Instruments only ──┘
```

- **Keystroke-to-commit** is the `Keystroke` signpost interval: opened in `NSTextInputClient.insertText` / `keyDown`, closed in the `CATransaction` completion handler that runs when the frame is handed to the compositor. This is what `EditorBench` and the editor surface report, and it is the number plan 2's sub-2 ms spike target refers to.
- **Commit-to-photon** is the display pipeline. It comes from the Animation Hitches lane of an Instruments trace, or from the `targetTimestamp` of `NSView.displayLink(target:selector:)` for the frame the commit landed in. Add it only when quoting an end-to-end figure.

Against the web's keydown → next-rAF (§2.2), keystroke-to-commit is the **stricter** measurement: it includes typesetting and drawing, which the rAF callback precedes. A native number that beats the web number is therefore beating it with a handicap. Never quote it the other way round.

### 6.2 The signpost contract

`apps/mac/Sources/EditorCore/LatencySignpost.swift`. Subsystem `dev.platform.editor`, category `Latency`. These strings are a contract with `analyze_trace.py`'s filters — renaming one silently empties every query.

| name        | kind     | opened / emitted where                      |
| ----------- | -------- | ------------------------------------------- |
| `Keystroke` | interval | input receipt → `CATransaction` completion  |
| `ApplyEdit` | event    | buffer mutation complete, before any layout |
| `Layout`    | event    | invalidated fragments typeset               |
| `Draw`      | event    | glyphs drawn for those fragments            |
| `Commit`    | event    | frame handed to the compositor              |

`KeystrokeTrace` is `~Copyable` so the interval cannot be accidentally duplicated or leaked past its `end()`. Disabled signposts cost an atomic load and a branch, which is cheap enough to leave in the hot path permanently — the alternative is an instrument that only exists in builds where the bug does not reproduce.

### 6.3 The xctrace recipe (verified 2026-08-28)

The instrument was calibrated before any editor exists, per the repo's debugging rule. `EditorBench --signpost-demo=N` emits N keystroke intervals with known synthetic stage costs (150 + 900 + 500 + 50 µs = 1.6 ms), so the trace can be checked against numbers we chose:

```bash
cd apps/mac && swift build -c release
xcrun xctrace record --template "Logging" --output /tmp/sig.trace \
  --launch -- "$(swift build -c release --show-bin-path)/EditorBench" --signpost-demo=60
python3 .claude/skills/swiftui-expert-skill/scripts/analyze_trace.py \
  --trace /tmp/sig.trace --list-signposts --signpost-subsystem dev.platform.editor
```

Result: 60 `Keystroke` intervals, 240 stage events (60 each of ApplyEdit/Layout/Draw/Commit), duration p50 **2.062 ms** against a 1.6 ms synthetic budget — the ~0.4 ms delta is `usleep` overshoot, which guarantees _at least_ the requested time. **The pipeline reports what we put in.**

Two traps, both hit while verifying this:

- **`--output` must precede `--launch`.** Anything after `--launch --` goes to the target process; `--output` placed last is passed to your binary, which rejects it, and the trace records a 0.8 s run of nothing.
- **Template choice decides whether signposts exist at all.** `Time Profiler` produces an empty signpost table. Use `Logging` (its `os_signpost` instrument with dynamic subsystems) for latency work, or `Animation Hitches` when the commit-to-photon tail is the question. `--list-devices` first: real devices and the host Mac take `SwiftUI`; the iOS Simulator's SwiftUI lane comes back empty.

For a long interactive session, `record_trace.py --stop-file /tmp/stop-trace` runs in the background and stops on `touch`.

### 6.4 Frame budget: 60 Hz here, 120 Hz target

`EditorBench` reads the refresh rate at runtime (`CGDisplayCopyDisplayMode(CGMainDisplayID())?.refreshRate`) and prints both budgets:

|        | budget               | meaning                           |
| ------ | -------------------- | --------------------------------- |
| local  | 16.67 ms @ 60 Hz     | what this MacBook Air can falsify |
| target | **8.33 ms @ 120 Hz** | what the editor is designed for   |

**Correcting the plan-of-plans premise: this machine is not ProMotion.** Built-in display, 2880×1800, 60 Hz, confirmed by both `CGDisplayMode.refreshRate` and `NSScreen.maximumFramesPerSecond`. Gate on the 8.33 ms target anyway — designing to the dev machine's 60 Hz bakes in a budget ProMotion halves — but never _claim_ 120 Hz until it is measured on a 120 Hz display. The harness prints that caveat itself so a pasted result carries it.

Budget arithmetic for plan 2: a 8.33 ms frame that must also absorb a keystroke leaves the sub-2 ms keystroke-to-commit target roughly a quarter of the frame, with the rest for everything that is not the edit.

### 6.5 Microbench rules

Encoded in `Measurement.swift` and `MachineProfile.swift`, not left to discipline:

- **`ContinuousClock`.** Monotonic, does not stop across suspension, no wall-clock conversion. `Duration.components` → ms.
- **Release only.** `EditorBench` prints a loud banner on a debug build. `swift run EditorBench` without `-c release` produces numbers that are not evidence.
- **Warmup discarded, not averaged.** First iterations pay page faults and lazy bridging that never recur in a running editor.
- **Whole sample distribution kept** (min / p50 / p95 / max / mean) so each row can report the same statistic as the web row it faces. A p95 compared against a mean is not a comparison.
- **Deterministic corpora**, same LCG as the web fixtures.
- **A sink for every result.** `benchSink` is global mutable state on purpose: with a constant seed and no sink, LLVM constant-folded the whole 20M-iteration calibration loop and it reported `0.00 ms`. The loop is now seeded from the pid.
- **CPU calibration every run**, same 20M-iteration shape as the web harness. Compare it only to other `EditorBench` runs — Swift and V8 do not produce comparable absolute times (69 ms here vs ~97 ms in-page). Its job is to tell you the machine was in a different state, and by how much.
- **Right-aligned fixed-decimal columns.** Same reason `tabular-nums` is the repo default for updating numbers: a column of latencies with wandering decimal points cannot be scanned.

### 6.6 Lesson zero — never iterate a String by Character

Measured by `EditorBench`, 9 MiB ASCII corpus, counting line breaks, min of 7 iterations, release:

| variant                     | min        | vs floor | why                                        |
| --------------------------- | ---------- | -------- | ------------------------------------------ |
| `String` (Character)        | 82.8 ms    | 46x      | grapheme-breaks every element              |
| `String.unicodeScalars`     | 10.0 ms    | 6x       | decodes, no grapheme breaking              |
| `String.utf16`              | 23.1 ms    | 13x      | what CoreText and the piece table index by |
| `String.utf8`               | 14.2 ms    | 8x       | native storage, still an iterator          |
| `utf8` contiguous buffer    | 4.2 ms     | 2x       | one bounds check, not one per byte         |
| `memchr` over `utf8` buffer | **1.8 ms** | 1x       | libc SIMD; the floor for byte search       |
| `EditorCore.Document`       | 131.6 ms   | 73x      | the placeholder, on the Character path     |

The corpus is pure ASCII — there are no graphemes to break. The 46x is paid entirely for the _possibility_ of one. Two consequences for plan 2:

- **Every buffer scan goes through `utf8` or `utf16`, and byte search goes through a contiguous buffer.** Not "prefer"; the 9 MiB scan is a real operation (open a file, build line starts) and 82 ms of it is a visible stall.
- **`utf16` is 5x the cost of a contiguous `utf8` buffer**, which is awkward because UTF-16 offsets are what the ported piece table and CoreText both speak. Resolve it in the line/layout layer: scan bytes, store UTF-16 offsets. Do not let the index type dictate the scan type.

`Document` is left on the Character path deliberately, as the control. Its comment says so — do not "fix" it without moving the control somewhere else, or the table loses its worst case.

---

## 7. Running it

```bash
cd apps/mac && swift run -c release EditorBench
```

```
--section=machine|baselines|scan   run one section (repeatable; default all)
--scan-mib=N                       string-scan corpus size (default 9)
--scan-iterations=N                string-scan iterations (default 7)
--no-calibration                   skip the CPU calibration loop (~1s)
--signpost-demo[=N]                emit N synthetic keystroke signposts and exit
```

Output sections: **Machine** (profile, both frame budgets, calibration), **Baselines** (the two tables above with an empty native column and the provenance legend), **String views** (§6.6).

---

## 8. Hygiene

Non-negotiable, and all three are lessons this machine has already taught:

- **Never compare runs across sessions.** After roughly an hour of heavy benching, tail latencies on this machine inflate about 2x — a typing gate that reads 12 ms cold reads 13–14 ms warm, with no code change. Always pair a candidate with a control **in the same session, interleaved**.
- **Always read a result relative to its calibration line.** A number without its `cpu calibration` is not a result.
- **Absolute ceilings do not survive days.** The ghostty renderer's unchanged baseline failed its own ceiling two days after it was set. Gate on a **ratio to a same-day control**, not on a constant, whenever the metric is machine-state sensitive.
- **No scratch benchmark files in the repo.** Throwaway probes get deleted; the recipe goes in this doc.

---

## 9. How the native column fills

Each row's `nativeMs` is registered by the plan that owns the path. The verdict cell scores it against the stricter of the two web columns.

| plan                  | rows it must fill                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| 2 — editor core       | `piecetable.*`, `virtualization.mount.*`, `typing.applyEdit.mean`, `typing.steady.*`, `scroll.frame.*` |
| 4 — tree-sitter + LSP | `syntax.edit.*`, `highlight.viewport.*`                                                                |
| after the gate        | `foldmap.*`, `minimap.update.mean` (parity features, not gate features)                                |

Plan 2's own exit criterion — sub-2 ms keystroke-to-paint on a 10 MiB file — is measured by §6.1's `Keystroke` interval via §6.3's recipe, not by a stopwatch.

**Before plan 2 starts:** repair `bench-workspace.mjs` (§5) so `typing.*` and `scroll.*` have a real same-machine web column to be scored against. Comparing a native number to a tier-3 memory is exactly the thing this harness exists to prevent.
