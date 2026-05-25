import type { ThreadId } from '@workspace/contracts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type ChatThreadSelection =
  | { kind: 'auto' }
  | { kind: 'draft' }
  | { kind: 'thread'; threadId: ThreadId }

export function useActiveChatThreadId(threadIds: readonly ThreadId[]) {
  const [selection, setSelection] = useState<ChatThreadSelection>({ kind: 'auto' })
  const selectedWasAvailable = useRef(false)
  const availableThreadIds = useMemo(() => new Set(threadIds), [threadIds])
  const selectedThreadId = selection.kind === 'thread' ? selection.threadId : null
  const activeThreadId =
    selection.kind === 'draft' ? null : (selectedThreadId ?? threadIds[0] ?? null)

  useEffect(() => {
    if (selection.kind !== 'thread') return
    if (!selectedThreadId) return
    if (availableThreadIds.has(selectedThreadId)) {
      selectedWasAvailable.current = true
      return
    }
    if (!selectedWasAvailable.current) return

    selectedWasAvailable.current = false
    setSelection({ kind: 'auto' })
  }, [availableThreadIds, selectedThreadId, selection.kind])

  const setActiveThreadId = useCallback((threadId: ThreadId) => {
    setSelection({ kind: 'thread', threadId })
  }, [])

  const selectDraftThread = useCallback(() => {
    selectedWasAvailable.current = false
    setSelection({ kind: 'draft' })
  }, [])

  return {
    activeThreadId,
    selectDraftThread,
    setActiveThreadId,
  }
}
