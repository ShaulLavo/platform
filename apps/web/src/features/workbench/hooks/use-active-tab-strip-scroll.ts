import { useLayoutEffect, useRef } from 'react'

import { tabStripScrollLeft } from '@/features/workbench/utils/tab-strip-scroll'

/** Matches the strip's `px-2`, so a revealed tab never sits flush against the edge. */
const TAB_STRIP_GUTTER = 8

/**
 * Scrolls the strip to the selected tab. Anything that opens a file — the tree,
 * quick access, a git diff, go-to-definition, a chat checkpoint — selects a tab
 * that may sit outside the scroll window, and nothing else brings it back.
 */
export function useActiveTabStripScroll(activeTabId: string | null) {
  const stripRef = useRef<HTMLDivElement>(null)

  // Layout effect, not effect: scrolling after paint shows the old offset for a frame.
  useLayoutEffect(() => {
    const strip = stripRef.current
    if (!strip || !activeTabId) return

    const tab = strip.querySelector(`[data-editor-tab-id="${activeTabId}"]`)
    if (!tab) return

    const stripBox = strip.getBoundingClientRect()
    const tabBox = tab.getBoundingClientRect()
    const scrollLeft = tabStripScrollLeft({
      gutter: TAB_STRIP_GUTTER,
      scrollLeft: strip.scrollLeft,
      stripLeft: stripBox.left,
      stripRight: stripBox.right,
      tabLeft: tabBox.left,
      tabRight: tabBox.right,
    })
    if (scrollLeft === null) return

    strip.scrollLeft = scrollLeft
  }, [activeTabId])

  return stripRef
}
