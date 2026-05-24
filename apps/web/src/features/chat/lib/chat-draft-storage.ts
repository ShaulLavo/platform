import type { ThreadId } from '@workspace/contracts'

const CHAT_DRAFT_KEY_PREFIX = 'platform.chat-draft.v1'

export function readChatDraft(rootPath: string, threadId: ThreadId | null) {
  if (!threadId) return ''
  if (!canUseLocalStorage()) return ''

  try {
    return localStorage.getItem(chatDraftStorageKey(rootPath, threadId)) ?? ''
  } catch {
    return ''
  }
}

export function writeChatDraft(rootPath: string, threadId: ThreadId | null, value: string) {
  if (!threadId) return
  if (!canUseLocalStorage()) return

  try {
    const key = chatDraftStorageKey(rootPath, threadId)
    if (value.trim()) {
      localStorage.setItem(key, value)
      return
    }

    localStorage.removeItem(key)
  } catch {
    // Draft persistence is best-effort.
  }
}

export function clearChatDraft(rootPath: string, threadId: ThreadId | null) {
  if (!threadId) return
  if (!canUseLocalStorage()) return

  try {
    localStorage.removeItem(chatDraftStorageKey(rootPath, threadId))
  } catch {
    // Draft persistence is best-effort.
  }
}

export function chatDraftStorageKey(rootPath: string, threadId: ThreadId) {
  return `${CHAT_DRAFT_KEY_PREFIX}:${encodeURIComponent(rootPath)}:${threadId}`
}

function canUseLocalStorage() {
  return typeof localStorage !== 'undefined'
}
