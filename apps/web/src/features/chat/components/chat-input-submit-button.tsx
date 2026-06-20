import { ArrowUpIcon, StopIcon } from '@phosphor-icons/react'
import { Button } from '@workspace/ui/components/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@workspace/ui/components/tooltip'
import { cn } from '@workspace/ui/lib/utils'
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
              className={cn(
                'size-7 rounded-lg transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                // Disabled is driven imperatively on the DOM node by the draft plugin,
                // so the idle/ready look must key off :disabled, not a React prop.
                'disabled:bg-muted disabled:text-muted-foreground/50 disabled:opacity-100',
              )}
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
