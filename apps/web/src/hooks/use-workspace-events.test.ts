import { describe, expect, it } from "bun:test"
import { fileSystemKeys } from "@/lib/query-keys"
import { shouldRefreshReadyRootTree } from "@/hooks/use-workspace-events"
import { affectedOpenFileRefreshPaths } from "@/lib/workspace-event-model"

describe("shouldRefreshReadyRootTree", () => {
  it("skips ready refresh when the root tree query is fetching", () => {
    const queryClient = queryClientWithState("repo", {
      data: {},
      dataUpdatedAt: 0,
      fetchStatus: "fetching",
    })

    expect(shouldRefreshReadyRootTree(queryClient, "repo", 20_000)).toBe(false)
  })

  it("skips ready refresh when the root tree query is fresh", () => {
    const queryClient = queryClientWithState("repo", {
      data: {},
      dataUpdatedAt: 15_000,
      fetchStatus: "idle",
    })

    expect(shouldRefreshReadyRootTree(queryClient, "repo", 20_000)).toBe(false)
  })

  it("refreshes ready root tree when cached data is stale", () => {
    const queryClient = queryClientWithState("repo", {
      data: {},
      dataUpdatedAt: 1_000,
      fetchStatus: "idle",
    })

    expect(shouldRefreshReadyRootTree(queryClient, "repo", 20_000)).toBe(true)
  })

  it("refreshes ready root tree when cached data was invalidated", () => {
    const queryClient = queryClientWithState("repo", {
      data: {},
      dataUpdatedAt: 19_000,
      fetchStatus: "idle",
      isInvalidated: true,
    })

    expect(shouldRefreshReadyRootTree(queryClient, "repo", 20_000)).toBe(true)
  })
})

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

function queryClientWithState(
  rootPath: string,
  state: {
    data?: unknown
    dataUpdatedAt: number
    fetchStatus: string
    isInvalidated?: boolean
  }
) {
  return {
    getQueryState: (queryKey: readonly unknown[]) => {
      if (
        JSON.stringify(queryKey) !==
        JSON.stringify(fileSystemKeys.tree(rootPath))
      ) {
        return undefined
      }

      return state
    },
  }
}
