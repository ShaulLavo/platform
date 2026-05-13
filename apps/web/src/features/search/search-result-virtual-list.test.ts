import { describe, expect, it } from "bun:test"

import {
  clampSearchResultVirtualListScrollTop,
  createSearchResultVirtualListMetrics,
  scrollTopForSearchResultVirtualListItem,
  visibleSearchResultVirtualListItems,
} from "./search-result-virtual-list"

describe("search result virtual list", () => {
  it("builds deterministic row offsets", () => {
    const metrics = createSearchResultVirtualListMetrics([
      { key: "file:a", size: 44 },
      { key: "results:a", size: 88 },
      { key: "file:b", size: 44 },
    ])

    expect(metrics.totalSize).toBe(176)
    expect(metrics.items).toEqual([
      { index: 0, key: "file:a", size: 44, start: 0 },
      { index: 1, key: "results:a", size: 88, start: 44 },
      { index: 2, key: "file:b", size: 44, start: 132 },
    ])
  })

  it("returns rows intersecting the viewport and overscan", () => {
    const metrics = createSearchResultVirtualListMetrics(
      Array.from({ length: 8 }, (_, index) => ({
        key: `row:${index}`,
        size: 20,
      }))
    )
    const visible = visibleSearchResultVirtualListItems(
      metrics,
      { height: 40, top: 60 },
      { overscan: 10 }
    )

    expect(visible.map((item) => item.key)).toEqual([
      "row:2",
      "row:3",
      "row:4",
      "row:5",
    ])
  })

  it("scrolls only when the target row is outside the viewport", () => {
    const metrics = createSearchResultVirtualListMetrics([
      { key: "row:0", size: 40 },
      { key: "row:1", size: 40 },
      { key: "row:2", size: 40 },
      { key: "row:3", size: 40 },
    ])

    expect(
      scrollTopForSearchResultVirtualListItem(
        metrics,
        1,
        { height: 80, top: 40 },
        { itemOffset: 6, totalPadding: 12 }
      )
    ).toBe(40)
    expect(
      scrollTopForSearchResultVirtualListItem(
        metrics,
        0,
        { height: 80, top: 40 },
        { itemOffset: 6, totalPadding: 12 }
      )
    ).toBe(0)
    expect(
      scrollTopForSearchResultVirtualListItem(
        metrics,
        3,
        { height: 80, top: 0 },
        { itemOffset: 6, totalPadding: 12 }
      )
    ).toBe(86)
  })

  it("clamps scroll offsets to the scrollable range", () => {
    expect(clampSearchResultVirtualListScrollTop(-20, 160, 80)).toBe(0)
    expect(clampSearchResultVirtualListScrollTop(120, 160, 80)).toBe(80)
  })
})
