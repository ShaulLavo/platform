import { useStore } from 'zustand'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import type { LexicalEditor } from 'lexical'
import { useEffect, useState } from 'react'

import { $setChatInputText } from '@/features/chat/utils/input-editor-actions'
import {
  readChatInputDraftPrompt,
  useChatInputDraftStore,
  type ChatInputDraftTarget,
} from '@/features/chat/state/chat-input-draft-store'
import {
  promptStashStoreFor,
  type PromptStashEntry,
} from '@/features/chat/state/prompt-stash-store'

/**
 * ⌘S on the composer: park the prompt, or — on an empty composer — open the
 * queue to pull one back. The listener is capture-phase on `window` so it beats
 * the editor's own key handling and the browser's save dialog, but it acts only
 * when the keystroke came from *this* composer's editor: chat mode can have a
 * second composer mounted on another surface.
 */
export function usePromptStash(draftTarget: ChatInputDraftTarget) {
  const [editor] = useLexicalComposerContext()
  const stashStore = promptStashStoreFor(draftTarget.environmentId)
  const entries = useStore(stashStore, (state) => state.entries)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isStashShortcut(event)) return

      const root = editor.getRootElement()
      if (!root?.contains(document.activeElement)) return

      event.preventDefault()
      const stashed = stashComposerPrompt(draftTarget, editor)
      if (stashed) return

      setMenuOpen(true)
    }

    window.addEventListener('keydown', handleKeyDown, true)

    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [draftTarget, editor])

  function removeEntry(entry: PromptStashEntry) {
    promptStashStoreFor(draftTarget.environmentId).getState().removeEntry(entry.id)
  }

  function restoreEntry(entry: PromptStashEntry) {
    const stash = promptStashStoreFor(draftTarget.environmentId).getState()
    const current = readChatInputDraftPrompt(draftTarget)
    // Restoring on top of a prompt in progress would destroy it, so the
    // composer's own text swaps into the queue instead of being overwritten. A
    // failed stash aborts the restore rather than trading one prompt for another.
    if (current.trim() && !stash.stashPrompt(current)) return

    const taken = stash.takeEntry(entry.id)
    if (!taken) return

    writeComposerPrompt(draftTarget, editor, taken.prompt)
    editor.focus()
    setMenuOpen(false)
  }

  return { entries, menuOpen, removeEntry, restoreEntry, setMenuOpen }
}

/** True once the prompt is parked and the composer emptied. */
function stashComposerPrompt(draftTarget: ChatInputDraftTarget, editor: LexicalEditor) {
  const prompt = readChatInputDraftPrompt(draftTarget)
  if (!prompt.trim()) return false
  // The composer is only emptied on the strength of the write landing.
  if (!promptStashStoreFor(draftTarget.environmentId).getState().stashPrompt(prompt)) return false

  writeComposerPrompt(draftTarget, editor, '')

  return true
}

/**
 * The editor and the stored draft are moved together. The draft plugin would
 * catch up on its own, but a second ⌘S or a restore that lands before it does
 * reads the stale prompt and stashes the same text twice.
 */
function writeComposerPrompt(
  draftTarget: ChatInputDraftTarget,
  editor: LexicalEditor,
  prompt: string,
) {
  editor.update(() => {
    $setChatInputText(prompt)
  })
  useChatInputDraftStore.getState().setPrompt(draftTarget, prompt)
}

function isStashShortcut(event: KeyboardEvent) {
  if (event.key !== 's' && event.key !== 'S') return false
  if (event.altKey || event.shiftKey) return false

  return event.metaKey || event.ctrlKey
}
