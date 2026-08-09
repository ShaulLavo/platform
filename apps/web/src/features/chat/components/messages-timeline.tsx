/* eslint-disable oxc-react-compiler/refs -- The React Compiler bails on this whole component with "Use of incompatible library": @tanstack/react-virtual's instance methods (getVirtualItems/getTotalSize/measureElement) are consumed during render. The bail is structural — no useVirtualizer option clears it (directDomUpdates ruled out 2026-06-13: not a real option in the installed virtual-core 3.16.0, and forcing it into the source still bails per the babel react-compiler probe). So fixing the ref-in-render here buys no memoization.
   TODO: revisit memoizing this component. The only real fix is swapping to a React-Compiler-compatible virtualizer (e.g. react-hook-tanstack-virtual) to reach CompileSuccess, then dropping this disable. Low priority — a chat timeline re-rendering on message/scroll change is cheap, so there's no measured cost to buy back yet. */
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'
import { ArrowDownIcon } from '@phosphor-icons/react'
import { useEffect, useLayoutEffect, useMemo, useReducer, useState, type Dispatch } from 'react'

import { chatTimelineItemEstimate, chatTimelineItems } from '../lib/chat-timeline-items'
import type { ChatTimelineItem } from '../lib/chat-timeline-items'
import type { ChatThread } from '../state/chat-projection-store'
import type { OptimisticChatMessage } from '../state/chat-optimistic-store'
import {
  initialTimelineScrollState,
  isTimelineWithinFollowBand,
  resolveTimelineAnchorItemId,
  timelineAnchoredTurnMetrics,
  timelineContentScrollsUp,
  timelineRemeasureScrollDelta,
  timelineScrollReducer,
  TIMELINE_ANCHOR_OFFSET_PX,
  TIMELINE_COMPOSER_INSET_PX,
  TIMELINE_TOP_INSET_PX,
  type TimelineScrollEvent,
  type TimelineScrollState,
  type TimelineViewportMetrics,
} from '../utils/timeline-scroll-anchoring'
import { ChatWelcomeView } from './chat-welcome-view'
import { TimelineRow } from './timeline-row'

const CHAT_TIMELINE_OVERSCAN = 6
/** Disclosure toggles mark themselves so their growth is never treated as stream growth. */
const DISCLOSURE_SELECTOR = '[data-scroll-anchor-ignore]'

type TimelineVirtualizer = Virtualizer<HTMLDivElement, Element>

