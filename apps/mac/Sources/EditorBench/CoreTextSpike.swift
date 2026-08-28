import AppKit
import CoreText
import Dispatch
import EditorCore
import Foundation
import QuartzCore
import os

@MainActor
enum CoreTextSpike {
  private static let corpusBytes = 10 << 20
  private static let warmupKeystrokes = 10
  private static let gateMs = 2.0

  static func run(keystrokes: Int, skipCalibration: Bool) -> Bool {
    let corpus = Corpus.source(bytes: corpusBytes)
    let buffer = SpikeBuffer(corpus: corpus)
    let view = SpikeEditorView(buffer: buffer)
    let window = makeWindow(view: view)
    let session = CoreTextSpikeSession(
      view: view,
      window: window,
      warmupKeystrokes: warmupKeystrokes,
      measuredKeystrokes: keystrokes
    )

    print("EditorBench — CoreText owner-drawn spike")
    print("corpus: \(formatCount(corpus.utf8.count)) bytes retained; measured line: \(buffer.measuredLineUTF16Length) UTF-16 units")
    print("path: input → local line edit → CTTypesetter → CTLine → hosted CALayer draw → CATransaction commit")
    if !skipCalibration {
      print("cpu calibration: \(formatMs(MachineProfile.cpuCalibration(), decimals: 2))")
    }

    DispatchQueue.main.async { session.start() }
    NSApplication.shared.run()
    withExtendedLifetime(buffer.original) {}
    window.orderOut(nil)
    precondition(session.timings.count == keystrokes, "spike did not record every requested sample")
    let samples = Samples(session.timings.map(\.total))
    let calibrated = !skipCalibration
    let clockPassed = calibrated && samples.p95Ms < gateMs
    printResults(samples: samples, timings: session.timings, calibrated: calibrated, clockPassed: clockPassed)
    return clockPassed
  }

  private static func makeWindow(view: SpikeEditorView) -> NSWindow {
    let application = NSApplication.shared
    application.setActivationPolicy(.accessory)
    application.finishLaunching()

    let window = NSWindow(
      contentRect: NSRect(x: 40, y: 40, width: 1200, height: 800),
      styleMask: [.titled],
      backing: .buffered,
      defer: false
    )
    window.backgroundColor = .textBackgroundColor
    window.contentView = view
    window.isReleasedWhenClosed = false
    window.makeKeyAndOrderFront(nil)
    window.makeFirstResponder(view)
    window.displayIfNeeded()
    return window
  }

  private static func printResults(
    samples: Samples,
    timings: [SpikeTiming],
    calibrated: Bool,
    clockPassed: Bool
  ) {
    var table = BenchTable(columns: [
      .init("stat"),
      .init("keystroke-to-commit", alignRight: true),
    ])
    table.append(["p50", formatMs(samples.p50Ms, decimals: 3)])
    table.append(["p95", formatMs(samples.p95Ms, decimals: 3)])
    table.append(["max", formatMs(samples.maxMs, decimals: 3)])
    print(table.render())
    printStageResults(timings)
    let paintSamples = Samples(timings.map(\.paint))
    print("input-to-paint p95: \(formatMs(paintSamples.p95Ms, decimals: 3))")
    print("samples: \(timings.count), warmup: \(warmupKeystrokes), gate: p95 < \(formatMs(gateMs, decimals: 1))")
    guard calibrated else {
      print("verdict: diagnostic only (uncalibrated)")
      return
    }
    print(clockPassed ? "verdict: trace candidate (clock p95 passes)" : "verdict: FAIL")
  }

  private static func printStageResults(_ timings: [SpikeTiming]) {
    var table = BenchTable(columns: [
      .init("stage"),
      .init("p95", alignRight: true),
    ])
    table.append(["apply edit", formatMs(Samples(timings.map(\.applyEdit)).p95Ms, decimals: 3)])
    table.append(["layout", formatMs(Samples(timings.map(\.layout)).p95Ms, decimals: 3)])
    table.append(["draw", formatMs(Samples(timings.map(\.draw)).p95Ms, decimals: 3)])
    table.append(["commit wait", formatMs(Samples(timings.map(\.commitWait)).p95Ms, decimals: 3)])
    print(table.render())
  }
}

