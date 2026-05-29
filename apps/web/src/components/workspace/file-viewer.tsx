import { WarningCircleIcon } from '@phosphor-icons/react'
import {
  createContext,
  useCallback,
  use,
  useEffect,
  memo,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'

import { EditorTabBar } from '@/components/workspace/editor-tab-bar'
import {
  hasEditorTabDragPayload,
  readEditorTabDragPayload,
} from '@/components/workspace/use-editor-tab-drag'
import { Editor } from '@/features/editor/components/editor'
import { LanguageServerReferencesPane } from '@/features/editor/components/language-server-references-pane'
import { parseConflictDiffDocumentId } from '@/features/editor/conflict-diff-document'
import type { EditorStatusBarSource } from '@/features/editor/state/editor-status-bar-source'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import {
  activeTabForPane,
  canSplitEditorPaneAtPane,
  canSplitEditorPaneAtRoot,
  editorPaneTabs,
  updateEditorPaneSplitSizes,
  type EditorPaneDropZone,
  type EditorPaneLeaf,
  type EditorPaneLayout,
  type EditorPaneNode,
  type EditorPaneSplit,
  type EditorPaneSplitScope,
} from '@/features/editor/state/editor-pane-state'
import {
  useEditorConflictStoreApi,
  type FilesystemConflict,
} from '@/features/editor/state/editor-conflict-state'
import type { EditorRenderDocument } from '@/features/editor/editor-render-document'
import { useEditorDocumentState } from '@/features/editor/state/editor-document-state'
import { useEditorUiState } from '@/features/editor/state/editor-ui-state'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import { GitDiffViewer, type GitDiffViewerHandle } from '@/features/git/components/diff-viewer'
import { parseDiffDocumentId } from '@/features/git/diff-document'
import { useDiffDocumentDiff } from '@/features/git/hooks'
import { SearchBufferEditor } from '@/features/search/search-buffer-editor'
import { parseSearchBufferDocumentId } from '@/features/search/search-buffer-document'
import { useSelectedFile } from '@/hooks/use-selected-file'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import { setFileSnapshotQueryData } from '@/lib/file-snapshot-query-cache'
import { createFileContent, ensureFolderPath, fetchFile, writeFileContent } from '@/lib/file-server'
import type { FileResult } from '@/lib/file-system-types'
import { fileSystemKeys } from '@/lib/query-keys'
import { clientErrors } from '@/lib/structured-errors'
import type { LoadState } from '@/lib/load-state'
import { cn } from '@workspace/ui/lib/utils'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@workspace/ui/components/resizable'
import {
  parseMergeConflicts,
  type DocumentSessionChange,
  type EditorKeymapLayer,
  type EditorScrollPosition,
  type TextSnapshot,
} from '@editor/core'
import type {
  LanguageServerDefinitionTarget,
  LanguageServerReferencesResult,
} from '@editor/lsp-plugin'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

type EditorPaneSplitDropZone = Exclude<EditorPaneDropZone, 'center'>
type EditorPaneSplitDropTarget = {
  paneId: string
  scope: EditorPaneSplitScope
  zone: EditorPaneSplitDropZone
}

const EDITOR_PANE_ROOT_EDGE_FRACTION = 0.28
const EDITOR_PANE_ROOT_EDGE_MIN_PX = 96
const EDITOR_PANE_ROOT_EDGE_MAX_PX = 180
const CONFLICT_RESOLUTION_DEBOUNCE_MS = 250

const EditorPaneDropContext = createContext<{
  dropTarget: EditorPaneSplitDropTarget | null
  setDropTarget: (target: EditorPaneSplitDropTarget | null) => void
  surfaceRef: RefObject<HTMLElement | null>
} | null>(null)

export const FileViewer = memo(function FileViewer({
  editorKeymapLayers,
  rootPath,
  onRequestCloseTab,
  onRequestCloseTabs,
}: {
  editorKeymapLayers: readonly EditorKeymapLayer[]
  rootPath: string
  onRequestCloseTab: RequestCloseTab
  onRequestCloseTabs: RequestCloseTabs
}) {
  const editorPaneLayout = useEditorWorkspaceState((state) => state.editorPaneLayout)
  const [dropTarget, setDropTarget] = useState<EditorPaneSplitDropTarget | null>(null)
  const surfaceRef = useRef<HTMLElement | null>(null)

  return (
    <EditorPaneDropContext value={{ dropTarget, setDropTarget, surfaceRef }}>
      <section className='relative h-full min-h-0 overflow-hidden' ref={surfaceRef}>
        <EditorPaneNodeView
          editorKeymapLayers={editorKeymapLayers}
          node={editorPaneLayout.root}
          rootPath={rootPath}
          onRequestCloseTab={onRequestCloseTab}
          onRequestCloseTabs={onRequestCloseTabs}
        />
        <EditorPaneDropOverlay target={dropTarget?.scope === 'root' ? dropTarget : null} />
      </section>
    </EditorPaneDropContext>
  )
})

function EditorPaneNodeView({
  editorKeymapLayers,
  node,
  rootPath,
  onRequestCloseTab,
  onRequestCloseTabs,
}: {
  editorKeymapLayers: readonly EditorKeymapLayer[]
  node: EditorPaneNode
  rootPath: string
  onRequestCloseTab: RequestCloseTab
  onRequestCloseTabs: RequestCloseTabs
}) {
  if (node.kind === 'leaf') {
    return (
      <EditorPaneLeafView
        editorKeymapLayers={editorKeymapLayers}
        pane={node}
        rootPath={rootPath}
        onRequestCloseTab={onRequestCloseTab}
        onRequestCloseTabs={onRequestCloseTabs}
      />
    )
  }

  return (
    <EditorPaneSplitView
      editorKeymapLayers={editorKeymapLayers}
      node={node}
      rootPath={rootPath}
      onRequestCloseTab={onRequestCloseTab}
      onRequestCloseTabs={onRequestCloseTabs}
    />
  )
}

function EditorPaneSplitView({
  editorKeymapLayers,
  node,
  rootPath,
  onRequestCloseTab,
  onRequestCloseTabs,
}: {
  editorKeymapLayers: readonly EditorKeymapLayer[]
  node: EditorPaneSplit
  rootPath: string
  onRequestCloseTab: RequestCloseTab
  onRequestCloseTabs: RequestCloseTabs
}) {
  const setEditorPaneLayout = useEditorWorkspaceState((state) => state.setEditorPaneLayout)
  const editorPaneLayout = useEditorWorkspaceState((state) => state.editorPaneLayout)

  function handleLayoutChanged(layout: Record<string, number>) {
    const sizes = node.children.map((child) => layout[child.id] ?? 0)
    setEditorPaneLayout(updateEditorPaneSplitSizes(editorPaneLayout, node.id, sizes))
  }

  return (
    <ResizablePanelGroup
      className='min-h-0 min-w-0'
      orientation={node.direction}
      onLayoutChanged={handleLayoutChanged}
    >
      {node.children.map((child, index) => (
        <EditorPaneSplitChild
          child={child}
          editorKeymapLayers={editorKeymapLayers}
          index={index}
          key={child.id}
          node={node}
          rootPath={rootPath}
          onRequestCloseTab={onRequestCloseTab}
          onRequestCloseTabs={onRequestCloseTabs}
        />
      ))}
    </ResizablePanelGroup>
  )
}

function EditorPaneSplitChild({
  child,
  editorKeymapLayers,
  index,
  node,
  rootPath,
  onRequestCloseTab,
  onRequestCloseTabs,
}: {
  child: EditorPaneNode
  editorKeymapLayers: readonly EditorKeymapLayer[]
  index: number
  node: EditorPaneSplit
  rootPath: string
  onRequestCloseTab: RequestCloseTab
  onRequestCloseTabs: RequestCloseTabs
}) {
  return (
    <>
      {index > 0 ? <ResizableHandle aria-label='Resize editor pane' withHandle /> : null}
      <ResizablePanel
        id={child.id}
        className='min-h-0 min-w-0 overflow-hidden'
        defaultSize={`${node.sizes[index] ?? 100 / node.children.length}%`}
        minSize='180px'
      >
        <EditorPaneNodeView
          editorKeymapLayers={editorKeymapLayers}
          node={child}
          rootPath={rootPath}
          onRequestCloseTab={onRequestCloseTab}
          onRequestCloseTabs={onRequestCloseTabs}
        />
      </ResizablePanel>
    </>
  )
}

function EditorPaneLeafView({
  editorKeymapLayers,
  pane,
  rootPath,
  onRequestCloseTab,
  onRequestCloseTabs,
}: {
  editorKeymapLayers: readonly EditorKeymapLayer[]
  pane: EditorPaneLeaf
  rootPath: string
  onRequestCloseTab: RequestCloseTab
  onRequestCloseTabs: RequestCloseTabs
}) {
  const editorPaneLayout = useEditorWorkspaceState((state) => state.editorPaneLayout)
  const activePaneId = editorPaneLayout.activePaneId
  const diffViewMode = useEditorWorkspaceState((state) => state.diffViewMode)
  const setDiffViewMode = useEditorWorkspaceState((state) => state.setDiffViewMode)
  const editorTabCount = useEditorWorkspaceState(
    (state) => editorPaneTabs(state.editorPaneLayout.root).length,
  )
  const { moveTabToSplit, setActivePane } = useEditorCommands()
  const { dropTarget, setDropTarget, surfaceRef } = useEditorPaneDropContext()
  const active = activePaneId === pane.id
  const tab = activeTabForPane(pane)
  const selectedPath = tab?.path ?? null
  const selectedDiff = useMemo(() => parseDiffDocumentId(selectedPath), [selectedPath])
  const clearStatusBarSource = useEditorUiState((state) => state.clearStatusBarSource)
  const paneDropTarget =
    dropTarget?.scope === 'pane' && dropTarget.paneId === pane.id ? dropTarget : null

  function handleRevealPreviousChange() {
    diffViewerRef.current?.revealPreviousHunk({ wrap: true })
  }

  function handleRevealNextChange() {
    diffViewerRef.current?.revealNextHunk({ wrap: true })
  }

  const diffViewerRef = useRef<GitDiffViewerHandle | null>(null)
  const selectedDiffQuery = useDiffDocumentDiff(selectedDiff)

  useEffect(() => {
    if (!active) return
    if (tab && !selectedDiff) return

    clearStatusBarSource()
  }, [active, clearStatusBarSource, selectedDiff, tab])

  function handleDragOver(event: React.DragEvent<HTMLElement>) {
    if (eventTargetsEditorTabBar(event)) {
      setDropTarget(null)
      return
    }
    if (editorTabCount <= 1) {
      setDropTarget(null)
      return
    }
    if (!hasEditorTabDragPayload(event.dataTransfer)) {
      setDropTarget(null)
      return
    }

    const target = editorPaneDropTarget({
      event,
      layout: editorPaneLayout,
      paneElement: event.currentTarget,
      paneId: pane.id,
      surfaceElement: surfaceRef.current,
    })
    if (!target) {
      setDropTarget(null)
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTarget(target)
  }

  function handleDragLeave(event: React.DragEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return

    setDropTarget(null)
  }

  function handleDrop(event: React.DragEvent<HTMLElement>) {
    if (eventTargetsEditorTabBar(event)) return

    const payload = readEditorTabDragPayload(event.dataTransfer)
    const target =
      dropTarget ??
      editorPaneDropTarget({
        event,
        layout: editorPaneLayout,
        paneElement: event.currentTarget,
        paneId: pane.id,
        surfaceElement: surfaceRef.current,
      })
    if (payload.status !== 'valid' || !target) return

    event.preventDefault()
    event.stopPropagation()
    moveTabToSplit(payload.payload.tabId, target.paneId, target.zone, target.scope)
    setDropTarget(null)
  }

  return (
    <section
      className={cn(
        'relative grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-border/70 bg-background',
        active && 'ring-1 ring-ring/30 ring-inset',
      )}
      data-editor-pane-id={pane.id}
      onDragLeaveCapture={handleDragLeave}
      onDragOverCapture={handleDragOver}
      onDropCapture={handleDrop}
      onFocusCapture={() => setActivePane(pane.id)}
      onPointerDownCapture={() => setActivePane(pane.id)}
    >
      <EditorTabBar
        diffViewMode={selectedDiff ? diffViewMode : null}
        paneId={pane.id}
        rootPath={rootPath}
        onDiffViewModeChange={setDiffViewMode}
        onRequestCloseTab={onRequestCloseTab}
        onRequestCloseTabs={onRequestCloseTabs}
        onRevealNextChange={handleRevealNextChange}
        onRevealPreviousChange={handleRevealPreviousChange}
      />
      {tab ? (
        selectedDiff ? (
          <GitDiffViewer
            diffs={selectedDiffQuery.data ?? []}
            error={selectedDiffQuery.error}
            isError={selectedDiffQuery.isError}
            isPending={selectedDiffQuery.isPending}
            mode={diffViewMode}
            path={selectedDiff.path}
            ref={diffViewerRef}
          />
        ) : (
          <EditorPaneTabBody
            active={active}
            editorKeymapLayers={editorKeymapLayers}
            rootPath={rootPath}
            tabId={tab.id}
            path={tab.path}
          />
        )
      ) : (
        <FileViewerEmpty />
      )}
      <EditorPaneDropOverlay target={paneDropTarget} />
    </section>
  )
}

function useEditorPaneDropContext() {
  const context = use(EditorPaneDropContext)
  if (!context) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useEditorPaneDropContext must be used within FileViewer',
    })
  }

  return context
}

