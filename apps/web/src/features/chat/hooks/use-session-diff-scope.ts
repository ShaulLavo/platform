import { useActiveChatProjection } from '@/features/chat/hooks/use-active-projection'
import { scopedSessionKey, type TurnId } from '@workspace/contracts'
import { useEffect } from 'react'

import { useOpenCheckpointDiffDocument } from '@/features/chat/hooks/use-open-checkpoint-diff-document'
import { useSessionDiffScopeStore } from '@/features/chat/state/session-diff-scope-store'
import {
  DEFAULT_SESSION_DIFF_SCOPE,
  reconcileSessionDiffScope,
} from '@/features/chat/utils/session-diff-scope-storage'
import { useChatModeSession } from '@/features/chat-mode/providers/session-context'

const NO_TURN_IDS: readonly TurnId[] = []

/**
 * The active session's remembered diff pick, already reconciled against the turns
 * that still exist. Reconciliation happens twice on purpose: purely during
 * render, so the first paint after a revert never shows a turn that is gone, and
 * once through the store so the persisted pick stops naming a dead turn.
 */
export function useSessionDiffScope() {
  const { activeSession, transport } = useChatModeSession()
  const sessionId = activeSession.sessionId
  const turnIds = useActiveChatProjection((state) =>
    sessionId ? (state.turnDiffIdsBySessionId[sessionId] ?? NO_TURN_IDS) : NO_TURN_IDS,
  )
  const summaryByTurnId = useActiveChatProjection((state) =>
    sessionId ? state.turnDiffSummaryBySessionId[sessionId] : undefined,
  )
  const storedScope = useSessionDiffScopeStore(
    (state) =>
      (sessionId
        ? state.scopeBySessionKey[
            scopedSessionKey({ environmentId: transport.environmentId, sessionId })
          ]?.scope
        : undefined) ?? DEFAULT_SESSION_DIFF_SCOPE,
  )
  const reconcileTurnScope = useSessionDiffScopeStore((state) => state.reconcileTurnScope)
  const selectSessionDiffScope = useSessionDiffScopeStore((state) => state.selectSessionDiffScope)
  const { openCheckpointDiff } = useOpenCheckpointDiffDocument()

  const scope = reconcileSessionDiffScope(storedScope, turnIds) ?? storedScope
  const turnSummary = scope.kind === 'turn' ? (summaryByTurnId?.[scope.turnId] ?? null) : null
  const latestTurnId = turnIds.at(-1) ?? null

  useEffect(() => {
    if (!sessionId) return

    reconcileTurnScope({ environmentId: transport.environmentId, sessionId }, turnIds)
  }, [reconcileTurnScope, sessionId, turnIds, transport.environmentId])

  function selectScope(next: Parameters<typeof selectSessionDiffScope>[1]) {
    if (!sessionId) return

    selectSessionDiffScope({ environmentId: transport.environmentId, sessionId }, next)
  }

  return {
    latestTurnId,
    scope,
    /** Switching to turn scope shows the turn; opening a file in it is a separate act. */
    selectTurnScope: (turnId: TurnId) => selectScope({ filePath: null, kind: 'turn', turnId }),
    selectWorkingTreeScope: () => selectScope({ kind: 'working-tree' }),
    /** Opens one file of the scoped turn; the open records the pick on its own. */
    openTurnFile: (path: string) => {
      if (!turnSummary) return

      void openCheckpointDiff(turnSummary, path)
    },
    turnSummary,
  }
}
