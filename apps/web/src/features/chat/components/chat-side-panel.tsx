import { ChatTransportProvider } from '@/features/chat/providers/transport-provider'
import { ChatSidePanelContent } from '@/features/chat/components/side-panel-content'

export function ChatSidePanel({ rootPath }: { readonly rootPath: string }) {
  return (
    <ChatTransportProvider>
      <ChatSidePanelContent rootPath={rootPath} />
    </ChatTransportProvider>
  )
}
