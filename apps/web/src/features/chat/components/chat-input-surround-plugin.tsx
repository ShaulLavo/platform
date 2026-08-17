import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'

import { surroundChatInputSelection } from '@/features/chat/utils/input-editor-actions'
import { chatInputSurroundClose } from '@/features/chat/utils/input-logic'

/**
 * Typing a bracket or quote over a selection wraps it instead of replacing it.
 * Handled on `beforeinput` in the capture phase so the wrap happens before
 * Lexical turns the keystroke into a plain insertion.
 */
export function ChatInputSurroundPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    function handleBeforeInput(event: InputEvent) {
      if (event.inputType !== 'insertText') return
      if (typeof event.data !== 'string') return

      const close = chatInputSurroundClose(event.data)
      if (!close) return
      if (!surroundChatInputSelection(editor, event.data, close)) return

      event.preventDefault()
      event.stopPropagation()
    }

    return editor.registerRootListener((rootElement, previousRootElement) => {
      previousRootElement?.removeEventListener('beforeinput', handleBeforeInput, true)
      rootElement?.addEventListener('beforeinput', handleBeforeInput, true)
    })
  }, [editor])

  return null
}
