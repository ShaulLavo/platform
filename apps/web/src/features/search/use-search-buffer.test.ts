import { describe, expect, it } from "bun:test"

import { workspaceSearchQuery } from "./use-search-buffer"

describe("workspace search buffer query", () => {
  it("uses content-only workspace search by default", () => {
    expect(workspaceSearchQuery("repo", "needle")).toMatchObject({
      caseSensitive: false,
      entryType: "file",
      excludeGlobs: [],
      includeContent: true,
      includeGlobs: [],
      includeNames: false,
      matchMode: "literal",
      path: "repo",
      query: "needle",
      wholeWord: false,
    })
  })

  it("builds workspace search queries with mode and glob options", () => {
    expect(
      workspaceSearchQuery("repo", "needle", {
        caseSensitive: true,
        excludeGlobText: "*.test.ts",
        filtersVisible: true,
        includeGlobText: "src/**/*.ts, tests/{unit,integration}/**/*.ts",
        matchMode: "regex",
        wholeWord: true,
      })
    ).toMatchObject({
      caseSensitive: true,
      excludeGlobs: ["*.test.ts"],
      includeGlobs: ["src/**/*.ts", "tests/{unit,integration}/**/*.ts"],
      matchMode: "regex",
      wholeWord: true,
    })
  })

  it("ignores glob field text while filters are hidden", () => {
    expect(
      workspaceSearchQuery("repo", "needle", {
        excludeGlobText: "*.test.ts",
        filtersVisible: false,
        includeGlobText: "src/**/*.ts",
      })
    ).toMatchObject({
      excludeGlobs: [],
      includeGlobs: [],
    })
  })
})
