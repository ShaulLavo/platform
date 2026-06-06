import { ChatSidePanel } from '@/features/chat/components/chat-side-panel'

import { WorkbenchPanelUnavailable } from '../workbench-panel-unavailable'
import type { WorkbenchSurfaceRendererProps } from './surface-renderer-registry'
import { useWorkbenchEditorSurfaceContext } from './use-workbench-editor-surface-context'

export function WorkbenchChatSurface({ surface }: WorkbenchSurfaceRendererProps) {
  const { rootPath } = useWorkbenchEditorSurfaceContext()
  if (surface.type !== 'chat') {
    return <WorkbenchPanelUnavailable message='This surface is not chat.' />
  }

  return <ChatSidePanel rootPath={rootPath} />
}
