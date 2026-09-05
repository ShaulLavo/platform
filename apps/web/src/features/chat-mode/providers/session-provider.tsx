import type { ReactNode } from 'react'
import { ChatTransportProvider } from '@/features/chat/providers/transport-provider'
import { ChatModeSessionController } from '@/features/chat-mode/providers/session-controller'

export function ChatModeSessionProvider({
  children,
  editorRootPath,
}: {
  readonly children: ReactNode
  readonly editorRootPath: string
}) {
  return (
    <ChatTransportProvider>
      <ChatModeSessionController editorRootPath={editorRootPath}>
        {children}
      </ChatModeSessionController>
    </ChatTransportProvider>
  )
}
