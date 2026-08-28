import Foundation

@MainActor
final class CoreTextSpikeDocument {
  let originalByteCount: Int
  let originalUTF16Length: Int
  let insertionOffset: Int

  private let original: NSString
  private let baselineDigest: UInt64
  private var state = State.clean
  private var nextInsertionID = UInt64.zero
  private var sourceReadSerial = UInt64.zero
  private var lastReadText: NSString?
  private(set) var lastInsertedLineRange: NSRange?
  private(set) var measuredSourceBackedReads = 0
  private(set) var totalOriginalLineUnitsRead = 0
  private(set) var maximumAffectedLineUTF16Length = 0
  private(set) var lastSourceLineRange = NSRange(location: NSNotFound, length: 0)

  init(corpus: String) {
    let original = corpus as NSString
    var insertionOffset = original.length / 2
    if original.character(at: insertionOffset) == 0x0A { insertionOffset -= 1 }

    originalByteCount = corpus.utf8.count
    originalUTF16Length = original.length
    self.insertionOffset = insertionOffset
    self.original = original
    baselineDigest = Self.digest(corpus)

    precondition(originalByteCount >= 10 << 20, "spike corpus is smaller than 10 MiB")
    precondition(originalUTF16Length >= 10 << 20, "spike UTF-16 storage is smaller than 10 MiB")
    precondition(originalByteCount == originalUTF16Length, "spike corpus must remain ASCII")
    precondition(originalByteCount == ExpectedCorpus.byteCount, "spike corpus byte count changed")
    precondition(originalUTF16Length == ExpectedCorpus.utf16Length, "spike corpus UTF-16 length changed")
    precondition(insertionOffset == ExpectedCorpus.insertionOffset, "spike insertion offset changed")
    precondition(baselineDigest == ExpectedCorpus.digest, "spike corpus contents changed")
    precondition(insertionOffset > original.length / 3, "spike insertion is not deep in the document")
    precondition(insertionOffset < original.length * 2 / 3, "spike insertion is not deep in the document")
  }

  func insert(_ text: String, measured: Bool) {
    guard case .clean = state else {
      preconditionFailure("spike supports one active insertion")
    }

    let inserted = text as NSString
    precondition(inserted.length > 0, "spike insertion is empty")
    precondition(inserted.rangeOfCharacter(from: .newlines).location == NSNotFound, "spike edit crossed a line")

    nextInsertionID += 1
    state = .inserted(
      ActiveInsertion(
        id: nextInsertionID,
        text: inserted,
        measured: measured,
        sourceReadSerialAtApply: sourceReadSerial
      )
    )
    lastInsertedLineRange = nil
    lastReadText = nil
    precondition(currentDocumentLength == originalUTF16Length + inserted.length, "edit did not change document length")
  }

  func restoreBaseline(_ text: String) {
    guard case let .inserted(active) = state else {
      preconditionFailure("spike cleanup has no active insertion")
    }
    precondition(active.text.isEqual(to: text), "cleanup text does not match the measured insertion")
    precondition(sourceReadSerial == active.sourceReadSerialAtApply + 1, "edit was not read exactly once")
    precondition(currentDocumentLength == originalUTF16Length + active.text.length, "edited length is wrong")

    state = .clean
    lastInsertedLineRange = nil
    lastReadText = nil
    precondition(currentDocumentLength == originalUTF16Length, "cleanup did not restore document length")
  }

  func visibleLine() -> String {
    guard case let .inserted(active) = state else {
      return readOriginalLine()
    }

    precondition(sourceReadSerial == active.sourceReadSerialAtApply, "edit was read more than once")
    let sourceRange = sourceContentRange()
    let insertedLocalRange = NSRange(
      location: insertionOffset - sourceRange.location,
      length: active.text.length
    )
    let text = materialize(sourceRange: sourceRange, inserting: active.text)
    sourceReadSerial += 1
    if active.measured { measuredSourceBackedReads += 1 }

    let evidence = ReadEvidence(
      insertionID: active.id,
      documentLength: currentDocumentLength,
      sourceRange: sourceRange,
      insertedLocalRange: insertedLocalRange,
      renderedLength: text.length
    )
    validate(evidence, active: active)
    record(evidence)
    lastInsertedLineRange = insertedLocalRange
    lastReadText = text
    return text as String
  }

  func insertedTextMatches(_ expected: String) -> Bool {
    guard let lastInsertedLineRange, let lastReadText else { return false }

    return lastReadText.substring(with: lastInsertedLineRange) == expected
  }

