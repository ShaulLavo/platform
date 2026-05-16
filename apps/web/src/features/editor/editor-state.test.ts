import { describe, expect, it } from "bun:test"

import { createEditorCommands } from "@/features/editor/state/editor-commands"
import { createEditorConflictStore } from "@/features/editor/state/editor-conflict-state"
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
  reorderOpenFilePath,
} from "@/features/editor/state/editor-tab-paths"
import { createEditorUiStore } from "@/features/editor/state/editor-ui-state"
import { createEditorWorkspaceStore } from "@/features/editor/state/editor-workspace-state"
import type { FileResult } from "@/lib/file-system-types"
import type { CachedWorkspaceState } from "@/lib/workspace-cache"
import type {
  LanguageServerDefinitionTarget,
  LanguageServerReferencesResult,
} from "@editor/language-server"

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
    expect(
      renameOpenFilePath(["src/a.ts", "src/b.ts"], "src/a.ts", "src/b.ts")
    ).toEqual(["src/b.ts"])
  })

  it("reorders open tab paths by target index after removal", () => {
    const paths = ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"]

    expect(reorderOpenFilePath(paths, "src/c.ts", 1)).toEqual([
      "src/a.ts",
      "src/c.ts",
      "src/b.ts",
      "src/d.ts",
    ])
    expect(reorderOpenFilePath(paths, "src/b.ts", 2)).toEqual([
      "src/a.ts",
      "src/c.ts",
      "src/b.ts",
      "src/d.ts",
    ])
    expect(reorderOpenFilePath(paths, "src/d.ts", 0)).toEqual([
      "src/d.ts",
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
    ])
    expect(reorderOpenFilePath(paths, "src/a.ts", 3)).toEqual([
      "src/b.ts",
      "src/c.ts",
      "src/d.ts",
      "src/a.ts",
    ])
    expect(reorderOpenFilePath(paths, "src/b.ts", 1)).toEqual(paths)
    expect(reorderOpenFilePath(paths, "src/missing.ts", 1)).toEqual(paths)
    expect(reorderOpenFilePath(["src/a.ts"], "src/a.ts", 0)).toEqual([
      "src/a.ts",
    ])
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

  it("skips unchanged scroll position updates", () => {
    const store = createEditorDocumentStore()
    store.getState().ensureCachedEditorDocument(file("src/file.ts", "local"))
    let updates = 0
    const unsubscribe = store.subscribe((state, previousState) => {
      if (state.scrollPositionByPath !== previousState.scrollPositionByPath) {
        updates += 1
      }
    })

    store.getState().setCachedEditorDocumentScrollPosition("src/file.ts", {
      left: 10,
      top: 20,
    })
    store.getState().setCachedEditorDocumentScrollPosition("src/file.ts", {
      left: 10,
      top: 20,
    })
    unsubscribe()

    expect(updates).toBe(1)
  })

  it("marks cached documents clean after saving without replacing the session", () => {
    const store = createEditorDocumentStore()
    const original = store
      .getState()
      .ensureCachedEditorDocument(file("src/file.ts", "local"))
    original.session.applyText("saved")
    store.getState().setCachedEditorDocumentDirty("src/file.ts", true)

    const result = store
      .getState()
      .markCachedEditorDocumentClean("src/file.ts", 2)
    const saved = store.getState().getCachedEditorDocument("src/file.ts")

    expect(result).toBe(true)
    expect(saved?.session).toBe(original.session)
    expect(saved?.revision).toBe(2)
    expect(saved?.session.isDirty()).toBe(false)
    expect(store.getState().dirtyFilePaths.has("src/file.ts")).toBe(false)
  })

  it("records dirty text changes even after the path is already dirty", () => {
    const store = createEditorDocumentStore()
    store.getState().ensureCachedEditorDocument(file("src/file.ts", "local"))
    const initialRevision =
      store.getState().documentContentRevisions["src/file.ts"]

    store.getState().recordCachedEditorDocumentTextChange("src/file.ts")
    const firstEditRevision =
      store.getState().documentContentRevisions["src/file.ts"]
    store.getState().recordCachedEditorDocumentTextChange("src/file.ts")

    expect(store.getState().dirtyContentRevision).toBe(2)
    expect(store.getState().dirtyFilePaths.has("src/file.ts")).toBe(true)
    expect(firstEditRevision).not.toBe(initialRevision)
    expect(store.getState().documentContentRevisions["src/file.ts"]).not.toBe(
      firstEditRevision
    )
  })

  it("tracks content revisions by cached document path", () => {
    const store = createEditorDocumentStore()
    store.getState().ensureCachedEditorDocument(file("src/a.ts", "a"))
    store.getState().ensureCachedEditorDocument(file("src/b.ts", "b"))
    const aRevision = store.getState().documentContentRevisions["src/a.ts"]
    const bRevision = store.getState().documentContentRevisions["src/b.ts"]

    store.getState().recordCachedEditorDocumentTextChange("src/a.ts")

    expect(store.getState().documentContentRevisions["src/a.ts"]).not.toBe(
      aRevision
    )
    expect(store.getState().documentContentRevisions["src/b.ts"]).toBe(
      bRevision
    )
  })

  it("moves and clears cached document content revisions", () => {
    const store = createEditorDocumentStore()
    store.getState().ensureCachedEditorDocument(file("src/old.ts", "a"))
    const revision = store.getState().documentContentRevisions["src/old.ts"]

    store.getState().renameCachedEditorDocumentPath("src/old.ts", "src/new.ts")
    expect(store.getState().documentContentRevisions["src/new.ts"]).toBe(
      revision
    )

    store.getState().deleteCachedEditorDocument("src/new.ts")

    expect(
      store.getState().documentContentRevisions["src/old.ts"]
    ).toBeUndefined()
    expect(
      store.getState().documentContentRevisions["src/new.ts"]
    ).toBeUndefined()
    expect(revision).toEqual(expect.any(String))
  })

  it("preserves the session when a forced refresh has matching content", () => {
    const store = createEditorDocumentStore()
    const original = store
      .getState()
      .ensureCachedEditorDocument(file("src/file.ts", "local"))
    original.session.applyText(" edit")
    store.getState().setCachedEditorDocumentDirty("src/file.ts", true)

    const result = store
      .getState()
      .forceReplaceCachedEditorDocument(file("src/file.ts", "local edit", 2))
    const refreshed = store.getState().getCachedEditorDocument("src/file.ts")

    expect(result.wasDirty).toBe(true)
    expect(refreshed?.session).toBe(original.session)
    expect(refreshed?.revision).toBe(2)
    expect(refreshed?.session.isDirty()).toBe(false)
    expect(store.getState().dirtyFilePaths.has("src/file.ts")).toBe(false)
  })

  it("skips forced refresh updates when content and revision already match", () => {
    const store = createEditorDocumentStore()
    const original = store
      .getState()
      .ensureCachedEditorDocument(file("src/file.ts", "local", 2))
    let documentUpdates = 0
    const unsubscribe = store.subscribe((state, previousState) => {
      if (state.documents !== previousState.documents) documentUpdates += 1
    })

    const result = store
      .getState()
      .forceReplaceCachedEditorDocument(file("src/file.ts", "local", 2))
    unsubscribe()

    expect(result.wasDirty).toBe(false)
    expect(documentUpdates).toBe(0)
    expect(store.getState().getCachedEditorDocument("src/file.ts")).toBe(
      original
    )
  })
})

