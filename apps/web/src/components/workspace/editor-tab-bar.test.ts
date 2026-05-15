import { describe, expect, it } from "bun:test"

import {
  editorTabDropIndex,
  type EditorTabDropTargetBounds,
} from "@/components/workspace/editor-tab-dnd"

describe("editorTabDropIndex", () => {
  it("inserts before the first tab midpoint", () => {
    expect(editorTabDropIndex(tabBounds(), 25, "src/b.ts")).toBe(0)
  })

  it("inserts between non-dragged tab midpoints", () => {
    expect(editorTabDropIndex(tabBounds(), 175, "src/b.ts")).toBe(1)
  })

  it("inserts at the end after the last midpoint", () => {
    expect(editorTabDropIndex(tabBounds(), 280, "src/a.ts")).toBe(2)
  })

  it("ignores the dragged tab when calculating the target index", () => {
    expect(editorTabDropIndex(tabBounds(), 125, "src/b.ts")).toBe(1)
  })

  it("returns zero when the dragged tab is the only target", () => {
    expect(
      editorTabDropIndex(
        [{ left: 0, path: "src/a.ts", right: 100 }],
        75,
        "src/a.ts"
      )
    ).toBe(0)
  })
})

function tabBounds(): readonly EditorTabDropTargetBounds[] {
  return [
    { left: 0, path: "src/a.ts", right: 100 },
    { left: 100, path: "src/b.ts", right: 200 },
    { left: 200, path: "src/c.ts", right: 300 },
  ]
}