@MainActor
private final class CoreTextSpikeSession {
  private let view: SpikeEditorView
  private let window: NSWindow
  private let warmupKeystrokes: Int
  private let measuredKeystrokes: Int
  private var completedKeystrokes = 0
  private(set) var timings: [SpikeTiming] = []

  init(
    view: SpikeEditorView,
    window: NSWindow,
    warmupKeystrokes: Int,
    measuredKeystrokes: Int
  ) {
    self.view = view
    self.window = window
    self.warmupKeystrokes = warmupKeystrokes
    self.measuredKeystrokes = measuredKeystrokes
    timings.reserveCapacity(measuredKeystrokes)
  }

  func start() {
    runNextKeystroke()
  }

  private func runNextKeystroke() {
    let isWarmup = completedKeystrokes < warmupKeystrokes
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    let pending = view.sendKeystroke(in: window, recordSignpost: !isWarmup)
    CATransaction.setCompletionBlock { [self] in
      pending.finish()
      finishKeystroke(pending, isWarmup: isWarmup)
    }
    view.invalidateEditedLine()
    view.displayHostedLayerIfNeeded()
    CATransaction.commit()
  }

  private func finishKeystroke(_ pending: PendingPaint, isWarmup: Bool) {
    if !isWarmup, let timing = pending.timing {
      timings.append(timing)
    }
    completedKeystrokes += 1

    CATransaction.begin()
    CATransaction.setDisableActions(true)
    CATransaction.setCompletionBlock { [self] in
      finishCleanup()
    }
    view.revertEdit("x")
    view.invalidateEditedLine()
    view.displayHostedLayerIfNeeded()
    CATransaction.commit()
  }

  private func finishCleanup() {
    guard completedKeystrokes < warmupKeystrokes + measuredKeystrokes else {
      stopApplication()
      return
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.04) { [self] in
      runNextKeystroke()
    }
  }

  private func stopApplication() {
    let application = NSApplication.shared
    application.stop(nil)
    let event = NSEvent.otherEvent(
      with: .applicationDefined,
      location: .zero,
      modifierFlags: [],
      timestamp: ProcessInfo.processInfo.systemUptime,
      windowNumber: 0,
      context: nil,
      subtype: 0,
      data1: 0,
      data2: 0
    )
    guard let event else { return }

    application.postEvent(event, atStart: false)
  }
}

@MainActor
private final class PendingPaint {
  let started = Bench.clock.now
  private let signpostID: OSSignpostID?
  private let signpostState: OSSignpostIntervalState?
  private var previousMark: ContinuousClock.Instant
  private var applyEdit: Duration?
  private var layout: Duration?
  private var draw: Duration?
  private var insertedGlyphDrawn = false
  private(set) var timing: SpikeTiming?

  init(recordSignpost: Bool) {
    previousMark = started
    guard recordSignpost else {
      signpostID = nil
      signpostState = nil
      return
    }

    let id = EditorSignpost.signposter.makeSignpostID()
    signpostID = id
    signpostState = EditorSignpost.signposter.beginInterval(EditorSignpost.keystroke, id: id)
  }

  func markApplyEdit() {
    applyEdit = mark(EditorSignpost.applyEdit)
  }

  func markLayout() {
    layout = mark(EditorSignpost.layout)
  }

  func markDraw(insertedGlyphDrawn: Bool) {
    self.insertedGlyphDrawn = insertedGlyphDrawn
    draw = mark(EditorSignpost.draw)
  }

