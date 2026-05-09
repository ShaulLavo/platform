import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import type { PickedFsEntry } from "@/components/file-picker-dialog"
import { diffDocumentId } from "@/features/git/diff-document"
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
    const diffPath = diffDocumentId("/repo/src/app.ts", false)

    writeWorkspaceCache({
      openFilePaths: ["/repo/src/readme.md", diffPath],
      rootFolder,
      selectedFilePath: diffPath,
      workspacePanelTab: "git",
    })

    expect(readWorkspaceCache()).toEqual({
      openFilePaths: ["/repo/src/readme.md", diffPath],
      rootFolder,
      selectedFilePath: diffPath,
      workspacePanelTab: "git",
    })
  })

  it("filters git diff tabs when their backing file is outside the workspace", () => {
    const rootFolder = pickedDirectory("/repo")
    const diffPath = diffDocumentId("/other/src/app.ts", false)

    writeWorkspaceCache({
      openFilePaths: [diffPath],
      rootFolder,
      selectedFilePath: diffPath,
      workspacePanelTab: "git",
    })

    expect(readWorkspaceCache()).toEqual({
      openFilePaths: [],
      rootFolder,
      selectedFilePath: null,
      workspacePanelTab: "git",
    })
  })
})

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
