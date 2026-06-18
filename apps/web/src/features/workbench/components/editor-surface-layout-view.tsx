import { EMPTY_GIT_FILES } from '@/components/workspace/editor-tabs/utils/editor-tab-model'
import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'
import { useEditorConflictState } from '@/features/editor/state/editor-conflict-state'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { createGitStore } from '@/features/git/state'
import { useStatus } from '@/features/git/hooks'
import { FixedWorkbenchLayout } from '@/features/workbench/components/fixed-workbench-layout'
import type { EditorKeymapLayer } from '@singapor/core'
import { useState } from 'react'

export function EditorSurfaceLayoutView({
  editorKeymapLayers,
  rootPath,
  onRequestCloseTab,
}: {
  readonly editorKeymapLayers: readonly EditorKeymapLayer[]
  readonly rootPath: string
  readonly onRequestCloseTab: RequestCloseTab
}) {
  const [gitStore] = useState(createGitStore)
  const commands = useEditorCommands()
  const conflicts = useEditorConflictState((state) => state.conflicts)
  const gitStatus = useStatus(rootPath)
  const gitFiles = gitStatus.data?.files ?? EMPTY_GIT_FILES
  const panels = useEditorWorkspaceState((state) => state.workbenchPanels)
  const setWorkbenchPanels = useEditorWorkspaceState((state) => state.setWorkbenchPanels)

  return (
    <FixedWorkbenchLayout
      conflicts={conflicts}
      editorKeymapLayers={editorKeymapLayers}
      gitFiles={gitFiles}
      gitStore={gitStore}
      panels={panels}
      rootPath={rootPath}
      onPanelsChange={setWorkbenchPanels}
      onRequestCloseTab={onRequestCloseTab}
      onSelectTab={(tabId) => commands.selectTab('main', tabId)}
    />
  )
}
