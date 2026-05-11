import { WarningCircleIcon } from "@phosphor-icons/react"
import { useCallback, useEffect, useMemo, useRef } from "react"

import { Editor } from "@/features/editor/components/editor"
import { parseConflictDiffDocumentId } from "@/features/editor/conflict-diff-document"
import { useEditorCommands } from "@/features/editor/state/editor-commands"
import {
  useEditorConflictStoreApi,
  type FilesystemConflict,
} from "@/features/editor/state/editor-conflict-state"
import {
  type CachedEditorDocument,
  useEditorDocumentState,
} from "@/features/editor/state/editor-document-state"
import type { EditorStatusBarState } from "@/features/editor/components/editor-status-bar"
import { useEditorUiState } from "@/features/editor/state/editor-ui-state"
import { useEditorWorkspaceState } from "@/features/editor/state/editor-workspace-state"
import { EditorTabBar } from "@/components/workspace/editor-tab-bar"
import {
  GitDiffViewer,
  type GitDiffViewerHandle,
} from "@/features/git/components/diff-viewer"
import { parseDiffDocumentId } from "@/features/git/diff-document"
import { useDiffDocumentDiff } from "@/features/git/hooks"
import { SearchBufferEditor } from "@/features/search/search-buffer-editor"
import { parseSearchBufferDocumentId } from "@/features/search/search-buffer-document"
import { reportError, toClientError } from "@/lib/client-error-taxonomy"
import {
  createFileContent,
  ensureFolderPath,
  fetchFile,
  writeFileContent,
} from "@/lib/file-server"
import type { FileResult } from "@/lib/file-system-types"
import { fileSystemKeys } from "@/lib/query-keys"
import type { LoadState } from "@/lib/load-state"
import { parseMergeConflicts } from "@editor/core"
import type { EditorKeyBinding } from "@editor/core"
import type { TypeScriptLspDefinitionTarget } from "@editor/typescript-lsp"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

