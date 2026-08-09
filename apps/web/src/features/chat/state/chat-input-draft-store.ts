import type {
  ChatAttachment,
  InteractionMode,
  ModelSelection,
  RuntimeMode,
  ThreadId,
} from '@workspace/contracts'
import { Debouncer } from '@tanstack/react-pacer/debouncer'
import { create } from 'zustand'

import {
  chatInputDraftStorageId,
  emptyPersistedChatInputDrafts,
  readPersistedChatInputDrafts,
  writePersistedChatInputDrafts,
  type PersistedChatInputDraft,
  type PersistedChatInputDraftStorage,
} from '../lib/chat-draft-storage'

const CHAT_INPUT_DRAFT_PERSIST_DEBOUNCE_MS = 300
const CHAT_INPUT_DRAFT_PERSISTENCE_ERROR = 'Chat draft could not be saved locally.'

export type ChatInputDraftTarget = {
  draftKey: string | null
  rootPath: string
}

export type ChatInputImageAttachment = ChatAttachment & {
  dataUrl: string
  previewUrl: string
}

type ChatInputTerminalContext = {
  id: string
  label: string
  value: string
}

type ChatInputDraftPromotion = {
  promotedThreadId?: ThreadId
  status: 'idle' | 'promoting' | 'promoted'
  threadId?: ThreadId
  updatedAt: string
}

export type ChatInputDraft = {
  draftPromotion: ChatInputDraftPromotion | null
  images: ChatInputImageAttachment[]
  interactionMode: InteractionMode | null
  modelSelection: ModelSelection | null
  prompt: string
  runtimeMode: RuntimeMode | null
  terminalContexts: ChatInputTerminalContext[]
  updatedAt: string | null
}

type ChatInputDraftState = {
  draftsByKey: Record<string, ChatInputDraft>
  persistenceError: string | null
}

type ChatInputDraftActions = {
  addImages: (target: ChatInputDraftTarget, images: readonly ChatInputImageAttachment[]) => void
  clearDraft: (target: ChatInputDraftTarget) => void
  flush: () => boolean
  getDraft: (target: ChatInputDraftTarget) => ChatInputDraft
  markDraftPromotion: (
    target: ChatInputDraftTarget,
    promotion: Omit<ChatInputDraftPromotion, 'updatedAt'>,
  ) => void
  removeImage: (target: ChatInputDraftTarget, imageId: string) => void
  setInteractionMode: (
    target: ChatInputDraftTarget,
    interactionMode: InteractionMode | null,
  ) => void
  setModelSelection: (target: ChatInputDraftTarget, modelSelection: ModelSelection | null) => void
  setPrompt: (target: ChatInputDraftTarget, prompt: string) => void
  setRuntimeMode: (target: ChatInputDraftTarget, runtimeMode: RuntimeMode | null) => void
  setTerminalContexts: (
    target: ChatInputDraftTarget,
    terminalContexts: readonly ChatInputTerminalContext[],
  ) => void
}

export type ChatInputDraftStore = ChatInputDraftState & ChatInputDraftActions

const EMPTY_IMAGES: ChatInputImageAttachment[] = []
const EMPTY_TERMINAL_CONTEXTS: ChatInputTerminalContext[] = []
const EMPTY_CHAT_INPUT_DRAFT: ChatInputDraft = {
  draftPromotion: null,
  images: EMPTY_IMAGES,
  interactionMode: null,
  modelSelection: null,
  prompt: '',
  runtimeMode: null,
  terminalContexts: EMPTY_TERMINAL_CONTEXTS,
  updatedAt: null,
}

const draftPersist = new Debouncer(() => flushChatInputDraftStorage(), {
  wait: CHAT_INPUT_DRAFT_PERSIST_DEBOUNCE_MS,
})

