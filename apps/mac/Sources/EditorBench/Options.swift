import Foundation

struct Options {
  enum Parsed {
    case options(Options)
    case message(String, exitCode: Int32)
  }

  enum Section: String, CaseIterable {
    case machine
    case baselines
    case scan
  }

  var sections: Set<Section> = Set(Section.allCases)
  var scanCorpusMiB = 9
  var scanIterations = 7
  var signpostKeystrokes: Int?
  var coreTextSpikeKeystrokes: Int?
  var skipCalibration = false

  static func parse(_ arguments: [String]) -> Parsed {
    var options = Options()
    var explicitSections: Set<Section> = []

    for argument in arguments {
      let (name, value) = split(argument)
      switch name {
      case "--section":
        guard let section = value.flatMap(Section.init(rawValue:)) else {
          return .message("--section needs one of \(Section.allCases.map(\.rawValue).joined(separator: ", "))", exitCode: 2)
        }
        explicitSections.insert(section)
      case "--scan-mib":
        guard let parsed = value.flatMap(Int.init), parsed > 0 else {
          return .message("--scan-mib needs a positive integer", exitCode: 2)
        }
        options.scanCorpusMiB = parsed
      case "--scan-iterations":
        guard let parsed = value.flatMap(Int.init), parsed > 0 else {
          return .message("--scan-iterations needs a positive integer", exitCode: 2)
        }
        options.scanIterations = parsed
      case "--signpost-demo":
        options.signpostKeystrokes = value.flatMap(Int.init) ?? 200
      case "--coretext-spike":
        guard let parsed = optionalPositiveInteger(value, default: 100) else {
          return .message("--coretext-spike needs a positive integer", exitCode: 2)
        }
        options.coreTextSpikeKeystrokes = parsed
      case "--no-calibration":
        options.skipCalibration = true
      case "--help", "-h":
        return .message(usage, exitCode: 0)
      default:
        return .message("unknown option \(argument)\n\n\(usage)", exitCode: 2)
      }
    }

    if !explicitSections.isEmpty { options.sections = explicitSections }
    return .options(options)
  }

  private static func optionalPositiveInteger(_ value: String?, default defaultValue: Int) -> Int? {
    guard value != nil else { return defaultValue }

    guard let parsed = value.flatMap(Int.init), parsed > 0 else { return nil }

    return parsed
  }

  private static func split(_ argument: String) -> (String, String?) {
    guard let separator = argument.firstIndex(of: "=") else { return (argument, nil) }

    return (String(argument[..<separator]), String(argument[argument.index(after: separator)...]))
  }

  static let usage = """
    EditorBench — the measurement instrument that gates native editor work.

      swift run -c release EditorBench [options]

      --section=machine|baselines|scan   run one section (repeatable; default all)
      --scan-mib=N                       string-scan corpus size (default 9)
      --scan-iterations=N                string-scan iterations (default 7)
      --no-calibration                   skip the CPU calibration loop (~1s)
      --signpost-demo[=N]                emit N synthetic keystroke signposts and exit
      --coretext-spike[=N]               run N painted line edits with a retained 10 MiB source

    Methodology, provenance and the xctrace recipe: docs/native-bench-harness.md
    """
}
