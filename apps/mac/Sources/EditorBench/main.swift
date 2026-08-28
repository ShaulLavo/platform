import EditorCore
import Foundation

/// The doctrine: every native editor decision is judged by numbers from this
/// target against the web editor's measured standard. The native column is
/// empty on purpose — it fills in as each plan lands the path it owns, and the
/// gate is passed when every row it fills reads "pass".
/// Methodology and provenance: docs/native-bench-harness.md

let options: Options
switch Options.parse(Array(CommandLine.arguments.dropFirst())) {
case .options(let parsed):
  options = parsed
case .message(let message, let exitCode):
  print(message)
  exit(exitCode)
}

let machine = MachineProfile.current()

if let keystrokes = options.signpostKeystrokes {
  SignpostDemo.run(keystrokes: keystrokes)
  exit(0)
}

if let keystrokes = options.coreTextSpikeKeystrokes {
  guard machine.buildIsRelease else {
    printBanner(machine)
    exit(2)
  }

  let traceCandidate = MainActor.assumeIsolated {
    CoreTextSpike.run(keystrokes: keystrokes, skipCalibration: options.skipCalibration)
  }
  exit(traceCandidate ? 0 : 1)
}

printBanner(machine)
if options.sections.contains(.machine) { printMachine(machine, skipCalibration: options.skipCalibration) }
if options.sections.contains(.baselines) { printBaselines() }
if options.sections.contains(.scan) {
  printStringScan(corpusMiB: options.scanCorpusMiB, iterations: options.scanIterations)
}

func printBanner(_ machine: MachineProfile) {
  print("EditorBench — native editor gate")
  guard !machine.buildIsRelease else { return }

  print("")
  print("!! debug build — every number below is noise. Re-run with:")
  print("!!   swift run -c release EditorBench")
}

func printMachine(_ machine: MachineProfile, skipCalibration: Bool) {
  section("Machine")
  var table = BenchTable(columns: [.init("field"), .init("value")])
  table.append(["cpu", "\(machine.cpuBrand) (\(machine.performanceCores)P + \(machine.efficiencyCores)E)"])
  table.append(["memory", String(format: "%.0f GiB", machine.memoryGiB)])
  table.append(["os", machine.osVersion])
  table.append(["build", machine.buildIsRelease ? "release" : "debug (results invalid)"])
  table.append(["display", displayDescription(machine)])
  table.append([
    "frame budget (local)", "\(formatMs(machine.localFrameBudgetMs, decimals: 2)) @ \(Int(machine.displayRefreshHz)) Hz",
  ])
  table.append([
    "frame budget (target)",
    "\(formatMs(machine.targetFrameBudgetMs, decimals: 2)) @ \(Int(MachineProfile.promotionHz)) Hz ProMotion — the bar we build to",
  ])
  if !skipCalibration {
    table.append(["cpu calibration", formatMs(MachineProfile.cpuCalibration(), decimals: 2)])
  }
  print(table.render())

  guard machine.displayRefreshHz < MachineProfile.promotionHz else { return }

  print("")
  print(
    wrapped(
      "note: this display is \(Int(machine.displayRefreshHz)) Hz, so the "
        + "\(formatMs(machine.targetFrameBudgetMs, decimals: 2)) ProMotion budget is a design "
        + "target here, not something this machine can falsify. Verify on a 120 Hz display "
        + "before claiming it."
    )
  )
}

func displayDescription(_ machine: MachineProfile) -> String {
  guard let pixels = machine.displayPixels else { return "\(Int(machine.displayRefreshHz)) Hz" }

  return "\(pixels.width)x\(pixels.height) @ \(Int(machine.displayRefreshHz)) Hz"
}

func printBaselines() {
  section("Baselines — interaction (what the user feels)")
  print(renderBaselines(interactionBaselines()))
  print("")
  print(
    wrapped(
      "None of these re-run on this machine: the Playwright harness cannot seed a workspace "
        + "since the cache schema moved to per-project slices. Repair is doc §5."
    )
  )

  section("Baselines — document (the paths the port reimplements)")
  print(renderBaselines(documentBaselines()))

  section("Provenance")
  for provenance in Provenance.allCases { print(wrapped(provenance.legend)) }
  print("")
  print(
    wrapped(
      "A native cell is scored against the stricter of the two web columns. Rows stay empty "
        + "until the plan that owns the path registers a result — an empty native column is "
        + "the correct output until plan 2 lands the buffer."
    )
  )
}

func renderBaselines(_ rows: [BaselineRow]) -> String {
  var table = BenchTable(columns: [
    .init("metric"),
    .init("corpus"),
    .init("stat"),
    .init("web (ref)", alignRight: true),
    .init("web (here)", alignRight: true),
    .init("native", alignRight: true),
    .init("verdict"),
    .init("src"),
  ])
  for row in rows {
    table.append([
      row.id, row.corpus, row.statistic, row.webReference, row.webThisMachine,
      row.nativeCell, row.verdict, row.provenance.marker,
    ])
  }
  return table.render()
}

func printStringScan(corpusMiB: Int, iterations: Int) {
  section("String views — count line breaks (lesson zero)")
  let corpus = Corpus.source(bytes: corpusMiB << 20)
  print("corpus: \(formatCount(corpus.utf8.count)) bytes (\(corpusMiB) MiB), \(iterations) iterations, min of run")

  let results = StringScanBench.run(corpus: corpus, iterations: iterations)
  let floor = results.map(\.samples.minMs).min() ?? 1
  var table = BenchTable(columns: [
    .init("variant"),
    .init("min", alignRight: true),
    .init("p50", alignRight: true),
    .init("vs floor", alignRight: true),
    .init("note"),
  ])
  for result in results {
    table.append([
      result.variant,
      formatMs(result.samples.minMs, decimals: 3),
      formatMs(result.samples.p50Ms, decimals: 3),
      String(format: "%.0fx", result.samples.minMs / floor),
      result.note,
    ])
  }
  print(table.render())
  print("")
  print(
    wrapped(
      "Rule: no hot path in EditorCore iterates a String by Character. Buffer scans go "
        + "through the utf8 or utf16 view, and byte search goes through a contiguous buffer. "
        + "Document is the placeholder from the scaffold and is deliberately left on the "
        + "Character path as the control — it also materialises a String.Index per line, "
        + "which is the second half of its cost."
    )
  )
}

func section(_ title: String) {
  print("")
  print("=== \(title) ===")
}
