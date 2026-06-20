import type { ModelSelection } from '@workspace/contracts'
import type { RefObject } from 'react'

import { ChatInputSubmitButton } from './chat-input-submit-button'
import { ProviderModelPicker } from './provider-model-picker'

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
    <div className='flex min-w-0 items-center justify-between gap-2 px-3 pb-2.5'>
      <div className='flex min-w-0 flex-1 items-center gap-2'>
        <ProviderModelPicker
          busy={busy}
          disabled={disabled}
          locked={modelSelectionLocked}
          modelSelection={modelSelection}
          onChange={onModelSelectionChange}
        />
        {statusLabel ? (
          <span
            className='text-muted-foreground min-w-0 flex-1 truncate text-[11px]'
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
