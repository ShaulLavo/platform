import { AtIcon, CaretDownIcon, CodeIcon, MicrophoneIcon, PlusIcon } from '@phosphor-icons/react'
import { Button } from '@workspace/ui/components/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@workspace/ui/components/tooltip'
import { cn } from '@workspace/ui/lib/utils'
import type { RefObject } from 'react'

import { ChatInputSubmitButton } from './chat-input-submit-button'

const inputToolButtons = [
  { Icon: PlusIcon, label: 'Add context', narrow: true },
  { Icon: CodeIcon, label: 'Attach code', narrow: false },
  { Icon: AtIcon, label: 'Mention context', narrow: false },
] as const

export function ChatInputActions({
  busy,
  disabled,
  modelLabel,
  onStop,
  onSubmit,
  sendButtonRef,
  sendDisabled,
  statusLabel,
}: {
  busy: boolean
  disabled: boolean
  modelLabel: string
  onStop: () => void
  onSubmit: () => Promise<boolean>
  sendButtonRef: RefObject<HTMLButtonElement | null>
  sendDisabled: boolean
  statusLabel: string | null
}) {
  return (
    <div className='@container flex min-w-0 items-center justify-between gap-2 px-3 pb-3'>
      <div className='flex min-w-0 items-center gap-1'>
        {inputToolButtons.map(({ Icon, label, narrow }) => (
          <Tooltip key={label}>
            <TooltipTrigger
              render={
                <Button
                  aria-label={label}
                  className={cn(
                    'text-muted-foreground hover:text-foreground rounded-md',
                    !narrow && '@max-[300px]:hidden',
                  )}
                  disabled={disabled}
                  size='icon-sm'
                  title={label}
                  type='button'
                  variant='ghost'
                />
              }
            >
              <Icon className='size-4' />
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label='Open commands'
                className='text-muted-foreground hover:text-foreground rounded-md text-base @max-[300px]:hidden'
                disabled={disabled}
                size='icon-sm'
                title='Open commands'
                type='button'
                variant='ghost'
              />
            }
          >
            <span aria-hidden>/</span>
          </TooltipTrigger>
          <TooltipContent>Open commands</TooltipContent>
        </Tooltip>
        {statusLabel ? (
          <span className='text-muted-foreground ml-1 hidden max-w-36 truncate text-[11px] @min-[360px]:inline'>
            {statusLabel}
          </span>
        ) : null}
      </div>
      <div className='flex min-w-0 shrink-0 items-center justify-end gap-1.5'>
        <button
          className='text-muted-foreground hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex h-7 max-w-36 items-center gap-1 truncate rounded-md px-2 text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50'
          disabled={disabled}
          title={modelLabel}
          type='button'
        >
          <span className='truncate'>{modelLabel}</span>
          <CaretDownIcon className='size-3 shrink-0' />
          {busy ? <span className='size-1.5 shrink-0 rounded-full bg-emerald-400' /> : null}
        </button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label='Voice input'
                className='text-muted-foreground hover:text-foreground rounded-md'
                disabled={disabled}
                size='icon-sm'
                title='Voice input'
                type='button'
                variant='ghost'
              />
            }
          >
            <MicrophoneIcon className='size-4' />
          </TooltipTrigger>
          <TooltipContent>Voice input</TooltipContent>
        </Tooltip>
        <ChatInputSubmitButton
          busy={busy}
          disabled={disabled}
          ref={sendButtonRef}
          sendDisabled={sendDisabled}
          onStop={onStop}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  )
}
