import { EditorPaneTabBody } from '@/components/workspace/editor-pane-tab-body'
import { FileViewerEmpty } from '@/components/workspace/file-viewer-empty'
import type { EditorDiffViewMode } from '@/features/editor/utils/diff-view-mode'
import { GitDiffViewer, type GitDiffViewerHandle } from '@/features/git/components/diff-viewer'
import type { parseDiffDocumentId } from '@/features/git/diff-document'
import type { useDiffDocumentDiff } from '@/features/git/hooks'
import type { EditorKeymapLayer } from '@editor/core'
import type { RefObject } from 'react'

export function EditorPaneLeafContent({
  active,
  diffViewerRef,
  diffViewMode,
  editorKeymapLayers,
  rootPath,
  selectedDiff,
  selectedDiffQuery,
  tab,
}: {
  active: boolean
  diffViewerRef: RefObject<GitDiffViewerHandle | null>
  diffViewMode: EditorDiffViewMode
  editorKeymapLayers: readonly EditorKeymapLayer[]
  rootPath: string
  selectedDiff: NonNullable<ReturnType<typeof parseDiffDocumentId>> | null
  selectedDiffQuery: ReturnType<typeof useDiffDocumentDiff>
  tab: { id: string; path: string } | null
}) {
  if (!tab) return <FileViewerEmpty />

  if (!selectedDiff) {
    return (
      <EditorPaneTabBody
        active={active}
        editorKeymapLayers={editorKeymapLayers}
        rootPath={rootPath}
        tabId={tab.id}
        path={tab.path}
      />
    )
  }

  return (
    <GitDiffViewer
      diffs={selectedDiffQuery.data ?? []}
      error={selectedDiffQuery.error}
      isError={selectedDiffQuery.isError}
      isPending={selectedDiffQuery.isPending}
      mode={diffViewMode}
      path={selectedDiff.path}
      ref={diffViewerRef}
    />
  )
}
