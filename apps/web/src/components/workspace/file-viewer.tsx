import { WarningCircleIcon } from "@phosphor-icons/react"
import { useEffect, useMemo } from "react"

import { Editor } from "@/features/editor/components/editor"
import { useEditorCommands } from "@/features/editor/state/editor-commands"
import {
  type CachedEditorDocument,
  useEditorDocumentState,
} from "@/features/editor/state/editor-document-state"
import type { EditorStatusBarState } from "@/features/editor/components/editor-status-bar"
import { useEditorUiState } from "@/features/editor/state/editor-ui-state"
import { useEditorWorkspaceState } from "@/features/editor/state/editor-workspace-state"
import { EditorTabBar } from "@/components/workspace/editor-tab-bar"
import { GitDiffViewer } from "@/features/git/components/diff-viewer"
import { parseDiffDocumentId } from "@/features/git/diff-document"
import { useDiffDocumentDiff } from "@/features/git/hooks"
import type { FileResult } from "@/lib/file-system-types"
import type { LoadState } from "@/lib/load-state"
import type { TypeScriptLspDefinitionTarget } from "@editor/typescript-lsp"

export function FileViewer({
  fileState,
  rootPath,
}: {
  fileState: LoadState<FileResult>
  rootPath: string
}) {
  const definitionTarget = useEditorUiState((state) => state.definitionTarget)
  const documentCacheVersion = useEditorDocumentState(
    (state) => state.documentCacheVersion
  )
  const diffViewMode = useEditorWorkspaceState((state) => state.diffViewMode)
  const ensureCachedEditorDocument = useEditorDocumentState(
    (state) => state.ensureCachedEditorDocument
  )
  const fallbackDocumentPath = useEditorDocumentState(
    (state) => state.fallbackDocumentPath
  )
  const getCachedEditorDocument = useEditorDocumentState(
    (state) => state.getCachedEditorDocument
  )
  const selectedFilePath = useEditorWorkspaceState(
    (state) => state.selectedFilePath
  )
  const setCachedEditorDocumentDirty = useEditorDocumentState(
    (state) => state.setCachedEditorDocumentDirty
  )
  const setCachedEditorDocumentScrollPosition = useEditorDocumentState(
    (state) => state.setCachedEditorDocumentScrollPosition
  )
  const setDiffViewMode = useEditorWorkspaceState(
    (state) => state.setDiffViewMode
  )
  const setStatusBarState = useEditorUiState((state) => state.setStatusBarState)
  const { openDefinition } = useEditorCommands()
  const selectedDiff = useMemo(
    () => parseDiffDocumentId(selectedFilePath),
    [selectedFilePath]
  )
  const selectedFile = selectedDiff ? null : readyFile(fileState)
  const selectedDiffQuery = useDiffDocumentDiff(selectedDiff)
  const selectedCachedDocument =
    selectedFilePath && documentCacheVersion >= 0
      ? getCachedEditorDocument(selectedFilePath)
      : null
  const fallbackDocument =
    fallbackDocumentPath && documentCacheVersion >= 0
      ? getCachedEditorDocument(fallbackDocumentPath)
      : null
  const visibleDocument =
    selectedCachedDocument ??
    (fileState.status === "error" ? null : fallbackDocument)

  useEffect(() => {
    if (!selectedFile) return

    ensureCachedEditorDocument(selectedFile, selectedFilePath)
  }, [ensureCachedEditorDocument, selectedFile, selectedFilePath])

  useEffect(() => {
    if (selectedDiff) {
      setStatusBarState(null)
      return
    }
    if (selectedFilePath && selectedCachedDocument) return
    if (selectedFilePath && fileState.status === "ready") return

    setStatusBarState(null)
  }, [
    fileState.status,
    selectedDiff,
    selectedCachedDocument,
    selectedFilePath,
    setStatusBarState,
  ])

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <EditorTabBar
        diffViewMode={selectedDiff ? diffViewMode : null}
        rootPath={rootPath}
        onDiffViewModeChange={setDiffViewMode}
      />
      {selectedFilePath ? (
        selectedDiff ? (
          <GitDiffViewer
            diff={selectedDiffQuery.data?.[0] ?? null}
            error={selectedDiffQuery.error}
            isError={selectedDiffQuery.isError}
            isPending={selectedDiffQuery.isPending}
            mode={diffViewMode}
            path={selectedDiff.path}
          />
        ) : (
          <FileViewerBody
            cachedDocument={visibleDocument}
            definitionTarget={definitionTarget}
            fileState={fileState}
            rootPath={rootPath}
            onEditorDirtyChange={setCachedEditorDocumentDirty}
            onEditorScrollPositionChange={setCachedEditorDocumentScrollPosition}
            onEditorStatusChange={setStatusBarState}
            onOpenDefinition={openDefinition}
          />
        )
      ) : (
        <FileViewerEmpty />
      )}
    </section>
  )
}

function FileViewerEmpty() {
  return <section className="min-h-[320px]" />
}

function FileViewerBody({
  cachedDocument,
  definitionTarget,
  fileState,
  rootPath,
  onEditorDirtyChange,
  onEditorScrollPositionChange,
  onEditorStatusChange,
  onOpenDefinition,
}: {
  cachedDocument: CachedEditorDocument | null
  definitionTarget: TypeScriptLspDefinitionTarget | null
  fileState: LoadState<FileResult>
  rootPath: string
  onEditorDirtyChange?: (path: string, dirty: boolean) => void
  onEditorScrollPositionChange: (
    path: string,
    scrollPosition: NonNullable<CachedEditorDocument["scrollPosition"]>
  ) => void
  onEditorStatusChange: (status: EditorStatusBarState | null) => void
  onOpenDefinition: (target: TypeScriptLspDefinitionTarget) => void | boolean
}) {
  if (cachedDocument) {
    return (
      <Editor
        definitionTarget={definitionTarget}
        document={cachedDocument}
        rootPath={rootPath}
        onDirtyChange={onEditorDirtyChange}
        onScrollPositionChange={onEditorScrollPositionChange}
        onStatusChange={onEditorStatusChange}
        onOpenDefinition={onOpenDefinition}
      />
    )
  }

  if (fileState.status === "error") {
    return (
      <div className="flex min-h-0 items-center justify-center p-6 text-xs text-muted-foreground">
        <WarningCircleIcon className="mr-2 size-4" />
        {fileState.message}
      </div>
    )
  }

  return null
}

function readyFile(fileState: LoadState<FileResult>) {
  if (fileState.status !== "ready") return null

  return fileState.data
}