export function FileViewer({
  editorKeyBindings,
  fileState,
  rootPath,
}: {
  editorKeyBindings: readonly EditorKeyBinding[]
  fileState: LoadState<FileResult>
  rootPath: string
}) {
  const definitionTarget = useEditorUiState((state) => state.definitionTarget)
  const diffViewerRef = useRef<GitDiffViewerHandle | null>(null)
  const documents = useEditorDocumentState((state) => state.documents)
  const diffViewMode = useEditorWorkspaceState((state) => state.diffViewMode)
  const ensureCachedEditorDocument = useEditorDocumentState(
    (state) => state.ensureCachedEditorDocument
  )
  const fallbackDocumentPath = useEditorDocumentState(
    (state) => state.fallbackDocumentPath
  )
  const scrollPositionByPath = useEditorDocumentState(
    (state) => state.scrollPositionByPath
  )
  const selectedFilePath = useEditorWorkspaceState(
    (state) => state.selectedFilePath
  )
  const setCachedEditorDocumentDirty = useEditorDocumentState(
    (state) => state.setCachedEditorDocumentDirty
  )
  const forceReplaceCachedEditorDocument = useEditorDocumentState(
    (state) => state.forceReplaceCachedEditorDocument
  )
  const setCachedEditorDocumentScrollPosition = useEditorDocumentState(
    (state) => state.setCachedEditorDocumentScrollPosition
  )
  const setDiffViewMode = useEditorWorkspaceState(
    (state) => state.setDiffViewMode
  )
  const setStatusBarState = useEditorUiState((state) => state.setStatusBarState)
  const {
    discardCachedEditorDocument,
    openDefinition,
    renameCachedEditorDocument,
  } = useEditorCommands()
  const resolveConflictEditorDocument = useConflictEditorResolution({
    discardCachedEditorDocument,
    forceReplaceCachedEditorDocument,
    renameCachedEditorDocument,
  })
  const selectedDiff = useMemo(
    () => parseDiffDocumentId(selectedFilePath),
    [selectedFilePath]
  )
  const selectedConflictDiff = useMemo(
    () => parseConflictDiffDocumentId(selectedFilePath),
    [selectedFilePath]
  )
  const selectedSearchBuffer = useMemo(
    () => parseSearchBufferDocumentId(selectedFilePath),
    [selectedFilePath]
  )
  const selectedFile =
    selectedDiff || selectedConflictDiff || selectedSearchBuffer
      ? null
      : readyFile(fileState)
  const selectedDiffQuery = useDiffDocumentDiff(selectedDiff)
  const selectedCachedDocument = selectedFilePath
    ? documentWithScroll(documents[selectedFilePath], scrollPositionByPath)
    : null
  const fallbackDocument = fallbackDocumentPath
    ? documentWithScroll(documents[fallbackDocumentPath], scrollPositionByPath)
    : null
  const visibleDocument =
    selectedCachedDocument ??
    (fileState.status === "error" ? null : fallbackDocument)

  function handleRevealPreviousChange() {
    diffViewerRef.current?.revealPreviousHunk({ wrap: true })
  }

  function handleRevealNextChange() {
    diffViewerRef.current?.revealNextHunk({ wrap: true })
  }

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
        onRevealNextChange={handleRevealNextChange}
        onRevealPreviousChange={handleRevealPreviousChange}
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
            ref={diffViewerRef}
          />
        ) : selectedSearchBuffer ? (
          <SearchBufferEditor rootPath={selectedSearchBuffer.rootPath} />
        ) : (
          <FileViewerBody
            cachedDocument={visibleDocument}
            definitionTarget={definitionTarget}
            editorKeyBindings={editorKeyBindings}
            fileState={fileState}
            rootPath={rootPath}
            onEditorDirtyChange={setCachedEditorDocumentDirty}
            onEditorScrollPositionChange={setCachedEditorDocumentScrollPosition}
            onEditorStatusChange={setStatusBarState}
            onEditorTextChange={resolveConflictEditorDocument}
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
  editorKeyBindings,
  fileState,
  rootPath,
  onEditorDirtyChange,
  onEditorScrollPositionChange,
  onEditorStatusChange,
  onEditorTextChange,
  onOpenDefinition,
}: {
  cachedDocument: CachedEditorDocument | null
  definitionTarget: TypeScriptLspDefinitionTarget | null
  editorKeyBindings: readonly EditorKeyBinding[]
  fileState: LoadState<FileResult>
  rootPath: string
  onEditorDirtyChange?: (path: string, dirty: boolean) => void
  onEditorScrollPositionChange: (
    path: string,
    scrollPosition: NonNullable<CachedEditorDocument["scrollPosition"]>
  ) => void
  onEditorStatusChange: (status: EditorStatusBarState | null) => void
  onEditorTextChange?: (path: string, text: string) => void
  onOpenDefinition: (target: TypeScriptLspDefinitionTarget) => void | boolean
}) {
  if (cachedDocument) {
    return (
      <Editor
        definitionTarget={definitionTarget}
        document={cachedDocument}
        keymapBindings={editorKeyBindings}
        rootPath={rootPath}
        onDirtyChange={onEditorDirtyChange}
        onScrollPositionChange={onEditorScrollPositionChange}
        onStatusChange={onEditorStatusChange}
        onTextChange={onEditorTextChange}
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

function documentWithScroll(
  document: CachedEditorDocument | undefined,
  scrollPositionByPath: Readonly<
    Record<string, NonNullable<CachedEditorDocument["scrollPosition"]>>
  >
) {
  if (!document) return null

  const scrollPosition = scrollPositionByPath[document.path]
  if (scrollPosition === undefined) return document

  return { ...document, scrollPosition }
}

function useConflictEditorResolution({
  discardCachedEditorDocument,
  forceReplaceCachedEditorDocument,
  renameCachedEditorDocument,
}: {
  discardCachedEditorDocument: (path: string) => { wasDirty: boolean }
  forceReplaceCachedEditorDocument: (file: FileResult) => { wasDirty: boolean }
  renameCachedEditorDocument: (
    from: string,
    to: string
  ) => { wasDirty: boolean }
}) {
  const conflictStore = useEditorConflictStoreApi()
  const queryClient = useQueryClient()
  const resolvingConflictIds = useRef(new Set<string>())

  return useCallback(
    (path: string, text: string) => {
      const conflictDiff = parseConflictDiffDocumentId(path)
      if (!conflictDiff) return
      if (parseMergeConflicts(text).length > 0) return

      const conflict =
        conflictStore.getState().conflicts[conflictDiff.conflictId]
      if (!conflict) return
      if (resolvingConflictIds.current.has(conflict.id)) return

      resolvingConflictIds.current.add(conflict.id)
      void applyConflictEditorResolution(conflict, text, {
        conflictStore,
        discardCachedEditorDocument,
        forceReplaceCachedEditorDocument,
        queryClient,
        renameCachedEditorDocument,
      })
        .catch((error: unknown) => {
          reportError(toClientError(error))
        })
        .finally(() => {
          resolvingConflictIds.current.delete(conflict.id)
        })
    },
    [
      conflictStore,
      discardCachedEditorDocument,
      forceReplaceCachedEditorDocument,
      queryClient,
      renameCachedEditorDocument,
    ]
  )
}

async function applyConflictEditorResolution(
  conflict: FilesystemConflict,
  resolvedText: string,
  context: ConflictEditorResolutionContext
) {
  if (conflict.eventType === "deleted") {
    await ensureFolderPath(parentPath(conflict.remotePath))
    await createFileContent(conflict.remotePath, resolvedText)
  } else {
    await writeFileContent(
      conflict.remotePath,
      resolvedText,
      conflict.remoteMtimeMs
    )
  }

  const file = await fetchFile(
    conflict.remotePath,
    new AbortController().signal
  )
  replaceResolvedConflictFile(conflict.localPath, file, context)
  finishEditorResolvedConflict(conflict, context)
}

type ConflictEditorResolutionContext = {
  conflictStore: ReturnType<typeof useEditorConflictStoreApi>
  discardCachedEditorDocument: (path: string) => { wasDirty: boolean }
  forceReplaceCachedEditorDocument: (file: FileResult) => { wasDirty: boolean }
  queryClient: ReturnType<typeof useQueryClient>
  renameCachedEditorDocument: (
    from: string,
    to: string
  ) => { wasDirty: boolean }
}

function replaceResolvedConflictFile(
  localPath: string,
  file: FileResult,
  context: ConflictEditorResolutionContext
) {
  if (localPath !== file.path) {
    context.renameCachedEditorDocument(localPath, file.path)
    moveFileQueryData(context.queryClient, localPath, file.path)
  }

  context.queryClient.setQueryData(fileSystemKeys.file(file.path), file)
  context.forceReplaceCachedEditorDocument(file)
}

function finishEditorResolvedConflict(
  conflict: FilesystemConflict,
  context: ConflictEditorResolutionContext
) {
  if (conflict.diffDocumentId) {
    context.discardCachedEditorDocument(conflict.diffDocumentId)
  }
  if (conflict.toastId) toast.dismiss(conflict.toastId)

  context.conflictStore.getState().removeConflict(conflict.id)
}

function moveFileQueryData(
  queryClient: ReturnType<typeof useQueryClient>,
  from: string,
  to: string
) {
  const file = queryClient.getQueryData<FileResult>(fileSystemKeys.file(from))
  queryClient.removeQueries({
    exact: true,
    queryKey: fileSystemKeys.file(from),
  })
  if (!file) return

  queryClient.setQueryData(fileSystemKeys.file(to), { ...file, path: to })
}

function parentPath(path: string) {
  const index = path.lastIndexOf("/")
  if (index < 0) return ""

  return path.slice(0, index)
}
