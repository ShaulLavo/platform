/// Placeholder storage so the package builds, and EditorBench's deliberate
/// Character-path control (see docs/native-bench-harness.md §6.6 — it is 75x
/// off the floor). The real buffer is designed in docs/native-editor-core-design.md
/// — do not grow this, and do not "fix" the scan without moving the control.
public struct Document: Sendable {
  public private(set) var text: String
  public private(set) var lineStarts: [String.Index]

  public init(text: String) {
    self.text = text
    self.lineStarts = Self.computeLineStarts(of: text)
  }

  public var lineCount: Int { lineStarts.count }

  public mutating func replaceAll(with text: String) {
    self.text = text
    self.lineStarts = Self.computeLineStarts(of: text)
  }

  static func computeLineStarts(of text: String) -> [String.Index] {
    var starts = [text.startIndex]
    var index = text.startIndex
    while index < text.endIndex {
      if text[index] == "\n" {
        starts.append(text.index(after: index))
      }
      index = text.index(after: index)
    }
    return starts
  }
}
