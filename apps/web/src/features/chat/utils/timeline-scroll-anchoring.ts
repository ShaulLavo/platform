/**
 * Every scroll decision the chat transcript makes, as pure functions over
 * geometry. The component owns the DOM and the virtualizer; it never decides
 * *whether* or *where* to scroll, only applies what this module returns.
 */

/**
 * Follow re-arm band above the real content end. Deliberately tight: a generous
 * "near the end" band re-arms live-follow while the user is reading history and
 * yanks them back down on the next stream chunk.
 */
export const TIMELINE_FOLLOW_REARM_BAND_PX = 40

/**
 * Space reserved below the last row so the final line never sits flush against
 * the composer. It is part of the scrollable content, so distance-to-end has to
 * subtract it to measure the distance to the *real* content bottom.
 */
export const TIMELINE_COMPOSER_INSET_PX = 16

/** Matching breathing room above the first row. */
export const TIMELINE_TOP_INSET_PX = 16

/** How far below the viewport top a newly sent message parks. */
export const TIMELINE_ANCHOR_OFFSET_PX = 16

/**
 * `following-end` pins to the live edge. `anchoring-new-turn` parks the message
 * the user just sent near the top and lets the answer unroll beneath it — the
 * whole point is that the text being read does not move. `free-scrolling` is the
 * user reading history: nothing moves the viewport until they come back.
 */
export type TimelineFollowMode = 'anchoring-new-turn' | 'following-end' | 'free-scrolling'

/** Viewport geometry, in the scroll container's own coordinate space. */
export interface TimelineViewportMetrics {
  /** `scrollHeight` — includes both insets and any anchored end space. */
  readonly contentHeight: number
  readonly scrollTop: number
  /** `clientHeight`. */
  readonly viewportHeight: number
}

/** One row's measured or estimated geometry, in the same coordinate space. */
export interface TimelineRowMetrics {
  readonly size: number
  readonly start: number
}

export interface TimelineAnchoredTurnMetrics {
  readonly anchorTop: number
  readonly contentBottom: number
  /** Extra scrollable space needed below the last row so the anchor can reach the top. */
  readonly endSpace: number
  readonly overflowsUsableViewport: boolean
  /** Scroll offset that parks the anchor `anchorOffset` px below the viewport top. */
  readonly parkScrollTop: number
  /** How far down to scroll to bring the growing end back into view — 0 while it already fits. */
  readonly scrollDeltaToRevealEnd: number
  readonly turnHeight: number
  readonly usableViewportHeight: number
}

export interface TimelineScrollState {
  readonly anchorItemId: string | null
  readonly anchoredEndSpace: number
  readonly followMode: TimelineFollowMode
  readonly latestUserItemId: string | null
  readonly parkedAnchorItemId: string | null
  readonly pendingInitialScroll: boolean
  readonly threadId: string | null
}

export type TimelineScrollEvent =
  | { readonly endSpace: number; readonly type: 'anchor-measured' }
  | { readonly type: 'anchor-parked' }
  | { readonly type: 'initial-scroll-done' }
  | { readonly type: 'jump-to-end' }
  | { readonly type: 'user-navigated' }
  | { readonly type: 'scrolled'; readonly withinFollowBand: boolean }
  | {
      readonly latestUserItemId: string | null
      readonly threadId: string
      readonly type: 'items-changed'
    }

export const initialTimelineScrollState: TimelineScrollState = {
  anchorItemId: null,
  anchoredEndSpace: 0,
  followMode: 'following-end',
  latestUserItemId: null,
  parkedAnchorItemId: null,
  pendingInitialScroll: false,
  threadId: null,
}

/** Distance from the viewport bottom down to the real content bottom. */
export function timelineDistanceToContentEnd(
  viewport: TimelineViewportMetrics,
  endInset: number,
): number {
  return viewport.contentHeight - viewport.scrollTop - viewport.viewportHeight - endInset
}

export function isTimelineWithinFollowBand(
  viewport: TimelineViewportMetrics,
  endInset: number,
): boolean {
  return timelineDistanceToContentEnd(viewport, endInset) <= TIMELINE_FOLLOW_REARM_BAND_PX
}

/** Content short enough to fit the viewport cannot carry a navigation gesture. */
export function timelineContentScrollsUp(viewport: TimelineViewportMetrics): boolean {
  return viewport.contentHeight - viewport.viewportHeight > 0
}

/** The id of the last user message, which is what a new turn anchors to. */
export function resolveTimelineAnchorItemId(
  items: readonly { readonly id: string; readonly message?: { readonly role: string } }[],
): string | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item?.message?.role !== 'user') continue

    return item.id
  }

  return null
}

