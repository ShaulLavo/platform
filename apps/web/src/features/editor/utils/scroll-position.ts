import type { EditorScrollPosition, EditorViewSnapshot } from '@singapor/core'

export function scrollPositionFromSnapshot(
  snapshot: EditorViewSnapshot | null,
): EditorScrollPosition | null {
  if (!snapshot) return null

  return {
    left: snapshot.viewport.scrollLeft,
    top: snapshot.viewport.scrollTop,
  }
}

/**
 * The editor lets the user overscroll until the last row reaches the top of the viewport, but
 * restoring an overscrolled offset paints a nearly empty pane. Persisted positions are capped to
 * the offset that rests the bottom row on the viewport's bottom edge; live scrolling is untouched.
 */
export function capOverscrollTop(top: number, snapshot: EditorViewSnapshot | null): number {
  if (!snapshot) return top

  const { totalHeight, viewport } = snapshot
  if (totalHeight <= 0 || viewport.clientHeight <= 0) return top

  return Math.min(top, Math.max(0, totalHeight - viewport.clientHeight))
}
