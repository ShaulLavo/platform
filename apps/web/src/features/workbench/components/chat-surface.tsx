import { ChatSidePanel } from '@/features/chat/components/chat-side-panel'

import { PanelUnavailable } from '@/features/workbench/components/panel-unavailable'
import type { SurfaceRendererProps } from '@/features/workbench/utils/surface-renderer-registry'
import { useEditorSurfaceContext } from '@/features/workbench/hooks/use-editor-surface-context'

export function ChatSurface({ surface }: SurfaceRendererProps) {
  const { rootPath } = useEditorSurfaceContext()
  if (surface.type !== 'chat') {
    return <PanelUnavailable message='This surface is not chat.' />
  }

  return <ChatSidePanel rootPath={rootPath} />
}
