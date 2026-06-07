import { TerminalPanel } from '@/features/terminal/terminal-panel'

import { PanelUnavailable } from '@/features/workbench/components/panel-unavailable'
import type { SurfaceRendererProps } from '@/features/workbench/utils/surface-renderer-registry'
import { useEditorSurfaceContext } from '@/features/workbench/hooks/use-editor-surface-context'

export function TerminalSurface({ active, surface, visible }: SurfaceRendererProps) {
  const { rootPath } = useEditorSurfaceContext()
  if (surface.type !== 'terminal') {
    return <PanelUnavailable message='This surface is not a terminal.' />
  }

  const sessionId = terminalSessionId(surface)

  return (
    <TerminalPanel
      active={active && visible}
      className='h-full'
      rootPath={rootPath}
      sessionId={sessionId}
    />
  )
}

function terminalSessionId(surface: SurfaceRendererProps['surface']) {
  return surface.stateKey ?? surface.resourceKey ?? String(surface.id)
}
