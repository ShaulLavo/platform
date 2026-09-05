import { createContext } from 'react'

import type { ChatTurnDiffSummary } from '@/features/chat/state/chat-projection-store'

export type ChatTimelineActions = {
  readonly openCheckpointDiff: (
    summary: ChatTurnDiffSummary,
    path?: string,
  ) => Promise<unknown> | unknown
  readonly openSessionCheckpointDiff: (summary: ChatTurnDiffSummary) => Promise<unknown> | unknown
  readonly revertToCheckpoint: (turnCount: number) => void
}

export const ChatTimelineActionsContext = createContext<ChatTimelineActions | null>(null)
