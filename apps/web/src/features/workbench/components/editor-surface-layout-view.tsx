import { EMPTY_GIT_FILES } from '@/components/workspace/editor-tabs/utils/editor-tab-model'
import { useEditorConflictState } from '@/features/editor/state/conflict-state'
import { useEditorWorkspaceState } from '@/features/editor/state/workspace-state'
import { useStatus } from '@/features/git/hooks'
import { WorkbenchLayout } from '@/features/workbench/components/layout'
import type { EditorKeymapLayer } from '@singapor/core'

export function EditorSurfaceLayoutView({
  editorKeymapLayers,
  rootPath,
}: {
  readonly editorKeymapLayers: readonly EditorKeymapLayer[]
  readonly rootPath: string
}) {
  const conflicts = useEditorConflictState((state) => state.conflicts)
  const gitStatus = useStatus(rootPath)
  const gitFiles = gitStatus.data?.files ?? EMPTY_GIT_FILES
  const panels = useEditorWorkspaceState((state) => state.workbenchPanels)
  const layout = useEditorWorkspaceState((state) => state.workbenchLayout)
  const setWorkbenchLayout = useEditorWorkspaceState((state) => state.setWorkbenchLayout)
  const setWorkbenchPanels = useEditorWorkspaceState((state) => state.setWorkbenchPanels)

  return (
    <WorkbenchLayout
      conflicts={conflicts}
      editorKeymapLayers={editorKeymapLayers}
      gitFiles={gitFiles}
      layout={layout}
      panels={panels}
      rootPath={rootPath}
      onLayoutChange={setWorkbenchLayout}
      onPanelsChange={setWorkbenchPanels}
    />
  )
}
