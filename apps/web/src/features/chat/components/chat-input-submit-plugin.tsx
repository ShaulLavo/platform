import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_TAB_COMMAND,
} from 'lexical'
import { useEffect } from 'react'

export function ChatInputSubmitPlugin({
  commandMenuOpen,
  disabled,
  onCommandMenuCommit,
  onCommandMenuMove,
  onSubmitRequest,
}: {
  commandMenuOpen: boolean
  disabled: boolean
  onCommandMenuCommit: () => boolean
  onCommandMenuMove: (offset: number) => boolean
  onSubmitRequest: () => Promise<boolean>
}) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const unregisterEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) =>
        handleEnterCommand({
          commandMenuOpen,
          disabled,
          event,
          onCommandMenuCommit,
          onSubmitRequest,
        }),
      COMMAND_PRIORITY_HIGH,
    )
    const unregisterTab = editor.registerCommand(
      KEY_TAB_COMMAND,
      (event) => handleMenuCommitCommand(commandMenuOpen, event, onCommandMenuCommit),
      COMMAND_PRIORITY_HIGH,
    )
    const unregisterArrowDown = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event) => handleMenuMoveCommand(commandMenuOpen, event, onCommandMenuMove, 1),
      COMMAND_PRIORITY_HIGH,
    )
    const unregisterArrowUp = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event) => handleMenuMoveCommand(commandMenuOpen, event, onCommandMenuMove, -1),
      COMMAND_PRIORITY_HIGH,
    )

    return () => {
      unregisterEnter()
      unregisterTab()
      unregisterArrowDown()
      unregisterArrowUp()
    }
  }, [commandMenuOpen, disabled, editor, onCommandMenuCommit, onCommandMenuMove, onSubmitRequest])

  return null
}

function handleEnterCommand({
  commandMenuOpen,
  disabled,
  event,
  onCommandMenuCommit,
  onSubmitRequest,
}: {
  commandMenuOpen: boolean
  disabled: boolean
  event: KeyboardEvent | null
  onCommandMenuCommit: () => boolean
  onSubmitRequest: () => Promise<boolean>
}) {
  if (disabled) return false
  if (event?.shiftKey) return false
  if (handleMenuCommitCommand(commandMenuOpen, event, onCommandMenuCommit)) return true

  event?.preventDefault()
  event?.stopPropagation()
  void onSubmitRequest()

  return true
}

function handleMenuCommitCommand(
  commandMenuOpen: boolean,
  event: KeyboardEvent | null,
  onCommandMenuCommit: () => boolean,
) {
  if (!commandMenuOpen) return false
  if (!onCommandMenuCommit()) return false

  event?.preventDefault()
  event?.stopPropagation()
  return true
}

function handleMenuMoveCommand(
  commandMenuOpen: boolean,
  event: KeyboardEvent | null,
  onCommandMenuMove: (offset: number) => boolean,
  offset: number,
) {
  if (!commandMenuOpen) return false
  if (!onCommandMenuMove(offset)) return false

  event?.preventDefault()
  event?.stopPropagation()
  return true
}