export function timelineAnchoredTurnMetrics({
  anchorOffset,
  anchorRow,
  endInset,
  lastRow,
  viewport,
}: {
  anchorOffset: number
  anchorRow: TimelineRowMetrics | undefined
  endInset: number
  lastRow: TimelineRowMetrics | undefined
  viewport: TimelineViewportMetrics
}): TimelineAnchoredTurnMetrics | null {
  if (!isMeasuredRow(anchorRow)) return null
  if (!isMeasuredRow(lastRow)) return null

  const anchorTop = anchorRow.start
  // A zero-height last row would make the turn look already-revealed.
  const contentBottom = lastRow.start + Math.max(1, lastRow.size)
  const usableViewportHeight = Math.max(0, viewport.viewportHeight - endInset - anchorOffset)
  const turnHeight = Math.max(0, contentBottom - anchorTop)
  const targetScrollToRevealEnd = Math.max(0, contentBottom - usableViewportHeight)

  return {
    anchorTop,
    contentBottom,
    endSpace: Math.max(0, usableViewportHeight - turnHeight),
    overflowsUsableViewport: turnHeight > usableViewportHeight,
    parkScrollTop: Math.max(0, anchorTop - anchorOffset),
    scrollDeltaToRevealEnd: Math.max(0, targetScrollToRevealEnd - viewport.scrollTop),
    turnHeight,
    usableViewportHeight,
  }
}

/**
 * How much to move the scroll offset when a row's measured size replaces its
 * estimate. Only rows that start above the viewport top matter: growing them
 * pushes everything visible down by `delta`, so the offset has to absorb it or
 * the text under the cursor jumps. Deliberately compensates while scrolling up
 * too — that is exactly when a reader notices the jump.
 */
export function timelineRemeasureScrollDelta({
  delta,
  rowStart,
  scrollTop,
  suspended,
}: {
  delta: number
  rowStart: number
  scrollTop: number
  suspended: boolean
}): number {
  if (suspended) return 0
  if (!Number.isFinite(delta) || delta === 0) return 0
  if (!Number.isFinite(rowStart)) return 0
  if (rowStart >= scrollTop) return 0

  return delta
}

export function timelineScrollReducer(
  state: TimelineScrollState,
  event: TimelineScrollEvent,
): TimelineScrollState {
  switch (event.type) {
    case 'items-changed':
      return reduceItemsChanged(state, event.threadId, event.latestUserItemId)
    case 'initial-scroll-done':
      if (!state.pendingInitialScroll) return state

      return { ...state, pendingInitialScroll: false }
    case 'anchor-measured':
      if (state.anchoredEndSpace === event.endSpace) return state

      return { ...state, anchoredEndSpace: event.endSpace }
    case 'anchor-parked':
      if (state.parkedAnchorItemId === state.anchorItemId) return state

      return { ...state, parkedAnchorItemId: state.anchorItemId }
    case 'scrolled':
      return reduceScrolled(state, event.withinFollowBand)
    case 'user-navigated':
      if (state.followMode === 'free-scrolling') return state

      return { ...state, followMode: 'free-scrolling' }
    case 'jump-to-end':
      return { ...state, ...releasedAnchor(), followMode: 'following-end' }
  }
}

function reduceItemsChanged(
  state: TimelineScrollState,
  threadId: string,
  latestUserItemId: string | null,
): TimelineScrollState {
  if (threadId !== state.threadId) {
    return {
      ...initialTimelineScrollState,
      latestUserItemId,
      pendingInitialScroll: true,
      threadId,
    }
  }
  if (latestUserItemId === state.latestUserItemId) return state
  if (latestUserItemId === null) return { ...state, latestUserItemId: null }

  // A brand new user message means the user just sent something: park it near
  // the top instead of pinning to the bottom, even if they were reading history.
  return {
    ...state,
    anchorItemId: latestUserItemId,
    followMode: 'anchoring-new-turn',
    latestUserItemId,
    parkedAnchorItemId: null,
  }
}

function reduceScrolled(
  state: TimelineScrollState,
  withinFollowBand: boolean,
): TimelineScrollState {
  // Scroll events cannot tell a gesture from our own programmatic move, so they
  // never break follow — only an explicit navigation does. While anchoring they
  // do not re-arm either, or the first streamed chunk would repin to the bottom
  // and undo the anchor.
  if (state.followMode === 'anchoring-new-turn') return state
  if (!withinFollowBand) return state
  if (state.followMode === 'following-end') return state

  // Back at the live edge: release the anchor. Its reserved end space sits
  // entirely below the viewport at this point, so collapsing it moves nothing.
  return { ...state, ...releasedAnchor(), followMode: 'following-end' }
}

function releasedAnchor() {
  return { anchorItemId: null, anchoredEndSpace: 0, parkedAnchorItemId: null }
}

function isMeasuredRow(row: TimelineRowMetrics | undefined): row is TimelineRowMetrics {
  if (!row) return false

  return Number.isFinite(row.start) && Number.isFinite(row.size)
}
