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
              className='bg-info text-info-foreground shadow-info/20 hover:bg-info/90 size-8 rounded-full shadow-sm disabled:opacity-45'
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