function eventTargetsEditorTabBar(event: React.DragEvent<HTMLElement>) {
  if (!(event.target instanceof Element)) return false

  return Boolean(event.target.closest("[data-editor-tab-id], [role='tablist']"))
}

function EditorPaneTabBody({
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
  const selectedSearchBuffer = useMemo(() => parseSearchBufferDocumentId(path), [path])
  const selectedConflictDiff = useMemo(() => parseConflictDiffDocumentId(path), [path])
  const { fileState } = useSelectedFile(selectedSearchBuffer || selectedConflictDiff ? null : path)
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
  const selectedFile = selectedConflictDiff || selectedSearchBuffer ? null : readyFile(fileState)

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
    if (selectedSearchBuffer) {
      clearStatusBarSource()
      return
    }
    if (path && selectedLiveDocument) return
    if (path && fileState.status === 'ready') return

    clearStatusBarSource()
  }, [
    active,
    clearStatusBarSource,
    fileState.status,
    path,
    selectedLiveDocument,
    selectedSearchBuffer,
  ])

  const handleEditorTextChange = useCallback(
    (sourceTabId: string, changedPath: string, change: DocumentSessionChange) => {
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

  if (selectedSearchBuffer) {
    return (
      <SearchBufferEditor
        editorKeymapLayers={editorKeymapLayers}
        rootPath={selectedSearchBuffer.rootPath}
      />
    )
  }

  return (
    <FileViewerBody
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

function FileViewerEmpty() {
  return <section className='min-h-[320px]' />
}

function FileViewerBody({
  active,
  liveDocument,
  definitionTarget,
  editorKeymapLayers,
  fileState,
  languageServerReferences,
  rootPath,
  tabId,
  onEditorDirtyChange,
  onEditorScrollPositionChange,
  onEditorStatusSourceChange,
  onEditorTextChange,
  onOpenDefinition,
  onOpenReferences,
  onReferencesClose,
}: {
  active: boolean
  liveDocument: EditorRenderDocument | null
  definitionTarget: LanguageServerDefinitionTarget | null
  editorKeymapLayers: readonly EditorKeymapLayer[]
  fileState: LoadState<FileResult>
  languageServerReferences: LanguageServerReferencesResult | null
  rootPath: string
  tabId: string
  onEditorDirtyChange?: (path: string, dirty: boolean) => void
  onEditorScrollPositionChange: (tabId: string, scrollPosition: EditorScrollPosition) => void
  onEditorStatusSourceChange: (source: EditorStatusBarSource | null) => void
  onEditorTextChange?: (tabId: string, path: string, change: DocumentSessionChange) => void
  onOpenDefinition: (target: LanguageServerDefinitionTarget) => void | boolean
  onOpenReferences: (result: LanguageServerReferencesResult) => void | boolean
  onReferencesClose: () => void
}) {
  if (liveDocument) {
    return (
      <div
        className={
          languageServerReferences
            ? 'grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_minmax(260px,340px)] grid-rows-[minmax(0,1fr)] overflow-hidden'
            : 'grid h-full min-h-0 min-w-0 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden'
        }
      >
        <Editor
          active={active}
          definitionTarget={definitionTarget}
          document={liveDocument}
          keymapLayers={editorKeymapLayers}
          rootPath={rootPath}
          tabId={tabId}
          onDirtyChange={onEditorDirtyChange}
          onScrollPositionChange={(_path, scrollPosition) =>
            onEditorScrollPositionChange(tabId, scrollPosition)
          }
          onStatusSourceChange={onEditorStatusSourceChange}
          onTextChange={onEditorTextChange}
          onOpenDefinition={onOpenDefinition}
          onOpenReferences={onOpenReferences}
        />
        {languageServerReferences ? (
          <LanguageServerReferencesPane
            references={languageServerReferences}
            rootPath={rootPath}
            onClose={onReferencesClose}
            onOpenReference={onOpenDefinition}
          />
        ) : null}
      </div>
    )
  }

  if (fileState.status === 'error') {
    return (
      <div className='text-muted-foreground flex min-h-0 items-center justify-center p-6 text-xs'>
        <WarningCircleIcon className='mr-2 size-4' />
        {fileState.message}
      </div>
    )
  }

  return null
}

function EditorPaneDropOverlay({ target }: { target: EditorPaneSplitDropTarget | null }) {
  if (!target) return null

  return (
    <div
      className='bg-background/10 pointer-events-none absolute inset-0 z-40'
      data-editor-pane-drop-preview={target.zone}
      data-editor-pane-drop-scope={target.scope}
    >
      <div
        className='border-ring/80 bg-ring/20 absolute rounded-sm border shadow-[inset_0_0_0_1px_hsl(var(--ring)/0.28)]'
        style={dropZonePreviewStyle(target.zone)}
      />
    </div>
  )
}

function dropZonePreviewStyle(zone: EditorPaneSplitDropZone): CSSProperties {
  const inset = 8

  if (zone === 'left') {
    return {
      bottom: inset,
      left: inset,
      top: inset,
      width: `calc(50% - ${inset}px)`,
    }
  }
  if (zone === 'right') {
    return {
      bottom: inset,
      right: inset,
      top: inset,
      width: `calc(50% - ${inset}px)`,
    }
  }
  if (zone === 'top') {
    return {
      height: `calc(50% - ${inset}px)`,
      left: inset,
      right: inset,
      top: inset,
    }
  }

  return {
    bottom: inset,
    height: `calc(50% - ${inset}px)`,
    left: inset,
    right: inset,
  }
}

function editorPaneDropZone(
  element: HTMLElement,
  event: Pick<React.DragEvent<HTMLElement>, 'clientX' | 'clientY'>,
): EditorPaneSplitDropZone {
  const rect = element.getBoundingClientRect()
  const x = normalizedPointerOffset(event.clientX, rect.left, rect.width)
  const y = normalizedPointerOffset(event.clientY, rect.top, rect.height)
  const distances: Array<{
    distance: number
    zone: EditorPaneSplitDropZone
  }> = [
    { distance: x, zone: 'left' },
    { distance: 1 - x, zone: 'right' },
    { distance: y, zone: 'top' },
    { distance: 1 - y, zone: 'bottom' },
  ]
  distances.sort((left, right) => left.distance - right.distance)

  return distances[0]?.zone ?? 'right'
}

function editorPaneDropTarget({
  event,
  layout,
  paneElement,
  paneId,
  surfaceElement,
}: {
  event: Pick<React.DragEvent<HTMLElement>, 'clientX' | 'clientY'>
  layout: EditorPaneLayout
  paneElement: HTMLElement
  paneId: string
  surfaceElement: HTMLElement | null
}): EditorPaneSplitDropTarget | null {
  const rootZone = surfaceElement ? editorPaneRootEdgeDropZone(surfaceElement, event) : null

  if (rootZone && canSplitEditorPaneAtRoot(layout)) {
    return {
      paneId,
      scope: 'root',
      zone: rootZone,
    }
  }

  if (!canSplitEditorPaneAtPane(layout, paneId)) return null

  return {
    paneId,
    scope: 'pane',
    zone: editorPaneDropZone(paneElement, event),
  }
}

function editorPaneRootEdgeDropZone(
  element: HTMLElement,
  event: Pick<React.DragEvent<HTMLElement>, 'clientX' | 'clientY'>,
): EditorPaneSplitDropZone | null {
  const rect = element.getBoundingClientRect()
  const threshold = editorPaneRootEdgeThreshold(rect)
  const distances: Array<{
    distance: number
    zone: EditorPaneSplitDropZone
  }> = [
    { distance: Math.max(0, event.clientX - rect.left), zone: 'left' },
    { distance: Math.max(0, rect.right - event.clientX), zone: 'right' },
    { distance: Math.max(0, event.clientY - rect.top), zone: 'top' },
    { distance: Math.max(0, rect.bottom - event.clientY), zone: 'bottom' },
  ]
  distances.sort((left, right) => left.distance - right.distance)

  const closest = distances[0]
  if (!closest || closest.distance > threshold) return null

  return closest.zone
}

function editorPaneRootEdgeThreshold(rect: DOMRect) {
  return Math.min(
    EDITOR_PANE_ROOT_EDGE_MAX_PX,
    Math.max(
      EDITOR_PANE_ROOT_EDGE_MIN_PX,
      Math.min(rect.width, rect.height) * EDITOR_PANE_ROOT_EDGE_FRACTION,
    ),
  )
}

function normalizedPointerOffset(value: number, start: number, size: number) {
  if (size <= 0) return 0.5

  return Math.max(0, Math.min(1, (value - start) / size))
}

function readyFile(fileState: LoadState<FileResult>) {
  if (fileState.status !== 'ready') return null

  return fileState.data
}

function joinedEditorRenderDocument({
  buffer,
  documentId,
  path,
  view,
}: {
  buffer: EditorRenderDocument['buffer'] | null
  documentId: string | null
  path: string | null
  view: EditorRenderDocument['view'] | null
}): EditorRenderDocument | null {
  if (!buffer) return null
  if (!documentId) return null
  if (!path) return null
  if (!view) return null

  return {
    buffer,
    id: documentId,
    path,
    view,
  }
}

function useConflictEditorResolution({
  discardLiveEditorDocument,
  forceReplaceLiveEditorDocument,
  renameLiveEditorDocument,
}: {
  discardLiveEditorDocument: (path: string) => { wasDirty: boolean }
  forceReplaceLiveEditorDocument: (file: FileResult) => { wasDirty: boolean }
  renameLiveEditorDocument: (from: string, to: string) => { wasDirty: boolean }
}) {
  const conflictStore = useEditorConflictStoreApi()
  const queryClient = useQueryClient()
  const resolvingConflictIds = useRef(new Set<string>())
  const pendingResolutionTimeouts = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => () => clearConflictResolutionTimeouts(pendingResolutionTimeouts.current), [])

  return useCallback(
    (path: string, textSnapshot: TextSnapshot) => {
      const conflictDiff = parseConflictDiffDocumentId(path)
      if (!conflictDiff) return

      replaceConflictResolutionTimeout(pendingResolutionTimeouts.current, path, () => {
        pendingResolutionTimeouts.current.delete(path)
        resolveConflictEditorSnapshot(conflictDiff, textSnapshot, {
          conflictStore,
          discardLiveEditorDocument,
          forceReplaceLiveEditorDocument,
          queryClient,
          renameLiveEditorDocument,
          resolvingConflictIds,
        })
      })
    },
    [
      conflictStore,
      discardLiveEditorDocument,
      forceReplaceLiveEditorDocument,
      queryClient,
      renameLiveEditorDocument,
    ],
  )
}

function resolveConflictEditorSnapshot(
  conflictDiff: NonNullable<ReturnType<typeof parseConflictDiffDocumentId>>,
  textSnapshot: TextSnapshot,
  context: ConflictEditorResolutionContext & {
    resolvingConflictIds: RefObject<Set<string>>
  },
) {
  const text = textSnapshot.materializeFullText()
  if (parseMergeConflicts(text).length > 0) return

  const conflict = context.conflictStore.getState().conflicts[conflictDiff.conflictId]
  if (!conflict) return
  if (context.resolvingConflictIds.current.has(conflict.id)) return

  context.resolvingConflictIds.current.add(conflict.id)
  void applyConflictEditorResolution(conflict, text, context)
    .catch((error: unknown) => {
      reportError(toClientError(error))
    })
    .finally(() => {
      context.resolvingConflictIds.current.delete(conflict.id)
    })
}

function replaceConflictResolutionTimeout(
  timeouts: Map<string, ReturnType<typeof setTimeout>>,
  path: string,
  resolve: () => void,
) {
  const current = timeouts.get(path)
  if (current) clearTimeout(current)

  const timeout = setTimeout(resolve, CONFLICT_RESOLUTION_DEBOUNCE_MS)
  timeouts.set(path, timeout)
}

function clearConflictResolutionTimeouts(timeouts: Map<string, ReturnType<typeof setTimeout>>) {
  for (const timeout of timeouts.values()) {
    clearTimeout(timeout)
  }

  timeouts.clear()
}

async function applyConflictEditorResolution(
  conflict: FilesystemConflict,
  resolvedText: string,
  context: ConflictEditorResolutionContext,
) {
  if (conflict.eventType === 'deleted') {
    await ensureFolderPath(parentPath(conflict.remotePath))
    await createFileContent(conflict.remotePath, resolvedText)
  } else {
    await writeFileContent(conflict.remotePath, resolvedText, {
      baseVersion: conflict.remoteVersion,
      expectedMtimeMs: conflict.remoteMtimeMs,
      origin: 'conflict-editor-resolution',
    })
  }

  const file = await fetchFile(conflict.remotePath, new AbortController().signal)
  replaceResolvedConflictFile(conflict.localPath, file, context)
  finishEditorResolvedConflict(conflict, context)
}

type ConflictEditorResolutionContext = {
  conflictStore: ReturnType<typeof useEditorConflictStoreApi>
  discardLiveEditorDocument: (path: string) => { wasDirty: boolean }
  forceReplaceLiveEditorDocument: (file: FileResult) => { wasDirty: boolean }
  queryClient: ReturnType<typeof useQueryClient>
  renameLiveEditorDocument: (from: string, to: string) => { wasDirty: boolean }
}

function replaceResolvedConflictFile(
  localPath: string,
  file: FileResult,
  context: ConflictEditorResolutionContext,
) {
  if (localPath !== file.path) {
    context.renameLiveEditorDocument(localPath, file.path)
    moveFileQueryData(context.queryClient, localPath, file.path)
  }

  setFileSnapshotQueryData(context.queryClient, file)
  context.forceReplaceLiveEditorDocument(file)
}

function finishEditorResolvedConflict(
  conflict: FilesystemConflict,
  context: ConflictEditorResolutionContext,
) {
  if (conflict.diffDocumentId) {
    context.discardLiveEditorDocument(conflict.diffDocumentId)
  }
  if (conflict.toastId) toast.dismiss(conflict.toastId)

  context.conflictStore.getState().removeConflict(conflict.id)
}

function moveFileQueryData(
  queryClient: ReturnType<typeof useQueryClient>,
  from: string,
  to: string,
) {
  const file = queryClient.getQueryData<FileResult>(fileSystemKeys.fileSnapshot(from))
  queryClient.removeQueries({
    exact: true,
    queryKey: fileSystemKeys.fileSnapshot(from),
  })
  if (!file) return

  setFileSnapshotQueryData(queryClient, { ...file, path: to })
}

function parentPath(path: string) {
  const index = path.lastIndexOf('/')
  if (index < 0) return ''

  return path.slice(0, index)
}
