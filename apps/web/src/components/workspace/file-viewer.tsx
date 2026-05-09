import { CircleNotchIcon, WarningCircleIcon } from "@phosphor-icons/react"
import { useEffect } from "react"

import { Editor } from "@/components/editor"
import {
  type CachedEditorDocument,
  useEditorState,
} from "@/components/editor/editor-state"
import type { EditorStatusBarState } from "@/components/editor/editor-status-bar"
import { EditorTabBar } from "@/components/workspace/editor-tab-bar"
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
  const ensureCachedEditorDocument = useEditorState(
    (state) => state.ensureCachedEditorDocument
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
  const setStatusBarState = useEditorState((state) => state.setStatusBarState)
  const openDefinition = useEditorState((state) => state.openDefinition)
  const selectedFile = selectedReadyFile(fileState, selectedFilePath)
  const cachedDocument =
    selectedFilePath && documentCacheVersion >= 0
      ? getCachedEditorDocument(selectedFilePath)
      : null

  useEffect(() => {
    if (!selectedFile) return

    ensureCachedEditorDocument(selectedFile)
  }, [ensureCachedEditorDocument, selectedFile])

  useEffect(() => {
    if (selectedFilePath && cachedDocument) return
    if (selectedFilePath && fileState.status === "ready") return

    setStatusBarState(null)
  }, [cachedDocument, fileState.status, selectedFilePath, setStatusBarState])

  return (
    <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <EditorTabBar />
      {selectedFilePath ? (
        <FileViewerBody
          cachedDocument={cachedDocument}
          definitionTarget={definitionTarget}
          fileState={fileState}
          rootPath={rootPath}
          onEditorDirtyChange={setCachedEditorDocumentDirty}
          onEditorScrollPositionChange={setCachedEditorDocumentScrollPosition}
          onEditorStatusChange={setStatusBarState}
          onOpenDefinition={openDefinition}
        />
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
  onEditorDirtyChange: (path: string, dirty: boolean) => void
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

  if (fileState.status === "loading") {
    return (
      <div className="flex min-h-0 items-center justify-center p-6 text-xs text-muted-foreground">
        <CircleNotchIcon className="mr-2 size-4 animate-spin" />
        Loading file
      </div>
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
  if (fileState.status !== "ready") return null

  return <FileViewerLoading />
}

function FileViewerLoading() {
  return (
    <div className="flex min-h-0 items-center justify-center p-6 text-xs text-muted-foreground">
      <CircleNotchIcon className="mr-2 size-4 animate-spin" />
      Loading file
    </div>
  )
}

function selectedReadyFile(
  fileState: LoadState<FileResult>,
  selectedFilePath: string | null
) {
  if (fileState.status !== "ready") return null
  if (fileState.data.path !== selectedFilePath) return null

  return fileState.data
}