  func finish() {
    guard let applyEdit, let layout, let draw, insertedGlyphDrawn else {
      preconditionFailure("measured keystroke did not edit, layout, and draw its inserted glyph")
    }
    let commitWait = previousMark.duration(to: Bench.clock.now)
    timing = SpikeTiming(
      applyEdit: applyEdit,
      layout: layout,
      draw: draw,
      commitWait: commitWait,
      total: started.duration(to: Bench.clock.now)
    )
    guard let signpostID, let signpostState else { return }

    EditorSignpost.signposter.emitEvent(EditorSignpost.commit, id: signpostID)
    EditorSignpost.signposter.endInterval(EditorSignpost.keystroke, signpostState)
  }

  private func mark(_ stage: StaticString) -> Duration {
    let now = Bench.clock.now
    let duration = previousMark.duration(to: now)
    previousMark = now
    guard let signpostID else { return duration }

    EditorSignpost.signposter.emitEvent(stage, id: signpostID)
    return duration
  }
}

private struct SpikeTiming {
  let applyEdit: Duration
  let layout: Duration
  let draw: Duration
  let commitWait: Duration
  let total: Duration

  var paint: Duration {
    applyEdit + layout + draw
  }
}

@MainActor
private final class SpikeBuffer {
  let original: NSString
  private(set) var lastInsertedRange: NSRange?
  private let editedLine: NSMutableString
  private var insertionOffset: Int

  var measuredLineUTF16Length: Int { editedLine.length }

  init(corpus: String) {
    original = corpus as NSString
    let midpoint = original.length / 2
    let lineRange = original.lineRange(for: NSRange(location: midpoint, length: 0))
    editedLine = NSMutableString(string: original.substring(with: lineRange))
    insertionOffset = max(0, editedLine.length - 1)
  }

  func insert(_ text: String) {
    let length = (text as NSString).length
    lastInsertedRange = NSRange(location: insertionOffset, length: length)
    editedLine.insert(text, at: insertionOffset)
    insertionOffset += length
  }

  func remove(_ text: String) {
    let length = (text as NSString).length
    insertionOffset -= length
    editedLine.deleteCharacters(in: NSRange(location: insertionOffset, length: length))
    lastInsertedRange = nil
  }

  func visibleLine() -> String {
    editedLine as String
  }

  func insertedTextMatches(_ expected: String) -> Bool {
    guard let lastInsertedRange else { return false }

    return editedLine.substring(with: lastInsertedRange) == expected
  }
}

private struct SpikeStyleRun {
  let range: NSRange
  let color: CGColor
}

@MainActor
private final class SpikeEditorView: NSView {
  private let buffer: SpikeBuffer
  private let font = CTFontCreateWithName("SFMono-Regular" as CFString, 13, nil)
  private let foreground = NSColor.textColor.cgColor
  private let hostedLayer = SpikeEditorLayer()
  private let selection = NSRange(location: 6, length: 14)
  private var activePaint: PendingPaint?
  private var recordNextInput = false
  private var startedPaint: PendingPaint?

  init(buffer: SpikeBuffer) {
    self.buffer = buffer
    super.init(frame: NSRect(x: 0, y: 0, width: 1200, height: 800))

    hostedLayer.editor = self
    hostedLayer.isOpaque = true
    hostedLayer.contentsScale = NSScreen.main?.backingScaleFactor ?? 2
    layer = hostedLayer
    wantsLayer = true
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is unavailable")
  }

  override var acceptsFirstResponder: Bool { true }

  func sendKeystroke(in window: NSWindow, recordSignpost: Bool) -> PendingPaint {
    recordNextInput = recordSignpost
    startedPaint = nil
    let event = NSEvent.keyEvent(
      with: .keyDown,
      location: .zero,
      modifierFlags: [],
      timestamp: ProcessInfo.processInfo.systemUptime,
      windowNumber: window.windowNumber,
      context: nil,
      characters: "x",
      charactersIgnoringModifiers: "x",
      isARepeat: false,
      keyCode: 7
    )
    guard let event else { preconditionFailure("failed to create spike key event") }

    NSApplication.shared.sendEvent(event)
    guard let startedPaint else {
      preconditionFailure("spike key event did not reach the editor view")
    }
    return startedPaint
  }