export function MessagesTimeline({
  checkpointRevertPending = false,
  optimisticMessages,
  thread,
}: {
  checkpointRevertPending?: boolean
  optimisticMessages: readonly OptimisticChatMessage[]
  thread: ChatThread
}) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const [scrollState, dispatch] = useReducer(timelineScrollReducer, initialTimelineScrollState)
  // Bumped by a disclosure toggle; null once the two frames it takes to settle
  // have passed. Non-null suspends both end-follow and remeasure compensation so
  // the row the user just expanded stays put under their cursor.
  const [disclosureSettleTick, setDisclosureSettleTick] = useState<number | null>(null)
  // Stable identity is required: the items array feeds the virtualizer's option
  // closures and every scroll effect's dependency list.
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
  // eslint-disable-next-line oxc-react-compiler/immutability -- the effect below installs `shouldAdjustScrollPositionOnItemSizeChange`, which virtual-core exposes as an instance property rather than a `useVirtualizer` option, so there is nowhere else to put it. The compiler already bails on this component (see the file header), so the freeze it is enforcing buys nothing here.
  const virtualizer = useVirtualizer({
    count: items.length,
    estimateSize: (index) => chatTimelineItemEstimate(items[index]),
    getItemKey: (index) => items[index]?.id ?? index,
    getScrollElement: () => scrollElement,
    overscan: CHAT_TIMELINE_OVERSCAN,
    // The insets live on the virtualizer rather than as CSS padding so scroll
    // offsets and row offsets share one coordinate space.
    paddingEnd: TIMELINE_COMPOSER_INSET_PX + scrollState.anchoredEndSpace,
    paddingStart: TIMELINE_TOP_INSET_PX,
  })
  const virtualItems = virtualizer.getVirtualItems()
  const disclosureSettling = disclosureSettleTick !== null

  useLayoutEffect(() => {
    // eslint-disable-next-line oxc-react-compiler/immutability -- virtual-core exposes this hook as an instance property, not a `useVirtualizer` option, so there is nowhere else to install it. The compiler already bails on this component (see the file header), so the freeze it is enforcing buys nothing here.
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, delta, instance) =>
      timelineRemeasureScrollDelta({
        delta,
        rowStart: item.start,
        scrollTop: instance.scrollOffset ?? 0,
        suspended: disclosureSettling,
      }) !== 0

    return () => {
      virtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined
    }
  }, [disclosureSettling, virtualizer])

  useLayoutEffect(() => {
    dispatch({
      latestUserItemId: resolveTimelineAnchorItemId(items),
      threadId: thread.id,
      type: 'items-changed',
    })
  }, [items, thread.id])

  useLayoutEffect(() => {
    if (!scrollElement) return
    if (items.length === 0) return

    applyTimelineScroll({
      dispatch,
      disclosureSettling,
      items,
      scrollElement,
      scrollState,
      virtualizer,
    })
  }, [disclosureSettling, items, scrollElement, scrollState, virtualizer])

  useEffect(() => {
    if (!scrollElement) return

    return attachNavigationListeners(scrollElement, dispatch, setDisclosureSettleTick)
  }, [scrollElement])

  useEffect(() => {
    if (disclosureSettleTick === null) return

    let second: number | null = null
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setDisclosureSettleTick(null))
    })

    return () => {
      cancelAnimationFrame(first)
      if (second !== null) cancelAnimationFrame(second)
    }
  }, [disclosureSettleTick])

  if (items.length === 0) {
    return <ChatWelcomeView />
  }

  function handleScroll() {
    if (!scrollElement) return

    dispatch({
      type: 'scrolled',
      withinFollowBand: isTimelineWithinFollowBand(
        readTimelineViewport(scrollElement),
        TIMELINE_COMPOSER_INSET_PX + scrollState.anchoredEndSpace,
      ),
    })
  }

  return (
    <div className='relative min-h-0 flex-1'>
      <div
        aria-label='Messages'
        className='app-scrollbar-thin h-full overflow-x-hidden overflow-y-auto px-3 sm:px-5'
        ref={setScrollElement}
        role='log'
        onScroll={handleScroll}
      >
        <div
          className='relative w-full'
          style={{
            height: virtualizer.getTotalSize(),
            // Scroll anchoring is ours: the browser's would fight the
            // compensation we apply when an estimated row is first measured.
            overflowAnchor: 'none',
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
              />
            </div>
          ))}
        </div>
      </div>
      <Button
        aria-label='Scroll to latest message'
        className={cn(
          'border-border/70 bg-background backdrop-material absolute right-4 bottom-4 size-8 rounded-full shadow-sm transition-opacity hover:bg-muted',
          scrollState.followMode !== 'free-scrolling' && 'pointer-events-none opacity-0',
        )}
        size='icon-sm'
        title='Scroll to latest message'
        type='button'
        variant='outline'
        onClick={() => dispatch({ type: 'jump-to-end' })}
      >
        <ArrowDownIcon className='size-3.5' />
      </Button>
    </div>
  )
}

function applyTimelineScroll({
  dispatch,
  disclosureSettling,
  items,
  scrollElement,
  scrollState,
  virtualizer,
}: {
  dispatch: Dispatch<TimelineScrollEvent>
  disclosureSettling: boolean
  items: readonly ChatTimelineItem[]
  scrollElement: HTMLDivElement
  scrollState: TimelineScrollState
  virtualizer: TimelineVirtualizer
}) {
  if (scrollState.pendingInitialScroll) {
    virtualizer.scrollToEnd({ behavior: 'auto' })
    dispatch({ type: 'initial-scroll-done' })
    return
  }
  if (disclosureSettling) return
  if (scrollState.followMode === 'anchoring-new-turn') {
    applyAnchoredTurnScroll({ dispatch, items, scrollElement, scrollState, virtualizer })
    return
  }
  if (scrollState.followMode !== 'following-end') return

  virtualizer.scrollToEnd({ behavior: 'auto' })
}

