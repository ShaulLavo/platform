import { describe, expect, it } from "bun:test"
import type { TreeEntry, TreeResult } from "@/lib/file-system-types"
import {
  patchTreeEntryMetadata,
  replaceDirectoryLoad,
  treeModel,
} from "@/lib/tree-model"

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

describe("patchTreeEntryMetadata", () => {
  it("updates an existing entry without removing siblings", () => {
    const root = "repo"
    const model = treeModel(
      tree(root, [file("repo/a.ts"), file("repo/b.ts")]),
      root
    )
    const next = patchTreeEntryMetadata(model, root, {
      ...file("repo/a.ts"),
      mtimeMs: 25,
      size: 10,
    })

    expect(next.entriesByTreePath.get("a.ts")).toMatchObject({
      mtimeMs: 25,
      size: 10,
    })
    expect(next.entriesByTreePath.has("b.ts")).toBe(true)
    expect(next.paths).toEqual(["a.ts", "b.ts"])
  })

  it("returns the current model when the entry is not visible", () => {
    const model = treeModel(tree("repo", [file("repo/a.ts")]), "repo")
    const next = patchTreeEntryMetadata(model, "repo", file("repo/missing.ts"))

    expect(next).toBe(model)
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