  override func keyDown(with event: NSEvent) {
    let pending = PendingPaint(recordSignpost: recordNextInput)
    activePaint = pending
    startedPaint = pending
    interpretKeyEvents([event])
  }

  override func insertText(_ insertString: Any) {
    let text = text(from: insertString)
    buffer.insert(text)
    activePaint?.markApplyEdit()
  }

  private func text(from value: Any) -> String {
    if let attributed = value as? NSAttributedString { return attributed.string }
    if let string = value as? NSString { return string as String }
    if let string = value as? String { return string }

    preconditionFailure("unexpected insertText value")
  }

  func revertEdit(_ text: String) {
    activePaint = nil
    buffer.remove(text)
  }

  func invalidateEditedLine() {
    let height = min(bounds.height, 32)
    hostedLayer.setNeedsDisplay(
      NSRect(x: 0, y: bounds.maxY - height, width: bounds.width, height: height)
    )
  }

  func displayHostedLayerIfNeeded() {
    hostedLayer.displayIfNeeded()
    precondition(hostedLayer.contents != nil, "hosted editor layer did not produce drawable contents")
  }

  fileprivate func drawHostedLayer(in context: CGContext) {
    let dirtyRect = context.boundingBoxOfClipPath
    context.setFillColor(NSColor.textBackgroundColor.cgColor)
    context.fill(dirtyRect)
    drawVisibleLine(in: context, dirtyRect: dirtyRect)
  }

  private func drawVisibleLine(in context: CGContext, dirtyRect: NSRect) {
    let attributedLine = makeAttributedLine()
    let typesetter = CTTypesetterCreateWithAttributedString(attributedLine)
    let fragments = makeFragments(typesetter: typesetter, length: attributedLine.length)
    activePaint?.markLayout()

    context.saveGState()
    context.textMatrix = .identity
    context.translateBy(x: 0, y: bounds.height)
    context.scaleBy(x: 1, y: -1)
    drawSelection(fragments: fragments, in: context)
    let insertedGlyphDrawn = drawGlyphs(fragments: fragments, dirtyRect: dirtyRect, in: context)
    context.restoreGState()
    activePaint?.markDraw(insertedGlyphDrawn: insertedGlyphDrawn)
    activePaint = nil
  }

  private func makeAttributedLine() -> NSAttributedString {
    let text = buffer.visibleLine()
    let attributed = NSMutableAttributedString(string: text)
    let fullRange = NSRange(location: 0, length: attributed.length)
    attributed.addAttribute(
      NSAttributedString.Key(kCTFontAttributeName as String),
      value: font,
      range: fullRange
    )
    attributed.addAttribute(
      NSAttributedString.Key(kCTForegroundColorAttributeName as String),
      value: foreground,
      range: fullRange
    )

    for run in styleRuns(length: attributed.length) {
      attributed.addAttribute(
        NSAttributedString.Key(kCTForegroundColorAttributeName as String),
        value: run.color,
        range: run.range
      )
    }
    return attributed
  }

  private func styleRuns(length: Int) -> [SpikeStyleRun] {
    guard length > 5 else { return [] }

    return [
      SpikeStyleRun(
        range: NSRange(location: 0, length: min(5, length)),
        color: NSColor.systemPurple.cgColor
      )
    ]
  }

  private func makeFragments(typesetter: CTTypesetter, length: Int) -> [SpikeFragment] {
    var fragments: [SpikeFragment] = []
    var offset = 0
    var baseline = CGFloat(24)
    let width = max(1, bounds.width - 24)
    while offset < length {
      let suggested = CTTypesetterSuggestLineBreak(typesetter, offset, Double(width))
      let count = max(1, suggested)
      let range = CFRange(location: offset, length: min(count, length - offset))
      let line = CTTypesetterCreateLine(typesetter, range)
      fragments.append(SpikeFragment(line: line, range: range, baseline: baseline))
      baseline += 18
      offset += range.length
    }
    return fragments
  }

