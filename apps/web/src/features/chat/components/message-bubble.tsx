import type { OrchestrationMessage } from '@workspace/contracts'
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react'
import { cn } from '@workspace/ui/lib/utils'
import type { MouseEvent, ReactNode } from 'react'

import { useContextMenu } from '@/features/menus/hooks/use-context-menu'

import { formatChatTimestamp } from '../lib/chat-formatters'
import { resolveAssistantMessageCopyState } from '../lib/chat-message-metadata'
import type { OptimisticChatMessage } from '../state/chat-optimistic-store'
import type { ChatTurnDiffSummary } from '../state/chat-projection-store'
import { allowsMessageContextMenu } from '../utils/message-menu'
import { useChatTimelineActions } from '../hooks/use-chat-timeline-actions'
import { AssistantChangedFilesSection } from './assistant-changed-files-section'
import { AssistantMessageMeta } from './assistant-message-meta'
import { AssistantMarkdown } from './assistant-markdown'
import { MessageCompletionDivider } from './message-completion-divider'
import { MessageMenu } from './message-menu'

export function MessageBubble({
  assistantStreaming,
  assistantTurnInProgress = false,
  checkpointRevertPending = false,
  completionSummary = null,
  durationEnd,
  durationStart,
  message,
  renderAssistantCopyButton,
  revertTurnCount = null,
  showAssistantCopyButton = false,
  showCompletionDivider = false,
  turnDiffSummary = null,
}: {
  assistantStreaming?: boolean
  assistantTurnInProgress?: boolean
  checkpointRevertPending?: boolean
  completionSummary?: string | null
  durationEnd?: string
  durationStart?: string
  message: OrchestrationMessage | OptimisticChatMessage
  renderAssistantCopyButton?: (text: string) => ReactNode
  revertTurnCount?: number | null
  showAssistantCopyButton?: boolean
  showCompletionDivider?: boolean
  turnDiffSummary?: ChatTurnDiffSummary | null
}) {
  const { revertToCheckpoint } = useChatTimelineActions()
  const contextMenu = useContextMenu()
  const user = message.role === 'user'
  const assistant = message.role === 'assistant'
  const effectiveAssistantStreaming = assistantStreaming ?? (assistant ? message.streaming : false)
  const optimistic = 'optimistic' in message
  const attachments = message.attachments ?? []
  const assistantText = assistant
    ? message.text || (effectiveAssistantStreaming ? '' : '(empty response)')
    : ''
  const attachmentList =
    attachments.length > 0 ? (
      <div
        className={cn(
          'flex flex-wrap gap-1.5',
          user ? message.text.trim().length > 0 && 'mb-2' : 'mt-2',
        )}
      >
        {attachments.map((attachment) => (
          <span
            className={cn(
              'rounded border px-1.5 py-0.5 text-[10px]',
              user
                ? 'border-border/70 text-muted-foreground'
                : 'border-border text-muted-foreground',
            )}
            key={attachment.id}
          >
            {attachment.name}
          </span>
        ))}
      </div>
    ) : null
  const assistantCopyState = resolveAssistantMessageCopyState({
    showCopyButton: showAssistantCopyButton,
    streaming: effectiveAssistantStreaming || assistantTurnInProgress,
    text: message.text,
  })
  const canRevertCheckpoint = user && typeof revertTurnCount === 'number'

  function handleRevertClick() {
    if (typeof revertTurnCount !== 'number') return

    revertToCheckpoint(revertTurnCount)
  }

  // Opened by hand rather than through MenuSurface's trigger: the trigger
  // applies `select-none`, which would make message text unselectable.
  function handleContextMenu(event: MouseEvent<HTMLElement>) {
    if (!allowsMessageContextMenu(event.target)) return

    contextMenu.openAtEvent(event, event.currentTarget)
  }

  return (
    <>
      {assistant && showCompletionDivider ? (
        <MessageCompletionDivider completionSummary={completionSummary} />
      ) : null}
      <div
        className={cn(
          'flex w-full min-w-0',
          assistant && 'group/assistant',
          user ? 'justify-end' : 'justify-start',
          optimistic && 'opacity-70',
        )}
      >
        <article
          className={cn(
            'min-w-0 text-sm leading-5',
            user
              ? 'max-w-[80%] rounded-2xl rounded-br-sm border border-border bg-secondary px-4 py-3 text-secondary-foreground'
              : 'w-full max-w-full px-1 py-0.5 text-foreground',
          )}
          onContextMenu={handleContextMenu}
        >
          {user ? (
            <>
              {attachmentList}
              {message.text.trim().length > 0 ? (
                <div className='break-words whitespace-pre-wrap'>{message.text}</div>
              ) : null}
            </>
          ) : (
            <>
              <AssistantMarkdown text={assistantText} streaming={effectiveAssistantStreaming} />
              {turnDiffSummary ? <AssistantChangedFilesSection summary={turnDiffSummary} /> : null}
              {attachmentList}
            </>
          )}
          {user ? (
            <div className='text-muted-foreground/50 mt-1 flex items-center justify-end gap-1.5 text-[10px] tabular-nums'>
              {canRevertCheckpoint ? (
                <button
                  aria-label='Revert to checkpoint before this turn'
                  className='hover:bg-background/80 hover:text-foreground inline-flex size-5 items-center justify-center border border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50'
                  data-scroll-anchor-ignore
                  disabled={checkpointRevertPending}
                  title='Revert to checkpoint before this turn'
                  type='button'
                  onClick={handleRevertClick}
                >
                  <ArrowCounterClockwiseIcon aria-hidden='true' className='size-3.5' />
                </button>
              ) : null}
              <span>{messageTimestampLabel(message, optimistic)}</span>
            </div>
          ) : (
            <div className='mt-1.5 flex items-center gap-2'>
              <p className='text-muted-foreground/30 text-[10px] tabular-nums'>
                <AssistantMessageMeta
                  createdAt={message.createdAt}
                  durationEnd={durationEnd ?? message.updatedAt}
                  durationStart={durationStart ?? message.createdAt}
                  streaming={effectiveAssistantStreaming}
                />
              </p>
              {assistantCopyState.visible && renderAssistantCopyButton ? (
                <div className='flex items-center opacity-0 transition-opacity duration-200 group-hover/assistant:opacity-100'>
                  {renderAssistantCopyButton(assistantCopyState.text ?? '')}
                </div>
              ) : null}
            </div>
          )}
        </article>
        {contextMenu.open ? (
          <MessageMenu
            anchor={contextMenu.anchor}
            checkpointRevertPending={checkpointRevertPending}
            message={message}
            onOpenChange={contextMenu.onOpenChange}
            revertTurnCount={revertTurnCount}
            turnDiffSummary={turnDiffSummary}
          />
        ) : null}
      </div>
    </>
  )
}

function messageTimestampLabel(
  message: OrchestrationMessage | OptimisticChatMessage,
  optimistic: boolean,
) {
  if (optimistic) return 'Sending'
  if (message.streaming) return 'Streaming'

  return formatChatTimestamp(message.updatedAt)
}
