import type { ChatTransport } from '@/features/chat/transport/chat-transport'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { resetThreadEarlierPageStore } from '@/features/chat/state/thread-earlier-page-store'

const activeTransports = new Set<ChatTransport>()
let projectionOrigin: string | null = null

export function registerActiveChatTransport(origin: string, transport: ChatTransport) {
  if (projectionOrigin !== null && projectionOrigin !== origin) {
    closeChatTransportsForEnvironmentSwitch()
  }
  projectionOrigin = origin
  activeTransports.add(transport)
  return () => {
    activeTransports.delete(transport)
    transport.close()
  }
}

export function closeChatTransportsForEnvironmentSwitch() {
  for (const transport of activeTransports) transport.close()
  activeTransports.clear()
  projectionOrigin = null
  useChatProjectionStore.getState().resetChatProjection()
  resetThreadEarlierPageStore()
}
