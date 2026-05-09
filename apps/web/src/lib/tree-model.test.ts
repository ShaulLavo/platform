import { describe, expect, it } from "bun:test"
import type { TreeEntry, TreeResult } from "@/lib/file-system-types"
import { replaceDirectoryLoad, treeModel } from "@/lib/tree-model"

describe("replaceDirectoryLoad", () => {
  it("replaces root children and removes stale entries", () => {
    const model = treeModel(
      tree("", [directory("src"), file("src/old.ts"), file("README.md")]),
      ""
    )
    const next = replaceDirectoryLoad(
      model,
      "",
      tree("", [file("package.json")])
    )

    expect(next.paths).toEqual(["package.json"])
    expect(next.entriesByTreePath.has("src")).toBe(false)
    expect(next.entriesByTreePath.has("src/old.ts")).toBe(false)
  })

  it("replaces a loaded directory without removing siblings", () => {
    const root = "repo"
    const model = treeModel(
      tree(root, [
        directory("repo/src", [file("repo/src/old.ts")]),
        file("repo/README.md"),
      ]),
      root
    )
    const next = replaceDirectoryLoad(
      model,
      root,
      tree("repo/src", [file("repo/src/new.ts")])
    )

    expect(next.paths).toEqual(["src/", "README.md", "src/new.ts"])
    expect(next.entriesByTreePath.has("src/old.ts")).toBe(false)
    expect(next.entriesByTreePath.has("README.md")).toBe(true)
  })
})

function tree(path: string, entries: TreeEntry[]): TreeResult {
  return { entries, path }
}

function directory(path: string, children?: TreeEntry[]): TreeEntry {
  return entry(path, "directory", children)
}

function file(path: string): TreeEntry {
  return entry(path, "file")
}

function entry(
  path: string,
  type: TreeEntry["type"],
  children?: TreeEntry[]
): TreeEntry {
  return {
    birthtimeMs: 1,
    children,
    mtimeMs: 1,
    name: path.split("/").at(-1) ?? path,
    path,
    size: 1,
    type,
  }
}
