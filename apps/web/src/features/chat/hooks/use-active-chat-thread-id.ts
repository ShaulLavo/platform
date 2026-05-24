import type { ThreadId } from '@workspace/contracts'
import { useEffect, useMemo, useRef, useState } from 'react'

export function useActiveChatThreadId(threadIds: readonly ThreadId[]) {
  const [selectedThreadId, setSelectedThreadId] = useState<ThreadId | null>(null)
  const selectedWasAvailable = useRef(false)
  const availableThreadIds = useMemo(() => new Set(threadIds), [threadIds])
  const activeThreadId = selectedThreadId ?? threadIds[0] ?? null

  useEffect(() => {
    if (!selectedThreadId) return
    if (availableThreadIds.has(selectedThreadId)) {
      selectedWasAvailable.current = true
      return
    }
    if (!selectedWasAvailable.current) return

    selectedWasAvailable.current = false
    setSelectedThreadId(threadIds[0] ?? null)
  }, [availableThreadIds, selectedThreadId, threadIds])

  return {
    activeThreadId,
    setActiveThreadId: setSelectedThreadId,
  }
}
