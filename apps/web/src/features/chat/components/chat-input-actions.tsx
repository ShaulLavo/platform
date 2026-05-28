import { MicrophoneIcon, PlusIcon } from '@phosphor-icons/react'
import type { ModelSelection } from '@workspace/contracts'
import { Button } from '@workspace/ui/components/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@workspace/ui/components/tooltip'
import { cn } from '@workspace/ui/lib/utils'
import type { RefObject } from 'react'

import { ChatInputSubmitButton } from './chat-input-submit-button'
import { ProviderModelPicker } from './provider-model-picker'

const inputToolButtons = [{ Icon: PlusIcon, label: 'Add context', narrow: true }] as const

export function ChatInputActions({
  busy,
  disabled,
  modelSelectionLocked,
  modelSelection,
  onModelSelectionChange,
  onStop,
  onSubmit,
  sendButtonRef,
  sendDisabled,
  statusLabel,
}: {
  busy: boolean
  disabled: boolean
  modelSelectionLocked: boolean
  modelSelection: ModelSelection
  onModelSelectionChange: (modelSelection: ModelSelection) => void
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
        {statusLabel ? (
          <span className='text-muted-foreground ml-1 hidden max-w-36 truncate text-[11px] @min-[360px]:inline'>
            {statusLabel}
          </span>
        ) : null}
      </div>
      <div className='flex min-w-0 shrink-0 items-center justify-end gap-1.5'>
        <ProviderModelPicker
          busy={busy}
          disabled={disabled}
          locked={modelSelectionLocked}
          modelSelection={modelSelection}
          onChange={onModelSelectionChange}
        />
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
