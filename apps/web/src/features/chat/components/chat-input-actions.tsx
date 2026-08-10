import type { InteractionMode, RuntimeMode, ThreadId } from '@workspace/contracts'
import { useRef, type RefObject } from 'react'

import { useElementWidth } from '@/components/workspace/shared/hooks/use-element-width'
import { contextUsageForActivities } from '@/features/chat/lib/context-usage'
import { selectChatThreadById } from '@/features/chat/state/chat-projection-selectors'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import type { ChatInputDraftTarget } from '@/features/chat/state/chat-input-draft-store'
import { ChatInputAttachButton } from './chat-input-attach-button'
import { ChatInputSubmitButton } from './chat-input-submit-button'
import { ComposerControlsMenu } from './composer-controls-menu'
import { ContextUsageRing } from './context-usage-ring'
import { ModelOptionsMenu } from './model-options-menu'
import { ModelPicker } from './model-picker'
import { PromptStashBadge } from './prompt-stash-badge'

/**
 * Below this the control row cannot hold its labels and the send button at once.
 * The composer lives in both a ~300px side panel and a full-width stage, so the
 * layout is decided by the measured row rather than by a viewport breakpoint.
 */
const COMPACT_ACTIONS_WIDTH = 380

const EMPTY_ACTIVITIES: readonly [] = []

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
  const actionsRef = useRef<HTMLDivElement | null>(null)
  const width = useElementWidth(actionsRef)
  // Only once measured: assuming compact before the first layout would flash the
  // whole row through its narrow arrangement on every mount.
  const compact = width !== null && width < COMPACT_ACTIONS_WIDTH
  // The context-window snapshots live on the thread detail, so the composer
  // reads them for the thread it is drafting into. A draft key that is not a
  // thread finds nothing, which is the correct answer: no thread, no usage.
  const activities = useChatProjectionStore(
    (state) =>
      selectChatThreadById(state, draftTarget.draftKey as ThreadId | null)?.activities ??
      EMPTY_ACTIVITIES,
  )
  const contextUsage = contextUsageForActivities(activities)

  return (
    <div
      className='flex min-w-0 flex-col gap-1 px-3 pb-2.5'
      data-composer-actions
      data-compact={compact}
      ref={actionsRef}
    >
      <div className='flex min-w-0 items-center justify-between gap-2'>
        <div className='flex min-w-0 flex-1 items-center gap-1'>
          <ModelPicker busy={busy} disabled={disabled} />
          <ComposerControlsMenu
            disabled={disabled}
            draftTarget={draftTarget}
            interactionMode={interactionMode}
            runtimeMode={runtimeMode}
          />
          <ModelOptionsMenu compact={compact} disabled={disabled} draftTarget={draftTarget} />
          <ChatInputAttachButton disabled={disabled} onSelectFiles={onSelectImageFiles} />
          {contextUsage ? <ContextUsageRing compact={compact} usage={contextUsage} /> : null}
          {statusLabel && !compact ? (
            <span
              className='text-muted-foreground min-w-0 flex-1 truncate pl-1 text-[11px]'
              title={statusLabel}
            >
              {statusLabel}
            </span>
          ) : null}
        </div>
        <div className='flex shrink-0 items-center gap-1'>
          <PromptStashBadge disabled={disabled} draftTarget={draftTarget} />
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
      {/* Narrow: the status wraps onto its own line instead of squeezing the
          controls it shares the row with down to their icons. */}
      {statusLabel && compact ? (
        <span className='text-muted-foreground min-w-0 truncate text-[11px]' title={statusLabel}>
          {statusLabel}
        </span>
      ) : null}
    </div>
  )
}
