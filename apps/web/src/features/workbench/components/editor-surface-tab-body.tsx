import { useCallback, useEffect, useMemo } from 'react'

import {
  joinedEditorRenderDocument,
  readyFile,
} from '@/components/workspace/diff/utils/editor-render-document-utils'
import { useConflictEditorResolution } from '@/components/workspace/diff/hooks/use-conflict-editor-resolution'
import { parseConflictDiffDocumentId } from '@/features/editor/conflict-diff-document'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { useEditorDocumentState } from '@/features/editor/state/editor-document-state'
import { useEditorUiState } from '@/features/editor/state/editor-ui-state'
import { FileEditorBody } from '@/features/workbench/components/file-editor-body'
import { useSelectedFile } from '@/hooks/use-selected-file'
import type { DocumentSessionChange, EditorKeymapLayer } from '@editor/core'
import type { LanguageServerReferencesResult } from '@editor/lsp-plugin'

export function EditorSurfaceTabBody({
  active,
  editorKeymapLayers,
  path,
  rootPath,
  tabId,
}: {
  active: boolean
  editorKeymapLayers: readonly EditorKeymapLayer[]
  path: string
  rootPath: string
  tabId: string
}) {
  const selectedConflictDiff = useMemo(() => parseConflictDiffDocumentId(path), [path])
  const { fileState } = useSelectedFile(selectedConflictDiff ? null : path)
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
  const definitionTarget = useEditorUiState((state) => state.definitionTarget)
  const languageServerReferences = useEditorUiState((state) => state.languageServerReferences)
  const setLanguageServerReferences = useEditorUiState((state) => state.setLanguageServerReferences)
  const clearStatusBarSource = useEditorUiState((state) => state.clearStatusBarSource)
  const setStatusBarSource = useEditorUiState((state) => state.setStatusBarSource)
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

  useEffect(() => {
    if (!selectedConflictDiff) return
    if (!getLiveEditorDocument(path)) return

    ensureEditorViewForDocument(tabId, path)
  }, [ensureEditorViewForDocument, getLiveEditorDocument, path, selectedConflictDiff, tabId])

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

  return (
    <FileEditorBody
      active={active}
      liveDocument={selectedLiveDocument}
      definitionTarget={active ? definitionTarget : null}
      editorKeymapLayers={editorKeymapLayers}
      fileState={fileState}
      languageServerReferences={active ? languageServerReferences : null}
      rootPath={rootPath}
      tabId={tabId}
      onEditorDirtyChange={setLiveEditorDocumentDirty}
      onEditorScrollPositionChange={setEditorViewScrollPosition}
      onEditorStatusSourceChange={setStatusBarSource}
      onEditorTextChange={handleEditorTextChange}
      onOpenDefinition={openDefinition}
      onOpenReferences={handleOpenReferences}
      onReferencesClose={() => setLanguageServerReferences(null)}
    />
  )
}
