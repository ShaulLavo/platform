import { LegendList, type LegendListRef, type NativeScrollEvent } from '@legendapp/list/react'
import type { ThreadId } from '@workspace/contracts'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'
import { ArrowDownIcon } from '@phosphor-icons/react'
import { useCallback, useMemo, useRef, useState } from 'react'

import { chatTimelineItems, type ChatTimelineItem } from '../lib/chat-timeline-items'
import type { ChatSidebarThreadSummary, ChatThread } from '../state/chat-projection-store'
import type { OptimisticChatMessage } from '../state/chat-optimistic-store'
import { ChatWelcomeView } from './chat-welcome-view'
import { TimelineRow } from './timeline-row'

export function MessagesTimeline({
  activeThreadId,
  onSelectThread,
  optimisticMessages,
  pastThreads,
  thread,
}: {
  activeThreadId: ThreadId | null
  onSelectThread: (threadId: ThreadId) => void
  optimisticMessages: readonly OptimisticChatMessage[]
  pastThreads: readonly ChatSidebarThreadSummary[]
  thread: ChatThread
}) {
  const listRef = useRef<LegendListRef | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const items = useMemo(
    () =>
      chatTimelineItems({
        activities: thread.activities,
        latestTurn: thread.latestTurn,
        messages: thread.messages,
        optimisticMessages,
      }),
    [optimisticMessages, thread.activities, thread.latestTurn, thread.messages],
  )
  const renderItem = useCallback(
    ({ item }: { item: ChatTimelineItem }) => (
      <div className='px-3 py-1.5'>
        <TimelineRow item={item} />
      </div>
    ),
    [],
  )

  if (items.length === 0) {
    return (
      <ChatWelcomeView
        activeThreadId={activeThreadId}
        pastThreads={pastThreads}
        onSelectThread={onSelectThread}
      />
    )
  }

  return (
    <div className='relative min-h-0 flex-1'>
      <LegendList
        aria-label='Messages'
        alignItemsAtEnd
        className='app-scrollbar-thin overflow-x-hidden overflow-y-auto'
        data={items}
        drawDistance={360}
        estimatedItemSize={72}
        getItemType={timelineItemType}
        initialScrollAtEnd
        keyExtractor={timelineItemKey}
        maintainScrollAtEnd={{
          animated: false,
          on: {
            dataChange: true,
            itemLayout: true,
            layout: true,
          },
        }}
        maintainScrollAtEndThreshold={0.16}
        ref={listRef}
        renderItem={renderItem}
        recycleItems
        role='log'
        style={{ height: '100%' }}
        onScroll={(event) => setAtBottom(isTimelineAtEnd(event.nativeEvent))}
      />
      <Button
        aria-label='Scroll to latest message'
        className={cn(
          'absolute right-3 bottom-3 rounded-full shadow-sm transition-opacity',
          atBottom && 'pointer-events-none opacity-0',
        )}
        size='icon-sm'
        title='Scroll to latest message'
        type='button'
        variant='outline'
        onClick={() => listRef.current?.scrollToEnd({ animated: true })}
      >
        <ArrowDownIcon className='size-3.5' />
      </Button>
    </div>
  )
}

function timelineItemKey(item: ChatTimelineItem) {
  return item.id
}

function timelineItemType(item: ChatTimelineItem) {
  return item.type
}

function isTimelineAtEnd(event: NativeScrollEvent) {
  const remaining =
    event.contentSize.height - event.contentOffset.y - event.layoutMeasurement.height

  return remaining < event.layoutMeasurement.height * 0.16
}
