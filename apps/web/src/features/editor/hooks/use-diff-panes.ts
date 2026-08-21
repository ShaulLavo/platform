import type { Editor } from '@singapor/core'
import type { DiffGutterSide } from '@singapor/diff'
import { useCallback, useRef } from 'react'

import type { DiffScrollPosition } from '@/features/editor/utils/diff-scroll-bridge'

type DiffSplitSide = Exclude<DiffGutterSide, 'stacked'>

export type DiffPanesController = {
  registerEditor(side: DiffGutterSide, editor: Editor | null): void
  handleFocus(side: DiffGutterSide): void
  handleScroll(side: DiffGutterSide, position: DiffScrollPosition): void
}

/**
 * The two behaviours split mode owes that a single pane does not: both axes scroll together, and
 * only one pane holds a selection.
 *
 * The callbacks are stable because the panes hang layout effects and a plugin instance off them —
 * a fresh identity per render would re-register the scroll bridge on every frame.
 */
export function useDiffPanes(): DiffPanesController {
  const editors = useRef(new Map<DiffGutterSide, Editor>())
  // Where our own last write left the mirrored pane, so its answering scroll can be told apart
  // from a reader scrolling it. Without this the mirror mirrors back, and a pane that clamps — a
  // shorter longest line, so less room to scroll horizontally — drags the pane the reader is
  // actually driving back with it.
  //
  // Matched on position rather than being a one-shot flag for that side. A write that lands
  // exactly where the pane already was emits no scroll event at all, and a bare flag would then
  // stay armed and swallow the reader's next scroll of that pane instead.
  const echo = useRef<{ side: DiffGutterSide; top: number; left: number } | null>(null)

  const registerEditor = useCallback((side: DiffGutterSide, editor: Editor | null) => {
    if (editor) {
      editors.current.set(side, editor)
      return
    }

    editors.current.delete(side)
    if (echo.current?.side === side) echo.current = null
  }, [])

  const handleScroll = useCallback((side: DiffGutterSide, from: DiffScrollPosition) => {
    if (isEcho(echo.current, side, from)) {
      echo.current = null
      return
    }

    const target = otherSide(side)
    if (!target) return

    const mirror = editors.current.get(target)
    if (!mirror) return

    const to = mirror.getScrollPosition()
    if (from.top === to.top && from.left === to.left) return

    // Verbatim, with no compensation for a pane that cannot scroll as far — the same contract the
    // old view had. The panes silently desynchronise horizontally until the driving one scrolls
    // back into the other's range.
    mirror.setScrollPosition({ left: from.left, top: from.top })
    // Read back rather than remembering what was asked for: `setScrollPosition` clamps, and it is
    // where the pane *landed* that its own scroll event will report.
    const landed = mirror.getScrollPosition()
    echo.current = { left: landed.left, side: target, top: landed.top }
  }, [])

  const handleFocus = useCallback((side: DiffGutterSide) => {
    const target = otherSide(side)
    if (!target) return

    // `reveal: false`, or collapsing the idle pane's selection scrolls it to the top and takes the
    // pane the reader is looking at with it on the next sync.
    editors.current.get(target)?.setSelection(0, 0, { reveal: false })
  }, [])

  return { handleFocus, handleScroll, registerEditor }
}

function isEcho(
  echo: { side: DiffGutterSide; top: number; left: number } | null,
  side: DiffGutterSide,
  position: DiffScrollPosition,
): boolean {
  if (!echo || echo.side !== side) return false

  return echo.top === position.top && echo.left === position.left
}

function otherSide(side: DiffGutterSide): DiffSplitSide | null {
  if (side === 'old') return 'new'
  if (side === 'new') return 'old'

  return null
}
