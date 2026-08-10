/**
 * Geometry for the transcript's turn rail, as pure functions over turn
 * boundaries and viewport metrics. The rail is navigation only: it reads the
 * scroll machine in `timeline-scroll-anchoring.ts` and never decides follow
 * mode. The component owns the DOM; it applies the offset this module returns.
 *
 * Every fraction here is approximate. A virtualized row keeps its estimated
 * height until it has been rendered and measured, so marks for turns outside
 * the measured window sit where the estimate puts them and slide as the reader
 * scrolls past and the real heights land. Good enough to navigate by, not
 * something to derive anything exact from.
 */

import {
  timelineContentScrollsUp,
  type TimelineRowMetrics,
  type TimelineViewportMetrics,
} from './timeline-scroll-anchoring'

/**
 * Below this the rail is noise: three marks beside a transcript the reader can
 * flick through in one gesture say nothing they cannot already see.
 */
export const TIMELINE_MINIMAP_MIN_TURNS = 4

/** The duck shape a timeline item needs for its turn boundary to be found. */
export interface TimelineMinimapItem {
  readonly id: string
  readonly message?: { readonly role: string }
}

export interface TimelineMinimapMark {
  readonly id: string
  /** 1-based position among turns, for labels. */
  readonly ordinal: number
  /** Turn top in the scroll container's coordinate space. */
  readonly start: number
  /** The same top as a fraction of the scrollable content, for placing the mark. */
  readonly startFraction: number
}

export interface TimelineMinimapBand {
  readonly endFraction: number
  readonly startFraction: number
}

/**
 * One mark per turn, at the top of the user message that started it. Folds only
 * ever hold a turn's own assistant and activity rows, so the user messages left
 * at the top level are the complete set of boundaries.
 */
export function timelineMinimapMarks({
  contentHeight,
  items,
  rows,
}: {
  contentHeight: number
  items: readonly TimelineMinimapItem[]
  rows: readonly (TimelineRowMetrics | undefined)[]
}): readonly TimelineMinimapMark[] {
  if (!(contentHeight > 0)) return []

  const marks: TimelineMinimapMark[] = []
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (item?.message?.role !== 'user') continue

    const start = rows[index]?.start
    if (start === undefined || !Number.isFinite(start)) continue

    marks.push({
      id: item.id,
      ordinal: marks.length + 1,
      start,
      startFraction: clampFraction(start / contentHeight),
    })
  }

  return marks
}

/** Where the viewport sits over the whole transcript. */
export function timelineMinimapViewportBand(
  viewport: TimelineViewportMetrics,
): TimelineMinimapBand | null {
  if (!(viewport.contentHeight > 0)) return null
  if (!(viewport.viewportHeight > 0)) return null

  return {
    endFraction: clampFraction(
      (viewport.scrollTop + viewport.viewportHeight) / viewport.contentHeight,
    ),
    startFraction: clampFraction(viewport.scrollTop / viewport.contentHeight),
  }
}

/**
 * The turn the reader is inside: the last one starting at or above the viewport
 * top. The top rather than the middle because that is the line a reader reads
 * from — a turn is "the one you are on" from the moment its first row is up
 * there, not once it covers half the screen.
 */
export function timelineMinimapActiveMarkId({
  marks,
  viewport,
}: {
  marks: readonly TimelineMinimapMark[]
  viewport: TimelineViewportMetrics
}): string | null {
  const first = marks[0]
  if (!first) return null

  let active = first.id
  for (const mark of marks) {
    if (mark.start > viewport.scrollTop) break

    active = mark.id
  }

  return active
}

/**
 * Where a jump lands: the turn parked `topInset` below the viewport top, the
 * same place a freshly sent turn parks. Clamped to the real scroll range so the
 * last turn lands at the content end rather than asking for an offset the
 * container will silently shorten.
 */
export function timelineMinimapScrollTop({
  mark,
  topInset,
  viewport,
}: {
  mark: TimelineMinimapMark
  topInset: number
  viewport: TimelineViewportMetrics
}): number {
  const maxScrollTop = Math.max(0, viewport.contentHeight - viewport.viewportHeight)

  return Math.min(maxScrollTop, Math.max(0, mark.start - topInset))
}

/** Content that fits the viewport has nowhere to navigate to. */
export function shouldShowTimelineMinimap({
  markCount,
  viewport,
}: {
  markCount: number
  viewport: TimelineViewportMetrics
}): boolean {
  if (markCount < TIMELINE_MINIMAP_MIN_TURNS) return false

  return timelineContentScrollsUp(viewport)
}

/**
 * Which mark carries the rail's single tab stop. Where the reader left focus
 * wins over where the viewport is, so scrolling never moves the tab stop out
 * from under someone navigating by keyboard.
 */
export function timelineMinimapRovingMarkId({
  activeMarkId,
  focusedMarkId,
  marks,
}: {
  activeMarkId: string | null
  focusedMarkId: string | null
  marks: readonly TimelineMinimapMark[]
}): string | null {
  const first = marks[0]
  if (!first) return null
  if (holdsMark(marks, focusedMarkId)) return focusedMarkId
  if (holdsMark(marks, activeMarkId)) return activeMarkId

  return first.id
}

/**
 * Arrow keys walk the rail without wrapping — it is a spatial map, and coming
 * out of the bottom at the top would misreport where the reader is.
 */
export function timelineMinimapKeyTargetIndex({
  count,
  from,
  key,
}: {
  count: number
  from: number
  key: string
}): number | null {
  if (count <= 0) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === 'ArrowUp') return Math.max(0, from - 1)
  if (key === 'ArrowDown') return Math.min(count - 1, from + 1)

  return null
}

function holdsMark(marks: readonly TimelineMinimapMark[], markId: string | null): markId is string {
  if (markId === null) return false

  return marks.some((mark) => mark.id === markId)
}

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0

  return Math.min(1, Math.max(0, value))
}
