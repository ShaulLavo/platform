import { EMPTY_GIT_FILES } from '@/components/workspace/editor-tabs/utils/editor-tab-model'
import { useEditorConflictState } from '@/features/editor/state/editor-conflict-state'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { createGitStore } from '@/features/git/state'
import { useStatus } from '@/features/git/hooks'
import { WorkbenchLayout } from '@/features/workbench/components/workbench-layout'
import type { EditorKeymapLayer } from '@singapor/core'
import { useState } from 'react'

export function EditorSurfaceLayoutView({
  editorKeymapLayers,
  rootPath,
}: {
  readonly editorKeymapLayers: readonly EditorKeymapLayer[]
  readonly rootPath: string
}) {
  const [gitStore] = useState(createGitStore)
  const conflicts = useEditorConflictState((state) => state.conflicts)
  const gitStatus = useStatus(rootPath)
  const gitFiles = gitStatus.data?.files ?? EMPTY_GIT_FILES
  const panels = useEditorWorkspaceState((state) => state.workbenchPanels)
  const setWorkbenchPanels = useEditorWorkspaceState((state) => state.setWorkbenchPanels)

  return (
    <WorkbenchLayout
      conflicts={conflicts}
      editorKeymapLayers={editorKeymapLayers}
      gitFiles={gitFiles}
      gitStore={gitStore}
      panels={panels}
      rootPath={rootPath}
      onPanelsChange={setWorkbenchPanels}
    />
  )
}
