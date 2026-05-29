import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'
import { ArrowDownIcon } from '@phosphor-icons/react'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { useOpenCheckpointDiffDocument } from '../hooks/use-open-checkpoint-diff-document'
import { chatTimelineItemEstimate, chatTimelineItems } from '../lib/chat-timeline-items'
import type { ChatThread, ChatTurnDiffSummary } from '../state/chat-projection-store'
import type { OptimisticChatMessage } from '../state/chat-optimistic-store'
import { ChatWelcomeView } from './chat-welcome-view'
import { TimelineRow } from './timeline-row'

const CHAT_SCROLL_END_THRESHOLD = 80
const CHAT_TIMELINE_OVERSCAN = 6

export function MessagesTimeline({
  checkpointRevertPending = false,
  optimisticMessages,
  onRevertToCheckpoint,
  thread,
}: {
  checkpointRevertPending?: boolean
  optimisticMessages: readonly OptimisticChatMessage[]
  onRevertToCheckpoint?: (turnCount: number) => void
  thread: ChatThread
}) {
  const scrollElementRef = useRef<HTMLDivElement | null>(null)
  const pinnedToEndRef = useRef(true)
  const initialScrollDoneRef = useRef(false)
  const [atEnd, setAtEnd] = useState(true)
  const { openCheckpointDiff, openFullThreadCheckpointDiff } = useOpenCheckpointDiffDocument()
  const items = useMemo(
    () =>
      chatTimelineItems({
        activities: thread.activities,
        latestTurn: thread.latestTurn,
        messages: thread.messages,
        optimisticMessages,
        proposedPlans: thread.proposedPlans,
        turnDiffSummaries: thread.turnDiffSummaries,
      }),
    [
      optimisticMessages,
      thread.activities,
      thread.latestTurn,
      thread.messages,
      thread.proposedPlans,
      thread.turnDiffSummaries,
    ],
  )
  const virtualizer = useVirtualizer({
    count: items.length,
    estimateSize: (index) => chatTimelineItemEstimate(items[index]),
    getItemKey: (index) => items[index]?.id ?? index,
    getScrollElement: () => scrollElementRef.current,
    overscan: CHAT_TIMELINE_OVERSCAN,
  })
  const virtualItems = virtualizer.getVirtualItems()

  const updatePinnedState = useCallback((nextAtEnd: boolean) => {
    pinnedToEndRef.current = nextAtEnd
    setAtEnd((currentAtEnd) => (currentAtEnd === nextAtEnd ? currentAtEnd : nextAtEnd))
  }, [])

  const handleScroll = useCallback(() => {
    updatePinnedState(isScrollElementAtEnd(scrollElementRef.current))
  }, [updatePinnedState])

  const handleScrollToLatest = useCallback(() => {
    scrollVirtualizerToEnd(virtualizer, items.length, 'smooth')
    updatePinnedState(true)
  }, [items.length, updatePinnedState, virtualizer])

  const handleOpenCheckpointDiff = useCallback(
    (summary: ChatTurnDiffSummary, path?: string) => openCheckpointDiff(summary, path),
    [openCheckpointDiff],
  )
  const handleOpenThreadCheckpointDiff = useCallback(
    (summary: ChatTurnDiffSummary) => openFullThreadCheckpointDiff(summary),
    [openFullThreadCheckpointDiff],
  )

  useLayoutEffect(() => {
    if (items.length === 0) return
    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true
      scrollVirtualizerToEnd(virtualizer, items.length, 'auto')
      updatePinnedState(true)
      return
    }
    if (!pinnedToEndRef.current) return

    scrollVirtualizerToEnd(virtualizer, items.length, 'auto')
  }, [items, updatePinnedState, virtualizer])

  if (items.length === 0) {
    return <ChatWelcomeView />
  }

  return (
    <div className='relative min-h-0 flex-1'>
      <div
        aria-label='Messages'
        className='app-scrollbar-thin h-full overflow-x-hidden overflow-y-auto px-3 py-4 sm:px-5'
        ref={scrollElementRef}
        role='log'
        onScroll={handleScroll}
      >
        <div
          className='relative w-full'
          style={{
            height: virtualizer.getTotalSize(),
          }}
        >
          {virtualItems.map((virtualItem) => (
            <div
              className='absolute top-0 left-0 w-full py-1.5'
              data-index={virtualItem.index}
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              style={{
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <TimelineRow
                checkpointRevertPending={checkpointRevertPending}
                item={items[virtualItem.index]!}
                onOpenCheckpointDiff={handleOpenCheckpointDiff}
                onOpenThreadCheckpointDiff={handleOpenThreadCheckpointDiff}
                onRevertToCheckpoint={onRevertToCheckpoint}
              />
            </div>
          ))}
        </div>
      </div>
      <Button
        aria-label='Scroll to latest message'
        className={cn(
          'border-border/70 bg-background/90 absolute right-4 bottom-4 size-8 rounded-full shadow-sm backdrop-blur transition-opacity hover:bg-muted',
          atEnd && 'pointer-events-none opacity-0',
        )}
        size='icon-sm'
        title='Scroll to latest message'
        type='button'
        variant='outline'
        onClick={handleScrollToLatest}
      >
        <ArrowDownIcon className='size-3.5' />
      </Button>
    </div>
  )
}

function scrollVirtualizerToEnd(
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  itemCount: number,
  behavior: ScrollBehavior,
) {
  if (itemCount === 0) return

  virtualizer.scrollToIndex(itemCount - 1, { align: 'end', behavior })
}

function isScrollElementAtEnd(element: HTMLDivElement | null) {
  if (!element) return true

  const remaining = element.scrollHeight - element.scrollTop - element.clientHeight

  return remaining <= CHAT_SCROLL_END_THRESHOLD
}
