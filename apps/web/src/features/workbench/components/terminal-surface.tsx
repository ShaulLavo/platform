import { TerminalPanelStack } from '@/components/workspace/terminal/components/terminal-panel-stack'
import { TerminalTabStrip } from '@/components/workspace/terminal/components/terminal-tab-strip'

import { PanelUnavailable } from '@/features/workbench/components/panel-unavailable'
import type { SurfaceRendererProps } from '@/features/workbench/utils/surface-renderer-registry'
import { useEditorSurfaceContext } from '@/features/workbench/hooks/use-editor-surface-context'

export function TerminalSurface({ surface }: SurfaceRendererProps) {
  const { rootPath } = useEditorSurfaceContext()
  if (surface.type !== 'terminal') {
    return <PanelUnavailable message='This surface is not a terminal.' />
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
