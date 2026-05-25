const CHAT_DRAFT_KEY_PREFIX = 'platform.chat-draft.v1'

export function readChatDraft(rootPath: string, draftKey: string | null) {
  if (!draftKey) return ''
  if (!canUseLocalStorage()) return ''

  try {
    return localStorage.getItem(chatDraftStorageKey(rootPath, draftKey)) ?? ''
  } catch {
    return ''
  }
}

export function writeChatDraft(rootPath: string, draftKey: string | null, value: string) {
  if (!draftKey) return
  if (!canUseLocalStorage()) return

  try {
    const key = chatDraftStorageKey(rootPath, draftKey)
    if (value.trim()) {
      localStorage.setItem(key, value)
      return
    }

    localStorage.removeItem(key)
  } catch {
    // Draft persistence is best-effort.
  }
}

export function clearChatDraft(rootPath: string, draftKey: string | null) {
  if (!draftKey) return
  if (!canUseLocalStorage()) return

  try {
    localStorage.removeItem(chatDraftStorageKey(rootPath, draftKey))
  } catch {
    // Draft persistence is best-effort.
  }
}

export function chatDraftStorageKey(rootPath: string, draftKey: string) {
  return `${CHAT_DRAFT_KEY_PREFIX}:${encodeURIComponent(rootPath)}:${draftKey}`
}

function canUseLocalStorage() {
  return typeof localStorage !== 'undefined'
}
