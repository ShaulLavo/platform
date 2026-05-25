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
  draftKey,
  rootPath,
}: {
  draftKey: string | null
  rootPath: string
}) {
  const key = currentDraftKey(rootPath, draftKey)
  const [state, setState] = useState<ChatComposerDraftState>(() => ({
    draft: readChatDraft(rootPath, draftKey),
    key,
  }))
  const draft = state.key === key ? state.draft : readChatDraft(rootPath, draftKey)

  useEffect(() => {
    setState({
      draft: readChatDraft(rootPath, draftKey),
      key,
    })
  }, [draftKey, key, rootPath])

  useEffect(() => {
    writeChatDraft(rootPath, draftKey, draft)
  }, [draft, draftKey, rootPath])

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
    clearChatDraft(rootPath, draftKey)
  }, [draftKey, key, rootPath])

  return {
    clearDraft,
    draft,
    setDraft,
  }
}

function currentDraftKey(rootPath: string, draftKey: string | null) {
  if (!draftKey) return null

  return chatDraftStorageKey(rootPath, draftKey)
}