  func verifyCompletedRun(measuredKeystrokes: Int) {
    guard case .clean = state else {
      preconditionFailure("spike did not restore the baseline document")
    }
    precondition(measuredSourceBackedReads == measuredKeystrokes, "not every measured edit read the 10 MiB source")
    precondition(maximumAffectedLineUTF16Length > 0, "spike never materialized an affected line")
    precondition(maximumAffectedLineUTF16Length <= 4_096, "spike affected line exceeded the bounded-line limit")
    precondition(lastSourceLineRange.location != NSNotFound, "spike did not record source evidence")
    precondition(Self.digest(original as String) == baselineDigest, "10 MiB source changed during the run")
    benchSink ^= Int(truncatingIfNeeded: baselineDigest)
    benchSink ^= insertionOffset
    benchSink ^= measuredSourceBackedReads
    benchSink ^= lastSourceLineRange.location
  }

  private var currentDocumentLength: Int {
    guard case let .inserted(active) = state else { return originalUTF16Length }

    return originalUTF16Length + active.text.length
  }

  private func readOriginalLine() -> String {
    original.substring(with: sourceContentRange())
  }

  private func sourceContentRange() -> NSRange {
    let lineRange = original.lineRange(for: NSRange(location: insertionOffset, length: 0))
    var contentLength = lineRange.length
    if contentLength > 0, original.character(at: NSMaxRange(lineRange) - 1) == 0x0A {
      contentLength -= 1
    }
    if contentLength > 0, original.character(at: lineRange.location + contentLength - 1) == 0x0D {
      contentLength -= 1
    }
    return NSRange(location: lineRange.location, length: contentLength)
  }

  private func materialize(sourceRange: NSRange, inserting text: NSString) -> NSString {
    let prefixRange = NSRange(
      location: sourceRange.location,
      length: insertionOffset - sourceRange.location
    )
    let suffixRange = NSRange(
      location: insertionOffset,
      length: NSMaxRange(sourceRange) - insertionOffset
    )
    let result = NSMutableString(capacity: sourceRange.length + text.length)
    result.append(original.substring(with: prefixRange))
    result.append(text as String)
    result.append(original.substring(with: suffixRange))
    return NSString(string: result as String)
  }

  private func validate(_ evidence: ReadEvidence, active: ActiveInsertion) {
    precondition(evidence.insertionID == active.id, "line read used a stale insertion")
    precondition(evidence.documentLength == originalUTF16Length + active.text.length, "line read used the wrong revision")
    precondition(NSLocationInRange(insertionOffset, evidence.sourceRange), "source line missed the global edit")
    precondition(NSEqualRanges(evidence.sourceRange, ExpectedCorpus.sourceLineRange), "spike source line changed")
    precondition(NSMaxRange(evidence.sourceRange) <= original.length, "source line exceeded the document")
    precondition(
      evidence.insertedLocalRange.location == insertionOffset - evidence.sourceRange.location,
      "local insertion offset does not map to the global edit"
    )
    precondition(
      evidence.renderedLength == evidence.sourceRange.length + active.text.length,
      "rendered line length missed the edit"
    )
  }

  private func record(_ evidence: ReadEvidence) {
    lastSourceLineRange = evidence.sourceRange
    totalOriginalLineUnitsRead += evidence.sourceRange.length
    maximumAffectedLineUTF16Length = max(maximumAffectedLineUTF16Length, evidence.renderedLength)
  }

  private static func digest(_ text: String) -> UInt64 {
    var hash = UInt64(14_695_981_039_346_656_037)
    for codeUnit in text.utf16 {
      hash ^= UInt64(codeUnit)
      hash = hash &* 1_099_511_628_211
    }
    return hash
  }
}

private extension CoreTextSpikeDocument {
  enum ExpectedCorpus {
    static let byteCount = 10_485_771
    static let utf16Length = 10_485_771
    static let insertionOffset = 5_242_885
    static let sourceLineRange = NSRange(location: 5_242_880, length: 98)
    static let digest = UInt64(0xDD16_504F_8C6F_3BF5)
  }

  enum State {
    case clean
    case inserted(ActiveInsertion)
  }

  struct ActiveInsertion {
    let id: UInt64
    let text: NSString
    let measured: Bool
    let sourceReadSerialAtApply: UInt64
  }

  struct ReadEvidence {
    let insertionID: UInt64
    let documentLength: Int
    let sourceRange: NSRange
    let insertedLocalRange: NSRange
    let renderedLength: Int
  }
}
