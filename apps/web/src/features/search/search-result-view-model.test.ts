import { describe, expect, it } from "bun:test"
import type { WorkspaceSearchMatch } from "@workspace/contracts"

import type { WorkspaceSearchFileGroup } from "./search-buffer-state"
import {
  expandedSearchResultItems,
  searchResultItems,
} from "./search-result-items"
import {
  searchResultExcerptById,
  searchResultFileBlocks,
  searchResultOpenTargetForId,
  searchResultVirtualRows,
} from "./search-result-view-model"

describe("search result view model", () => {
  it("builds file blocks and excerpts with stable result ids", () => {
    const firstMatch = contentMatch({
      column: 14,
      endColumn: 20,
      line: 12,
      preview: "export const needle = true",
    })
    const secondMatch = contentMatch({
      column: 10,
      endColumn: 16,
      line: 128,
      preview: "return needle",
    })
    const group = fileGroup([firstMatch, secondMatch])
    const items = expandedSearchResultItems([group])
    const groupItem = items.find((item) => item.type === "group")
    const matchItems = items.filter((item) => item.type === "match")
    const blocks = searchResultFileBlocks([group], "needle")

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toEqual(
      expect.objectContaining({
        collapsed: false,
        id: groupItem?.id,
        languageId: "typescript",
        matchCount: 2,
        path: "/repo/src/app.ts",
        pathLabel: "src/app.ts",
      })
    )
    expect(blocks[0]?.excerpts.map((excerpt) => excerpt.id)).toEqual(
      matchItems.map((item) => item.id)
    )
  })

  it("builds excerpts from current previews with match ranges and source mappings", () => {
    const match = contentMatch({
      column: 14,
      endColumn: 20,
      line: 12,
      preview: "export const needle = true",
    })
    const blocks = searchResultFileBlocks([fileGroup([match])], "needle")
    const excerpt = blocks[0]?.excerpts[0]

    expect(excerpt).toEqual(
      expect.objectContaining({
        languageId: "typescript",
        path: match.path,
        sourceMatch: match,
        startLine: 12,
        text: "export const needle = true",
      })
    )
    expect(excerpt?.matchRanges).toEqual([{ end: 19, start: 13 }])
    expect(
      excerpt
        ? excerpt.text.slice(
            excerpt.matchRanges[0]?.start,
            excerpt.matchRanges[0]?.end
          )
        : null
    ).toBe("needle")
  })

  it("keeps collapsed group excerpts out of the virtual row model", () => {
    const firstMatch = contentMatch({
      column: 1,
      endColumn: 7,
      line: 4,
      preview: "needle",
    })
    const secondMatch = contentMatch({
      column: 8,
      endColumn: 14,
      line: 5,
      preview: "const needle = true",
    })
    const blocks = searchResultFileBlocks(
      [{ ...fileGroup([firstMatch, secondMatch]), collapsed: true }],
      "needle"
    )
    const rows = searchResultVirtualRows(blocks)

    expect(blocks[0]?.collapsed).toBe(true)
    expect(blocks[0]?.excerpts).toHaveLength(2)
    expect(rows).toEqual([{ file: blocks[0], type: "file" }])
  })

  it("maps virtual rows to expanded file headers and excerpts", () => {
    const match = contentMatch({
      column: 1,
      endColumn: 7,
      line: 4,
      preview: "needle",
    })
    const blocks = searchResultFileBlocks([fileGroup([match])], "needle")
    const rows = searchResultVirtualRows(blocks)

    expect(rows.map((row) => row.type)).toEqual(["file", "excerpt"])
    expect(rows[0]).toEqual({ file: blocks[0], type: "file" })
    expect(rows[1]).toEqual({
      excerpt: blocks[0]?.excerpts[0],
      fileId: blocks[0]?.id,
      type: "excerpt",
    })
  })

  it("maps file and excerpt ids back to open targets", () => {
    const match = contentMatch({
      column: 1,
      endColumn: 7,
      line: 4,
      preview: "needle",
    })
    const blocks = searchResultFileBlocks([fileGroup([match])], "needle")
    const block = blocks[0]
    const excerpt = block?.excerpts[0]

    expect(searchResultOpenTargetForId(blocks, block?.id ?? null)).toEqual({
      match: null,
      path: match.path,
    })
    expect(searchResultOpenTargetForId(blocks, excerpt?.id ?? null)).toEqual({
      match,
      path: match.path,
    })
    expect(searchResultExcerptById(blocks, excerpt?.id ?? null)).toBe(excerpt)
  })

  it("represents filename-only results as selectable file rows", () => {
    const match: WorkspaceSearchMatch = {
      kind: "name",
      path: "/repo/src/needle.ts",
      source: "disk",
      targetType: "file",
      type: "file",
    }
    const group: WorkspaceSearchFileGroup = {
      collapsed: false,
      count: 0,
      matches: [match],
      name: "needle.ts",
      path: match.path,
      pathLabel: "src/needle.ts",
    }
    const item = searchResultItems([group])[0]
    const blocks = searchResultFileBlocks([group], "needle")
    const rows = searchResultVirtualRows(blocks)

    expect(blocks).toEqual([
      expect.objectContaining({
        excerpts: [],
        id: item?.id,
        matchCount: 1,
        path: match.path,
        pathLabel: "src/needle.ts",
      }),
    ])
    expect(rows).toEqual([{ file: blocks[0], type: "file" }])
    expect(searchResultOpenTargetForId(blocks, item?.id ?? null)).toEqual({
      match: null,
      path: match.path,
    })
  })
})

function contentMatch(
  patch: Pick<WorkspaceSearchMatch, "column" | "endColumn" | "line" | "preview">
): WorkspaceSearchMatch {
  return {
    kind: "content",
    path: "/repo/src/app.ts",
    source: "disk",
    type: "file",
    ...patch,
  }
}

function fileGroup(
  matches: WorkspaceSearchMatch[],
  pathLabel = "src/app.ts"
): WorkspaceSearchFileGroup {
  const path = matches[0]?.path ?? "/repo/src/app.ts"

  return {
    collapsed: false,
    count: matches.length,
    matches,
    name: path.split("/").at(-1) ?? "app.ts",
    path,
    pathLabel,
  }
}
