import { create } from 'zustand'

import {
  nextChatChangedFilesExpansionStamp,
  pruneChatChangedFilesExpansion,
  readPersistedChatChangedFilesExpansion,
  writePersistedChatChangedFilesExpansion,
  type PersistedChatChangedFilesExpansion,
} from '../lib/chat-changed-files-expansion-storage'
import type { ChatTurnDiffSummary } from './chat-projection-store'

export type ChatChangedFilesExpansion = PersistedChatChangedFilesExpansion

type ChatChangedFilesExpansionChanges = Partial<
  Pick<ChatChangedFilesExpansion, 'cardExpanded' | 'directoriesExpanded'>
>

/**
 * Changed-files cards render inside the virtualized timeline, so a card that
 * scrolls out of overscan unmounts — expansion cannot be component state. It
 * also has to survive a reload: reopening a thread to find every card back at
 * its default is the same lost place as scrolling back to the top.
 */
type ChatChangedFilesExpansionStore = {
  expansionByKey: Record<string, ChatChangedFilesExpansion>
  setCardExpanded: (expansionKey: string, expanded: boolean) => void
  setDirectoriesExpanded: (expansionKey: string, expanded: boolean) => void
}

const UNSET_EXPANSION: ChatChangedFilesExpansion = {
  cardExpanded: null,
  directoriesExpanded: null,
  updatedAt: 0,
}

export const useChatChangedFilesExpansionStore = create<ChatChangedFilesExpansionStore>((set) => ({
  expansionByKey: readPersistedChatChangedFilesExpansion().expansionByKey,
  setCardExpanded: (expansionKey, cardExpanded) => {
    set((state) => withExpansion(state, expansionKey, { cardExpanded }))
    persistChatChangedFilesExpansion()
  },
  setDirectoriesExpanded: (expansionKey, directoriesExpanded) => {
    set((state) => withExpansion(state, expansionKey, { directoriesExpanded }))
    persistChatChangedFilesExpansion()
  },
}))

export function chatChangedFilesExpansionKey(summary: ChatTurnDiffSummary) {
  return `${summary.threadId}:${summary.turnId}`
}

export function hydrateChatChangedFilesExpansionStoreFromStorage() {
  useChatChangedFilesExpansionStore.setState({
    expansionByKey: readPersistedChatChangedFilesExpansion().expansionByKey,
  })
}

export function resetChatChangedFilesExpansionStore() {
  useChatChangedFilesExpansionStore.setState({ expansionByKey: {} })
}

function persistChatChangedFilesExpansion() {
  try {
    writePersistedChatChangedFilesExpansion(
      useChatChangedFilesExpansionStore.getState().expansionByKey,
    )
  } catch {
    // A full or blocked localStorage costs the user a remembered disclosure
    // state, which is not worth surfacing anywhere in the transcript.
  }
}

function withExpansion(
  state: ChatChangedFilesExpansionStore,
  expansionKey: string,
  changes: ChatChangedFilesExpansionChanges,
) {
  const current = state.expansionByKey[expansionKey] ?? UNSET_EXPANSION

  return {
    expansionByKey: pruneChatChangedFilesExpansion({
      ...state.expansionByKey,
      [expansionKey]: {
        ...current,
        ...changes,
        updatedAt: nextChatChangedFilesExpansionStamp(state.expansionByKey),
      },
    }),
  }
}
