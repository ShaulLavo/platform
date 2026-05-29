import { create } from 'zustand'

import type { ChatTurnDiffSummary } from './chat-projection-store'

type ChatChangedFilesExpansionStore = {
  expandedBySummaryId: Record<string, boolean>
  setSummaryExpanded: (summaryId: string, expanded: boolean) => void
}

export const useChatChangedFilesExpansionStore = create<ChatChangedFilesExpansionStore>((set) => ({
  expandedBySummaryId: {},
  setSummaryExpanded: (summaryId, expanded) =>
    set((state) => ({
      expandedBySummaryId: {
        ...state.expandedBySummaryId,
        [summaryId]: expanded,
      },
    })),
}))

export function chatChangedFilesExpansionKey(summary: ChatTurnDiffSummary) {
  return `${summary.threadId}:${summary.turnId}`
}
