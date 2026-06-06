import { Panel as GitPanel } from '@/features/git/panel'

import { WorkbenchPanelUnavailable } from '../workbench-panel-unavailable'
import type { WorkbenchSurfaceRendererProps } from './surface-renderer-registry'
import { ToolPaneHeader } from './tool-pane-header'
import { useWorkbenchEditorSurfaceContext } from './use-workbench-editor-surface-context'

export function WorkbenchGitChangesSurface({ surface }: WorkbenchSurfaceRendererProps) {
  const { gitStore, rootPath, toolSurfaceState } = useWorkbenchEditorSurfaceContext()
  if (surface.type !== 'git-changes') {
    return <WorkbenchPanelUnavailable message='This surface is not Git changes.' />
  }
  if (!toolSurfaceState) {
    return <WorkbenchPanelUnavailable message='Git changes state is unavailable.' />
  }

  return (
    <section className='bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
      <ToolPaneHeader
        tab='git'
        treeState={toolSurfaceState.treeState}
        visibleTreeItemCount={toolSurfaceState.visibleTreeItemCount}
      />
      <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>
        <GitPanel rootPath={rootPath} store={gitStore} />
      </div>
    </section>
  )
}
