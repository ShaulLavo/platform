import {
  interactionModeSchema,
  modelSelectionSchema,
  runtimeModeSchema,
  trimmedNonEmptyStringSchema,
} from '@workspace/contracts'
import * as v from 'valibot'

export const CHAT_INPUT_DRAFT_STORAGE_KEY = 'platform.chat-input-drafts.v1'
const CHAT_INPUT_DRAFT_STORAGE_VERSION = 1

const persistedImageAttachmentSchema = v.object({
  dataUrl: v.pipe(v.string(), v.minLength(1)),
  id: trimmedNonEmptyStringSchema,
  mimeType: v.pipe(v.string(), v.regex(/^image\//i)),
  name: trimmedNonEmptyStringSchema,
  sizeBytes: v.pipe(v.number(), v.integer(), v.minValue(0)),
  type: v.literal('image'),
})

const persistedTerminalContextSchema = v.object({
  id: trimmedNonEmptyStringSchema,
  label: trimmedNonEmptyStringSchema,
  value: trimmedNonEmptyStringSchema,
})

const draftPromotionSchema = v.object({
  promotedThreadId: v.optional(trimmedNonEmptyStringSchema),
  status: v.picklist(['idle', 'promoting', 'promoted']),
  threadId: v.optional(trimmedNonEmptyStringSchema),
  updatedAt: trimmedNonEmptyStringSchema,
})

const persistedChatInputDraftSchema = v.object({
  draftPromotion: v.optional(v.nullable(draftPromotionSchema), null),
  images: v.optional(v.array(persistedImageAttachmentSchema), []),
  interactionMode: v.optional(v.nullable(interactionModeSchema), null),
  modelSelection: v.optional(v.nullable(modelSelectionSchema), null),
  prompt: v.optional(v.string(), ''),
  runtimeMode: v.optional(v.nullable(runtimeModeSchema), null),
  terminalContexts: v.optional(v.array(persistedTerminalContextSchema), []),
  updatedAt: v.optional(v.nullable(v.string()), null),
})

const persistedChatInputDraftStorageSchema = v.object({
  draftsByKey: v.record(v.string(), persistedChatInputDraftSchema),
  version: v.literal(CHAT_INPUT_DRAFT_STORAGE_VERSION),
})

export type PersistedChatInputDraft = v.InferOutput<typeof persistedChatInputDraftSchema>
export type PersistedChatInputDraftStorage = v.InferOutput<
  typeof persistedChatInputDraftStorageSchema
>

export function chatInputDraftStorageId(rootPath: string, draftKey: string | null) {
  if (!draftKey) return null

  return `${encodeURIComponent(rootPath)}:${draftKey}`
}

export function readPersistedChatInputDrafts(): PersistedChatInputDraftStorage {
  const fallback = emptyPersistedChatInputDrafts()
  if (!canUseLocalStorage()) return fallback

  try {
    const raw = localStorage.getItem(CHAT_INPUT_DRAFT_STORAGE_KEY)
    if (!raw) return fallback

    const parsed = v.safeParse(persistedChatInputDraftStorageSchema, JSON.parse(raw))
    if (!parsed.success) return fallback

    return parsed.output
  } catch {
    return fallback
  }
}

export function writePersistedChatInputDrafts(storage: PersistedChatInputDraftStorage) {
  if (!canUseLocalStorage()) return

  localStorage.setItem(CHAT_INPUT_DRAFT_STORAGE_KEY, JSON.stringify(storage))
}

export function emptyPersistedChatInputDrafts(): PersistedChatInputDraftStorage {
  return {
    draftsByKey: {},
    version: CHAT_INPUT_DRAFT_STORAGE_VERSION,
  }
}

function canUseLocalStorage() {
  return typeof localStorage !== 'undefined'
}
