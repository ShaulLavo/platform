import { describe, expect, it } from "bun:test"
import { FileTree as PierreFileTree } from "@pierre/trees"
import type {
  FileTreeDirectoryHandle,
  FileTreeItemHandle,
} from "@pierre/trees"

import {
  loadExpandedDirectories,
  syncTreePaneState,
} from "@/components/workspace/tree-pane-state"
import type { TreeEntry, TreeResult } from "@/lib/file-system-types"
import { mergeDirectoryLoad, treeModel } from "@/lib/tree-model"

describe("syncTreePaneState", () => {
  it("continues expanding newly loaded ancestors for the selected file", () => {
    const root = "repo"
    const selectedFilePath = "repo/src/components/Button.tsx"
    const initialModel = treeModel(tree(root, [directory("repo/src")]), root)
    const fileTree = new PierreFileTree({
      flattenEmptyDirectories: true,
      initialExpansion: "closed",
      paths: initialModel.paths,
    })
    const loadPasses: string[][] = []

    try {
      const previousPaths = syncTreePaneState({
        loadExpandedDirectoriesForCurrentModel: (currentTree) => {
          loadPasses.push(expandedDirectories(currentTree))
        },
        model: initialModel,
        previousPaths: initialModel.paths,
        rootPath: root,
        selectedFilePath,
        tree: fileTree,
      })
      const loadedModel = mergeDirectoryLoad(
        initialModel,
        root,
        tree("repo/src", [directory("repo/src/components")]),
        "src"
      )

      syncTreePaneState({
        loadExpandedDirectoriesForCurrentModel: (currentTree) => {
          loadPasses.push(expandedDirectories(currentTree))
        },
        model: loadedModel,
        previousPaths,
        rootPath: root,
        selectedFilePath,
        tree: fileTree,
      })

      expect(loadPasses).toEqual([["src/"], ["src/", "src/components/"]])
    } finally {
      fileTree.cleanUp()
    }
  })

  it("loads expanded symlink directory targets", () => {
    const root = "repo"
    const model = treeModel(tree(root, [symlinkDirectory("repo/vendor")]), root)
    const fileTree = new PierreFileTree({
      flattenEmptyDirectories: true,
      initialExpansion: "closed",
      paths: model.paths,
    })
    const loadedPaths: string[] = []

    try {
      getDirectory(fileTree, "vendor/").expand()

      syncTreePaneState({
        loadExpandedDirectoriesForCurrentModel: (currentTree) => {
          loadExpandedDirectories(currentTree, model, (_entry, path) =>
            loadedPaths.push(path)
          )
        },
        model,
        previousPaths: model.paths,
        rootPath: root,
        selectedFilePath: null,
        tree: fileTree,
      })

      expect(loadedPaths).toEqual(["vendor/"])
    } finally {
      fileTree.cleanUp()
    }
  })

  it("keeps focus inside a nested lazy directory after flattened children load", () => {
    const root = "repo"
    const initialModel = mergeDirectoryLoad(
      treeModel(tree(root, [directory("repo/src")]), root),
      root,
      tree("repo/src", [
        directory("repo/src/components"),
        file("repo/src/index.ts"),
      ]),
      "src"
    )
    const fileTree = new PierreFileTree({
      flattenEmptyDirectories: true,
      initialExpansion: "closed",
      paths: initialModel.paths,
    })

    try {
      getDirectory(fileTree, "src/").expand()
      fileTree.focusPath("src/components/")
      getDirectory(fileTree, "src/components/").expand()

      const loadedModel = mergeDirectoryLoad(
        initialModel,
        root,
        tree("repo/src/components", [directory("repo/src/components/ui")]),
        "src/components"
      )

      const focusChanges = focusChangesDuring(fileTree, () =>
        syncTreePaneState({
          loadExpandedDirectoriesForCurrentModel: () => {},
          model: loadedModel,
          previousPaths: initialModel.paths,
          rootPath: root,
          selectedFilePath: null,
          tree: fileTree,
        })
      )

      expect(focusChanges).toEqual(["src/components/ui/"])
      expect(fileTree.getFocusedPath()).toBe("src/components/ui/")
    } finally {
      fileTree.cleanUp()
    }
  })

  it("keeps focus inside a root lazy directory after flattened children load", () => {
    const root = "repo"
    const initialModel = treeModel(
      tree(root, [directory("repo/docs"), directory("repo/src")]),
      root
    )
    const fileTree = new PierreFileTree({
      flattenEmptyDirectories: true,
      initialExpansion: "closed",
      paths: initialModel.paths,
    })

    try {
      fileTree.focusPath("src/")
      getDirectory(fileTree, "src/").expand()

      const loadedModel = mergeDirectoryLoad(
        initialModel,
        root,
        tree("repo/src", [directory("repo/src/components")]),
        "src"
      )
      const focusChanges = focusChangesDuring(fileTree, () =>
        syncTreePaneState({
          loadExpandedDirectoriesForCurrentModel: () => {},
          model: loadedModel,
          previousPaths: initialModel.paths,
          rootPath: root,
          selectedFilePath: null,
          tree: fileTree,
        })
      )

      expect(focusChanges).toEqual(["src/components/"])
      expect(fileTree.getFocusedPath()).toBe("src/components/")
    } finally {
      fileTree.cleanUp()
    }
  })
})

function focusChangesDuring(tree: PierreFileTree, action: () => void) {
  const paths: (string | null)[] = []
  const unsubscribe = tree.subscribe(() => {
    paths.push(tree.getFocusedPath())
  })

  try {
    action()
  } finally {
    unsubscribe()
  }

  return paths
}

function expandedDirectories(tree: PierreFileTree) {
  return ["src/", "src/components/", "vendor/"].filter((path) => {
    const item = tree.getItem(path)
    if (!isDirectoryHandle(item)) return false

    return item.isExpanded()
  })
}

function getDirectory(
  tree: PierreFileTree,
  path: string
): FileTreeDirectoryHandle {
  const item = tree.getItem(path)
  if (!isDirectoryHandle(item)) {
    throw new Error(`Expected ${path} to be a directory`)
  }

  return item
}

function isDirectoryHandle(
  item: FileTreeItemHandle | null
): item is FileTreeDirectoryHandle {
  return item?.isDirectory() === true
}

function tree(path: string, entries: TreeEntry[]): TreeResult {
  return { entries, path }
}

function symlinkDirectory(path: string): TreeEntry {
  return {
    birthtimeMs: 1,
    mtimeMs: 1,
    name: path.split("/").at(-1) ?? path,
    path,
    size: 1,
    targetType: "directory",
    type: "symlink",
  }
}

function directory(path: string): TreeEntry {
  return {
    birthtimeMs: 1,
    mtimeMs: 1,
    name: path.split("/").at(-1) ?? path,
    path,
    size: 1,
    type: "directory",
  }
}

function file(path: string): TreeEntry {
  return {
    birthtimeMs: 1,
    mtimeMs: 1,
    name: path.split("/").at(-1) ?? path,
    path,
    size: 1,
    type: "file",
  }
}
