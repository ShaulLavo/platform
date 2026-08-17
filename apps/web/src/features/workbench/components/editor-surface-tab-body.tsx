import { useCallback, useEffect, useMemo } from 'react'

import {
  joinedEditorRenderDocument,
  readyFile,
} from '@/components/workspace/diff/utils/editor-render-document-utils'
import { useConflictEditorResolution } from '@/components/workspace/diff/hooks/use-conflict-editor-resolution'
import { SearchPane } from '@/components/workspace/search/components/search-pane'
import { parseConflictDiffDocumentId } from '@/features/editor/utils/conflict-diff-document'
import { useEditorCommands } from '@/features/editor/state/commands'
import { useEditorDocumentState } from '@/features/editor/state/document-state'
import { useEditorUiState, useEditorUiStoreApi } from '@/features/editor/state/ui-state'
import { FileEditorBody } from '@/features/workbench/components/file-editor-body'
import {
  EditorSurfaceActionsContext,
  type EditorSurfaceActions,
} from '@/features/workbench/providers/editor-surface-actions-context'
import { parseRefDocumentId } from '@/features/git/utils/ref-document'
import { parseSearchBufferDocumentId } from '@/features/search/utils/buffer-document'
import { SettingsPage } from '@/features/settings/components/page'
import { isSettingsDocumentId } from '@/features/settings/utils/document'
import { useSelectedFile } from '@/hooks/use-selected-file'
import type { DocumentSessionChange, EditorKeymapLayer } from '@singapor/core'
import type {
  LanguageServerDefinitionTarget,
  LanguageServerReferencesResult,
} from '@singapor/lsp-plugin'

