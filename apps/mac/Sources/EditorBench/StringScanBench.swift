import EditorCore
import Foundation

/// Lesson zero of the native port, kept as executable evidence rather than a
/// comment: iterating a Swift `String` by `Character` pays grapheme-breaking
/// per element, and a hot path that does it is an order of magnitude off before
/// any editor logic runs. Every buffer scan in EditorCore goes through a UTF-8
/// or UTF-16 view, and this table is the reason.
enum StringScanBench {
  struct Result {
    let variant: String
    let note: String
    let samples: Samples
  }

  static func run(corpus: String, iterations: Int) -> [Result] {
    let expected = corpus.utf8.reduce(0) { $1 == 0x0A ? $0 + 1 : $0 }

    return [
      measure("String (Character)", "grapheme-breaks every element", iterations) {
        var count = 0
        for character in corpus where character == "\n" { count += 1 }
        return count
      },
      measure("String.unicodeScalars", "decodes, no grapheme breaking", iterations) {
        var count = 0
        for scalar in corpus.unicodeScalars where scalar == "\n" { count += 1 }
        return count
      },
      measure("String.utf16", "what CoreText and the piece table index by", iterations) {
        var count = 0
        for unit in corpus.utf16 where unit == 0x0A { count += 1 }
        return count
      },
      measure("String.utf8", "native storage, still an iterator", iterations) {
        var count = 0
        for byte in corpus.utf8 where byte == 0x0A { count += 1 }
        return count
      },
      measure("utf8 contiguous buffer", "one bounds check, not one per byte", iterations) {
        var count = 0
        corpus.utf8.withContiguousStorageIfAvailable { buffer in
          for byte in buffer where byte == 0x0A { count += 1 }
        }
        return count
      },
      measure("memchr over utf8 buffer", "libc SIMD; the floor for byte search", iterations) {
        var count = 0
        corpus.utf8.withContiguousStorageIfAvailable { buffer in
          count = countNewlines(in: buffer)
        }
        return count
      },
      measure("EditorCore.Document", "placeholder buffer — on the Character path", iterations) {
        Document(text: corpus).lineCount - 1
      },
    ].map { result in
      precondition(result.observed == expected, "\(result.value.variant) counted \(result.observed)")
      return result.value
    }
  }

  private static func measure(
    _ variant: String,
    _ note: String,
    _ iterations: Int,
    _ body: @escaping () -> Int
  ) -> (value: Result, observed: Int) {
    var observed = 0
    let samples = Bench.measure(iterations: iterations) { observed = body() }
    return (Result(variant: variant, note: note, samples: samples), observed)
  }

  private static func countNewlines(in buffer: UnsafeBufferPointer<UInt8>) -> Int {
    guard let base = buffer.baseAddress else { return 0 }

    var cursor = UnsafeRawPointer(base)
    var remaining = buffer.count
    var count = 0
    while remaining > 0, let hit = memchr(cursor, 0x0A, remaining) {
      count += 1
      let consumed = UnsafeRawPointer(hit) - cursor + 1
      cursor = UnsafeRawPointer(hit) + 1
      remaining -= consumed
    }
    return count
  }
}
