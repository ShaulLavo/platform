import type { SessionId } from '@workspace/contracts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type ChatSessionSelection =
  | { kind: 'auto' }
  | { kind: 'draft' }
  | { kind: 'session'; sessionId: SessionId }

export function useActiveChatSessionId(sessionIds: readonly SessionId[]) {
  const [selection, setSelection] = useState<ChatSessionSelection>({ kind: 'auto' })
  const selectedWasAvailable = useRef(false)
  const availableSessionIds = useMemo(() => new Set(sessionIds), [sessionIds])
  const selectedSessionId = selection.kind === 'session' ? selection.sessionId : null
  const activeSessionId =
    selection.kind === 'draft' ? null : (selectedSessionId ?? sessionIds[0] ?? null)

  useEffect(() => {
    if (selection.kind !== 'session') return
    if (!selectedSessionId) return
    if (availableSessionIds.has(selectedSessionId)) {
      selectedWasAvailable.current = true
      return
    }
    if (!selectedWasAvailable.current) return

    selectedWasAvailable.current = false
    // Syncing local selection to the external session list: a session we were showing
    // got deleted, so fall back to auto. This can't be derived during render —
    // telling "deleted" apart from the create-time race (selected before the session
    // lands in the projection store) needs the selectedWasAvailable history, and
    // reading a ref or setting state during render trips the other compiler rules.
    // oxlint-disable-next-line oxc-react-compiler/set-state-in-effect
    setSelection({ kind: 'auto' })
  }, [availableSessionIds, selectedSessionId, selection.kind])

  const setActiveSessionId = useCallback((sessionId: SessionId) => {
    setSelection({ kind: 'session', sessionId })
  }, [])

  const selectDraftSession = useCallback(() => {
    selectedWasAvailable.current = false
    setSelection({ kind: 'draft' })
  }, [])

  return {
    activeSessionId,
    selectDraftSession,
    setActiveSessionId,
  }
}
