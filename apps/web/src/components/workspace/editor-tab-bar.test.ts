import { describe, expect, it } from "bun:test"

import { editorTabCloseTargetPaths } from "@/components/workspace/editor-tab-close-targets"
import {
  chromeVisualTabsReducer,
  syncChromeVisualTabs,
  type ChromeVisualTabsState,
} from "@/components/workspace/use-chrome-visual-tabs"
import {
  editorTabDragReducer,
  editorTabInsertionEdge,
} from "@/components/workspace/use-editor-tab-drag"
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

describe("editorTabDragReducer", () => {
  it("starts a drag with the source tab as the initial target", () => {
    expect(
      editorTabDragReducer(null, {
        path: "src/b.ts",
        sourceIndex: 1,
        type: "start",
      })
    ).toEqual({
      path: "src/b.ts",
      sourceIndex: 1,
      targetIndex: 1,
    })
  })

  it("updates the drag target index and clears the drag", () => {
    const dragging = {
      path: "src/b.ts",
      sourceIndex: 1,
      targetIndex: 1,
    }

    expect(
      editorTabDragReducer(dragging, { targetIndex: 0, type: "target" })
    ).toEqual({
      path: "src/b.ts",
      sourceIndex: 1,
      targetIndex: 0,
    })
    expect(editorTabDragReducer(dragging, { type: "clear" })).toBeNull()
  })
})

describe("editorTabInsertionEdge", () => {
  it("marks the tab before the drop target", () => {
    const tabs = pathOnlyTabs()

    expect(
      editorTabInsertionEdge(tabs, tabs[0]!, {
        path: "src/b.ts",
        sourceIndex: 1,
        targetIndex: 0,
      })
    ).toBe("before")
  })

  it("marks the last tab when dropping after all targets", () => {
    const tabs = pathOnlyTabs()

    expect(
      editorTabInsertionEdge(tabs, tabs[2]!, {
        path: "src/b.ts",
        sourceIndex: 1,
        targetIndex: 2,
      })
    ).toBe("after")
  })
})

describe("chromeVisualTabsReducer", () => {
  it("keeps existing tabs present and opens newly added tabs", () => {
    const initialTabs = chromeTabs(["src/a.ts", "src/b.ts"])
    const nextTabs = chromeTabs(["src/a.ts", "src/c.ts"])
    const state = chromeVisualTabsState(initialTabs)

    const next = chromeVisualTabsReducer(state, {
      areTabsEqual: sameChromeTab,
      tabs: nextTabs,
      type: "sync-tabs",
    })

    expect(next.sourceTabs).toBe(nextTabs)
    expect(next.visualTabs.map((visualTab) => visualTab.phase)).toEqual([
      "present",
      "opening",
    ])
    expect(next.visualTabs.map((visualTab) => visualTab.tab.path)).toEqual([
      "src/a.ts",
      "src/c.ts",
    ])
  })

  it("finishes opening tabs on the matching animation frame", () => {
    const state = chromeVisualTabsState(chromeTabs(["src/a.ts"]))
    const synced = chromeVisualTabsReducer(state, {
      areTabsEqual: sameChromeTab,
      tabs: chromeTabs(["src/a.ts", "src/b.ts"]),
      type: "sync-tabs",
    })

    const next = chromeVisualTabsReducer(synced, {
      openingKey: "src/b.ts",
      type: "finish-opening",
    })

    expect(next.visualTabs.map((visualTab) => visualTab.phase)).toEqual([
      "present",
      "present",
    ])
  })

  it("reuses semantically equal tab models", () => {
    const initialTabs = chromeTabs(["src/a.ts"])
    const state = chromeVisualTabsState(initialTabs)
    const nextTabs = chromeTabs(["src/a.ts"])

    const visualTabs = syncChromeVisualTabs(
      state.visualTabs,
      nextTabs,
      sameChromeTab
    )

    expect(visualTabs[0]?.tab).toBe(initialTabs[0])
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

function pathOnlyTabs() {
  return [{ path: "src/a.ts" }, { path: "src/b.ts" }, { path: "src/c.ts" }]
}

function editorTabs() {
  return [
    { dirty: false, path: "src/a.ts" },
    { dirty: true, path: "src/b.ts" },
    { dirty: false, path: "src/c.ts" },
    { dirty: true, path: "src/d.ts" },
  ]
}

function chromeTabs(paths: readonly string[]) {
  return paths.map((path) => ({ path }))
}

function chromeVisualTabsState(
  tabs: ReturnType<typeof chromeTabs>
): ChromeVisualTabsState<{ path: string }> {
  return {
    sourceTabs: tabs,
    visualTabs: tabs.map((tab) => ({ phase: "present", tab })),
  }
}

function sameChromeTab(left: { path: string }, right: { path: string }) {
  return left.path === right.path
}
