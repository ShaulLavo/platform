import { use } from 'react'
import { ChatTransportContext } from '@/features/chat/providers/transport-context'
import { clientErrors } from '@/lib/structured-errors'

export function useChatTransport() {
  const transport = use(ChatTransportContext)
  if (transport) return transport
  throw clientErrors.CONTEXT_MISSING({ message: 'Chat transport requires ChatTransportProvider.' })
}
