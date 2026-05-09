import { WarningCircleIcon } from "@phosphor-icons/react"
import { useEffect, useMemo } from "react"

import { Editor } from "@/components/editor"
import {
  type CachedEditorDocument,
  useEditorState,
} from "@/components/editor/editor-state"
import type { EditorStatusBarState } from "@/components/editor/editor-status-bar"
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
  const definitionTarget = useEditorState((state) => state.definitionTarget)
  const documentCacheVersion = useEditorState(
    (state) => state.documentCacheVersion
  )
  const diffViewMode = useEditorState((state) => state.diffViewMode)
  const ensureCachedEditorDocument = useEditorState(
    (state) => state.ensureCachedEditorDocument
  )
  const fallbackDocumentPath = useEditorState(
    (state) => state.fallbackDocumentPath
  )
  const getCachedEditorDocument = useEditorState(
    (state) => state.getCachedEditorDocument
  )
  const selectedFilePath = useEditorState((state) => state.selectedFilePath)
  const setCachedEditorDocumentDirty = useEditorState(
    (state) => state.setCachedEditorDocumentDirty
  )
  const setCachedEditorDocumentScrollPosition = useEditorState(
    (state) => state.setCachedEditorDocumentScrollPosition
  )
  const setDiffViewMode = useEditorState((state) => state.setDiffViewMode)
  const setStatusBarState = useEditorState((state) => state.setStatusBarState)
  const openDefinition = useEditorState((state) => state.openDefinition)
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

    ensureCachedEditorDocument(selectedFile)
  }, [ensureCachedEditorDocument, selectedFile])

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