  private func drawSelection(fragments: [SpikeFragment], in context: CGContext) {
    context.setFillColor(NSColor.selectedTextBackgroundColor.cgColor)
    for fragment in fragments {
      guard let intersection = NSIntersectionRange(selection, fragment.nsRange).nonEmpty else { continue }

      let start = CTLineGetOffsetForStringIndex(fragment.line, intersection.location, nil)
      let end = CTLineGetOffsetForStringIndex(fragment.line, NSMaxRange(intersection), nil)
      context.fill(CGRect(x: 12 + start, y: fragment.baseline - 14, width: max(1, end - start), height: 18))
    }
  }

  private func drawGlyphs(
    fragments: [SpikeFragment],
    dirtyRect: NSRect,
    in context: CGContext
  ) -> Bool {
    var insertedGlyphDrawn = false
    for fragment in fragments {
      context.textPosition = CGPoint(x: 12, y: fragment.baseline)
      CTLineDraw(fragment.line, context)
      if fragmentDrawsInsertedGlyph(fragment, dirtyRect: dirtyRect) {
        insertedGlyphDrawn = true
      }
    }
    return insertedGlyphDrawn
  }

  private func fragmentDrawsInsertedGlyph(_ fragment: SpikeFragment, dirtyRect: NSRect) -> Bool {
    guard activePaint != nil else { return false }
    guard let insertedRange = buffer.lastInsertedRange else { return false }
    guard buffer.insertedTextMatches("x") else { return false }
    guard fragment.viewGlyphBounds(in: bounds).intersects(dirtyRect) else { return false }

    let runs = CTLineGetGlyphRuns(fragment.line) as NSArray
    for case let run as CTRun in runs {
      guard CTRunGetGlyphCount(run) > 0 else { continue }
      guard runContainsStringIndex(run, insertedRange.location) else { continue }

      return true
    }
    return false
  }

  private func runContainsStringIndex(_ run: CTRun, _ target: Int) -> Bool {
    let glyphCount = CTRunGetGlyphCount(run)
    if let indices = CTRunGetStringIndicesPtr(run) {
      for index in 0..<glyphCount where indices[index] == target { return true }
      return false
    }

    var indices = Array(repeating: CFIndex.zero, count: glyphCount)
    CTRunGetStringIndices(run, CFRange(location: 0, length: 0), &indices)
    return indices.contains(target)
  }

}

@MainActor
private final class SpikeEditorLayer: CALayer {
  nonisolated(unsafe) weak var editor: SpikeEditorView?

  nonisolated override func draw(in context: CGContext) {
    dispatchPrecondition(condition: .onQueue(.main))
    let editor = editor
    let context = MainThreadOnly(value: context)
    MainActor.assumeIsolated {
      editor?.drawHostedLayer(in: context.value)
    }
  }
}

private struct MainThreadOnly<Value>: @unchecked Sendable {
  let value: Value
}

private struct SpikeFragment {
  let line: CTLine
  let range: CFRange
  let baseline: CGFloat

  var nsRange: NSRange {
    NSRange(location: range.location, length: range.length)
  }

  func viewGlyphBounds(in viewBounds: NSRect) -> NSRect {
    let glyphBounds = CTLineGetBoundsWithOptions(line, [.useGlyphPathBounds])
    return NSRect(
      x: 12 + glyphBounds.minX,
      y: viewBounds.height - baseline - glyphBounds.maxY,
      width: glyphBounds.width,
      height: glyphBounds.height
    )
  }
}

private extension NSRange {
  var nonEmpty: NSRange? {
    length > 0 ? self : nil
  }
}
