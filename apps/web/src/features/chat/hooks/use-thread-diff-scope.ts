import type { TurnId } from '@workspace/contracts'
import { useEffect } from 'react'

import { useOpenCheckpointDiffDocument } from '@/features/chat/hooks/use-open-checkpoint-diff-document'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { useThreadDiffScopeStore } from '@/features/chat/state/thread-diff-scope-store'
import {
  DEFAULT_THREAD_DIFF_SCOPE,
  reconcileThreadDiffScope,
} from '@/features/chat/utils/thread-diff-scope-storage'
import { useChatModeSession } from '@/features/chat-mode/providers/session-context'

const NO_TURN_IDS: readonly TurnId[] = []

/**
 * The active thread's remembered diff pick, already reconciled against the turns
 * that still exist. Reconciliation happens twice on purpose: purely during
 * render, so the first paint after a revert never shows a turn that is gone, and
 * once through the store so the persisted pick stops naming a dead turn.
 */
export function useThreadDiffScope() {
  const { activeSession } = useChatModeSession()
  const threadId = activeSession.threadId
  const turnIds = useChatProjectionStore((state) =>
    threadId ? (state.turnDiffIdsByThreadId[threadId] ?? NO_TURN_IDS) : NO_TURN_IDS,
  )
  const summaryByTurnId = useChatProjectionStore((state) =>
    threadId ? state.turnDiffSummaryByThreadId[threadId] : undefined,
  )
  const storedScope = useThreadDiffScopeStore(
    (state) =>
      (threadId ? state.scopeByThreadId[threadId]?.scope : undefined) ?? DEFAULT_THREAD_DIFF_SCOPE,
  )
  const reconcileTurnScope = useThreadDiffScopeStore((state) => state.reconcileTurnScope)
  const selectThreadDiffScope = useThreadDiffScopeStore((state) => state.selectThreadDiffScope)
  const { openCheckpointDiff } = useOpenCheckpointDiffDocument()

  const scope = reconcileThreadDiffScope(storedScope, turnIds) ?? storedScope
  const turnSummary = scope.kind === 'turn' ? (summaryByTurnId?.[scope.turnId] ?? null) : null
  const latestTurnId = turnIds.at(-1) ?? null

  useEffect(() => {
    if (!threadId) return

    reconcileTurnScope(threadId, turnIds)
  }, [reconcileTurnScope, threadId, turnIds])

  function selectScope(next: Parameters<typeof selectThreadDiffScope>[1]) {
    if (!threadId) return

    selectThreadDiffScope(threadId, next)
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