function applyAnchoredTurnScroll({
  dispatch,
  items,
  scrollElement,
  scrollState,
  virtualizer,
}: {
  dispatch: Dispatch<TimelineScrollEvent>
  items: readonly ChatTimelineItem[]
  scrollElement: HTMLDivElement
  scrollState: TimelineScrollState
  virtualizer: TimelineVirtualizer
}) {
  const anchorIndex = items.findIndex((item) => item.id === scrollState.anchorItemId)
  if (anchorIndex < 0) return

  const viewport = readTimelineViewport(scrollElement)
  const metrics = timelineAnchoredTurnMetrics({
    anchorOffset: TIMELINE_ANCHOR_OFFSET_PX,
    anchorRow: virtualizer.measurementsCache[anchorIndex],
    endInset: TIMELINE_COMPOSER_INSET_PX,
    lastRow: virtualizer.measurementsCache[items.length - 1],
    viewport,
  })
  if (!metrics) return
  // Reserve the space the park needs before moving, or the scroll clamps short.
  if (metrics.endSpace !== scrollState.anchoredEndSpace) {
    dispatch({ endSpace: metrics.endSpace, type: 'anchor-measured' })
    return
  }
  if (scrollState.parkedAnchorItemId !== scrollState.anchorItemId) {
    virtualizer.scrollToOffset(metrics.parkScrollTop, { behavior: 'auto' })
    dispatch({ type: 'anchor-parked' })
    return
  }
  // Sub-pixel deltas are measurement noise, not content the user is missing.
  if (metrics.scrollDeltaToRevealEnd <= 1) return

  virtualizer.scrollToOffset(viewport.scrollTop + metrics.scrollDeltaToRevealEnd, {
    behavior: 'auto',
  })
}

/**
 * Only a real navigation gesture breaks follow — scroll events cannot tell one
 * from our own programmatic moves, and breaking follow on those would stop the
 * transcript following its own stream.
 */
function attachNavigationListeners(
  element: HTMLDivElement,
  dispatch: Dispatch<TimelineScrollEvent>,
  suspendForDisclosure: (update: (current: number | null) => number) => void,
) {
  const contentScrollsUp = () => timelineContentScrollsUp(readTimelineViewport(element))
  // The band rather than a strict at-end test: streaming growth flickers the
  // strict flag false for a frame, and a gesture landing in that window would
  // break follow with no scroll left to re-arm it.
  const awayFromEnd = () =>
    !isTimelineWithinFollowBand(readTimelineViewport(element), TIMELINE_COMPOSER_INSET_PX)
  const navigate = () => dispatch({ type: 'user-navigated' })
  const settleDisclosure = () => suspendForDisclosure((current) => (current ?? 0) + 1)

  // Only an upward wheel is navigation intent; wheeling down either does
  // nothing or moves toward the edge we are already following.
  const handleWheel = (event: WheelEvent) => {
    if (event.deltaY >= 0) return
    if (!contentScrollsUp()) return

    navigate()
  }
  // Touch direction is not observable here, so break only once the drag has
  // actually carried the viewport out of the band.
  const handleTouchMove = () => {
    if (!awayFromEnd()) return

    navigate()
  }
  const handlePointerDown = (event: PointerEvent) => {
    if (isDisclosureTarget(event.target)) {
      settleDisclosure()
      return
    }
    // A scrollbar drag produces no wheel or touch events, and it is the only
    // pointerdown whose target is the scroll node itself.
    if (event.target === element) {
      if (!contentScrollsUp()) return

      navigate()
      return
    }
    // Clicking inside content near the live edge keeps following; selecting
    // text up in the history must not be yanked away.
    if (!awayFromEnd()) return

    navigate()
  }
  // Keyboard scrolling bypasses wheel and pointer events entirely.
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'PageUp') return
    if (!contentScrollsUp()) return

    navigate()
  }

  element.addEventListener('wheel', handleWheel, { passive: true })
  element.addEventListener('touchmove', handleTouchMove, { passive: true })
  element.addEventListener('pointerdown', handlePointerDown, { passive: true })
  element.addEventListener('keydown', handleKeyDown)

  return () => {
    element.removeEventListener('wheel', handleWheel)
    element.removeEventListener('touchmove', handleTouchMove)
    element.removeEventListener('pointerdown', handlePointerDown)
    element.removeEventListener('keydown', handleKeyDown)
  }
}

function isDisclosureTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false

  return target.closest(DISCLOSURE_SELECTOR) !== null
}

function readTimelineViewport(element: HTMLDivElement): TimelineViewportMetrics {
  return {
    contentHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
    viewportHeight: element.clientHeight,
  }
}
