import { useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { LoadingState } from '@workspace/ui/components/loading-state'
import { originForQueryClient } from '@/lib/environments/state/query-clients'
import type { ChatTransport } from '@/features/chat/transport/chat-transport'
import { createChatTransport } from '@/features/chat/transport/create-chat-transport'
import { registerActiveChatTransport } from '@/features/chat/state/active-transports'
import { ChatTransportContext } from '@/features/chat/providers/transport-context'

export function ChatTransportProvider({ children }: { readonly children: ReactNode }) {
  const origin = originForQueryClient(useQueryClient())
  const [transport, setTransport] = useState<ChatTransport | null>(null)

  useEffect(() => {
    const current = createChatTransport(origin)
    const release = registerActiveChatTransport(origin, current)
    // Each setup owns a fresh connection, including StrictMode effect replay.
    // oxlint-disable-next-line oxc-react-compiler/set-state-in-effect
    setTransport(current)
    return release
  }, [origin])

  if (!transport || transport.closed)
    return (
      <LoadingState label='Connecting chat'>
        <div className='skeleton-sweep h-4 w-1/2' />
      </LoadingState>
    )
  return <ChatTransportContext value={transport}>{children}</ChatTransportContext>
}
