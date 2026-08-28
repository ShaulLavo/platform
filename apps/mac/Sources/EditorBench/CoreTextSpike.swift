import AppKit
import CoreText
import Dispatch
import EditorCore
import Foundation
import ImageIO
import QuartzCore
import UniformTypeIdentifiers
import os

@MainActor
enum CoreTextSpike {
  private static let corpusBytes = 10 << 20
  private static let warmupKeystrokes = 10
  private static let gateMs = 2.0

  static func writeSnapshot(path: String) {
    let document = CoreTextSpikeDocument(corpus: Corpus.source(bytes: corpusBytes))
    let view = SpikeEditorView(document: document)
    let window = makeWindow(view: view)

    CATransaction.begin()
    CATransaction.setDisableActions(true)
    let pending = view.sendKeystroke(in: window, recordSignpost: false)
    view.invalidateEditedLine()
    view.displayHostedLayerIfNeeded()
    CATransaction.commit()
    pending.finish()
    view.writeHostedLayerPNG(to: URL(fileURLWithPath: path))
    view.revertEdit("x")
    window.orderOut(nil)
    print("CoreText spike snapshot: \(path)")
  }

  static func run(keystrokes: Int, skipCalibration: Bool) -> Bool {
    let document = CoreTextSpikeDocument(corpus: Corpus.source(bytes: corpusBytes))
    let view = SpikeEditorView(document: document)
    let window = makeWindow(view: view)
    let session = CoreTextSpikeSession(
      view: view,
      window: window,
      warmupKeystrokes: warmupKeystrokes,
      measuredKeystrokes: keystrokes
    )

    print("EditorBench — CoreText owner-drawn spike")
    print(
      "corpus: \(formatCount(document.originalByteCount)) bytes / "
        + "\(formatCount(document.originalUTF16Length)) UTF-16 units; "
        + "global insertion: \(formatCount(document.insertionOffset))"
    )
    print(
      "path: input → global edit overlay → source-backed line lookup and read → "
        + "CTTypesetter → CTLine → hosted CALayer draw → CATransaction completion"
    )
    if !skipCalibration {
      print("cpu calibration: \(formatMs(MachineProfile.cpuCalibration(), decimals: 2))")
    }

    DispatchQueue.main.async { session.start() }
    NSApplication.shared.run()
    withExtendedLifetime(document) {}
    window.orderOut(nil)
    precondition(session.timings.count == keystrokes, "spike did not record every requested sample")
    document.verifyCompletedRun(measuredKeystrokes: keystrokes)
    print(
      "proof: \(document.measuredSourceBackedReads) measured source reads; "
        + "source line \(NSStringFromRange(document.lastSourceLineRange)); "
        + "largest affected line \(document.maximumAffectedLineUTF16Length) UTF-16 units; "
        + "total source line units read \(formatCount(document.totalOriginalLineUnitsRead))"
    )
    let samples = Samples(session.timings.map(\.total))
    let calibrated = !skipCalibration
    let clockPassed = calibrated && samples.p95Ms < gateMs
    printResults(samples: samples, timings: session.timings, calibrated: calibrated, clockPassed: clockPassed)
    return clockPassed
  }

