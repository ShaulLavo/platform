import type { ReactNode } from 'react'

import { useRailOrderActions } from '@/features/chat-mode/hooks/use-rail-order-actions'
import { ChatRailOrderContext } from '@/features/chat-mode/providers/rail-order-context'

export function ChatRailOrderProvider({ children }: { readonly children: ReactNode }) {
  const railOrder = useRailOrderActions()

  return <ChatRailOrderContext value={railOrder}>{children}</ChatRailOrderContext>
}
