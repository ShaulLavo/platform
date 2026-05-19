import { describe, expect, it } from "bun:test"

import { editorTabCloseTargetIds } from "@/components/workspace/editor-tab-close-targets"
import {
  chromeVisualTabsReducer,
  syncChromeVisualTabs,
  type ChromeVisualTabsState,
} from "@/components/workspace/use-chrome-visual-tabs"
import {
  EDITOR_TAB_DRAG_MIME,
  editorTabDragReducer,
  editorTabInsertionEdge,
  hasEditorTabDragPayload,
} from "@/components/workspace/use-editor-tab-drag"
import {
  editorTabDropIndex,
  type EditorTabDropTargetBounds,
} from "@/components/workspace/editor-tab-dnd"

describe("editorTabDropIndex", () => {
  it("inserts before the first tab midpoint", () => {
    expect(editorTabDropIndex(tabBounds(), 25, "tab-b")).toBe(0)
  })

  it("inserts between non-dragged tab midpoints", () => {
    expect(editorTabDropIndex(tabBounds(), 175, "tab-b")).toBe(1)
  })

  it("inserts at the end after the last midpoint", () => {
    expect(editorTabDropIndex(tabBounds(), 280, "tab-a")).toBe(2)
  })

  it("ignores the dragged tab when calculating the target index", () => {
    expect(editorTabDropIndex(tabBounds(), 125, "tab-b")).toBe(1)
  })

  it("returns zero when the dragged tab is the only target", () => {
    expect(
      editorTabDropIndex(
        [{ id: "tab-a", left: 0, path: "src/a.ts", right: 100 }],
        75,
        "tab-a"
      )
    ).toBe(0)
  })
})

describe("editorTabDragReducer", () => {
  it("starts a drag with the source tab as the initial target", () => {
    expect(
      editorTabDragReducer(null, {
        paneId: "pane-a",
        path: "src/b.ts",
        sourceIndex: 1,
        tabId: "tab-b",
        type: "start",
      })
    ).toEqual({
      paneId: "pane-a",
      path: "src/b.ts",
      sourceIndex: 1,
      tabId: "tab-b",
      targetIndex: 1,
    })
  })

  it("updates the drag target index and clears the drag", () => {
    const dragging = {
      paneId: "pane-a",
      path: "src/b.ts",
      sourceIndex: 1,
      tabId: "tab-b",
      targetIndex: 1,
    }

    expect(
      editorTabDragReducer(dragging, { targetIndex: 0, type: "target" })
    ).toEqual({
      paneId: "pane-a",
      path: "src/b.ts",
      sourceIndex: 1,
      tabId: "tab-b",
      targetIndex: 0,
    })
    expect(editorTabDragReducer(dragging, { type: "clear" })).toBeNull()
  })
})

describe("hasEditorTabDragPayload", () => {
  it("detects editor tab drags from the MIME type before drop data is readable", () => {
    expect(
      hasEditorTabDragPayload(dataTransferWithTypes([EDITOR_TAB_DRAG_MIME]))
    ).toBe(true)
  })

  it("ignores non-editor drags", () => {
    expect(hasEditorTabDragPayload(dataTransferWithTypes(["text/plain"]))).toBe(
      false
    )
  })
})

function dataTransferWithTypes(types: string[]): DataTransfer {
  return { types } as unknown as DataTransfer
}

describe("editorTabInsertionEdge", () => {
  it("marks the tab before the drop target", () => {
    const tabs = pathOnlyTabs()

    expect(
      editorTabInsertionEdge(tabs, tabs[0]!, {
        paneId: "pane-a",
        path: "src/b.ts",
        sourceIndex: 1,
        tabId: "tab-b",
        targetIndex: 0,
      })
    ).toBe("before")
  })

  it("marks the last tab when dropping after all targets", () => {
    const tabs = pathOnlyTabs()

    expect(
      editorTabInsertionEdge(tabs, tabs[2]!, {
        paneId: "pane-a",
        path: "src/b.ts",
        sourceIndex: 1,
        tabId: "tab-b",
        targetIndex: 2,
      })
    ).toBe("after")
  })

  it("does not mark the dragged tab's current slot", () => {
    const tabs = pathOnlyTabs()

    expect(
      editorTabInsertionEdge(tabs, tabs[2]!, {
        paneId: "pane-a",
        path: "src/b.ts",
        sourceIndex: 1,
        tabId: "tab-b",
        targetIndex: 1,
      })
    ).toBeNull()
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

describe("editorTabCloseTargetIds", () => {
  it("targets the clicked tab for close", () => {
    expect(editorTabCloseTargetIds(editorTabs(), "tab-b", "close")).toEqual([
      "tab-b",
    ])
  })

  it("targets every tab except the clicked tab for close others", () => {
    expect(
      editorTabCloseTargetIds(editorTabs(), "tab-b", "closeOthers")
    ).toEqual(["tab-a", "tab-c", "tab-d"])
  })

  it("targets tabs to the right of the clicked tab", () => {
    expect(
      editorTabCloseTargetIds(editorTabs(), "tab-b", "closeToRight")
    ).toEqual(["tab-c", "tab-d"])
  })

  it("targets only clean tabs for close saved", () => {
    expect(
      editorTabCloseTargetIds(editorTabs(), "tab-b", "closeSaved")
    ).toEqual(["tab-a", "tab-c"])
  })

  it("targets every tab for close all", () => {
    expect(editorTabCloseTargetIds(editorTabs(), "tab-b", "closeAll")).toEqual([
      "tab-a",
      "tab-b",
      "tab-c",
      "tab-d",
    ])
  })

  it("returns no targets when the tab is missing", () => {
    expect(
      editorTabCloseTargetIds(editorTabs(), "missing-tab", "closeAll")
    ).toEqual([])
  })
})

function tabBounds(): readonly EditorTabDropTargetBounds[] {
  return [
    { id: "tab-a", left: 0, path: "src/a.ts", right: 100 },
    { id: "tab-b", left: 100, path: "src/b.ts", right: 200 },
    { id: "tab-c", left: 200, path: "src/c.ts", right: 300 },
  ]
}

function pathOnlyTabs() {
  return [
    { id: "tab-a", path: "src/a.ts" },
    { id: "tab-b", path: "src/b.ts" },
    { id: "tab-c", path: "src/c.ts" },
  ]
}

function editorTabs() {
  return [
    { dirty: false, id: "tab-a", path: "src/a.ts" },
    { dirty: true, id: "tab-b", path: "src/b.ts" },
    { dirty: false, id: "tab-c", path: "src/c.ts" },
    { dirty: true, id: "tab-d", path: "src/d.ts" },
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
