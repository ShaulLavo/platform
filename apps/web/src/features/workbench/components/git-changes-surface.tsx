import { Panel as GitPanel } from '@/features/git/panel'

import { PanelUnavailable } from '@/features/workbench/components/panel-unavailable'
import type { SurfaceRendererProps } from '@/features/workbench/utils/surface-renderer-registry'
import { ToolPaneHeader } from '@/features/workbench/components/tool-pane-header'
import { useEditorSurfaceContext } from '@/features/workbench/hooks/use-editor-surface-context'

export function GitChangesSurface({ surface }: SurfaceRendererProps) {
  const { gitStore, rootPath } = useEditorSurfaceContext()
  if (surface.type !== 'git-changes') {
    return <PanelUnavailable message='This surface is not Git changes.' />
  }

  return (
    <section className='bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
      <ToolPaneHeader tab='git' />
      <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>
        <GitPanel rootPath={rootPath} store={gitStore} />
      </div>
    </section>
  )
}
