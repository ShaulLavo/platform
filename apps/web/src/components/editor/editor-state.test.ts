import { describe, expect, it } from "bun:test"
import { createEditorStore } from "@/components/editor/editor-state"
import type { FileResult } from "@/lib/file-system-types"

describe("editor remote document cache updates", () => {
  it("force replaces dirty cached documents and clears dirty state", () => {
    const store = createEditorStore(
      workspaceState(["src/file.ts"], "src/file.ts")
    )
    const original = store
      .getState()
      .ensureCachedEditorDocument(file("src/file.ts", "local"))
    original.session.applyText(" edit")
    store.getState().setCachedEditorDocumentDirty("src/file.ts", true)

    const result = store
      .getState()
      .forceReplaceCachedEditorDocument(file("src/file.ts", "remote", 2))
    const replaced = store.getState().getCachedEditorDocument("src/file.ts")

    expect(result.wasDirty).toBe(true)
    expect(replaced?.session.getText()).toBe("remote")
    expect(store.getState().dirtyFilePaths.has("src/file.ts")).toBe(false)
  })

  it("discards cached documents and closes deleted tabs", () => {
    const store = createEditorStore(
      workspaceState(["src/a.ts", "src/b.ts"], "src/a.ts")
    )
    store.getState().ensureCachedEditorDocument(file("src/a.ts", "local"))
    store.getState().setCachedEditorDocumentDirty("src/a.ts", true)

    const result = store.getState().discardCachedEditorDocument("src/a.ts")

    expect(result.wasDirty).toBe(true)
    expect(store.getState().openFilePaths).toEqual(["src/b.ts"])
    expect(store.getState().selectedFilePath).toBe("src/b.ts")
    expect(store.getState().getCachedEditorDocument("src/a.ts")).toBe(null)
  })

  it("renames tabs, cached documents, and dirty markers", () => {
    const store = createEditorStore(
      workspaceState(["src/old.ts"], "src/old.ts")
    )
    store.getState().ensureCachedEditorDocument(file("src/old.ts", "local"))
    store.getState().setCachedEditorDocumentDirty("src/old.ts", true)

    const result = store
      .getState()
      .renameCachedEditorDocument("src/old.ts", "src/new.ts")

    expect(result.wasDirty).toBe(true)
    expect(store.getState().openFilePaths).toEqual(["src/new.ts"])
    expect(store.getState().selectedFilePath).toBe("src/new.ts")
    expect(store.getState().dirtyFilePaths.has("src/old.ts")).toBe(false)
    expect(store.getState().dirtyFilePaths.has("src/new.ts")).toBe(true)
    expect(store.getState().getCachedEditorDocument("src/new.ts")?.path).toBe(
      "src/new.ts"
    )
  })
})

function workspaceState(openFilePaths: string[], selectedFilePath: string) {
  return {
    openFilePaths,
    diffViewMode: "split" as const,
    rootFolder: {
      birthtimeMs: 1,
      mtimeMs: 1,
      name: "repo",
      path: "",
      size: 1,
      type: "directory" as const,
    },
    selectedFilePath,
    workspacePanelTab: "files" as const,
  }
}

function file(path: string, content: string, mtimeMs = 1): FileResult {
  return {
    content,
    mtimeMs,
    path,
    size: content.length,
  }
}
