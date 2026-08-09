import type { InteractionMode, RuntimeMode } from '@workspace/contracts'
import type { RefObject } from 'react'

import type { ChatInputDraftTarget } from '@/features/chat/state/chat-input-draft-store'
import { ChatInputAttachButton } from './chat-input-attach-button'
import { ChatInputSubmitButton } from './chat-input-submit-button'
import { ComposerControlsMenu } from './composer-controls-menu'
import { ModelPicker } from './model-picker'

export function ChatInputActions({
  busy,
  disabled,
  draftTarget,
  interactionMode,
  onSelectImageFiles,
  onStop,
  onSubmit,
  runtimeMode,
  sendButtonRef,
  sendDisabled,
  statusLabel,
}: {
  busy: boolean
  disabled: boolean
  draftTarget: ChatInputDraftTarget
  interactionMode: InteractionMode
  onSelectImageFiles: (files: readonly File[]) => void
  onStop: () => void
  onSubmit: () => Promise<boolean>
  runtimeMode: RuntimeMode
  sendButtonRef: RefObject<HTMLButtonElement | null>
  sendDisabled: boolean
  statusLabel: string | null
}) {
  return (
    <div className='flex min-w-0 items-center justify-between gap-2 px-3 pb-2.5'>
      <div className='flex min-w-0 flex-1 items-center gap-1'>
        <ModelPicker busy={busy} disabled={disabled} />
        <ComposerControlsMenu
          disabled={disabled}
          draftTarget={draftTarget}
          interactionMode={interactionMode}
          runtimeMode={runtimeMode}
        />
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
