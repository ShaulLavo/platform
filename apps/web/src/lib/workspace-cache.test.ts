import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import type { PickedFsEntry } from "@/components/file-picker-dialog"
import { conflictDiffDocumentId } from "@/features/editor/conflict-diff-document"
import { diffDocumentId } from "@/features/git/diff-document"
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
      openFilePaths: ["/repo/src/readme.md", diffPath],
      rootFolder,
      selectedFilePath: diffPath,
      workspacePanelTab: "git",
    })

    expect(readWorkspaceCache()).toEqual({
      diffViewMode: "stacked",
      openFilePaths: ["/repo/src/readme.md", diffPath],
      rootFolder,
      selectedFilePath: diffPath,
      workspacePanelTab: "git",
    })
  })

  it("filters git diff tabs when their backing file is outside the workspace", () => {
    const rootFolder = pickedDirectory("/repo")
    const diffPath = diffDocumentId(snapshotDiff("/other/src/app.ts"))

    writeWorkspaceCache({
      diffViewMode: "split",
      openFilePaths: [diffPath],
      rootFolder,
      selectedFilePath: diffPath,
      workspacePanelTab: "git",
    })

    expect(readWorkspaceCache()).toEqual({
      diffViewMode: "split",
      openFilePaths: [],
      rootFolder,
      selectedFilePath: null,
      workspacePanelTab: "git",
    })
  })

  it("does not persist transient conflict diff tabs", () => {
    const rootFolder = pickedDirectory("/repo")
    const conflictPath = conflictDiffDocumentId("conflict-1")

    writeWorkspaceCache({
      diffViewMode: "split",
      openFilePaths: ["/repo/src/readme.md", conflictPath],
      rootFolder,
      selectedFilePath: conflictPath,
      workspacePanelTab: "files",
    })

    expect(readWorkspaceCache()).toEqual({
      diffViewMode: "split",
      openFilePaths: ["/repo/src/readme.md"],
      rootFolder,
      selectedFilePath: null,
      workspacePanelTab: "files",
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
