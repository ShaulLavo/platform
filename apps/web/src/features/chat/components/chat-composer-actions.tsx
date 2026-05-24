import {
  AtIcon,
  CaretDownIcon,
  HashIcon,
  ImageIcon,
  MicrophoneIcon,
  SparkleIcon,
} from '@phosphor-icons/react'
import { Button } from '@workspace/ui/components/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@workspace/ui/components/tooltip'

import { ChatComposerSubmitButton } from './chat-composer-submit-button'

export function ChatComposerActions({
  busy,
  disabled,
  modelLabel,
  onAfterSubmit,
  onStop,
  onSubmitText,
  sendDisabled,
  statusLabel,
  submitting,
}: {
  busy: boolean
  disabled: boolean
  modelLabel: string
  onAfterSubmit: () => void
  onStop: () => void
  onSubmitText: (text: string) => Promise<boolean>
  sendDisabled: boolean
  statusLabel: string | null
  submitting: boolean
}) {
  return (
    <div className='flex min-w-0 items-center justify-between gap-2 px-2.5 py-2'>
      <div className='flex min-w-0 items-center gap-1'>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label='Mention workspace context'
                disabled={disabled}
                size='icon-sm'
                title='Mention workspace context'
                type='button'
                variant='ghost'
              />
            }
          >
            <AtIcon className='size-4' />
          </TooltipTrigger>
          <TooltipContent>Mention workspace context</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label='Add issue or reference'
                disabled={disabled}
                size='icon-sm'
                title='Add issue or reference'
                type='button'
                variant='ghost'
              />
            }
          >
            <HashIcon className='size-4' />
          </TooltipTrigger>
          <TooltipContent>Add issue or reference</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label='Attach image'
                disabled={disabled}
                size='icon-sm'
                title='Attach image'
                type='button'
                variant='ghost'
              />
            }
          >
            <ImageIcon className='size-4' />
          </TooltipTrigger>
          <TooltipContent>Attach image</TooltipContent>
        </Tooltip>
        {statusLabel ? (
          <span className='text-muted-foreground ml-1 hidden max-w-36 truncate text-[11px] sm:inline'>
            {statusLabel}
          </span>
        ) : null}
      </div>
      <div className='flex min-w-0 shrink-0 items-center gap-1.5'>
        <button
          className='text-muted-foreground hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex max-w-32 items-center gap-1 truncate rounded-sm px-1.5 py-1 text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50'
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
                aria-label='AI tools'
                disabled={disabled}
                size='icon-sm'
                title='AI tools'
                type='button'
                variant='ghost'
              />
            }
          >
            <SparkleIcon className='size-4' />
          </TooltipTrigger>
          <TooltipContent>AI tools</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label='Voice input'
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
        <ChatComposerSubmitButton
          busy={busy}
          disabled={disabled}
          sendDisabled={sendDisabled}
          submitting={submitting}
          onAfterSubmit={onAfterSubmit}
          onStop={onStop}
          onSubmitText={onSubmitText}
        />
      </div>
    </div>
  )
}
