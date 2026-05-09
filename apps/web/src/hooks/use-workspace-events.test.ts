import { describe, expect, it } from "bun:test"
import { affectedOpenFileRefreshPaths } from "@/lib/workspace-event-model"

describe("affectedOpenFileRefreshPaths", () => {
  const root = "repo"
  const openFiles = ["repo/a.ts", "repo/b.ts", "repo/src/c.ts"]

  it("refreshes the exact open file for changed events", () => {
    const paths = affectedOpenFileRefreshPaths(
      [{ type: "changed", path: "repo/a.ts" }],
      openFiles,
      new Set(),
      root
    )

    expect(paths).toEqual(["repo/a.ts"])
  })

  it("does not refresh sibling tabs for ordinary non-open changes", () => {
    const paths = affectedOpenFileRefreshPaths(
      [{ type: "changed", path: "repo/package.json" }],
      openFiles,
      new Set(),
      root
    )

    expect(paths).toEqual([])
  })

  it("uses directory fallback for temporary save paths", () => {
    const paths = affectedOpenFileRefreshPaths(
      [{ type: "changed", path: "repo/.a.ts.tmp" }],
      openFiles,
      new Set(),
      root
    )

    expect(paths).toEqual(["repo/a.ts", "repo/b.ts"])
  })
})
