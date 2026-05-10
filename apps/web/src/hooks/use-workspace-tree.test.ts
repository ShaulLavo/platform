import { describe, expect, it } from "bun:test"
import { selectedFileAncestorDirectoryPaths } from "@/hooks/use-workspace-tree"

describe("selectedFileAncestorDirectoryPaths", () => {
  it("returns selected file ancestors inside the root folder", () => {
    expect(
      selectedFileAncestorDirectoryPaths(
        "repo",
        "repo/src/components/Button.tsx"
      )
    ).toEqual(["repo/src", "repo/src/components"])
  })

  it("handles workspace-root selections", () => {
    expect(
      selectedFileAncestorDirectoryPaths("", "src/components/Button.tsx")
    ).toEqual(["src", "src/components"])
  })

  it("ignores missing and out-of-workspace selections", () => {
    expect(selectedFileAncestorDirectoryPaths("repo", null)).toEqual([])
    expect(
      selectedFileAncestorDirectoryPaths("repo", "other/src/Button.tsx")
    ).toEqual([])
  })
})
