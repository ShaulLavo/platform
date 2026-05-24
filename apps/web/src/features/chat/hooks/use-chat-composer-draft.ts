import type { ThreadId } from '@workspace/contracts'
import { useCallback, useEffect, useState } from 'react'

import {
  chatDraftStorageKey,
  clearChatDraft,
  readChatDraft,
  writeChatDraft,
} from '../lib/chat-draft-storage'

type ChatComposerDraftState = {
  draft: string
  key: string | null
}

export function useChatComposerDraft({
  rootPath,
  threadId,
}: {
  rootPath: string
  threadId: ThreadId | null
}) {
  const key = currentDraftKey(rootPath, threadId)
  const [state, setState] = useState<ChatComposerDraftState>(() => ({
    draft: readChatDraft(rootPath, threadId),
    key,
  }))
  const draft = state.key === key ? state.draft : readChatDraft(rootPath, threadId)

  useEffect(() => {
    setState({
      draft: readChatDraft(rootPath, threadId),
      key,
    })
  }, [key, rootPath, threadId])

  useEffect(() => {
    writeChatDraft(rootPath, threadId, draft)
  }, [draft, rootPath, threadId])

  const setDraft = useCallback(
    (draft: string) => {
      setState({
        draft,
        key,
      })
    },
    [key],
  )

  const clearDraft = useCallback(() => {
    setState({
      draft: '',
      key,
    })
    clearChatDraft(rootPath, threadId)
  }, [key, rootPath, threadId])

  return {
    clearDraft,
    draft,
    setDraft,
  }
}

function currentDraftKey(rootPath: string, threadId: ThreadId | null) {
  if (!threadId) return null

  return chatDraftStorageKey(rootPath, threadId)
}
