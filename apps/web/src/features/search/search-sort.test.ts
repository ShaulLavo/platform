import { describe, expect, it } from "bun:test"

import { compareSearchFileNames, compareSearchPaths } from "./search-sort"

describe("search sort", () => {
  it("sorts file names with numeric chunks", () => {
    const names = ["file-10.ts", "file-2.ts", "file-1.ts"]

    expect(names.sort(compareSearchFileNames)).toEqual([
      "file-1.ts",
      "file-2.ts",
      "file-10.ts",
    ])
  })

  it("uses raw filename ordering as the case-insensitive tiebreaker", () => {
    const names = ["app.ts", "App.ts"]

    expect(names.sort(compareSearchFileNames)).toEqual(["App.ts", "app.ts"])
  })

  it("sorts path components case-insensitively before filenames", () => {
    const paths = [
      "repo/Src/file-10.ts",
      "repo/docs/file-1.ts",
      "repo/src/file-2.ts",
    ]

    expect(paths.sort(compareSearchPaths)).toEqual([
      "repo/docs/file-1.ts",
      "repo/src/file-2.ts",
      "repo/Src/file-10.ts",
    ])
  })

  it("keeps collator ordering for filenames outside the fast path", () => {
    const names = ["file.ts", "file_test.ts", "file.test.ts"]
    const collator = new Intl.Collator(undefined, {
      numeric: true,
      sensitivity: "base",
    })

    expect([...names].sort(compareSearchFileNames)).toEqual(
      [...names].sort((left, right) => collator.compare(left, right))
    )
  })
})