export function EditorSurfaceTabBody({
  active,
  definitionTarget,
  editorKeymapLayers,
  path,
  rootPath,
  tabId,
}: {
  active: boolean
  definitionTarget?: LanguageServerDefinitionTarget
  editorKeymapLayers: readonly EditorKeymapLayer[]
  path: string
  rootPath: string
  tabId: string
}) {
  const selectedConflictDiff = useMemo(() => parseConflictDiffDocumentId(path), [path])
  const selectedSearchBuffer = useMemo(() => parseSearchBufferDocumentId(path), [path])
  const selectedRefDocument = useMemo(() => parseRefDocumentId(path), [path])
  const { fileState } = useSelectedFile(
    selectedConflictDiff || selectedSearchBuffer || selectedRefDocument ? null : path,
  )
  const selectedViewDocumentId = useEditorDocumentState(
    (state) => state.viewsByTabId[tabId]?.documentId ?? null,
  )
  const selectedViewSession = useEditorDocumentState(
    (state) => state.viewsByTabId[tabId]?.view ?? null,
  )
  const selectedDocumentBuffer = useEditorDocumentState((state) =>
    selectedViewDocumentId
      ? (state.liveDocumentsById[selectedViewDocumentId]?.buffer ?? null)
      : null,
  )
  const selectedDocumentPath = useEditorDocumentState((state) =>
    selectedViewDocumentId ? (state.liveDocumentsById[selectedViewDocumentId]?.path ?? null) : null,
  )
  const selectedLiveDocument = useMemo(
    () =>
      joinedEditorRenderDocument({
        buffer: selectedDocumentBuffer,
        documentId: selectedViewDocumentId,
        path: selectedDocumentPath,
        view: selectedViewSession,
      }),
    [selectedDocumentBuffer, selectedDocumentPath, selectedViewDocumentId, selectedViewSession],
  )
  const ensureEditorView = useEditorDocumentState((state) => state.ensureEditorView)
  const ensureEditorViewForDocument = useEditorDocumentState(
    (state) => state.ensureEditorViewForDocument,
  )
  const getLiveEditorDocument = useEditorDocumentState((state) => state.getLiveEditorDocument)
  const setLiveEditorDocumentDirty = useEditorDocumentState(
    (state) => state.setLiveEditorDocumentDirty,
  )
  const recordLiveEditorDocumentTextChange = useEditorDocumentState(
    (state) => state.recordLiveEditorDocumentTextChange,
  )
  const forceReplaceLiveEditorDocument = useEditorDocumentState(
    (state) => state.forceReplaceLiveEditorDocument,
  )
  const setEditorViewScrollPosition = useEditorDocumentState(
    (state) => state.setEditorViewScrollPosition,
  )
  const uiDefinitionTarget = useEditorUiState((state) => state.definitionTarget)
  const languageServerReferences = useEditorUiState((state) => state.languageServerReferences)
  const setLanguageServerReferences = useEditorUiState((state) => state.setLanguageServerReferences)
  const clearStatusBarSource = useEditorUiState((state) => state.clearStatusBarSource)
  const setStatusBarSource = useEditorUiState((state) => state.setStatusBarSource)
  const uiStore = useEditorUiStoreApi()
  const { discardLiveEditorDocument, openDefinition, renameLiveEditorDocument } =
    useEditorCommands()
  const resolveConflictEditorDocument = useConflictEditorResolution({
    discardLiveEditorDocument,
    forceReplaceLiveEditorDocument,
    renameLiveEditorDocument,
  })
  const selectedFile = selectedConflictDiff ? null : readyFile(fileState)

  useEffect(() => {
    if (!selectedFile) return

    ensureEditorView(tabId, selectedFile)
  }, [ensureEditorView, selectedFile, tabId])

  // Conflict and git-ref tabs both own an unsynced document rather than a file, so they attach a
  // view by document id instead of going through the file path.
  useEffect(() => {
    if (!selectedConflictDiff && !selectedRefDocument) return
    if (!getLiveEditorDocument(path)) return

    ensureEditorViewForDocument(tabId, path)
  }, [
    ensureEditorViewForDocument,
    getLiveEditorDocument,
    path,
    selectedConflictDiff,
    selectedRefDocument,
    tabId,
  ])

  useEffect(() => {
    if (!active) return
    if (path && selectedLiveDocument) return
    if (path && fileState.status === 'ready') return

    clearStatusBarSource()
  }, [active, clearStatusBarSource, fileState.status, path, selectedLiveDocument])

  const handleEditorTextChange = useCallback(
    (_sourceTabId: string, changedPath: string, change: DocumentSessionChange) => {
      recordLiveEditorDocumentTextChange(changedPath)
      resolveConflictEditorDocument(changedPath, change.textSnapshot)
    },
    [recordLiveEditorDocumentTextChange, resolveConflictEditorDocument],
  )
  const handleOpenReferences = useCallback(
    (result: LanguageServerReferencesResult) => {
      setLanguageServerReferences(result)
      return true
    },
    [setLanguageServerReferences],
  )
  const handlePreviewDefinition = useCallback(
    (target: LanguageServerDefinitionTarget) => {
      uiStore.getState().setDefinitionTarget(target)
    },
    [uiStore],
  )
  const handleCloseReferences = useCallback(
    () => setLanguageServerReferences(null),
    [setLanguageServerReferences],
  )
  // This is a bound workbench action surface; Editor still receives explicit plugin callbacks.
  const editorSurfaceActions = useMemo<EditorSurfaceActions>(
    () => ({
      closeReferences: handleCloseReferences,
      openDefinition,
      openReferences: handleOpenReferences,
      previewReference: handlePreviewDefinition,
      recordTextChange: handleEditorTextChange,
      setDirtyState: setLiveEditorDocumentDirty,
      setScrollPosition: (scrollPosition) => setEditorViewScrollPosition(tabId, scrollPosition),
      setStatusSource: setStatusBarSource,
    }),
    [
      handleCloseReferences,
      handleEditorTextChange,
      handleOpenReferences,
      handlePreviewDefinition,
      openDefinition,
      setEditorViewScrollPosition,
      setLiveEditorDocumentDirty,
      setStatusBarSource,
      tabId,
    ],
  )

  // Before the file paths: a settings tab has no document, no language server
  // and nothing to save, so falling through to the editor machinery would only
  // give it a spinner for a file that does not exist.
  if (isSettingsDocumentId(path)) return <SettingsPage />

  if (selectedSearchBuffer) {
    return (
      <SearchPane
        compact={false}
        editorKeymapLayers={editorKeymapLayers}
        rootPath={selectedSearchBuffer.rootPath}
      />
    )
  }

  return (
    <EditorSurfaceActionsContext value={editorSurfaceActions}>
      <FileEditorBody
        active={active}
        liveDocument={selectedLiveDocument}
        definitionTarget={definitionTarget ?? (active ? uiDefinitionTarget : null)}
        editorKeymapLayers={editorKeymapLayers}
        fileState={fileState}
        languageServerReferences={active ? languageServerReferences : null}
        path={path}
        rootPath={rootPath}
        tabId={tabId}
      />
    </EditorSurfaceActionsContext>
  )
}
