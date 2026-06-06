import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PROVIDER_INSTANCE_ID } from '@workspace/contracts'

import { CHAT_INPUT_DRAFT_STORAGE_KEY } from '../../lib/chat-draft-storage'
import {
  flushChatInputDraftStorage,
  hydrateChatInputDraftStoreFromStorage,
  resetChatInputDraftStore,
  useChatInputDraftStore,
  type ChatInputDraftTarget,
  type ChatInputImageAttachment,
} from '../chat-input-draft-store'

const STORE = new Map<string, string>()
const TARGET: ChatInputDraftTarget = {
  draftKey: 'thread-1',
  rootPath: '/repo',
}

describe('chat input draft store', () => {
  beforeEach(() => {
    STORE.clear()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: fakeLocalStorage(),
    })
    resetChatInputDraftStore()
  })

  afterEach(() => {
    resetChatInputDraftStore()
    delete (globalThis as { localStorage?: Storage }).localStorage
  })

  it('persists and hydrates versioned prompt, model, and images', () => {
    useChatInputDraftStore.getState().setPrompt(TARGET, 'Explain this screenshot')
    useChatInputDraftStore.getState().setModelSelection(TARGET, {
      model: 'codex-test',
      providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
    })
    useChatInputDraftStore.getState().addImages(TARGET, [imageAttachment('image-1')])

    expect(flushChatInputDraftStorage()).toBe(true)

    const persisted = JSON.parse(STORE.get(CHAT_INPUT_DRAFT_STORAGE_KEY) ?? '{}')
    expect(persisted.version).toBe(1)

    resetChatInputDraftStore()
    hydrateChatInputDraftStoreFromStorage()

    const draft = useChatInputDraftStore.getState().getDraft(TARGET)
    expect(draft.prompt).toBe('Explain this screenshot')
    expect(draft.modelSelection?.model).toBe('codex-test')
    expect(draft.images).toMatchObject([
      {
        dataUrl: 'data:image/png;base64,abc',
        id: 'image-1',
        previewUrl: 'data:image/png;base64,abc',
      },
    ])
  })

  it('clears a draft after successful send cleanup', () => {
    useChatInputDraftStore.getState().setPrompt(TARGET, 'Ship it')
    useChatInputDraftStore.getState().addImages(TARGET, [imageAttachment('image-1')])
    useChatInputDraftStore.getState().clearDraft(TARGET)

    expect(flushChatInputDraftStorage()).toBe(true)
    expect(useChatInputDraftStore.getState().getDraft(TARGET).prompt).toBe('')
    expect(STORE.get(CHAT_INPUT_DRAFT_STORAGE_KEY)).toContain('"draftsByKey":{}')
  })

  it('keeps in-memory attachments when local storage persistence fails', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: throwingLocalStorage(),
    })
    resetChatInputDraftStore()
    useChatInputDraftStore.getState().addImages(TARGET, [imageAttachment('image-1')])

    expect(flushChatInputDraftStorage()).toBe(false)
    expect(useChatInputDraftStore.getState().persistenceError).toBe(
      'Chat draft could not be saved locally.',
    )
    expect(useChatInputDraftStore.getState().getDraft(TARGET).images).toHaveLength(1)
  })
})

function imageAttachment(id: string): ChatInputImageAttachment {
  return {
    dataUrl: 'data:image/png;base64,abc',
    id,
    mimeType: 'image/png',
    name: 'screenshot.png',
    previewUrl: 'data:image/png;base64,abc',
    sizeBytes: 3,
    type: 'image',
  }
}

function fakeLocalStorage() {
  return {
    getItem: (key: string) => STORE.get(key) ?? null,
    removeItem: (key: string) => {
      STORE.delete(key)
    },
    setItem: (key: string, value: string) => {
      STORE.set(key, value)
    },
  }
}

function throwingLocalStorage() {
  return {
    getItem: () => null,
    removeItem: () => undefined,
    setItem: () => {
      throw new Error('quota')
    },
  }
}
