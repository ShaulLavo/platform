import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_HIGH, KEY_DOWN_COMMAND, type LexicalEditor } from 'lexical'
import { useEffect } from 'react'

import { moveChatInputCaretToLineBoundary } from '../lib/chat-input-editor-actions'

/**
 * Home/End in the composer. macOS browsers scroll the page for these keys and
 * leave the caret where it was, so the composer has to move it itself; doing it
 * on every platform keeps the motion identical everywhere.
 */
export function ChatInputLineBoundaryPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(
    () =>
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => handleLineBoundaryKey(editor, event),
        COMMAND_PRIORITY_HIGH,
      ),
    [editor],
  )

  return null
}

function handleLineBoundaryKey(editor: LexicalEditor, event: KeyboardEvent | null) {
  if (!event) return false
  if (event.key !== 'End' && event.key !== 'Home') return false
  // Modified Home/End are document-scope motions the browser still owns.
  if (event.altKey || event.ctrlKey || event.isComposing || event.metaKey) return false

  const edge = event.key === 'End' ? 'end' : 'start'
  if (!moveChatInputCaretToLineBoundary(editor, edge, event.shiftKey)) return false

  event.preventDefault()
  event.stopPropagation()

  return true
}
