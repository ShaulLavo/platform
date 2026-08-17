import { createFocusStore, FocusContext } from '@/features/workspace/providers/focus-state'
import { useState, type ReactNode } from 'react'

export function FocusProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createFocusStore)

  return <FocusContext value={store}>{children}</FocusContext>
}
