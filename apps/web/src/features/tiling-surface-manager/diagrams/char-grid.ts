// Edge bitmask for a single cell. Box segments are accumulated as edges so that
// touching borders merge into the correct T- and cross-junction glyphs.
const UP = 1
const RIGHT = 2
const DOWN = 4
const LEFT = 8

const EDGE_GLYPHS = [
  ' ', // 0
  '│', // UP
  '─', // RIGHT
  '└', // UP|RIGHT
  '│', // DOWN
  '│', // UP|DOWN
  '┌', // RIGHT|DOWN
  '├', // UP|RIGHT|DOWN
  '─', // LEFT
  '┘', // UP|LEFT
  '─', // RIGHT|LEFT
  '┴', // UP|RIGHT|LEFT
  '┐', // DOWN|LEFT
  '┤', // UP|DOWN|LEFT
  '┬', // RIGHT|DOWN|LEFT
  '┼', // UP|RIGHT|DOWN|LEFT
] as const

// A fixed-size character canvas. Box borders are stored as edge masks; text is
// stored as literal overrides that win over any border underneath.
export class CharGrid {
  private readonly edges: number[]
  private readonly chars: (string | null)[]

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    this.edges = Array.from({ length: cols * rows }, () => 0)
    this.chars = Array.from({ length: cols * rows }, () => null)
  }

  box(x: number, y: number, width: number, height: number) {
    if (width < 2 || height < 2) return

    const right = x + width - 1
    const bottom = y + height - 1
    this.hSegment(x, right, y)
    this.hSegment(x, right, bottom)
    this.vSegment(y, bottom, x)
    this.vSegment(y, bottom, right)
  }

  text(x: number, y: number, value: string) {
    for (let offset = 0; offset < value.length; offset += 1) {
      this.setChar(x + offset, y, value[offset] ?? '')
    }
  }

  toString(): string {
    const lines: string[] = []
    for (let y = 0; y < this.rows; y += 1) {
      lines.push(this.renderRow(y).replace(/\s+$/, ''))
    }

    return lines.join('\n')
  }

  private renderRow(y: number): string {
    let row = ''
    for (let x = 0; x < this.cols; x += 1) {
      row += this.renderCell(x, y)
    }

    return row
  }

  private renderCell(x: number, y: number): string {
    const literal = this.chars[this.index(x, y)]
    if (literal) return literal

    return EDGE_GLYPHS[this.edges[this.index(x, y)] ?? 0] ?? ' '
  }

  private hSegment(x1: number, x2: number, y: number) {
    for (let x = x1; x < x2; x += 1) {
      this.addEdges(x, y, RIGHT)
      this.addEdges(x + 1, y, LEFT)
    }
  }

  private vSegment(y1: number, y2: number, x: number) {
    for (let y = y1; y < y2; y += 1) {
      this.addEdges(x, y, DOWN)
      this.addEdges(x, y + 1, UP)
    }
  }

  private addEdges(x: number, y: number, mask: number) {
    if (!this.inBounds(x, y)) return

    this.edges[this.index(x, y)] |= mask
  }

  private setChar(x: number, y: number, value: string) {
    if (!this.inBounds(x, y)) return
    if (value === '') return

    this.chars[this.index(x, y)] = value
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows
  }

  private index(x: number, y: number): number {
    return y * this.cols + x
  }
}
