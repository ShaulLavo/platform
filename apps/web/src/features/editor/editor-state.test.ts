import { describe, expect, it } from "bun:test"

import { createEditorCommands } from "@/features/editor/state/editor-commands"
import { createEditorDocumentStore } from "@/features/editor/state/editor-document-state"
import {
  removeDirtyFilePath,
  renameDirtyFilePath,
  updateDirtyFilePaths,
} from "@/features/editor/state/editor-dirty-paths"
import {
  nextSelectedFilePath,
  openFilePathList,
  renameOpenFilePath,
} from "@/features/editor/state/editor-tab-paths"
import { createEditorUiStore } from "@/features/editor/state/editor-ui-state"
import { createEditorWorkspaceStore } from "@/features/editor/state/editor-workspace-state"
import type { FileResult } from "@/lib/file-system-types"
import type { CachedWorkspaceState } from "@/lib/workspace-cache"
import type { TypeScriptLspDefinitionTarget } from "@editor/typescript-lsp"

describe("editor path utilities", () => {
  it("adds, selects, and renames open tab paths", () => {
    expect(openFilePathList(["src/a.ts"], "src/b.ts")).toEqual([
      "src/a.ts",
      "src/b.ts",
    ])
    expect(openFilePathList(["src/a.ts"], "src/a.ts")).toEqual(["src/a.ts"])
    expect(nextSelectedFilePath(["src/a.ts", "src/b.ts"], "src/a.ts")).toBe(
      "src/b.ts"
    )
    expect(renameOpenFilePath(["src/a.ts", "src/b.ts"], "src/a.ts", "src/b.ts"))
      .toEqual(["src/b.ts"])
  })

  it("updates dirty path sets without unnecessary replacements", () => {
    const paths = new Set(["src/a.ts"])

    expect(updateDirtyFilePaths(paths, "src/a.ts", true)).toBe(null)
    expect(removeDirtyFilePath(paths, "src/b.ts")).toBe(null)
    expect(removeDirtyFilePath(paths, "src/a.ts")).toEqual(new Set())
    expect(renameDirtyFilePath(paths, "src/a.ts", "src/b.ts")).toEqual(
      new Set(["src/b.ts"])
    )
  })
})