describe("editor conflict store", () => {
  it("adds, updates, and removes filesystem conflicts", () => {
    const store = createEditorConflictStore()

    store.getState().addConflict({
      eventType: "changed",
      id: "conflict-1",
      localPath: "src/file.ts",
      localText: "local",
      remoteMtimeMs: 2,
      remotePath: "src/file.ts",
      remoteSize: 6,
      remoteText: "remote",
    })
    store.getState().updateConflict("conflict-1", {
      diffDocumentId: "conflict-diff:conflict-1",
      toastId: "toast-1",
    })

    expect(store.getState().conflicts["conflict-1"]).toMatchObject({
      diffDocumentId: "conflict-diff:conflict-1",
      toastId: "toast-1",
    })

    store.getState().removeConflict("conflict-1")

    expect(store.getState().conflicts["conflict-1"]).toBeUndefined()
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
    expect(workspaceStore.getState().editorHistory).toEqual([
      "src/b.ts",
      "src/a.ts",
    ])
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
    expect(workspaceStore.getState().editorHistory).toEqual([
      "src/target.ts",
      "src/a.ts",
    ])
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
    expect(workspaceStore.getState().editorHistory).toEqual([])
    expect(documentStore.getState().getCachedEditorDocument("src/a.ts")).toBe(
      null
    )
    expect(workspaceStore.getState().recentlyClosedEditorPaths).toEqual([])
  })

  it("discards dirty tabs from user close and tracks them as recently closed", () => {
    const { commands, documentStore, workspaceStore } = setupStores(
      workspaceState(["src/a.ts", "src/b.ts"], "src/a.ts")
    )
    documentStore.getState().ensureCachedEditorDocument(file("src/a.ts", "a"))
    documentStore.getState().setCachedEditorDocumentDirty("src/a.ts", true)

    const result = commands.discardAndCloseTab("src/a.ts")

    expect(result.wasDirty).toBe(true)
    expect(workspaceStore.getState().openFilePaths).toEqual(["src/b.ts"])
    expect(workspaceStore.getState().selectedFilePath).toBe("src/b.ts")
    expect(workspaceStore.getState().editorHistory).toEqual([])
    expect(workspaceStore.getState().recentlyClosedEditorPaths).toEqual([
      "src/a.ts",
    ])
    expect(documentStore.getState().getCachedEditorDocument("src/a.ts")).toBe(
      null
    )
    expect(documentStore.getState().dirtyFilePaths.has("src/a.ts")).toBe(false)
  })

  it("tracks closed editors and reopens the last closed tab", () => {
    const { commands, workspaceStore } = setupStores(
      workspaceState(["src/a.ts", "src/b.ts"], "src/a.ts")
    )

    commands.closeTab("src/a.ts")

    expect(workspaceStore.getState().openFilePaths).toEqual(["src/b.ts"])
    expect(workspaceStore.getState().recentlyClosedEditorPaths).toEqual([
      "src/a.ts",
    ])

    const reopened = commands.reopenClosedEditor()

    expect(reopened).toBe(true)
    expect(workspaceStore.getState().openFilePaths).toEqual([
      "src/b.ts",
      "src/a.ts",
    ])
    expect(workspaceStore.getState().selectedFilePath).toBe("src/a.ts")
    expect(workspaceStore.getState().recentlyClosedEditorPaths).toEqual([])
  })

  it("selects the previous editor from editor history", () => {
    const { commands, workspaceStore } = setupStores(
      workspaceState(["src/a.ts", "src/b.ts"], "src/b.ts")
    )
    workspaceStore.setState({
      editorHistory: ["src/b.ts", "src/a.ts"],
    })

    const selected = commands.selectPreviousEditor()

    expect(selected).toBe(true)
    expect(workspaceStore.getState().selectedFilePath).toBe("src/a.ts")
  })

  it("reorders tabs without touching editor selection metadata", () => {
    const { commands, documentStore, workspaceStore } = setupStores(
      workspaceState(["src/a.ts", "src/b.ts", "src/c.ts"], "src/b.ts")
    )
    documentStore.getState().ensureCachedEditorDocument(file("src/a.ts", "a"))
    documentStore.getState().setCachedEditorDocumentDirty("src/a.ts", true)
    workspaceStore.setState({
      editorHistory: ["src/b.ts", "src/a.ts"],
      recentlyClosedEditorPaths: ["src/old.ts"],
    })

    const reordered = commands.reorderTab("src/a.ts", 2)
    const noop = commands.reorderTab("src/b.ts", 0)
    const missing = commands.reorderTab("src/missing.ts", 1)

    expect(reordered).toBe(true)
    expect(noop).toBe(false)
    expect(missing).toBe(false)
    expect(workspaceStore.getState().openFilePaths).toEqual([
      "src/b.ts",
      "src/c.ts",
      "src/a.ts",
    ])
    expect(workspaceStore.getState().selectedFilePath).toBe("src/b.ts")
    expect(workspaceStore.getState().editorHistory).toEqual([
      "src/b.ts",
      "src/a.ts",
    ])
    expect(workspaceStore.getState().recentlyClosedEditorPaths).toEqual([
      "src/old.ts",
    ])
    expect(documentStore.getState().dirtyFilePaths.has("src/a.ts")).toBe(true)
  })

  it("renames tabs, cached documents, dirty markers, and LSP targets", () => {
    const { commands, documentStore, uiStore, workspaceStore } = setupStores(
      workspaceState(["src/old.ts"], "src/old.ts")
    )
    documentStore.getState().ensureCachedEditorDocument(file("src/old.ts", "a"))
    documentStore.getState().setCachedEditorDocumentDirty("src/old.ts", true)
    uiStore.getState().setDefinitionTarget(definitionTarget("src/old.ts"))
    uiStore
      .getState()
      .setLanguageServerReferences(referencesResult("src/old.ts"))

    const result = commands.renameCachedEditorDocument(
      "src/old.ts",
      "src/new.ts"
    )

    expect(result.wasDirty).toBe(true)
    expect(workspaceStore.getState().openFilePaths).toEqual(["src/new.ts"])
    expect(workspaceStore.getState().selectedFilePath).toBe("src/new.ts")
    expect(workspaceStore.getState().editorHistory).toEqual(["src/new.ts"])
    expect(documentStore.getState().dirtyFilePaths.has("src/old.ts")).toBe(
      false
    )
    expect(documentStore.getState().dirtyFilePaths.has("src/new.ts")).toBe(true)
    expect(
      documentStore.getState().getCachedEditorDocument("src/new.ts")?.path
    ).toBe("src/new.ts")
    expect(uiStore.getState().definitionTarget?.path).toBe("src/new.ts")
    expect(
      uiStore.getState().languageServerReferences?.targets[0]?.path
    ).toBe("src/new.ts")
  })

  it("resets workspace, document, and ui state for a picked root folder", () => {
    const { commands, documentStore, uiStore, workspaceStore } = setupStores(
      workspaceState(["src/a.ts"], "src/a.ts")
    )
    documentStore.getState().ensureCachedEditorDocument(file("src/a.ts", "a"))
    uiStore.getState().setDefinitionTarget(definitionTarget("src/a.ts"))
    uiStore
      .getState()
      .setLanguageServerReferences(referencesResult("src/a.ts"))

    commands.pickRootFolder(rootFolder("/repo"))

    expect(workspaceStore.getState().rootFolder?.path).toBe("/repo")
    expect(workspaceStore.getState().openFilePaths).toEqual([])
    expect(workspaceStore.getState().selectedFilePath).toBe(null)
    expect(workspaceStore.getState().editorHistory).toEqual([])
    expect(workspaceStore.getState().gitPanelOpen).toBe(true)
    expect(workspaceStore.getState().recentlyClosedEditorPaths).toEqual([])
    expect(workspaceStore.getState().sidebarVisible).toBe(true)
    expect(workspaceStore.getState().workspacePanelTab).toBe("files")
    expect(documentStore.getState().dirtyFilePaths).toEqual(new Set())
    expect(documentStore.getState().fallbackDocumentPath).toBe(null)
    expect(uiStore.getState().definitionTarget).toBe(null)
    expect(uiStore.getState().languageServerReferences).toBe(null)
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
    editorHistory: selectedFilePath ? [selectedFilePath] : [],
    gitPanelOpen: true,
    openFilePaths,
    recentlyClosedEditorPaths: [],
    rootFolder: rootFolder(""),
    selectedFilePath,
    sidebarVisible: true,
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

function definitionTarget(path: string): LanguageServerDefinitionTarget {
  return {
    path,
    range: {
      end: { character: 1, line: 1 },
      start: { character: 0, line: 1 },
    },
    uri: `file://${path}`,
  }
}

function referencesResult(path: string): LanguageServerReferencesResult {
  return {
    targets: [definitionTarget(path)],
    uri: `file://${path}`,
  }
}
