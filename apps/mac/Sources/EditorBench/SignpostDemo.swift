import EditorCore
import Foundation

/// Calibrates the keystroke instrument before there is an editor to point it
/// at. It emits the real `EditorSignpost` intervals with synthetic, known
/// stage durations, so an `xctrace` capture can be checked against numbers we
/// chose — if the trace does not report roughly these, the instrument is
/// broken, not the editor. Recipe in docs/native-bench-harness.md §7.
enum SignpostDemo {
  /// Shaped like a keystroke that lands inside a 120 Hz frame: the stages sum
  /// to about 1.6 ms, which is what the plan-2 spike has to hit for real.
  private static let stageBudgets: [(stage: StaticString, label: String, micros: UInt32)] = [
    (EditorSignpost.applyEdit, "ApplyEdit", 150),
    (EditorSignpost.layout, "Layout", 900),
    (EditorSignpost.draw, "Draw", 500),
    (EditorSignpost.commit, "Commit", 50),
  ]

  static func run(keystrokes: Int) {
    print("emitting \(keystrokes) synthetic keystroke intervals")
    print("  subsystem \(EditorSignpost.subsystem)  category \(EditorSignpost.category)")
    print("  stages: " + stageBudgets.map { "\($0.label) \($0.micros)us" }.joined(separator: " → "))
    print("  pid \(ProcessInfo.processInfo.processIdentifier)")

    let samples = Bench.measure(iterations: keystrokes, warmup: 0) {
      let trace = KeystrokeTrace()
      for budget in stageBudgets {
        usleep(budget.micros)
        trace.mark(budget.stage)
      }
      trace.end()
      usleep(40_000)  // steady-typing gap, matching the web harness's key delay
    }

    print(
      "wall clock per keystroke: p50 \(formatMs(samples.p50Ms, decimals: 3)), "
        + "p95 \(formatMs(samples.p95Ms, decimals: 3))"
    )
    print("expected interval in the trace: ~1.6 ms (the sleeps), minus the 40 ms gap")
  }
}
