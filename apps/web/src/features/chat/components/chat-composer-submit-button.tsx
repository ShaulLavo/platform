import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ArrowUpIcon, StopIcon } from '@phosphor-icons/react'
import { Button } from '@workspace/ui/components/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@workspace/ui/components/tooltip'

import { submitChatComposerEditor } from '../lib/chat-composer-editor-actions'

export function ChatComposerSubmitButton({
  busy,
  disabled,
  onAfterSubmit,
  onStop,
  onSubmitText,
  sendDisabled,
  submitting,
}: {
  busy: boolean
  disabled: boolean
  onAfterSubmit: () => void
  onStop: () => void
  onSubmitText: (text: string) => Promise<boolean>
  sendDisabled: boolean
  submitting: boolean
}) {
  const [editor] = useLexicalComposerContext()
  const label = busy ? 'Stop current turn' : 'Send message'

  async function handleClick() {
    if (busy) {
      onStop()
      return
    }

    await submitChatComposerEditor({
      busy,
      disabled,
      editor,
      onAfterSubmit,
      onSubmitText,
      submitting,
    })
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className='size-8 rounded-md bg-emerald-600 text-white shadow-sm hover:bg-emerald-500 disabled:opacity-45 dark:bg-emerald-600 dark:hover:bg-emerald-500'
            disabled={busy ? disabled : sendDisabled}
            size='icon-sm'
            title={label}
            type='button'
            variant='ghost'
            onClick={handleClick}
          />
        }
      >
        {busy ? <StopIcon className='size-4' weight='fill' /> : <ArrowUpIcon className='size-4' />}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
