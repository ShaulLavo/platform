import Foundation

/// Timing primitive for every native microbench. `ContinuousClock` because it
/// does not stop across suspension and needs no wall-clock conversion; the
/// samples are kept whole so the table can report whichever statistic the web
/// row it is compared against used.
struct Samples {
  private let sortedMs: [Double]
  let totalMs: Double

  init(_ durations: [Duration]) {
    let milliseconds = durations.map(Samples.milliseconds)
    sortedMs = milliseconds.sorted()
    totalMs = milliseconds.reduce(0, +)
  }

  var count: Int { sortedMs.count }
  var minMs: Double { sortedMs.first ?? 0 }
  var maxMs: Double { sortedMs.last ?? 0 }
  var meanMs: Double { sortedMs.isEmpty ? 0 : totalMs / Double(sortedMs.count) }
  var p50Ms: Double { percentile(0.5) }
  var p95Ms: Double { percentile(0.95) }

  func percentile(_ fraction: Double) -> Double {
    guard !sortedMs.isEmpty else { return 0 }

    let rank = Int((fraction * Double(sortedMs.count)).rounded(.up)) - 1
    return sortedMs[min(sortedMs.count - 1, max(0, rank))]
  }

  static func milliseconds(_ duration: Duration) -> Double {
    let parts = duration.components
    return Double(parts.seconds) * 1_000 + Double(parts.attoseconds) * 1e-15
  }
}

enum Bench {
  static let clock = ContinuousClock()

  /// Warmup runs are discarded rather than averaged in: the first iterations
  /// pay page faults and lazy-bridging costs that never recur in a running
  /// editor, so folding them in measures the wrong program.
  static func measure(iterations: Int, warmup: Int = 1, _ body: () -> Void) -> Samples {
    for _ in 0..<warmup { body() }

    var durations: [Duration] = []
    durations.reserveCapacity(iterations)
    for _ in 0..<iterations {
      let start = clock.now
      body()
      durations.append(start.duration(to: clock.now))
    }

    return Samples(durations)
  }

  /// For work whose per-item cost is the number of interest. `body` returns the
  /// item count so the caller does not have to keep the two in sync.
  static func measureThroughput(iterations: Int, warmup: Int = 1, _ body: () -> Int) -> (
    samples: Samples, perItemMs: Double
  ) {
    var items = 0
    let samples = measure(iterations: iterations, warmup: warmup) { items = body() }
    let perItem = items > 0 ? samples.meanMs / Double(items) : 0
    return (samples, perItem)
  }
}
