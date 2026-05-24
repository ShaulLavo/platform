import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_HIGH, KEY_ENTER_COMMAND } from 'lexical'
import { useEffect } from 'react'

import { submitChatComposerEditor } from '../lib/chat-composer-editor-actions'

export function ChatComposerSubmitPlugin({
  busy,
  disabled,
  onAfterSubmit,
  onSubmitText,
  submitting,
}: {
  busy: boolean
  disabled: boolean
  onAfterSubmit: () => void
  onSubmitText: (text: string) => Promise<boolean>
  submitting: boolean
}) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (event?.shiftKey) return false

        event?.preventDefault()
        event?.stopPropagation()
        void submitChatComposerEditor({
          busy,
          disabled,
          editor,
          onAfterSubmit,
          onSubmitText,
          submitting,
        })

        return true
      },
      COMMAND_PRIORITY_HIGH,
    )
  }, [busy, disabled, editor, onAfterSubmit, onSubmitText, submitting])

  return null
}
