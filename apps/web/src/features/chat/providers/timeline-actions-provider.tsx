import { useMemo, type ReactNode } from 'react'

import { useOpenCheckpointDiffDocument } from '@/features/chat/hooks/use-open-checkpoint-diff-document'
import {
  ChatTimelineActionsContext,
  type ChatTimelineActions,
} from '@/features/chat/providers/timeline-actions-context'

export function ChatTimelineActionsProvider({
  children,
  revertToCheckpoint,
}: {
  readonly children: ReactNode
  readonly revertToCheckpoint: (turnCount: number) => void
}) {
  const { openCheckpointDiff, openFullThreadCheckpointDiff } = useOpenCheckpointDiffDocument()
  // Context value stability keeps message rows from repainting on unrelated chat chrome changes.
  const value = useMemo<ChatTimelineActions>(
    () => ({
      openCheckpointDiff,
      openThreadCheckpointDiff: openFullThreadCheckpointDiff,
      revertToCheckpoint,
    }),
    [openCheckpointDiff, openFullThreadCheckpointDiff, revertToCheckpoint],
  )

  return <ChatTimelineActionsContext value={value}>{children}</ChatTimelineActionsContext>
}