export const useChatInputDraftStore = create<ChatInputDraftStore>((set, get) => ({
  ...createInitialChatInputDraftState(),
  addImages: (target, images) => {
    set((state) => updateDraftForTarget(state, target, (draft) => addImagesToDraft(draft, images)))
    draftPersist.maybeExecute()
  },
  clearDraft: (target) => {
    set((state) => removeDraftForTarget(state, target))
    draftPersist.maybeExecute()
  },
  flush: () => flushChatInputDraftStorage(),
  getDraft: (target) => chatInputDraftForTarget(get(), target),
  markDraftPromotion: (target, promotion) => {
    set((state) =>
      updateDraftForTarget(state, target, (draft) =>
        withDraftPatch(draft, {
          draftPromotion: {
            ...promotion,
            updatedAt: new Date().toISOString(),
          },
        }),
      ),
    )
    draftPersist.maybeExecute()
  },
  removeImage: (target, imageId) => {
    set((state) =>
      updateDraftForTarget(state, target, (draft) => removeImageFromDraft(draft, imageId)),
    )
    draftPersist.maybeExecute()
  },
  setInteractionMode: (target, interactionMode) => {
    set((state) =>
      updateDraftForTarget(state, target, (draft) => withDraftPatch(draft, { interactionMode })),
    )
    draftPersist.maybeExecute()
  },
  setModelSelection: (target, modelSelection) => {
    set((state) =>
      updateDraftForTarget(state, target, (draft) => withDraftPatch(draft, { modelSelection })),
    )
    draftPersist.maybeExecute()
  },
  setPrompt: (target, prompt) => {
    set((state) =>
      updateDraftForTarget(state, target, (draft) => withDraftPatch(draft, { prompt })),
    )
    draftPersist.maybeExecute()
  },
  setRuntimeMode: (target, runtimeMode) => {
    set((state) =>
      updateDraftForTarget(state, target, (draft) => withDraftPatch(draft, { runtimeMode })),
    )
    draftPersist.maybeExecute()
  },
  setTerminalContexts: (target, terminalContexts) => {
    set((state) =>
      updateDraftForTarget(state, target, (draft) =>
        withDraftPatch(draft, { terminalContexts: Array.from(terminalContexts) }),
      ),
    )
    draftPersist.maybeExecute()
  },
}))

export function selectChatInputDraftImages(
  state: ChatInputDraftStore,
  target: ChatInputDraftTarget,
) {
  return chatInputDraftForTarget(state, target).images
}

export function readChatInputDraftPrompt(target: ChatInputDraftTarget) {
  return useChatInputDraftStore.getState().getDraft(target).prompt
}

export function flushChatInputDraftStorage() {
  draftPersist.cancel()

  try {
    writePersistedChatInputDrafts(persistedStorageFromState(useChatInputDraftStore.getState()))
    clearDraftPersistenceError()
    return true
  } catch {
    useChatInputDraftStore.setState({ persistenceError: CHAT_INPUT_DRAFT_PERSISTENCE_ERROR })
    return false
  }
}

export function hydrateChatInputDraftStoreFromStorage() {
  useChatInputDraftStore.setState(createInitialChatInputDraftState())
}

export function resetChatInputDraftStore() {
  draftPersist.cancel()
  useChatInputDraftStore.setState({
    draftsByKey: {},
    persistenceError: null,
  })
}

function createInitialChatInputDraftState(): ChatInputDraftState {
  return {
    draftsByKey: hydrateDrafts(readPersistedChatInputDrafts()),
    persistenceError: null,
  }
}

function chatInputDraftForTarget(
  state: Pick<ChatInputDraftState, 'draftsByKey'>,
  target: ChatInputDraftTarget,
) {
  const draftId = chatInputDraftStorageId(target.rootPath, target.draftKey)
  if (!draftId) return EMPTY_CHAT_INPUT_DRAFT

  return state.draftsByKey[draftId] ?? EMPTY_CHAT_INPUT_DRAFT
}

function updateDraftForTarget(
  state: ChatInputDraftState,
  target: ChatInputDraftTarget,
  update: (draft: ChatInputDraft) => ChatInputDraft,
): ChatInputDraftState {
  const draftId = chatInputDraftStorageId(target.rootPath, target.draftKey)
  if (!draftId) return state

  const draft = state.draftsByKey[draftId] ?? EMPTY_CHAT_INPUT_DRAFT
  const nextDraft = update(draft)
  if (nextDraft === draft) return state
  if (isEmptyChatInputDraft(nextDraft)) return removeDraftById(state, draftId)

  return {
    ...state,
    draftsByKey: {
      ...state.draftsByKey,
      [draftId]: nextDraft,
    },
  }
}

