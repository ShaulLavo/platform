import { useState } from 'react'
import type { SessionId } from '@workspace/contracts'
import { Button } from '@workspace/ui/components/button'
import { ChatView } from '@/features/chat/components/chat-view'
import { useChatTransport } from '@/features/chat/hooks/use-chat-transport'
import { ChatProviderSignInProvider } from '@/features/chat/providers/provider-sign-in-provider'
import { ChatTransportProvider } from '@/features/chat/providers/transport-provider'
import { TestEditorStateProvider } from './editor-state-provider'
import { renderWithProviders } from '../render'

export function renderCachedChatSelection(sessionId: SessionId) {
  return renderWithProviders(
    <TestEditorStateProvider>
      <ChatProviderSignInProvider>
        <ChatTransportProvider>
          <SessionSelection sessionId={sessionId} />
        </ChatTransportProvider>
      </ChatProviderSignInProvider>
    </TestEditorStateProvider>,
  )
}

function SessionSelection({ sessionId }: { readonly sessionId: SessionId }) {
  const [selected, setSelected] = useState<SessionId | null>(null)
  const transport = useChatTransport()
  return (
    <>
      <Button onClick={() => setSelected(sessionId)}>Open cached session</Button>
      <ChatView
        activeSessionId={selected}
        transport={transport}
        onSessionCreated={setSelected}
        rootPath='/repo/platform'
      />
    </>
  )
}
