import { useEffect, useMemo, useRef, type DragEvent as ReactDragEvent } from 'react'

import { EditorPaneDropOverlay } from '@/components/workspace/editor-pane-drop-overlay'
import {
  editorPaneDropTarget,
  eventTargetsEditorTabBar,
} from '@/components/workspace/editor-pane-drop-utils'
import { EditorPaneLeafContent } from '@/components/workspace/editor-pane-leaf-content'
import { EditorTabBar } from '@/components/workspace/editor-tab-bar'
import { useEditorPaneDropContext } from '@/components/workspace/use-editor-pane-drop-context'
import {
  hasEditorTabDragPayload,
  readEditorTabDragPayload,
} from '@/components/workspace/use-editor-tab-drag'
import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import {
  activeTabForPane,
  editorPaneTabs,
  type EditorPaneLeaf,
} from '@/features/editor/state/editor-pane-state'
import { useEditorUiState } from '@/features/editor/state/editor-ui-state'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import type { GitDiffViewerHandle } from '@/features/git/components/diff-viewer'
import { parseDiffDocumentId } from '@/features/git/diff-document'
import { useDiffDocumentDiff } from '@/features/git/hooks'
import { cn } from '@workspace/ui/lib/utils'
import type { EditorKeymapLayer } from '@editor/core'

export function EditorPaneLeafView({
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
  const diffViewerRef = useRef<GitDiffViewerHandle | null>(null)
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
  const selectedDiffQuery = useDiffDocumentDiff(selectedDiff)
  const clearStatusBarSource = useEditorUiState((state) => state.clearStatusBarSource)
  const paneDropTarget =
    dropTarget?.scope === 'pane' && dropTarget.paneId === pane.id ? dropTarget : null

  useEffect(() => {
    if (!active) return
    if (tab && !selectedDiff) return

    clearStatusBarSource()
  }, [active, clearStatusBarSource, selectedDiff, tab])

  function handleRevealPreviousChange() {
    diffViewerRef.current?.revealPreviousHunk({ wrap: true })
  }

  function handleRevealNextChange() {
    diffViewerRef.current?.revealNextHunk({ wrap: true })
  }

  function handleDragOver(event: ReactDragEvent<HTMLElement>) {
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

  function handleDragLeave(event: ReactDragEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return

    setDropTarget(null)
  }

  function handleDrop(event: ReactDragEvent<HTMLElement>) {
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
      <EditorPaneLeafContent
        active={active}
        diffViewerRef={diffViewerRef}
        diffViewMode={diffViewMode}
        editorKeymapLayers={editorKeymapLayers}
        rootPath={rootPath}
        selectedDiff={selectedDiff}
        selectedDiffQuery={selectedDiffQuery}
        tab={tab}
      />
      <EditorPaneDropOverlay target={paneDropTarget} />
    </section>
  )
}
