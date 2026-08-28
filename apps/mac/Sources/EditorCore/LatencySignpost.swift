import os

/// Keystroke-to-photon instrument. The editor surface emits these intervals;
/// the numbers come back out of an Instruments trace via
/// `.claude/skills/swiftui-expert-skill/scripts/analyze_trace.py --list-signposts`.
/// Stage names and the subsystem/category are a contract with that script's
/// filters — see docs/native-bench-harness.md before renaming any of them.
public enum EditorSignpost {
  public static let subsystem = "dev.platform.editor"
  public static let category = "Latency"

  public static let signposter = OSSignposter(subsystem: subsystem, category: category)

  /// Input receipt to the frame that carries the edit. The interval every
  /// other stage nests inside.
  public static let keystroke: StaticString = "Keystroke"
  /// Buffer mutation only — no layout, no paint.
  public static let applyEdit: StaticString = "ApplyEdit"
  /// Typesetting the fragments the edit invalidated.
  public static let layout: StaticString = "Layout"
  /// Glyph drawing for the invalidated fragments.
  public static let draw: StaticString = "Draw"
  /// Frame handed to the compositor. Photon time is this plus the display
  /// pipeline, which only the trace's Animation Hitches lane can see.
  public static let commit: StaticString = "Commit"
}

/// One keystroke's nested intervals. Held by the editor surface from the input
/// event until the `CATransaction` completion handler closes it.
public struct KeystrokeTrace: ~Copyable {
  private let id: OSSignpostID
  private let state: OSSignpostIntervalState

  public init() {
    id = EditorSignpost.signposter.makeSignpostID()
    state = EditorSignpost.signposter.beginInterval(EditorSignpost.keystroke, id: id)
  }

  /// Marks a stage boundary inside the keystroke. Cheap enough for the hot
  /// path: disabled signposts cost an atomic load and a branch.
  public func mark(_ stage: StaticString) {
    EditorSignpost.signposter.emitEvent(stage, id: id)
  }

  public consuming func end() {
    EditorSignpost.signposter.endInterval(EditorSignpost.keystroke, state)
  }
}
