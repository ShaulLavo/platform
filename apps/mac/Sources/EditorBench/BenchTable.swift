import Foundation

/// Fixed-width text table. Numeric columns are right-aligned so digits line up
/// the way `tabular-nums` does on the web side — a column of latencies is
/// unreadable when the decimal points wander.
struct BenchTable {
  struct Column {
    let title: String
    let alignRight: Bool

    init(_ title: String, alignRight: Bool = false) {
      self.title = title
      self.alignRight = alignRight
    }
  }

  let columns: [Column]
  private(set) var rows: [[String]] = []

  init(columns: [Column]) {
    self.columns = columns
  }

  mutating func append(_ row: [String]) {
    rows.append(row)
  }

  func render() -> String {
    let widths = columnWidths()
    var lines = [renderRow(columns.map(\.title), widths)]
    lines.append(widths.map { String(repeating: "─", count: $0) }.joined(separator: "  "))
    lines.append(contentsOf: rows.map { renderRow($0, widths) })
    return lines.joined(separator: "\n")
  }

  private func columnWidths() -> [Int] {
    columns.indices.map { index in
      let cells = rows.compactMap { $0.indices.contains(index) ? $0[index].count : nil }
      return max(columns[index].title.count, cells.max() ?? 0)
    }
  }

  private func renderRow(_ cells: [String], _ widths: [Int]) -> String {
    let padded = widths.indices.map { index -> String in
      let cell = cells.indices.contains(index) ? cells[index] : ""
      return pad(cell, to: widths[index], right: columns[index].alignRight)
    }
    return padded.joined(separator: "  ").trimmingTrailingSpaces()
  }

  private func pad(_ value: String, to width: Int, right: Bool) -> String {
    guard value.count < width else { return value }

    let filler = String(repeating: " ", count: width - value.count)
    return right ? filler + value : value + filler
  }
}

extension String {
  fileprivate func trimmingTrailingSpaces() -> String {
    guard let end = lastIndex(where: { $0 != " " }) else { return "" }

    return String(self[...end])
  }
}

/// Milliseconds, fixed decimals, always the same width for a given scale.
/// Sub-microsecond document ops need four places; frame times do not.
func formatMs(_ value: Double, decimals: Int = 4) -> String {
  String(format: "%.\(decimals)f ms", value)
}

func formatCount(_ value: Int) -> String {
  value.formatted(.number.grouping(.automatic))
}

/// Wraps prose to a width a terminal shows without folding. Tables set their
/// own width from their content; only the notes around them need this.
func wrapped(_ text: String, width: Int = 96) -> String {
  var lines: [String] = []
  var current = ""
  for word in text.split(separator: " ") {
    if current.isEmpty {
      current = String(word)
      continue
    }
    if current.count + 1 + word.count <= width {
      current += " " + word
      continue
    }
    lines.append(current)
    current = String(word)
  }
  if !current.isEmpty { lines.append(current) }
  return lines.joined(separator: "\n")
}
