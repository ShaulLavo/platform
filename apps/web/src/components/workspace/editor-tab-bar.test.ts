import { describe, expect, it } from "bun:test"

import { editorTabCloseTargetPaths } from "@/components/workspace/editor-tab-bar"
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

describe("editorTabCloseTargetPaths", () => {
  it("targets the clicked tab for close", () => {
    expect(
      editorTabCloseTargetPaths(editorTabs(), "src/b.ts", "close")
    ).toEqual(["src/b.ts"])
  })

  it("targets every tab except the clicked tab for close others", () => {
    expect(
      editorTabCloseTargetPaths(editorTabs(), "src/b.ts", "closeOthers")
    ).toEqual(["src/a.ts", "src/c.ts", "src/d.ts"])
  })

  it("targets tabs to the right of the clicked tab", () => {
    expect(
      editorTabCloseTargetPaths(editorTabs(), "src/b.ts", "closeToRight")
    ).toEqual(["src/c.ts", "src/d.ts"])
  })

  it("targets only clean tabs for close saved", () => {
    expect(
      editorTabCloseTargetPaths(editorTabs(), "src/b.ts", "closeSaved")
    ).toEqual(["src/a.ts", "src/c.ts"])
  })

  it("targets every tab for close all", () => {
    expect(
      editorTabCloseTargetPaths(editorTabs(), "src/b.ts", "closeAll")
    ).toEqual(["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"])
  })

  it("returns no targets when the tab is missing", () => {
    expect(
      editorTabCloseTargetPaths(editorTabs(), "src/missing.ts", "closeAll")
    ).toEqual([])
  })
})

function tabBounds(): readonly EditorTabDropTargetBounds[] {
  return [
    { left: 0, path: "src/a.ts", right: 100 },
    { left: 100, path: "src/b.ts", right: 200 },
    { left: 200, path: "src/c.ts", right: 300 },
  ]
}

function editorTabs() {
  return [
    { dirty: false, path: "src/a.ts" },
    { dirty: true, path: "src/b.ts" },
    { dirty: false, path: "src/c.ts" },
    { dirty: true, path: "src/d.ts" },
  ]
}
