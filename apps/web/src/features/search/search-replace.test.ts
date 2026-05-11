import { describe, expect, it } from "bun:test"
import type {
  WorkspaceSearchMatch,
  WorkspaceSearchQuery,
} from "@workspace/contracts"

import {
  applyWorkspaceSearchReplaceEdits,
  workspaceSearchReplacePlan,
} from "./search-replace"

const QUERY: WorkspaceSearchQuery = {
  includeContent: true,
  limit: 20,
  path: "repo",
  query: "needle",
}

describe("workspace search replacement planner", () => {
  it("plans literal replacements for validated content ranges", () => {
    const plan = workspaceSearchReplacePlan({
      matches: [match({ column: 7, endColumn: 13 })],
      query: QUERY,
      replaceText: "pin",
      text: "const needle = true",
    })

    expect(plan).toEqual({
      appliedCount: 1,
      edits: [{ from: 6, text: "pin", to: 12 }],
      skippedCount: 0,
    })
    expect(
      applyWorkspaceSearchReplaceEdits("const needle = true", plan.edits)
    ).toBe("const pin = true")
  })

  it("respects case-sensitive and whole-word validation", () => {
    const plan = workspaceSearchReplacePlan({
      matches: [
        match({ column: 1, endColumn: 7 }),
        match({ column: 8, endColumn: 14 }),
        match({ column: 15, endColumn: 21 }),
      ],
      query: { ...QUERY, caseSensitive: true, wholeWord: true },
      replaceText: "pin",
      text: "needle Needle needlex",
    })

    expect(plan).toEqual({
      appliedCount: 1,
      edits: [{ from: 0, text: "pin", to: 6 }],
      skippedCount: 2,
    })
  })

  it("plans regex capture replacements", () => {
    const query = {
      ...QUERY,
      matchMode: "regex" as const,
      query: "use(\\w+)",
    }
    const plan = workspaceSearchReplacePlan({
      matches: [match({ column: 8, endColumn: 14 })],
      query,
      replaceText: "keep-$1",
      text: "needle useful unused",
    })

    expect(plan).toEqual({
      appliedCount: 1,
      edits: [{ from: 7, text: "keep-ful", to: 13 }],
      skippedCount: 0,
    })
  })

  it("supports replacement escapes for regex mode", () => {
    const plan = workspaceSearchReplacePlan({
      matches: [match({ column: 1, endColumn: 7 })],
      query: { ...QUERY, matchMode: "regex", query: "(needle)" },
      replaceText: "$1\\n\\t$1",
      text: "needle",
    })

    expect(applyWorkspaceSearchReplaceEdits("needle", plan.edits)).toBe(
      "needle\n\tneedle"
    )
  })

  it("merges adjacent edits while preserving replacement order", () => {
    const plan = workspaceSearchReplacePlan({
      matches: [
        match({ column: 1, endColumn: 7 }),
        match({ column: 7, endColumn: 13 }),
      ],
      query: QUERY,
      replaceText: "x",
      text: "needleneedle",
    })

    expect(plan.edits).toEqual([{ from: 0, text: "xx", to: 12 }])
    expect(applyWorkspaceSearchReplaceEdits("needleneedle", plan.edits)).toBe(
      "xx"
    )
  })

  it("keeps CRLF line offsets stable", () => {
    const plan = workspaceSearchReplacePlan({
      matches: [match({ column: 1, endColumn: 7, line: 2 })],
      query: QUERY,
      replaceText: "pin",
      text: "first\r\nneedle\r\nlast",
    })

    expect(plan.edits).toEqual([{ from: 7, text: "pin", to: 13 }])
    expect(
      applyWorkspaceSearchReplaceEdits("first\r\nneedle\r\nlast", plan.edits)
    ).toBe("first\r\npin\r\nlast")
  })

  it("handles Unicode code-point boundaries", () => {
    const plan = workspaceSearchReplacePlan({
      matches: [match({ column: 4, endColumn: 10 })],
      query: QUERY,
      replaceText: "pin",
      text: "😀 needle",
    })

    expect(plan.edits).toEqual([{ from: 3, text: "pin", to: 9 }])
    expect(applyWorkspaceSearchReplaceEdits("😀 needle", plan.edits)).toBe(
      "😀 pin"
    )
  })

  it("skips stale ranges instead of replacing nearby text", () => {
    const plan = workspaceSearchReplacePlan({
      matches: [match({ column: 1, endColumn: 7 })],
      query: QUERY,
      replaceText: "pin",
      text: "changed needle",
    })

    expect(plan).toEqual({
      appliedCount: 0,
      edits: [],
      skippedCount: 1,
    })
  })
})

function match({
  column,
  endColumn,
  line = 1,
}: {
  column: number
  endColumn: number
  line?: number
}): WorkspaceSearchMatch {
  return {
    column,
    endColumn,
    kind: "content",
    line,
    path: "repo/src/app.ts",
    source: "disk",
    type: "file",
  }
}