  private static func makeWindow(view: SpikeEditorView) -> NSWindow {
    let application = NSApplication.shared
    application.setActivationPolicy(.regular)
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
    application.activate(ignoringOtherApps: true)
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
      .init("input-to-transaction", alignRight: true),
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

private struct SpikeStyleRun {
  let range: NSRange
  let color: CGColor
}

private struct SpikeStyleRunStore {
  let baseRange: NSRange
  let color: CGColor

  func runs(lineLength: Int, insertion: NSRange?) -> [SpikeStyleRun] {
    var range = baseRange
    if let insertion, insertion.location <= range.location {
      range.location += insertion.length
    }
    guard range.location < lineLength else { return [] }

    range.length = min(range.length, lineLength - range.location)
    return [SpikeStyleRun(range: range, color: color)]
  }
}

@MainActor
private final class SpikeEditorView: NSView {
  private let document: CoreTextSpikeDocument
  private let font = CTFontCreateWithName("SFMono-Regular" as CFString, 13, nil)
  private let foreground = NSColor.textColor.cgColor
  private let hostedLayer = SpikeEditorLayer()
  private let selection = NSRange(location: 13, length: 10)
  private let styleRunStore = SpikeStyleRunStore(
    baseRange: NSRange(location: 6, length: 5),
    color: NSColor.systemPurple.cgColor
  )
  private var activePaint: PendingPaint?
  private var recordNextInput = false
  private var startedPaint: PendingPaint?

  init(document: CoreTextSpikeDocument) {
    self.document = document
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
    document.insert(text, measured: recordNextInput)
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
    document.restoreBaseline(text)
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

  func writeHostedLayerPNG(to url: URL) {
    let scale = hostedLayer.contentsScale
    let width = Int(hostedLayer.bounds.width * scale)
    let height = Int(hostedLayer.bounds.height * scale)
    guard let context = CGContext(
      data: nil,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: width * 4,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
      preconditionFailure("failed to create the visual snapshot context")
    }

    context.scaleBy(x: scale, y: scale)
    hostedLayer.render(in: context)
    guard let image = context.makeImage() else { preconditionFailure("failed to render the visual snapshot") }
    guard let destination = CGImageDestinationCreateWithURL(
      url as CFURL,
      UTType.png.identifier as CFString,
      1,
      nil
    ) else {
      preconditionFailure("failed to create the visual snapshot destination")
    }

    CGImageDestinationAddImage(destination, image, nil)
    precondition(CGImageDestinationFinalize(destination), "failed to write the visual snapshot")
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
    context.textMatrix = CGAffineTransform(scaleX: 1, y: -1)
    context.translateBy(x: 0, y: bounds.height)
    context.scaleBy(x: 1, y: -1)
    verifyUprightGlyphTransform(in: context)
    drawSelection(fragments: fragments, in: context)
    let insertedGlyphDrawn = drawGlyphs(fragments: fragments, dirtyRect: dirtyRect, in: context)
    context.restoreGState()
    activePaint?.markDraw(insertedGlyphDrawn: insertedGlyphDrawn)
    activePaint = nil
  }

  private func verifyUprightGlyphTransform(in context: CGContext) {
    let textMatrix = context.textMatrix
    let ctm = context.ctm
    let origin = CGPoint.zero.applying(textMatrix).applying(ctm)
    let glyphUp = CGPoint(x: 0, y: 1).applying(textMatrix).applying(ctm)
    precondition(glyphUp.y > origin.y, "CoreText glyph transform is vertically flipped")
  }

  private func makeAttributedLine() -> NSAttributedString {
    let text = document.visibleLine()
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

    for run in styleRunStore.runs(
      lineLength: attributed.length,
      insertion: document.lastInsertedLineRange
    ) {
      attributed.addAttribute(
        NSAttributedString.Key(kCTForegroundColorAttributeName as String),
        value: run.color,
        range: run.range
      )
    }
    return attributed
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
    guard let insertedRange = document.lastInsertedLineRange else { return false }
    guard document.insertedTextMatches("x") else { return false }
    guard fragment.viewBounds(for: insertedRange, in: bounds).intersects(dirtyRect) else { return false }

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

  func viewBounds(for range: NSRange, in viewBounds: NSRect) -> NSRect {
    let start = CTLineGetOffsetForStringIndex(line, range.location, nil)
    let end = CTLineGetOffsetForStringIndex(line, NSMaxRange(range), nil)
    let lineBounds = CTLineGetBoundsWithOptions(line, [.useGlyphPathBounds])
    return NSRect(
      x: 12 + min(start, end),
      y: viewBounds.height - baseline - lineBounds.maxY,
      width: max(1, abs(end - start)),
      height: lineBounds.height
    )
  }
}

private extension NSRange {
  var nonEmpty: NSRange? {
    length > 0 ? self : nil
  }
}
