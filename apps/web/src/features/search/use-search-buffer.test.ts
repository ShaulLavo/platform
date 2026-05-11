import { describe, expect, it } from "bun:test"

import { workspaceSearchQuery } from "./use-search-buffer"

describe("workspace search buffer query", () => {
  it("uses content-only workspace search by default", () => {
    expect(workspaceSearchQuery("repo", "needle")).toMatchObject({
      entryType: "file",
      includeContent: true,
      includeNames: false,
      matchMode: "literal",
      path: "repo",
      query: "needle",
    })
  })
})
