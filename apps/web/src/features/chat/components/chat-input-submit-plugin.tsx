import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_HIGH, KEY_ENTER_COMMAND } from 'lexical'
import { useEffect } from 'react'

export function ChatInputSubmitPlugin({
  disabled,
  onSubmitRequest,
}: {
  disabled: boolean
  onSubmitRequest: () => Promise<boolean>
}) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (disabled) return false
        if (event?.shiftKey) return false

        event?.preventDefault()
        event?.stopPropagation()
        void onSubmitRequest()

        return true
      },
      COMMAND_PRIORITY_HIGH,
    )
  }, [disabled, editor, onSubmitRequest])

  return null
}
