import { useEffect, useRef } from 'react'

import { DiffTabActions } from '@/components/workspace/diff/components/diff-tab-actions'
import { useFocus } from '@/components/workspace/focus/providers/focus-state'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { useEditorUiState } from '@/features/editor/state/editor-ui-state'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { GitDiffViewer, type GitDiffViewerHandle } from '@/features/git/components/diff-viewer'
import { parseDiffDocumentId } from '@/features/git/diff-document'
import { useDiffDocumentDiff } from '@/features/git/hooks'

import { WorkbenchPanelUnavailable } from './workbench-panel-unavailable'
import type { WorkbenchDiffEditorPanel as WorkbenchDiffEditorPanelModel } from './workbench-panel-types'

export function WorkbenchDiffEditorPanel({
  active,
  panel,
}: {
  readonly active: boolean
  readonly panel: WorkbenchDiffEditorPanelModel
}) {
  const diffViewerRef = useRef<GitDiffViewerHandle | null>(null)
  const diff = parseDiffDocumentId(panel.diffDocumentId)
  const diffQuery = useDiffDocumentDiff(diff)
  const diffViewMode = useEditorWorkspaceState((state) => state.diffViewMode)
  const setDiffViewMode = useEditorWorkspaceState((state) => state.setDiffViewMode)
  const clearStatusBarSource = useEditorUiState((state) => state.clearStatusBarSource)
  const requestEditorFocus = useFocus((state) => state.requestEditorFocus)
  const { selectFile } = useEditorCommands()

  useEffect(() => {
    if (!active) return

    clearStatusBarSource()
  }, [active, clearStatusBarSource])

  function handleOpenFile(path: string) {
    selectFile(path)
    requestEditorFocus()
  }

  function handleRevealPreviousChange() {
    diffViewerRef.current?.revealPreviousHunk({ wrap: true })
  }

  function handleRevealNextChange() {
    diffViewerRef.current?.revealNextHunk({ wrap: true })
  }

  if (!diff) return <WorkbenchPanelUnavailable message='This diff could not be restored.' />

  return (
    <section className='workbench-panel workbench-diff-panel'>
      <div className='workbench-diff-panel-actions'>
        <DiffTabActions
          diffPath={diff.path}
          mode={diffViewMode}
          onModeChange={setDiffViewMode}
          onOpenFile={handleOpenFile}
          onRevealNextChange={handleRevealNextChange}
          onRevealPreviousChange={handleRevealPreviousChange}
        />
      </div>
      <GitDiffViewer
        diffs={diffQuery.data ?? []}
        error={diffQuery.error}
        isError={diffQuery.isError}
        isPending={diffQuery.isPending}
        mode={diffViewMode}
        path={diff.path}
        ref={diffViewerRef}
      />
    </section>
  )
}