describe("editor document store", () => {
  it("force replaces dirty cached documents and clears dirty state", () => {
    const store = createEditorDocumentStore()
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

  it("tracks scroll position on cached documents", () => {
    const store = createEditorDocumentStore()
    store.getState().ensureCachedEditorDocument(file("src/file.ts", "local"))

    store.getState().setCachedEditorDocumentScrollPosition("src/file.ts", {
      left: 10,
      top: 20,
    })

    expect(
      store.getState().getCachedEditorDocument("src/file.ts")?.scrollPosition
    ).toEqual({ left: 10, top: 20 })
  })
})

describe("editor commands", () => {
  it("selects files, opens tabs, clears status, and records fallbacks", () => {
    const { commands, documentStore, uiStore, workspaceStore } = setupStores(
      workspaceState(["src/a.ts"], "src/a.ts")
    )
    documentStore.getState().ensureCachedEditorDocument(file("src/a.ts", "a"))
    uiStore.setState({ statusBarState: {} as never })

    commands.selectFile("src/b.ts")

    expect(workspaceStore.getState().openFilePaths).toEqual([
      "src/a.ts",
      "src/b.ts",
    ])
    expect(workspaceStore.getState().selectedFilePath).toBe("src/b.ts")
    expect(documentStore.getState().fallbackDocumentPath).toBe("src/a.ts")
    expect(uiStore.getState().statusBarState).toBe(null)
  })

  it("opens definitions through workspace, document, and ui stores", () => {
    const { commands, documentStore, uiStore, workspaceStore } = setupStores(
      workspaceState(["src/a.ts"], "src/a.ts")
    )
    documentStore.getState().ensureCachedEditorDocument(file("src/a.ts", "a"))

    const result = commands.openDefinition(definitionTarget("src/target.ts"))

    expect(result).toBe(true)
    expect(uiStore.getState().definitionTarget?.path).toBe("src/target.ts")
    expect(workspaceStore.getState().openFilePaths).toEqual([
      "src/a.ts",
      "src/target.ts",
    ])
    expect(workspaceStore.getState().selectedFilePath).toBe("src/target.ts")
    expect(documentStore.getState().fallbackDocumentPath).toBe("src/a.ts")
  })

  it("discards cached documents and closes deleted tabs", () => {
    const { commands, documentStore, workspaceStore } = setupStores(
      workspaceState(["src/a.ts", "src/b.ts"], "src/a.ts")
    )
    documentStore.getState().ensureCachedEditorDocument(file("src/a.ts", "a"))
    documentStore.getState().setCachedEditorDocumentDirty("src/a.ts", true)

    const result = commands.discardCachedEditorDocument("src/a.ts")

    expect(result.wasDirty).toBe(true)
    expect(workspaceStore.getState().openFilePaths).toEqual(["src/b.ts"])
    expect(workspaceStore.getState().selectedFilePath).toBe("src/b.ts")
    expect(documentStore.getState().getCachedEditorDocument("src/a.ts")).toBe(
      null
    )
  })

  it("renames tabs, cached documents, dirty markers, and definition target", () => {
    const { commands, documentStore, uiStore, workspaceStore } = setupStores(
      workspaceState(["src/old.ts"], "src/old.ts")
    )
    documentStore.getState().ensureCachedEditorDocument(file("src/old.ts", "a"))
    documentStore.getState().setCachedEditorDocumentDirty("src/old.ts", true)
    uiStore.getState().setDefinitionTarget(definitionTarget("src/old.ts"))

    const result = commands.renameCachedEditorDocument(
      "src/old.ts",
      "src/new.ts"
    )

    expect(result.wasDirty).toBe(true)
    expect(workspaceStore.getState().openFilePaths).toEqual(["src/new.ts"])
    expect(workspaceStore.getState().selectedFilePath).toBe("src/new.ts")
    expect(documentStore.getState().dirtyFilePaths.has("src/old.ts")).toBe(
      false
    )
    expect(documentStore.getState().dirtyFilePaths.has("src/new.ts")).toBe(
      true
    )
    expect(
      documentStore.getState().getCachedEditorDocument("src/new.ts")?.path
    ).toBe("src/new.ts")
    expect(uiStore.getState().definitionTarget?.path).toBe("src/new.ts")
  })

  it("resets workspace, document, and ui state for a picked root folder", () => {
    const { commands, documentStore, uiStore, workspaceStore } = setupStores(
      workspaceState(["src/a.ts"], "src/a.ts")
    )
    documentStore.getState().ensureCachedEditorDocument(file("src/a.ts", "a"))
    uiStore.getState().setDefinitionTarget(definitionTarget("src/a.ts"))

    commands.pickRootFolder(rootFolder("/repo"))

    expect(workspaceStore.getState().rootFolder?.path).toBe("/repo")
    expect(workspaceStore.getState().openFilePaths).toEqual([])
    expect(workspaceStore.getState().selectedFilePath).toBe(null)
    expect(workspaceStore.getState().workspacePanelTab).toBe("files")
    expect(documentStore.getState().dirtyFilePaths).toEqual(new Set())
    expect(documentStore.getState().fallbackDocumentPath).toBe(null)
    expect(uiStore.getState().definitionTarget).toBe(null)
  })
})

function setupStores(initialState: CachedWorkspaceState) {
  const documentStore = createEditorDocumentStore()
  const uiStore = createEditorUiStore()
  const workspaceStore = createEditorWorkspaceStore(initialState)
  const commands = createEditorCommands({
    documentStore,
    uiStore,
    workspaceStore,
  })

  return { commands, documentStore, uiStore, workspaceStore }
}

function workspaceState(
  openFilePaths: string[],
  selectedFilePath: string | null
): CachedWorkspaceState {
  return {
    diffViewMode: "split",
    openFilePaths,
    rootFolder: rootFolder(""),
    selectedFilePath,
    workspacePanelTab: "files",
  }
}

function rootFolder(path: string) {
  return {
    birthtimeMs: 1,
    mtimeMs: 1,
    name: "repo",
    path,
    size: 1,
    type: "directory" as const,
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

function definitionTarget(path: string): TypeScriptLspDefinitionTarget {
  return {
    path,
    range: {
      end: { character: 1, line: 1 },
      start: { character: 0, line: 1 },
    },
    uri: `file://${path}`,
  }
}
