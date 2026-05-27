import { ArrowUpIcon, StopIcon } from '@phosphor-icons/react'
import { Button } from '@workspace/ui/components/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@workspace/ui/components/tooltip'
import { forwardRef } from 'react'

export const ChatInputSubmitButton = forwardRef<HTMLButtonElement, ChatInputSubmitButtonProps>(
  function ChatInputSubmitButton({ busy, disabled, onStop, onSubmit, sendDisabled }, ref) {
    const label = busy ? 'Stop current turn' : 'Send message'

    async function handleClick() {
      if (busy) {
        onStop()
        return
      }

      await onSubmit()
    }

    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={label}
              className='size-8 rounded-full bg-blue-600 text-white shadow-sm shadow-blue-950/20 hover:bg-blue-500 disabled:opacity-45 dark:bg-blue-600 dark:hover:bg-blue-500'
              disabled={busy ? disabled : sendDisabled}
              ref={ref}
              size='icon-sm'
              title={label}
              type='button'
              variant='ghost'
              onClick={handleClick}
            />
          }
        >
          {busy ? (
            <StopIcon className='size-4' weight='fill' />
          ) : (
            <ArrowUpIcon className='size-4' />
          )}
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    )
  },
)

type ChatInputSubmitButtonProps = {
  busy: boolean
  disabled: boolean
  onStop: () => void
  onSubmit: () => Promise<boolean>
  sendDisabled: boolean
}
