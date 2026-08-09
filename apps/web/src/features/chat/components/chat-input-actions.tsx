import type { RefObject } from 'react'

import { ChatInputAttachButton } from './chat-input-attach-button'
import { ChatInputSubmitButton } from './chat-input-submit-button'
import { ModelPicker } from './model-picker'

export function ChatInputActions({
  busy,
  disabled,
  onSelectImageFiles,
  onStop,
  onSubmit,
  sendButtonRef,
  sendDisabled,
  statusLabel,
}: {
  busy: boolean
  disabled: boolean
  onSelectImageFiles: (files: readonly File[]) => void
  onStop: () => void
  onSubmit: () => Promise<boolean>
  sendButtonRef: RefObject<HTMLButtonElement | null>
  sendDisabled: boolean
  statusLabel: string | null
}) {
  return (
    <div className='flex min-w-0 items-center justify-between gap-2 px-3 pb-2.5'>
      <div className='flex min-w-0 flex-1 items-center gap-1'>
        <ModelPicker busy={busy} disabled={disabled} />
        <ChatInputAttachButton disabled={disabled} onSelectFiles={onSelectImageFiles} />
        {statusLabel ? (
          <span
            className='text-muted-foreground min-w-0 flex-1 truncate pl-1 text-[11px]'
            title={statusLabel}
          >
            {statusLabel}
          </span>
        ) : null}
      </div>
      <ChatInputSubmitButton
        busy={busy}
        disabled={disabled}
        ref={sendButtonRef}
        sendDisabled={sendDisabled}
        onStop={onStop}
        onSubmit={onSubmit}
      />
    </div>
  )
}
