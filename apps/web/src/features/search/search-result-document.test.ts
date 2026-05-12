import { describe, expect, it } from "bun:test"
import type { WorkspaceSearchMatch } from "@workspace/contracts"

import type { WorkspaceSearchFileGroup } from "./search-buffer-state"
import {
  searchResultDocument,
  searchResultDocumentItemIdAtRow,
  searchResultDocumentSelection,
  searchResultDocumentTargetAtRow,
} from "./search-result-document"

describe("search result editor document", () => {
  it("renders file headers, match lines, highlights, and source mappings", () => {
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
    const document = searchResultDocument(
      [fileGroup([firstMatch, secondMatch])],
      "needle"
    )

    expect(document.text).toBe(
      [
        "src/app.ts (2 matches)",
        " 12: export const needle = true",
        "128: return needle",
      ].join("\n")
    )
    expect(document.highlights).toHaveLength(2)
    expect(
      document.text.slice(
        document.highlights[0].start,
        document.highlights[0].end
      )
    ).toBe("needle")

    const matchLine = document.lines.find(
      (line) => line.type === "match" && line.match === firstMatch
    )
    if (!matchLine || matchLine.type !== "match") {
      throw new Error("Expected a generated match line")
    }

    expect(searchResultDocumentSelection(document, matchLine.itemId)).toEqual(
      matchLine.matchRange
    )
    expect(searchResultDocumentTargetAtRow(document, matchLine.row)).toEqual({
      match: firstMatch,
      path: firstMatch.path,
    })
    expect(searchResultDocumentItemIdAtRow(document, matchLine.row)).toBe(
      matchLine.itemId
    )
  })

  it("maps header lines to file open targets", () => {
    const match = contentMatch({
      column: 1,
      endColumn: 7,
      line: 4,
      preview: "needle",
    })
    const document = searchResultDocument([fileGroup([match])], "needle")
    const header = document.lines[0]
    if (!header || header.type !== "header") {
      throw new Error("Expected a generated header line")
    }

    expect(searchResultDocumentTargetAtRow(document, header.row)).toEqual({
      match: null,
      path: match.path,
    })
    expect(searchResultDocumentSelection(document, header.itemId)).toEqual({
      end: header.end,
      start: header.start,
    })
  })

  it("renders expanded matches even when the tree group is collapsed", () => {
    const match = contentMatch({
      column: 1,
      endColumn: 7,
      line: 4,
      preview: "needle",
    })
    const document = searchResultDocument(
      [{ ...fileGroup([match]), collapsed: true }],
      "needle"
    )

    expect(document.text).toContain("4: needle")
    expect(document.lines.some((line) => line.type === "match")).toBe(true)
  })

  it("does not insert blank spacer rows between file groups", () => {
    const firstMatch = contentMatch({
      column: 1,
      endColumn: 7,
      line: 4,
      preview: "needle",
    })
    const secondMatch = {
      ...contentMatch({
        column: 8,
        endColumn: 14,
        line: 8,
        preview: "const needle = true",
      }),
      path: "/repo/src/other.ts",
    }
    const document = searchResultDocument(
      [fileGroup([firstMatch]), fileGroup([secondMatch], "src/other.ts")],
      "needle"
    )

    expect(document.text).toBe(
      [
        "src/app.ts (1 match)",
        "4: needle",
        "src/other.ts (1 match)",
        "8: const needle = true",
      ].join("\n")
    )
    expect(document.lines).toHaveLength(4)
  })

  it("renders filename-only results as selectable document rows", () => {
    const match: WorkspaceSearchMatch = {
      kind: "name",
      path: "/repo/src/needle.ts",
      source: "disk",
      targetType: "file",
      type: "file",
    }
    const document = searchResultDocument(
      [
        {
          collapsed: false,
          count: 0,
          matches: [match],
          name: "needle.ts",
          path: match.path,
          pathLabel: "src/needle.ts",
        },
      ],
      "needle"
    )
    const line = document.lines[0]
    if (!line || line.type !== "match") {
      throw new Error("Expected a generated name-match line")
    }

    expect(document.text).toBe("name: /repo/src/needle.ts")
    expect(searchResultDocumentTargetAtRow(document, line.row)).toEqual({
      match,
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
