import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import type { PickedFsEntry } from "@/lib/file-system-types"
import { conflictDiffDocumentId } from "@/features/editor/conflict-diff-document"
import { diffDocumentId } from "@/features/git/diff-document"
import { searchBufferDocumentId } from "@/features/search/search-buffer-document"
import type { FileDiff } from "@/features/git/types"
import { readWorkspaceCache, writeWorkspaceCache } from "@/lib/workspace-cache"

const STORE = new Map<string, string>()

describe("workspace cache", () => {
  beforeEach(() => {
    STORE.clear()
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: fakeLocalStorage(),
    })
  })

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage
  })

  it("persists git diff tabs when their backing file is in the workspace", () => {
    const rootFolder = pickedDirectory("/repo")
    const diffPath = diffDocumentId(snapshotDiff("/repo/src/app.ts"))

    writeWorkspaceCache({
      diffViewMode: "stacked",
      editorHistory: [diffPath, "/repo/src/readme.md"],
      gitPanelOpen: false,
      openFilePaths: ["/repo/src/readme.md", diffPath],
      recentlyClosedEditorPaths: ["/repo/src/closed.ts"],
      rootFolder,
      selectedFilePath: diffPath,
      sidebarVisible: false,
      workspacePanelTab: "git",
    })

    expect(readWorkspaceCache()).toEqual({
      diffViewMode: "stacked",
      editorHistory: [diffPath, "/repo/src/readme.md"],
      gitPanelOpen: false,
      openFilePaths: ["/repo/src/readme.md", diffPath],
      recentlyClosedEditorPaths: ["/repo/src/closed.ts"],
      rootFolder,
      selectedFilePath: diffPath,
      sidebarVisible: false,
      workspacePanelTab: "git",
    })
  })

  it("filters git diff tabs when their backing file is outside the workspace", () => {
    const rootFolder = pickedDirectory("/repo")
    const diffPath = diffDocumentId(snapshotDiff("/other/src/app.ts"))

    writeWorkspaceCache({
      diffViewMode: "split",
      editorHistory: [diffPath],
      gitPanelOpen: true,
      openFilePaths: [diffPath],
      recentlyClosedEditorPaths: ["/other/src/closed.ts"],
      rootFolder,
      selectedFilePath: diffPath,
      sidebarVisible: true,
      workspacePanelTab: "git",
    })

    expect(readWorkspaceCache()).toEqual({
      diffViewMode: "split",
      editorHistory: [],
      gitPanelOpen: true,
      openFilePaths: [],
      recentlyClosedEditorPaths: [],
      rootFolder,
      selectedFilePath: null,
      sidebarVisible: true,
      workspacePanelTab: "git",
    })
  })

  it("does not persist transient conflict diff tabs", () => {
    const rootFolder = pickedDirectory("/repo")
    const conflictPath = conflictDiffDocumentId("conflict-1")

    writeWorkspaceCache({
      diffViewMode: "split",
      editorHistory: [conflictPath, "/repo/src/readme.md"],
      gitPanelOpen: true,
      openFilePaths: ["/repo/src/readme.md", conflictPath],
      recentlyClosedEditorPaths: [conflictPath],
      rootFolder,
      selectedFilePath: conflictPath,
      sidebarVisible: true,
      workspacePanelTab: "files",
    })

    expect(readWorkspaceCache()).toEqual({
      diffViewMode: "split",
      editorHistory: ["/repo/src/readme.md"],
      gitPanelOpen: true,
      openFilePaths: ["/repo/src/readme.md"],
      recentlyClosedEditorPaths: [],
      rootFolder,
      selectedFilePath: null,
      sidebarVisible: true,
      workspacePanelTab: "files",
    })
  })

  it("persists the search panel tab", () => {
    const rootFolder = pickedDirectory("/repo")

    writeWorkspaceCache({
      diffViewMode: "split",
      editorHistory: [],
      gitPanelOpen: true,
      openFilePaths: [],
      recentlyClosedEditorPaths: [],
      rootFolder,
      selectedFilePath: null,
      sidebarVisible: true,
      workspacePanelTab: "search",
    })

    expect(readWorkspaceCache().workspacePanelTab).toBe("search")
  })

  it("does not persist transient search buffer tabs", () => {
    const rootFolder = pickedDirectory("/repo")
    const searchPath = searchBufferDocumentId("/repo")

    writeWorkspaceCache({
      diffViewMode: "split",
      editorHistory: [searchPath],
      gitPanelOpen: true,
      openFilePaths: ["/repo/src/readme.md", searchPath],
      recentlyClosedEditorPaths: [searchPath],
      rootFolder,
      selectedFilePath: searchPath,
      sidebarVisible: true,
      workspacePanelTab: "search",
    })

    expect(readWorkspaceCache()).toMatchObject({
      editorHistory: [],
      openFilePaths: ["/repo/src/readme.md"],
      recentlyClosedEditorPaths: [],
      selectedFilePath: null,
    })
  })
})

function snapshotDiff(path: string): FileDiff {
  return {
    hunks: [],
    newObjectId: "b".repeat(40),
    oldObjectId: "a".repeat(40),
    patch: "",
    path,
    staged: false,
  }
}

function pickedDirectory(path: string): PickedFsEntry {
  return {
    birthtimeMs: 1,
    mtimeMs: 1,
    name: "repo",
    path,
    size: 1,
    type: "directory",
  }
}

function fakeLocalStorage() {
  return {
    getItem: (key: string) => STORE.get(key) ?? null,
    removeItem: (key: string) => {
      STORE.delete(key)
    },
    setItem: (key: string, value: string) => {
      STORE.set(key, value)
    },
  }
}
