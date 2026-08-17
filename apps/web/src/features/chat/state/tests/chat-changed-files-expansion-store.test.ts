import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  CHAT_CHANGED_FILES_EXPANSION_LIMIT,
  CHAT_CHANGED_FILES_EXPANSION_STORAGE_KEY,
} from '@/features/chat/utils/changed-files-expansion-storage'
import {
  hydrateChatChangedFilesExpansionStoreFromStorage,
  resetChatChangedFilesExpansionStore,
  useChatChangedFilesExpansionStore,
} from '@/features/chat/state/chat-changed-files-expansion-store'

// The node project has no DOM, and the point of these tests is what crosses
// localStorage, so stand up a real Map-backed Storage rather than skipping it.
const STORE = new Map<string, string>()

function memoryLocalStorage(): Storage {
  return {
    get length() {
      return STORE.size
    },
    clear: () => STORE.clear(),
    getItem: (key: string) => STORE.get(key) ?? null,
    key: (index: number) => Array.from(STORE.keys())[index] ?? null,
    removeItem: (key: string) => void STORE.delete(key),
    setItem: (key: string, value: string) => void STORE.set(key, value),
  }
}

function expansion(key: string) {
  return useChatChangedFilesExpansionStore.getState().expansionByKey[key]
}

function storedKeys() {
  const raw = STORE.get(CHAT_CHANGED_FILES_EXPANSION_STORAGE_KEY) ?? '{}'
  return Object.keys(JSON.parse(raw).expansionByKey ?? {})
}

beforeEach(() => {
  STORE.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: memoryLocalStorage(),
  })
  resetChatChangedFilesExpansionStore()
})

afterEach(() => {
  STORE.clear()
  resetChatChangedFilesExpansionStore()
  delete (globalThis as { localStorage?: Storage }).localStorage
})

describe('chat changed-files expansion store', () => {
  it('reports nothing chosen until the user chooses', () => {
    expect(expansion('thread-1:turn-1')).toBeUndefined()
  })

  it('keeps the card and its folders as independent choices', () => {
    const { setCardExpanded, setDirectoriesExpanded } = useChatChangedFilesExpansionStore.getState()

    setCardExpanded('thread-1:turn-1', true)
    expect(expansion('thread-1:turn-1')).toMatchObject({
      cardExpanded: true,
      directoriesExpanded: null,
    })

    setDirectoriesExpanded('thread-1:turn-1', false)
    expect(expansion('thread-1:turn-1')).toMatchObject({
      cardExpanded: true,
      directoriesExpanded: false,
    })
  })

  it('survives a reload', () => {
    useChatChangedFilesExpansionStore.getState().setCardExpanded('thread-1:turn-1', true)

    // What a fresh page load does: drop the in-memory store, read storage back.
    resetChatChangedFilesExpansionStore()
    expect(expansion('thread-1:turn-1')).toBeUndefined()

    hydrateChatChangedFilesExpansionStoreFromStorage()
    expect(expansion('thread-1:turn-1')).toMatchObject({ cardExpanded: true })
  })

  it('drops storage written under a different version instead of trusting it', () => {
    localStorage.setItem(
      CHAT_CHANGED_FILES_EXPANSION_STORAGE_KEY,
      JSON.stringify({ expansionByKey: { 'thread-1:turn-1': { cardExpanded: true } }, version: 2 }),
    )

    hydrateChatChangedFilesExpansionStoreFromStorage()

    expect(useChatChangedFilesExpansionStore.getState().expansionByKey).toEqual({})
  })

  it('bounds the entries deleted threads would otherwise leave behind forever', () => {
    const { setCardExpanded } = useChatChangedFilesExpansionStore.getState()
    const total = CHAT_CHANGED_FILES_EXPANSION_LIMIT + 25

    for (let index = 0; index < total; index += 1) {
      setCardExpanded(`thread-${index}:turn-1`, true)
    }

    const keys = Object.keys(useChatChangedFilesExpansionStore.getState().expansionByKey)
    expect(keys).toHaveLength(CHAT_CHANGED_FILES_EXPANSION_LIMIT)
    expect(keys).toContain(`thread-${total - 1}:turn-1`)
    expect(keys).not.toContain('thread-0:turn-1')
    expect(storedKeys()).toHaveLength(CHAT_CHANGED_FILES_EXPANSION_LIMIT)
  })
})
