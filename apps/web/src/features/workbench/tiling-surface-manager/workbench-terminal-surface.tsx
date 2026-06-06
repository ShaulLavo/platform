import { TerminalPanelStack } from '@/components/workspace/terminal/components/terminal-panel-stack'
import { TerminalTabStrip } from '@/components/workspace/terminal/components/terminal-tab-strip'

import { WorkbenchPanelUnavailable } from '../workbench-panel-unavailable'
import type { WorkbenchSurfaceRendererProps } from './surface-renderer-registry'
import { useWorkbenchEditorSurfaceContext } from './use-workbench-editor-surface-context'

export function WorkbenchTerminalSurface({ surface }: WorkbenchSurfaceRendererProps) {
  const { rootPath } = useWorkbenchEditorSurfaceContext()
  if (surface.type !== 'terminal') {
    return <WorkbenchPanelUnavailable message='This surface is not a terminal.' />
  }

  return (
    <section
      className='flex h-full min-h-0 min-w-0 flex-col overflow-hidden'
      style={{ background: 'var(--terminal-background)' }}
    >
      <TerminalTabStrip rootPath={rootPath} />
      <TerminalPanelStack rootPath={rootPath} />
    </section>
  )
}