function removeDraftForTarget(
  state: ChatInputDraftState,
  target: ChatInputDraftTarget,
): ChatInputDraftState {
  const draftId = chatInputDraftStorageId(target.rootPath, target.draftKey)
  if (!draftId) return state

  return removeDraftById(state, draftId)
}

function removeDraftById(state: ChatInputDraftState, draftId: string): ChatInputDraftState {
  if (!state.draftsByKey[draftId]) return state

  const { [draftId]: _removed, ...draftsByKey } = state.draftsByKey
  return {
    ...state,
    draftsByKey,
  }
}

function withDraftPatch(draft: ChatInputDraft, patch: Partial<ChatInputDraft>): ChatInputDraft {
  const nextDraft = {
    ...draft,
    ...patch,
    updatedAt: new Date().toISOString(),
  }

  return draftsEqual(draft, nextDraft) ? draft : nextDraft
}

function addImagesToDraft(
  draft: ChatInputDraft,
  images: readonly ChatInputImageAttachment[],
): ChatInputDraft {
  if (images.length === 0) return draft

  return withDraftPatch(draft, {
    images: draft.images.concat(images),
  })
}

function removeImageFromDraft(draft: ChatInputDraft, imageId: string): ChatInputDraft {
  const images = draft.images.filter((image) => image.id !== imageId)
  if (images.length === draft.images.length) return draft

  return withDraftPatch(draft, { images })
}

function isEmptyChatInputDraft(draft: ChatInputDraft) {
  if (draft.prompt.trim()) return false
  if (draft.images.length > 0) return false
  if (draft.terminalContexts.length > 0) return false
  if (draft.modelSelection) return false
  if (draft.runtimeMode) return false
  if (draft.interactionMode) return false

  return !draft.draftPromotion
}

function draftsEqual(left: ChatInputDraft, right: ChatInputDraft) {
  return (
    left.prompt === right.prompt &&
    left.images === right.images &&
    left.terminalContexts === right.terminalContexts &&
    left.modelSelection === right.modelSelection &&
    left.runtimeMode === right.runtimeMode &&
    left.interactionMode === right.interactionMode &&
    left.draftPromotion === right.draftPromotion
  )
}

function clearDraftPersistenceError() {
  if (!useChatInputDraftStore.getState().persistenceError) return

  useChatInputDraftStore.setState({ persistenceError: null })
}

function hydrateDrafts(storage: PersistedChatInputDraftStorage) {
  return Object.fromEntries(
    Object.entries(storage.draftsByKey).map(([draftId, draft]) => [draftId, hydrateDraft(draft)]),
  )
}

function hydrateDraft(draft: PersistedChatInputDraft): ChatInputDraft {
  return {
    draftPromotion: draft.draftPromotion as ChatInputDraftPromotion | null,
    // Image bytes never reach storage, so a stored draft has no preview source:
    // restoring its attachments would only render broken thumbnails.
    images: EMPTY_IMAGES,
    interactionMode: draft.interactionMode,
    modelSelection: draft.modelSelection,
    prompt: draft.prompt,
    runtimeMode: draft.runtimeMode,
    terminalContexts: draft.terminalContexts,
    updatedAt: draft.updatedAt,
  }
}

function persistedStorageFromState(state: ChatInputDraftState): PersistedChatInputDraftStorage {
  const storage = emptyPersistedChatInputDrafts()

  for (const [draftId, draft] of Object.entries(state.draftsByKey)) {
    if (isEmptyChatInputDraft(draft)) continue

    storage.draftsByKey[draftId] = persistedDraft(draft)
  }

  return storage
}

function persistedDraft(draft: ChatInputDraft): PersistedChatInputDraft {
  return {
    draftPromotion: draft.draftPromotion,
    interactionMode: draft.interactionMode,
    modelSelection: draft.modelSelection,
    prompt: draft.prompt,
    runtimeMode: draft.runtimeMode,
    terminalContexts: draft.terminalContexts,
    updatedAt: draft.updatedAt,
  }
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeunload', () => {
    flushChatInputDraftStorage()
  })
}
