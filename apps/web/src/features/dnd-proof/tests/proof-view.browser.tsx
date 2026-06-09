import '@workspace/ui/globals.css'

import { commands, page } from '@vitest/browser/context'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DndProofView } from '@/features/dnd-proof/components/proof-view'

let root: Root | null = null
let currentDragPoint: PointerPoint | null = null
let currentPointerId = 0

declare module '@vitest/browser/context' {
  interface BrowserCommands {
    proofMouseDrag(input: ProofMouseDragInput): Promise<void>
    proofMouseUp(): Promise<void>
  }
}

type ProofMouseDragInput = {
  readonly release?: boolean
  readonly sourceClientX?: number
  readonly sourceClientY?: number
  readonly sourceSelector: string
  readonly sourceX?: number
  readonly sourceY?: number
  readonly steps: readonly ProofMouseDragStep[]
}

type ProofMouseDragStep =
  | {
      readonly dx: number
      readonly dy: number
      readonly kind: 'move-by'
      readonly steps?: number
    }
  | {
      readonly kind: 'move-to-selector'
      readonly offsetX?: number
      readonly offsetY?: number
      readonly selector: string
      readonly steps?: number
      readonly x?: number
      readonly y?: number
    }
  | {
      readonly kind: 'pause'
      readonly ms?: number
    }

afterEach(async () => {
  await commands.proofMouseUp().catch(() => undefined)

  if (root) {
    flushSync(() => root?.unmount())
    root = null
  }

  document.body.innerHTML = ''
  document.body.removeAttribute('style')
  currentDragPoint = null
  currentPointerId = 0
})

describe.sequential('dnd proof browser behavior', () => {
  it('renders root guides at the real full surface edges', async () => {
    renderProof()

    await waitForProof()
    await waitForSettledProofGeometry()

    const surfaceRect = proofSurfaceArea().getBoundingClientRect()
    const topRect = snapDestinationWithLabel('root top').getBoundingClientRect()
    const leftRect = snapDestinationWithLabel('root left').getBoundingClientRect()
    const rightRect = snapDestinationWithLabel('root right').getBoundingClientRect()
    const bottomRect = snapDestinationWithLabel('root bottom').getBoundingClientRect()
    const firstStripRect = tabStrips()[0]?.getBoundingClientRect()
    const firstWindowRect = windowRegions()[0]?.getBoundingClientRect()
    if (!firstStripRect) throw new Error('Missing first tab strip')
    if (!firstWindowRect) throw new Error('Missing first window')

    expect(topRect.top).toBeLessThan(firstStripRect.bottom)
    expectClose(topRect.top, firstWindowRect.top)
    expectClose(topRect.top, surfaceRect.top + 8)
    expectClose(topRect.left, surfaceRect.left + 8)
    expectClose(topRect.width, surfaceRect.width - 16)
    expectClose(leftRect.top, surfaceRect.top + 8)
    expectClose(leftRect.height, surfaceRect.height - 16)
    expectClose(rightRect.top, surfaceRect.top + 8)
    expectClose(rightRect.height, surfaceRect.height - 16)
    expectClose(bottomRect.left, surfaceRect.left + 8)
    expectClose(bottomRect.width, surfaceRect.width - 16)
  })

  it('previews detached tab snap layout with real browser pointer events before release', async () => {
    renderProof()

    await waitForProof()
    await waitForSettledProofGeometry()

    const beforeRects = windowRects()
    const sourceId = firstTabIdInFirstMultiTabStrip()

    await nativeDragTabToSnap(sourceId, 'window right', { release: false })

    await vi.waitFor(() => {
      expect(activeSnapDestination()?.textContent?.trim()).toBe('window right')
      expect(windowRects()).not.toEqual(beforeRects)
    })

    await commands.proofMouseUp()

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('tab -> window right')
      expectValidProofTabState()
    })
  })

  it('moves the same tab to another window and back with real browser pointer events', async () => {
    renderProof()

    await waitForProof()

    const sourceStrip = firstMultiTabStrip()
    const sourceId = tabIdsInStrip(sourceStrip)[0]
    const homeStripId = proofTabStripId(sourceStrip)
    const targetStrip = tabStripNotContaining(sourceId)
    const targetStripId = proofTabStripId(targetStrip)
    if (!sourceId) throw new Error('Missing source tab id')

    await nativeDragTabToStripDropZone(sourceId, targetStrip)

    await vi.waitFor(() => {
      expect(tabStripIdContaining(sourceId)).toBe(targetStripId)
      expectValidProofTabState()
    })

    await nativeDragTabToStrip(sourceId, tabStripWithId(homeStripId))

    await vi.waitFor(() => {
      expect(tabStripIdContaining(sourceId)).toBe(homeStripId)
      expectValidProofTabState()
    })
  })

  it('previews a detached tab inside the target tab strip before release', async () => {
    renderProof()

    await waitForProof()

    const sourceStrip = firstMultiTabStrip()
    const sourceId = tabIdsInStrip(sourceStrip)[0]
    const targetStrip = tabStripNotContaining(sourceId ?? '')
    const targetStripId = proofTabStripId(targetStrip)
    if (!sourceId) throw new Error('Missing source tab id')

    await nativeDragTabToStripDropZone(sourceId, targetStrip, { release: false })

    await vi.waitFor(() => {
      expect(tabIdsInStrip(tabStripWithId(targetStripId))).toContain(sourceId)
      expectValidProofTabState()
    })

    await commands.proofMouseUp()
    await settleProofDrag()
  })

  it('survives repeated same-tab cross-window round trips with real browser pointer events', async () => {
    renderProof()

    await waitForProof()

    const sourceStrip = firstMultiTabStrip()
    const sourceId = tabIdsInStrip(sourceStrip)[0]
    const homeStripId = proofTabStripId(sourceStrip)
    const targetStripId = proofTabStripId(tabStripNotContaining(sourceId))
    if (!sourceId) throw new Error('Missing source tab id')

    for (let index = 0; index < 3; index += 1) {
      await nativeDragTabToStrip(sourceId, tabStripWithId(targetStripId))
      await vi.waitFor(() => {
        expect(tabStripIdContaining(sourceId)).toBe(targetStripId)
        expectValidProofTabState()
      })

      await nativeDragTabToStrip(sourceId, tabStripWithId(homeStripId))
      await vi.waitFor(() => {
        expect(tabStripIdContaining(sourceId)).toBe(homeStripId)
        expectValidProofTabState()
      })
    }
  })

  it('grabs a window from its handle with real browser pointer events', async () => {
    renderProof()

    await waitForProof()
    await waitForSettledProofGeometry()

    const beforeRects = windowRects()

    await nativeDragWindowToSnap('root right', { release: false })

    await vi.waitFor(() => {
      expect(activeSnapDestination()?.textContent?.trim()).toBe('root right')
      expect(windowRects()).not.toEqual(beforeRects)
    })

    await commands.proofMouseUp()

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('window -> root right')
      expect(document.body.textContent).not.toContain('tab -> root right')
      expectValidProofTabState()
    })
  })

  it('lets a picked-up window return to its source slot', async () => {
    renderProof()

    await waitForProof()
    await waitForSettledProofGeometry()

    const sourceWindow = rightmostWindowRegion()

    startPointerDrag(windowDragHandleIn(sourceWindow))
    movePointerBy(8, 0)
    await nextFrame()
    movePointerTo(snapDestinationDropPoint('root left'))
    await nextFrame()
    const returnPoint = centerOf(snapDestinationWithLabel('return home'))

    movePointerTo(returnPoint)
    await holdPointerOver(returnPoint, 2)

    await vi.waitFor(() => {
      expect(activeSnapDestination()?.textContent?.trim()).toBe('return home')
    })

    finishPointerDrag(returnPoint)

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('release window:')
      expect(document.body.textContent).toContain('-> window:')
      expect(document.body.textContent).not.toContain('window -> root left')
      expectValidProofTabState()
    })
  })

  it('snaps a window through the source vacancy root corridor', async () => {
    renderProof()

    await waitForProof()
    await waitForSettledProofGeometry()

    const beforeRects = windowRects()
    const sourceWindow = topmostWindowRegion()

    startPointerDrag(windowDragHandleIn(sourceWindow))
    movePointerBy(8, 0)
    await nextFrame()
    const vacancyDestination = sourceVacancyDestinationWithLabel('root top')
    const vacancyPoint = centerOf(vacancyDestination)
    const vacancyLabel = vacancyDestination.textContent?.trim()

    movePointerTo(vacancyPoint)
    await holdPointerOver(vacancyPoint, 2)

    await vi.waitFor(() => {
      expect(activeSnapDestination()?.textContent?.trim()).toBe(vacancyLabel)
    })

    finishPointerDrag(vacancyPoint)

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain(`window -> ${vacancyLabel}`)
      expect(windowRects()).not.toEqual(beforeRects)
      expectValidProofTabState()
    })
  })

  it('collapses and expands a proof window in place', async () => {
    renderProof()

    await waitForProof()

    const originalWindowCount = windowRegions().length
    const originalTabIds = tabStrips().flatMap(tabIdsInStrip)
    const targetWindow = bottommostWindowRegion()
    const targetWindowId = proofWindowId(targetWindow)
    const expandedRect = targetWindow.getBoundingClientRect()

    collapseButtonIn(targetWindow).click()

    await vi.waitFor(() => {
      const collapsedWindow = proofWindowById(targetWindowId)
      const collapsedRect = collapsedWindow.getBoundingClientRect()

      expect(collapsedWindow.dataset.proofWindowMode).toBe('collapsed')
      expect(collapsedRect.height).toBeLessThan(expandedRect.height)
      expect(collapsedRect.height).toBeLessThanOrEqual(42)
      expect(getComputedStyle(windowBodyIn(collapsedWindow)).display).toBe('none')
      expect(windowRegions()).toHaveLength(originalWindowCount)
      expect(tabStrips().flatMap(tabIdsInStrip)).toEqual(originalTabIds)
    })

    expandButtonIn(proofWindowById(targetWindowId)).click()

    await vi.waitFor(() => {
      const expandedWindow = proofWindowById(targetWindowId)

      expect(expandedWindow.dataset.proofWindowMode).toBe('normal')
      expect(expandedWindow.getBoundingClientRect().height).toBeGreaterThan(42)
      expect(getComputedStyle(windowBodyIn(expandedWindow)).display).not.toBe('none')
      expectValidProofTabState()
    })
  })

  it('collapses a single root proof window to its header allocation', async () => {
    renderProof()

    await waitForProof()

    const targetWindow = await closeWindowsUntilOne()
    const targetWindowId = proofWindowId(targetWindow)
    const expandedRect = targetWindow.getBoundingClientRect()

    collapseButtonIn(targetWindow).click()

    await vi.waitFor(() => {
      const collapsedWindow = proofWindowById(targetWindowId)
      const collapsedRect = collapsedWindow.getBoundingClientRect()

      expect(windowRegions()).toHaveLength(1)
      expect(collapsedWindow.dataset.proofWindowMode).toBe('collapsed')
      expect(collapsedRect.height).toBeLessThan(expandedRect.height)
      expect(collapsedRect.height).toBeLessThanOrEqual(42)
      expect(getComputedStyle(windowBodyIn(collapsedWindow)).display).toBe('none')
    })
  })

  it('keeps side-collapsed proof window controls reachable in a vertical tab rail', async () => {
    renderProof()

    await waitForProof()

    const targetWindow = leftmostWindowRegion()
    const targetWindowId = proofWindowId(targetWindow)

    collapseButtonIn(targetWindow).click()

    await vi.waitFor(() => {
      const collapsedWindow = proofWindowById(targetWindowId)
      const collapsedRect = collapsedWindow.getBoundingClientRect()

      expect(collapsedWindow.dataset.proofWindowMode).toBe('collapsed')
      expect(collapsedWindow.dataset.proofWindowChromeOrientation).toBe('vertical')
      expect(tabStripInWindow(collapsedWindow).dataset.proofTabStripOrientation).toBe('vertical')
      expect(collapsedRect.width).toBeLessThanOrEqual(42)
      expect(collapsedRect.height).toBeGreaterThan(42)
      expectWindowControlsInside(collapsedWindow)
    })
  })

  it('drags a collapsed proof window to a snap target', async () => {
    renderProof()

    await waitForProof()

    const targetWindow = await collapseWindowElement(bottommostWindowRegion())
    const targetWindowId = proofWindowId(targetWindow)
    const beforeRects = windowRects()
    const snapPoint = snapDestinationDropPoint('root right')

    startPointerDrag(windowDragHandleIn(targetWindow))
    movePointerBy(8, 0)
    await nextFrame()
    movePointerTo(snapPoint)
    await holdPointerOver(snapPoint, 2)

    await vi.waitFor(() => {
      expect(activeSnapDestination()?.textContent?.trim()).toBe('root right')
    })

    finishPointerDrag(snapPoint)

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('window -> root right')
      expect(proofWindowById(targetWindowId).dataset.proofWindowMode).toBe('collapsed')
      expect(windowRects()).not.toEqual(beforeRects)
      expectValidProofTabState()
    })
  })

  it('moves tabs out of and back into a collapsed proof window strip', async () => {
    renderProof()

    await waitForProof()

    const collapsedWindow = await collapseWindowElement(bottommostWindowRegion())
    const collapsedStrip = tabStripInWindow(collapsedWindow)
    const collapsedStripId = proofTabStripId(collapsedStrip)
    const sourceId = tabIdsInStrip(collapsedStrip)[0]
    if (!sourceId) throw new Error('Missing collapsed-window source tab')

    const targetStrip = tabStripNotContaining(sourceId)
    const targetStripId = proofTabStripId(targetStrip)

    await nativeDragTabToStrip(sourceId, targetStrip)
    await vi.waitFor(() => {
      expect(tabStripIdContaining(sourceId)).toBe(targetStripId)
      expectValidProofTabState()
    })

    await nativeDragTabToStripDropZone(sourceId, tabStripWithId(collapsedStripId))
    await vi.waitFor(() => {
      expect(tabStripIdContaining(sourceId)).toBe(collapsedStripId)
      expect(proofWindowById(proofWindowId(collapsedWindow)).dataset.proofWindowMode).toBe(
        'collapsed',
      )
      expectValidProofTabState()
    })
  })

  it('sorts a detached tab through the target window body center before release', async () => {
    renderProof()

    await waitForProof()

    const sourceStrip = firstMultiTabStrip()
    const sourceId = tabIdsInStrip(sourceStrip)[0]
    if (!sourceId) throw new Error('Missing source tab id')

    const targetWindow = bottommostWindowRegion()
    const targetWindowId = proofWindowId(targetWindow)
    const targetStrip = tabStripInWindow(targetWindow)
    const targetStripId = proofTabStripId(targetStrip)
    const targetBodyTextBefore = windowBodyIn(targetWindow).textContent

    startPointerDrag(proofTab(sourceId))
    movePointerBy(8, 0)
    await nextFrame()
    movePointerTo({ x: centerOf(proofTab(sourceId)).x, y: centerOf(proofTab(sourceId)).y + 70 })
    await nextFrame()
    const { centerBodyPoint } = bodySortPointsForWindow(proofWindowById(targetWindowId))

    movePointerTo(centerBodyPoint)

    await vi.waitFor(() => {
      expect(tabIdsInStrip(tabStripWithId(targetStripId))).toContain(sourceId)
      expect(windowBodyIn(proofWindowById(targetWindowId)).textContent).toBe(targetBodyTextBefore)
    })

    const { rightBodyPoint } = bodySortPointsForWindow(proofWindowById(targetWindowId))

    movePointerTo(rightBodyPoint)
    await nextFrame()

    await vi.waitFor(() => {
      expect(tabIdsInStrip(tabStripWithId(targetStripId)).at(-1)).toBe(sourceId)
      expect(windowBodyIn(proofWindowById(targetWindowId)).textContent).toBe(targetBodyTextBefore)
    })

    const { leftBodyPoint } = bodySortPointsForWindow(proofWindowById(targetWindowId))

    movePointerTo(leftBodyPoint)
    await nextFrame()

    await vi.waitFor(() => {
      const ids = tabIdsInStrip(tabStripWithId(targetStripId))
      const sourceIndex = ids.indexOf(sourceId)

      expect(sourceIndex).toBeGreaterThanOrEqual(0)
      expect(sourceIndex).toBeLessThan(ids.length - 1)
      expect(windowBodyIn(proofWindowById(targetWindowId)).textContent).toBe(targetBodyTextBefore)
    })

    finishPointerDrag(leftBodyPoint)

    await vi.waitFor(() => {
      expect(tabStripIdContaining(sourceId)).toBe(targetStripId)
      expect(tabIdsInStrip(tabStripWithId(targetStripId))).toContain(sourceId)
      expectValidProofTabState()
    })
    await settleProofDrag()
  })

  it('continues body-center tab autoscroll while the pointer is held near the edge', async () => {
    renderProof()

    await waitForProof()

    const targetWindow = bottommostWindowRegion()
    const targetWindowId = proofWindowId(targetWindow)
    await addTabsToWindow(targetWindow, 12)

    const targetStrip = tabStripInWindow(proofWindowById(targetWindowId))
    const sourceId = tabIdsInStrip(tabStripInWindow(topmostWindowRegion()))[0]
    if (!sourceId) throw new Error('Missing source tab id')

    targetStrip.scrollLeft = 0
    await vi.waitFor(() => {
      expect(targetStrip.scrollWidth).toBeGreaterThan(targetStrip.clientWidth)
    })

    startPointerDrag(proofTab(sourceId))
    movePointerBy(8, 0)
    await nextFrame()
    movePointerTo({ x: centerOf(proofTab(sourceId)).x, y: centerOf(proofTab(sourceId)).y + 70 })
    await nextFrame()

    const { rightEntryPoint } = bodyAutoscrollEntryPointsForWindow(proofWindowById(targetWindowId))
    movePointerTo(rightEntryPoint)
    await nextFrame()

    await vi.waitFor(() => {
      const stripRect = targetStrip.getBoundingClientRect()
      const tabRect = proofTab(sourceId).getBoundingClientRect()

      expect(tabRect.left + tabRect.width / 2).toBeGreaterThan(stripRect.right - 90)
    })

    const { rightBodyPoint } = bodySortPointsForWindow(proofWindowById(targetWindowId))
    movePointerTo(rightBodyPoint)
    await nextFrame()

    const scrollBeforeHold = targetStrip.scrollLeft
    await waitFrames(18)

    expect(targetStrip.scrollLeft).toBeGreaterThan(scrollBeforeHold + 30)
    finishPointerDrag(rightBodyPoint)
  })

  it('uses the production resize overlay to resize proof windows live', async () => {
    renderProof()

    await waitForProof()

    expect(resizeOverlay()).not.toBeNull()
    expect(getComputedStyle(resizeOverlay()).pointerEvents).toBe('none')

    const handle = firstResizeHandle()
    const startPoint = centerOf(handle)
    const resizePoint = resizePointForHandle(handle, startPoint, 60)
    const beforeRects = windowRects()

    expect(getComputedStyle(handle).pointerEvents).toBe('auto')

    currentPointerId += 1
    handle.dispatchEvent(pointerEvent('pointerdown', startPoint, 1))
    handle.dispatchEvent(pointerEvent('pointermove', resizePoint, 1))

    await vi.waitFor(() => {
      expect(windowRects()).not.toEqual(beforeRects)
    })

    const movedHandlePoint = centerOf(firstResizeHandle())
    expectResizeHandleMoved(handle, movedHandlePoint, resizePoint)

    handle.dispatchEvent(pointerEvent('pointerup', resizePoint, 0))
  })

  it('resizes proof windows through a full real browser pointer drag', async () => {
    renderProof()

    await waitForProof()
    await waitForSettledProofGeometry()

    const handle = firstResizeHandle()
    const startPoint = centerOf(handle)
    const targetPoint = resizePointForHandle(handle, startPoint, 120)
    const beforeRects = windowRects()

    await commands.proofMouseDrag({
      sourceSelector: selectorFor(handle),
      steps: [
        {
          dx: targetPoint.x - startPoint.x,
          dy: targetPoint.y - startPoint.y,
          kind: 'move-by',
          steps: 24,
        },
        { kind: 'pause', ms: 32 },
      ],
    })

    await vi.waitFor(() => {
      expect(windowRects()).not.toEqual(beforeRects)
    })

    const movedHandlePoint = centerOf(firstResizeHandle())
    expectResizeHandleMoved(handle, movedHandlePoint, targetPoint)
  })

  it('keeps resize handles usable after a window is collapsed', async () => {
    renderProof()

    await waitForProof()

    const collapsedWindow = await collapseWindowElement(bottommostWindowRegion())
    const targetWindowId = proofWindowId(collapsedWindow)
    const beforeRects = windowRects()

    resizeFirstHandleBy(48)

    await vi.waitFor(() => {
      expect(windowRects()).not.toEqual(beforeRects)
      expect(proofWindowById(targetWindowId).dataset.proofWindowMode).toBe('collapsed')
      expectValidProofTabState()
    })
  })

  it('reorders tabs from the right edge of the tab bar without activating a snap zone', async () => {
    renderProof()

    await waitForProof()

    const strip = firstMultiTabStrip()
    const beforeIds = tabIdsInStrip(strip)
    const sourceTab = tabsInStrip(strip)[0]
    if (!sourceTab) throw new Error('Missing source tab')

    const stripRect = strip.getBoundingClientRect()
    const targetPoint = { x: stripRect.right - 4, y: stripRect.top + stripRect.height / 2 }

    startPointerDrag(sourceTab)
    movePointerBy(8, 0)
    await nextFrame()
    movePointerTo(targetPoint, strip)
    await nextFrame()

    expect(activeSnapDestination()).toBeNull()

    finishPointerDrag(targetPoint)

    await vi.waitFor(() => {
      const afterIds = tabIdsInStrip(firstMultiTabStrip())
      expect(afterIds.at(-1)).toBe(beforeIds[0])
      expect(new Set(afterIds)).toEqual(new Set(beforeIds))
    })
  })

  it('detaches a tab to a root snap target', async () => {
    renderProof()

    await waitForProof()

    const originalWindowCount = windowRegions().length
    const originalStrip = firstMultiTabStrip()
    const sourceId = tabIdsInStrip(originalStrip)[0]
    if (!sourceId) throw new Error('Missing source tab id')
    const originalStripId = originalStrip.dataset.proofTabStripId

    await dragTabToSnap(sourceId, 'root bottom')

    await vi.waitFor(() => {
      expect(windowRegions()).toHaveLength(originalWindowCount + 1)
      expect(tabStripIdContaining(sourceId)).not.toBe(originalStripId)
    })
  })

  it('keeps root-snapped tabs inside their owning tab strips', async () => {
    renderProof()

    await waitForProof()

    const snapLabels = ['root left', 'root right', 'root left'] as const
    for (const snapLabel of snapLabels) {
      const sourceId = firstTabIdInFirstMultiTabStrip()

      await dragTabToSnap(sourceId, snapLabel, { assertActive: false })
      await vi.waitFor(expectTabsInsideOwningStrips)
    }
  })

  for (const snapLabel of ['window right', 'window bottom', 'window left', 'window top']) {
    it(`snaps a detached tab to ${snapLabel}`, async () => {
      renderProof()

      await waitForProof()

      const originalWindowCount = windowRegions().length
      const sourceId = firstTabIdInFirstMultiTabStrip()

      await dragTabToSnap(sourceId, snapLabel, {
        holdFrames: snapLabel === 'window top' ? 1 : undefined,
      })

      await vi.waitFor(() => {
        expect(document.body.textContent).toContain(`tab -> ${snapLabel}`)
        expect(windowRegions()).toHaveLength(originalWindowCount + 1)
      })
    })
  }

  it('docks a single-tab window back into a tab strip', async () => {
    renderProof()

    await waitForProof()

    const originalWindowCount = windowRegions().length
    buttonWithText('Window').click()

    await vi.waitFor(() => {
      expect(windowRegions()).toHaveLength(originalWindowCount + 1)
    })

    const sourceStrip = singleTabStrip()
    const sourceId = tabIdsInStrip(sourceStrip)[0]
    if (!sourceId) throw new Error('Missing single-window source tab id')

    const sourceTab = proofTab(sourceId)
    const sourceCenter = centerOf(sourceTab)
    startPointerDrag(sourceTab)
    movePointerBy(8, 0)
    await nextFrame()
    movePointerTo({ x: sourceCenter.x, y: sourceCenter.y + 70 })
    await nextFrame()
    const targetStrip = tabStripNotContaining(sourceId)
    const targetStripId = targetStrip.dataset.proofTabStripId
    const targetRect = targetStrip.getBoundingClientRect()
    const targetPoint = { x: targetRect.right - 16, y: targetRect.top + targetRect.height / 2 }

    movePointerTo(targetPoint)
    await nextFrame()
    finishPointerDrag(targetPoint)

    await vi.waitFor(() => {
      expect(windowRegions()).toHaveLength(originalWindowCount)
      expect(tabStripIdContaining(sourceId)).toBe(targetStripId)
    })
  })

  it('keeps a window drag active across resize handles and commits the resolved snap on release', async () => {
    renderProof()

    await waitForProof()

    const beforeRects = windowRects()
    const handle = firstResizeHandle()
    const dragHandle = firstWindowDragHandle()
    const snapPoint = snapDestinationDropPoint('root right')

    startPointerDrag(dragHandle)
    movePointerBy(8, 0)
    await nextFrame()
    movePointerTo(centerOf(handle), handle)
    await nextFrame()
    movePointerTo(snapPoint)
    await nextFrame()

    await vi.waitFor(() => {
      expect(activeSnapDestination()).not.toBeNull()
      expect(windowRects()).not.toEqual(beforeRects)
    })

    finishPointerDrag(snapPoint)

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('window ->')
    })
  })

  it('hides snap target chrome during drag when drop zones are toggled off', async () => {
    renderProof()

    await waitForProof()

    buttonWithText('Hide zones').click()
    await nextFrame()

    const dragHandle = firstWindowDragHandle()
    const snapPoint = snapDestinationDropPoint('root right')

    startPointerDrag(dragHandle)
    movePointerBy(8, 0)
    await nextFrame()
    movePointerTo(snapPoint)
    await nextFrame()

    await vi.waitFor(() => {
      const activeDestination = activeSnapDestination()
      expect(activeDestination).not.toBeNull()
      expect(getComputedStyle(activeDestination as HTMLElement).opacity).toBe('0')
    })

    finishPointerDrag(snapPoint)
  })
})

function renderProof() {
  document.body.style.margin = '0'
  const container = document.createElement('main')
  container.style.height = '700px'
  container.style.width = '900px'
  document.body.append(container)
  root = createRoot(container)
  flushSync(() => root?.render(<DndProofView />))
}

async function waitForProof() {
  await vi.waitFor(() => {
    expect(windowRegions()).toHaveLength(3)
    expect(tabStrips().length).toBeGreaterThan(0)
    expect(snapDestinationWithLabel('root top')).not.toBeNull()
  })
  await nextFrame()
}

async function dragTabToSnap(
  tabId: string,
  snapLabel: string,
  options: {
    readonly assertActive?: boolean
    readonly holdFrames?: number
  } = {},
) {
  const sourceTab = proofTab(tabId)
  const sourceCenter = centerOf(sourceTab)

  startPointerDrag(sourceTab)
  movePointerBy(8, 0)
  await nextFrame()
  movePointerTo({ x: sourceCenter.x, y: sourceCenter.y + 70 })
  await nextFrame()
  const snapPoint = snapDestinationDropPoint(snapLabel)
  movePointerTo(snapPoint)
  await nextFrame()
  const settledSnapPoint = snapDestinationDropPoint(snapLabel)
  movePointerTo(settledSnapPoint)
  await holdPointerOver(settledSnapPoint, options.holdFrames ?? 4)
  if (options.assertActive !== false) {
    await vi.waitFor(() => {
      expect(activeSnapDestination()?.textContent?.trim()).toBe(snapLabel)
    })
  }
  finishPointerDrag(settledSnapPoint)
}

async function nativeDragTabToSnap(
  tabId: string,
  snapLabel: string,
  options: {
    readonly release?: boolean
  } = {},
) {
  await commands.proofMouseDrag({
    release: options.release,
    sourceSelector: selectorFor(proofTab(tabId)),
    steps: nativeTabSnapSteps(snapLabel),
  })
}

function nativeTabSnapSteps(snapLabel: string): readonly ProofMouseDragStep[] {
  const steps: ProofMouseDragStep[] = [
    { dx: 8, dy: 0, kind: 'move-by', steps: 4 },
    { dx: 0, dy: 70, kind: 'move-by', steps: 8 },
    snapDestinationMouseStep(snapLabel),
    { kind: 'pause', ms: 32 },
  ]
  if (snapLabel === 'window top') return steps

  return [...steps, snapDestinationMouseStep(snapLabel), { kind: 'pause', ms: 32 }]
}

async function nativeDragTabToStrip(tabId: string, targetStrip: HTMLElement) {
  const targetStripId = proofTabStripId(targetStrip)
  const source = await settledVisibleTabSource(tabId)
  const settledTargetStrip = tabStripWithId(targetStripId)
  const targetElement = tabDockElementInStrip(settledTargetStrip)
  const sourcePoint = tabPointFromRatio(source.tab, source.point)

  await commands.proofMouseDrag({
    sourceClientX: sourcePoint.x,
    sourceClientY: sourcePoint.y,
    sourceSelector: selectorFor(source.tab),
    sourceX: source.point.x,
    sourceY: source.point.y,
    steps: [
      { dx: 8, dy: 0, kind: 'move-by', steps: 4 },
      { dx: 0, dy: 70, kind: 'move-by', steps: 8 },
      {
        kind: 'move-to-selector',
        selector: selectorFor(targetElement.element),
        steps: 18,
        x: targetElement.x,
        y: targetElement.y,
      },
      { kind: 'pause', ms: 32 },
      {
        kind: 'move-to-selector',
        selector: selectorFor(targetElement.element),
        steps: 4,
        x: targetElement.x,
        y: targetElement.y,
      },
      { kind: 'pause', ms: 32 },
    ],
  })
  await settleProofDrag()
}

async function nativeDragTabToStripDropZone(
  tabId: string,
  targetStrip: HTMLElement,
  options: {
    readonly release?: boolean
  } = {},
) {
  const targetStripId = proofTabStripId(targetStrip)
  const source = await settledVisibleTabSource(tabId)
  const settledTargetStrip = tabStripWithId(targetStripId)
  const targetElement = tabStripDropZoneElement(settledTargetStrip)
  const sourcePoint = tabPointFromRatio(source.tab, source.point)

  await commands.proofMouseDrag({
    release: options.release,
    sourceClientX: sourcePoint.x,
    sourceClientY: sourcePoint.y,
    sourceSelector: selectorFor(source.tab),
    sourceX: source.point.x,
    sourceY: source.point.y,
    steps: [
      { dx: 8, dy: 0, kind: 'move-by', steps: 4 },
      { dx: 0, dy: 70, kind: 'move-by', steps: 8 },
      {
        kind: 'move-to-selector',
        selector: selectorFor(targetElement.element),
        steps: 18,
        x: targetElement.x,
        y: targetElement.y,
      },
      { kind: 'pause', ms: 32 },
    ],
  })
  await settleProofDrag()
}

function tabDockElementInStrip(strip: HTMLElement) {
  const lastTab = tabsInStrip(strip).at(-1)
  if (lastTab) return { element: lastTab, x: 0.5, y: 0.5 }

  return { element: strip, x: 0.5, y: 0.5 }
}

function tabStripDropZoneElement(strip: HTMLElement) {
  if (strip.dataset.proofTabStripOrientation === 'vertical') {
    return { element: strip, x: 0.5, y: 0.95 }
  }

  return { element: strip, x: 0.98, y: 0.5 }
}

async function nativeDragWindowToSnap(
  snapLabel: string,
  options: {
    readonly release?: boolean
  } = {},
) {
  await commands.proofMouseDrag({
    release: options.release,
    sourceSelector: selectorFor(firstWindowDragHandle()),
    steps: [
      { dx: 8, dy: 0, kind: 'move-by', steps: 4 },
      snapDestinationMouseStep(snapLabel),
      { kind: 'pause', ms: 32 },
    ],
  })
}

function snapDestinationMouseStep(label: string): ProofMouseDragStep {
  const destination = snapDestinationWithLabel(label)
  const selector = selectorFor(destination)
  if (label === 'root left') {
    return { kind: 'move-to-selector', offsetX: 6, selector, steps: 18, x: 0, y: 0.5 }
  }
  if (label === 'root top') {
    return { kind: 'move-to-selector', offsetY: 6, selector, steps: 18, x: 0.5, y: 0 }
  }
  if (label === 'root bottom') {
    return { kind: 'move-to-selector', offsetY: -6, selector, steps: 18, x: 0.5, y: 1 }
  }
  if (label === 'root right') {
    return { kind: 'move-to-selector', offsetX: -6, selector, steps: 18, x: 1, y: 0.5 }
  }
  if (label === 'window left') {
    return { kind: 'move-to-selector', offsetX: 6, selector, steps: 18, x: 0, y: 0.5 }
  }
  if (label === 'window right') {
    return { kind: 'move-to-selector', offsetX: -6, selector, steps: 18, x: 1, y: 0.5 }
  }
  if (label === 'window top') {
    return { kind: 'move-to-selector', offsetY: 6, selector, steps: 18, x: 0.5, y: 0 }
  }
  if (label === 'window bottom') {
    return { kind: 'move-to-selector', offsetY: 6, selector, steps: 18, x: 0.5, y: 0 }
  }

  return { kind: 'move-to-selector', selector, steps: 18, x: 0.5, y: 0.5 }
}

function snapDestinationDropPoint(label: string): PointerPoint {
  const destination = snapDestinationWithLabel(label)
  const rect = destination.getBoundingClientRect()
  const surfaceRect = proofSurfaceArea().getBoundingClientRect()
  if (label === 'root left') {
    return {
      x: surfaceRect.left + 2,
      y: surfaceRect.top + surfaceRect.height / 2,
    }
  }
  if (label === 'root top') {
    return {
      x: surfaceRect.left + surfaceRect.width / 2,
      y: surfaceRect.top + 2,
    }
  }
  if (label === 'root bottom') {
    return {
      x: surfaceRect.left + surfaceRect.width / 2,
      y: surfaceRect.bottom - 2,
    }
  }
  if (label === 'root right') {
    return {
      x: surfaceRect.right - 2,
      y: surfaceRect.top + surfaceRect.height / 2,
    }
  }
  if (label === 'window left') {
    return {
      x: rect.left + 6,
      y: rect.top + rect.height / 2,
    }
  }
  if (label === 'window right') {
    return {
      x: rect.right - 6,
      y: rect.top + rect.height / 2,
    }
  }
  if (label === 'window top') {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + 6,
    }
  }
  if (label === 'window bottom') {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + 6,
    }
  }

  return centerOf(destination)
}

function proofSurfaceArea() {
  const area = document.querySelector<HTMLElement>('[data-proof-surface-area]')
  if (!area) throw new Error('Missing proof surface area')

  return area
}

function windowRegions() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-proof-window-id]'))
}

function windowRects() {
  return windowRegions().map((windowElement) => {
    const rect = windowElement.getBoundingClientRect()
    return {
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    }
  })
}

function rightmostWindowRegion() {
  const window = windowRegions().toSorted((left, right) => {
    return right.getBoundingClientRect().right - left.getBoundingClientRect().right
  })[0]
  if (!window) throw new Error('Missing rightmost window')

  return window
}

function topmostWindowRegion() {
  const window = windowRegions().toSorted((left, right) => {
    return left.getBoundingClientRect().top - right.getBoundingClientRect().top
  })[0]
  if (!window) throw new Error('Missing topmost window')

  return window
}

function leftmostWindowRegion() {
  const window = windowRegions().toSorted((left, right) => {
    return left.getBoundingClientRect().left - right.getBoundingClientRect().left
  })[0]
  if (!window) throw new Error('Missing leftmost window')

  return window
}

function bottommostWindowRegion() {
  const window = windowRegions().toSorted((left, right) => {
    return right.getBoundingClientRect().bottom - left.getBoundingClientRect().bottom
  })[0]
  if (!window) throw new Error('Missing bottommost window')

  return window
}

function proofWindowId(windowElement: HTMLElement) {
  const windowId = windowElement.dataset.proofWindowId
  if (!windowId) throw new Error('Missing proof window id')

  return windowId
}

function proofWindowById(windowId: string) {
  const windowElement = document.querySelector<HTMLElement>(`[data-proof-window-id="${windowId}"]`)
  if (!windowElement) throw new Error(`Missing proof window ${windowId}`)

  return windowElement
}

async function collapseWindowElement(windowElement: HTMLElement) {
  const windowId = proofWindowId(windowElement)

  collapseButtonIn(windowElement).click()
  await vi.waitFor(() => {
    expect(proofWindowById(windowId).dataset.proofWindowMode).toBe('collapsed')
  })
  await vi.waitFor(() => {
    const rect = proofWindowById(windowId).getBoundingClientRect()

    expect(Math.min(rect.width, rect.height)).toBeLessThanOrEqual(42)
  })
  await settleProofDrag()

  return proofWindowById(windowId)
}

async function closeWindowsUntilOne() {
  while (windowRegions().length > 1) {
    const windowElement = windowRegions().at(-1)
    if (!windowElement) throw new Error('Missing window to close')

    closeButtonIn(windowElement).click()
    await vi.waitFor(() => {
      expect(windowRegions().length).toBeGreaterThanOrEqual(1)
      expect(windowRegions()).not.toContain(windowElement)
    })
  }

  const windowElement = windowRegions()[0]
  if (!windowElement) throw new Error('Missing remaining proof window')

  return windowElement
}

async function addTabsToWindow(windowElement: HTMLElement, count: number) {
  const windowId = proofWindowId(windowElement)
  const startCount = tabIdsInStrip(tabStripInWindow(windowElement)).length

  for (let index = 0; index < count; index += 1) {
    windowControlButtonWithLabelPrefix(proofWindowById(windowId), 'Add tab to ').click()
    await nextFrame()
  }

  await vi.waitFor(() => {
    const strip = tabStripInWindow(proofWindowById(windowId))

    expect(tabIdsInStrip(strip)).toHaveLength(startCount + count)
  })
}

function collapseButtonIn(windowElement: HTMLElement) {
  const button = buttonInWindowWithLabelPrefix(windowElement, 'Collapse ')
  if (!button) throw new Error('Missing collapse button')

  return button
}

function expandButtonIn(windowElement: HTMLElement) {
  const button = buttonInWindowWithLabelPrefix(windowElement, 'Expand ')
  if (!button) throw new Error('Missing expand button')

  return button
}

function closeButtonIn(windowElement: HTMLElement) {
  const title = windowElement.getAttribute('aria-label')
  if (!title) throw new Error('Missing window title')

  const button = windowControlButtons(windowElement).find(
    (candidate) => candidate.getAttribute('aria-label') === `Close ${title}`,
  )
  if (!button) throw new Error('Missing close button')

  return button
}

function windowControlButtonWithLabelPrefix(windowElement: HTMLElement, prefix: string) {
  const button = windowControlButtons(windowElement).find((candidate) =>
    candidate.getAttribute('aria-label')?.startsWith(prefix),
  )
  if (!button) throw new Error(`Missing window control ${prefix}`)

  return button
}

function windowControlButtons(windowElement: HTMLElement) {
  const header = windowElement.querySelector('header')
  if (!header) throw new Error('Missing window header')

  const controls = header.lastElementChild
  if (!(controls instanceof HTMLElement)) throw new Error('Missing window controls')

  return Array.from(controls.querySelectorAll<HTMLButtonElement>('button'))
}

function expectWindowControlsInside(windowElement: HTMLElement) {
  const buttons = [
    windowControlButtonWithLabelPrefix(windowElement, 'Add tab to '),
    windowControlButtonWithLabelPrefix(windowElement, 'Expand '),
    closeButtonIn(windowElement),
  ]

  for (const button of buttons) {
    expectElementInsideWindow(button, windowElement)
  }
}

function expectElementInsideWindow(element: HTMLElement, windowElement: HTMLElement) {
  const rect = element.getBoundingClientRect()
  const windowRect = windowElement.getBoundingClientRect()

  expect(rect.width).toBeGreaterThan(0)
  expect(rect.height).toBeGreaterThan(0)
  expect(rect.left).toBeGreaterThanOrEqual(windowRect.left - 1)
  expect(rect.right).toBeLessThanOrEqual(windowRect.right + 1)
  expect(rect.top).toBeGreaterThanOrEqual(windowRect.top - 1)
  expect(rect.bottom).toBeLessThanOrEqual(windowRect.bottom + 1)
}

function buttonInWindowWithLabelPrefix(windowElement: HTMLElement, prefix: string) {
  return Array.from(windowElement.querySelectorAll<HTMLButtonElement>('button')).find((candidate) =>
    candidate.getAttribute('aria-label')?.startsWith(prefix),
  )
}

function windowBodyIn(windowElement: HTMLElement) {
  const body = windowElement.querySelector<HTMLElement>('[data-proof-window-body]')
  if (!body) throw new Error('Missing proof window body')

  return body
}

function tabStripInWindow(windowElement: HTMLElement) {
  const strip = windowElement.querySelector<HTMLElement>('[data-proof-tab-strip-id]')
  if (!strip) throw new Error('Missing proof tab strip in window')

  return strip
}

function bodySortPointsForWindow(windowElement: HTMLElement) {
  const rect = windowElement.getBoundingClientRect()
  const insetX = Math.min(rect.width * 0.35, Math.max(44, rect.width * 0.18))
  const y = rect.top + rect.height / 2

  return {
    centerBodyPoint: { x: rect.left + rect.width / 2, y },
    leftBodyPoint: { x: rect.left + insetX + 4, y },
    rightBodyPoint: { x: rect.right - insetX - 4, y },
  }
}

function bodyAutoscrollEntryPointsForWindow(windowElement: HTMLElement) {
  const rect = windowElement.getBoundingClientRect()
  const insetX = Math.min(rect.width * 0.35, Math.max(44, rect.width * 0.18))
  const centerLeft = rect.left + insetX
  const centerRight = rect.right - insetX
  const edgeSize = Math.min(160, (centerRight - centerLeft) / 3)
  const y = rect.top + rect.height / 2

  return {
    rightEntryPoint: { x: centerRight - edgeSize + 8, y },
  }
}

function tabStrips() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-proof-tab-strip-id]'))
}

function firstMultiTabStrip() {
  const strip = tabStrips().find((candidate) => tabsInStrip(candidate).length > 1)
  if (!strip) throw new Error('Missing multi-tab strip')

  return strip
}

function firstTabIdInFirstMultiTabStrip() {
  const sourceId = tabIdsInStrip(firstMultiTabStrip())[0]
  if (!sourceId) throw new Error('Missing source tab id')

  return sourceId
}

function singleTabStrip() {
  const strip = tabStrips().find((candidate) => tabsInStrip(candidate).length === 1)
  if (!strip) throw new Error('Missing single-tab strip')

  return strip
}

function tabStripNotContaining(tabId: string) {
  const strip = tabStrips().find((candidate) => !tabIdsInStrip(candidate).includes(tabId))
  if (!strip) throw new Error(`Missing tab strip outside ${tabId}`)

  return strip
}

function tabStripWithId(tabStripId: string) {
  const strip = tabStrips().find((candidate) => candidate.dataset.proofTabStripId === tabStripId)
  if (!strip) throw new Error(`Missing tab strip ${tabStripId}`)

  return strip
}

function tabsInStrip(strip: HTMLElement) {
  return Array.from(strip.children).flatMap((child) => {
    if (!(child instanceof HTMLElement)) return []
    if (!child.dataset.proofTabId) return []

    return [child]
  })
}

function tabIdsInStrip(strip: HTMLElement) {
  return tabsInStrip(strip).map((tab) => tab.dataset.proofTabId ?? '')
}

function expectTabsInsideOwningStrips() {
  for (const strip of tabStrips()) {
    expectTabsInsideStrip(strip)
  }
}

function expectTabsInsideStrip(strip: HTMLElement) {
  const stripRect = strip.getBoundingClientRect()
  const horizontallyScrollable = strip.scrollWidth > strip.clientWidth + 1

  for (const tab of tabsInStrip(strip)) {
    const tabRect = tab.getBoundingClientRect()
    if (!horizontallyScrollable) {
      expect(tabRect.left).toBeGreaterThanOrEqual(stripRect.left - 1)
      expect(tabRect.right).toBeLessThanOrEqual(stripRect.right + 1)
    }
    expect(tabRect.top).toBeGreaterThanOrEqual(stripRect.top - 1)
    expect(tabRect.bottom).toBeLessThanOrEqual(stripRect.bottom + 1)
  }
}

function tabStripIdContaining(tabId: string) {
  const strip = tabStrips().find((candidate) => tabIdsInStrip(candidate).includes(tabId))
  if (!strip?.dataset.proofTabStripId) throw new Error(`Missing tab strip containing ${tabId}`)

  return strip.dataset.proofTabStripId
}

function proofTabStripId(strip: HTMLElement) {
  const tabStripId = strip.dataset.proofTabStripId
  if (!tabStripId) throw new Error('Missing proof tab strip id')

  return tabStripId
}

function proofTab(tabId: string) {
  const tab = tabStrips()
    .flatMap(tabsInStrip)
    .find((candidate) => candidate.dataset.proofTabId === tabId)
  if (!tab) throw new Error(`Missing proof tab ${tabId}`)

  return tab
}

function snapDestinationWithLabel(label: string) {
  const destinations = snapDestinationsWithLabel(label)
  const destination = preferredSnapDestination(label, destinations)
  if (!destination) throw new Error(`Missing snap destination ${label}`)

  return destination
}

function preferredSnapDestination(label: string, destinations: readonly HTMLElement[]) {
  if (!label.startsWith('window ')) return destinations[0]

  return internalWindowSnapDestination(label, destinations) ?? destinations[0]
}

function internalWindowSnapDestination(label: string, destinations: readonly HTMLElement[]) {
  const surfaceRect = proofSurfaceArea().getBoundingClientRect()

  return destinations.find((destination) => {
    const rect = destination.getBoundingClientRect()
    if (label === 'window left') return rect.left > surfaceRect.left + 20
    if (label === 'window right') return rect.right < surfaceRect.right - 20
    if (label === 'window top') return rect.top > surfaceRect.top + 20
    if (label === 'window bottom') return rect.bottom < surfaceRect.bottom - 20

    return false
  })
}

function snapDestinationsWithLabel(label: string) {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-proof-snap-destination]')).filter(
    (candidate) => candidate.textContent?.trim() === label,
  )
}

function activeSnapDestination() {
  return document.querySelector<HTMLElement>('[data-proof-snap-active="true"]')
}

function sourceVacancyDestinationWithLabel(label: string) {
  const destination = snapDestinationsWithLabel(label).find((candidate) =>
    candidate.dataset.proofSnapDestination?.includes('source-vacancy'),
  )
  if (!destination) throw new Error(`Missing source vacancy destination ${label}`)

  return destination
}

function expectValidProofTabState() {
  const ids = tabStrips().flatMap(tabIdsInStrip)

  expect(ids).toHaveLength(6)
  expect(new Set(ids).size).toBe(ids.length)

  for (const strip of tabStrips()) {
    expectUnexpectedTabStripChildren(strip)
    expect(tabsInStrip(strip).length).toBeGreaterThan(0)
  }
}

function expectUnexpectedTabStripChildren(strip: HTMLElement) {
  const unexpectedChildren = Array.from(strip.children).filter((child) => {
    if (!(child instanceof HTMLElement)) return true

    return !child.dataset.proofTabId
  })

  expect(unexpectedChildren).toHaveLength(0)
}

function buttonWithText(text: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.textContent?.includes(text),
  )
  if (!button) throw new Error(`Missing button ${text}`)

  return button
}

function firstResizeHandle() {
  const handle = document.querySelector<HTMLElement>(
    '[aria-label="Resize columns"], [aria-label="Resize rows"]',
  )
  if (!handle) throw new Error('Missing proof resize handle')

  return handle
}

function resizeOverlay() {
  const overlay = document.querySelector<HTMLElement>('[data-workbench-resize-overlay]')
  if (!overlay) throw new Error('Missing production resize overlay')

  return overlay
}

function resizeFirstHandleBy(deltaPx: number) {
  const handle = firstResizeHandle()
  const startPoint = centerOf(handle)
  const resizePoint = resizePointForHandle(handle, startPoint, deltaPx)

  currentPointerId += 1
  handle.dispatchEvent(pointerEvent('pointerdown', startPoint, 1))
  handle.dispatchEvent(pointerEvent('pointermove', resizePoint, 1))
  handle.dispatchEvent(pointerEvent('pointerup', resizePoint, 0))
}

function resizePointForHandle(
  handle: HTMLElement,
  startPoint: PointerPoint,
  deltaPx: number,
): PointerPoint {
  if (handle.getAttribute('aria-label') === 'Resize columns') {
    return { x: startPoint.x + deltaPx, y: startPoint.y }
  }

  return { x: startPoint.x, y: startPoint.y + deltaPx }
}

function expectResizeHandleMoved(
  handle: HTMLElement,
  movedPoint: PointerPoint,
  expectedPoint: PointerPoint,
) {
  if (handle.getAttribute('aria-label') === 'Resize columns') {
    expect(Math.abs(movedPoint.x - expectedPoint.x)).toBeLessThanOrEqual(1)
    return
  }

  expect(Math.abs(movedPoint.y - expectedPoint.y)).toBeLessThanOrEqual(1)
}

function firstWindowDragHandle() {
  const handle = document.querySelector<HTMLElement>('[data-proof-window-drag-handle]')
  if (!handle) throw new Error('Missing proof window drag handle')

  return handle
}

function windowDragHandleIn(windowElement: HTMLElement) {
  const handle = windowElement.querySelector<HTMLElement>('[data-proof-window-drag-handle]')
  if (!handle) throw new Error('Missing proof window drag handle in window')

  return handle
}

function expectClose(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(2)
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

async function waitFrames(frameCount: number) {
  for (let index = 0; index < frameCount; index += 1) {
    await nextFrame()
  }
}

async function settleProofDrag() {
  await nextFrame()
  await nextFrame()
  await nextFrame()
  await nextFrame()
}

async function waitForSettledProofGeometry() {
  await vi.waitFor(() => {
    const firstRect = windowRects()[0]
    if (!firstRect) throw new Error('Missing proof window rect')

    expect(firstRect.width).toBeLessThan(500)
  })
  await settleProofDrag()
}

async function holdPointerOver(point: PointerPoint, frameCount: number) {
  for (let index = 0; index < frameCount; index += 1) {
    movePointerTo(point)
    await nextFrame()
  }
}

type PointerPoint = {
  readonly x: number
  readonly y: number
}

function startPointerDrag(element: HTMLElement, point: PointerPoint = centerOf(element)) {
  currentDragPoint = point
  currentPointerId += 1
  const target = document.elementFromPoint(point.x, point.y) ?? element
  target.dispatchEvent(pointerEvent('pointerdown', point, 1))
}

function movePointerBy(deltaX: number, deltaY: number, target: EventTarget = document) {
  if (!currentDragPoint) throw new Error('Cannot move a pointer before pointerdown')

  movePointerTo({ x: currentDragPoint.x + deltaX, y: currentDragPoint.y + deltaY }, target)
}

function movePointerTo(point: PointerPoint, target: EventTarget = document) {
  currentDragPoint = point
  target.dispatchEvent(pointerEvent('pointermove', point, 1))
}

function finishPointerDrag(point: PointerPoint = currentDragPoint ?? { x: 0, y: 0 }) {
  document.dispatchEvent(pointerEvent('pointerup', point, 0))
  currentDragPoint = null
}

function pointerEvent(type: string, point: PointerPoint, buttons: number) {
  return new PointerEvent(type, {
    bubbles: true,
    button: 0,
    buttons,
    cancelable: true,
    clientX: point.x,
    clientY: point.y,
    isPrimary: true,
    pointerId: currentPointerId,
    pointerType: 'mouse',
  })
}

function centerOf(element: HTMLElement): PointerPoint {
  const rect = element.getBoundingClientRect()

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  }
}

function scrollTabIntoStripView(tab: HTMLElement) {
  const strip = tab.closest<HTMLElement>('[data-proof-tab-strip-id]')
  if (!strip) return

  const stripRect = strip.getBoundingClientRect()
  const tabRect = tab.getBoundingClientRect()
  if (tabRect.left < stripRect.left) {
    strip.scrollLeft -= stripRect.left - tabRect.left + 8
    return
  }
  if (tabRect.right <= stripRect.right) return

  strip.scrollLeft += tabRect.right - stripRect.right + 8
}

async function settledVisibleTabSource(tabId: string) {
  for (let index = 0; index < 30; index += 1) {
    const tab = proofTab(tabId)
    scrollTabIntoStripView(tab)
    await nextFrame()

    const settledTab = proofTab(tabId)
    const sourcePoint = visibleTabSourcePoint(settledTab)
    if (sourcePointHitsTab(settledTab, sourcePoint)) {
      return { point: sourcePoint, tab: settledTab }
    }
  }

  throw new Error(`Unable to find a hit-testable source tab for ${tabId}`)
}

function visibleTabSourcePoint(tab: HTMLElement) {
  const center = { x: 0.5, y: 0.5 }
  if (sourcePointHitsTab(tab, center)) return center

  const tabRect = tab.getBoundingClientRect()
  const strip = tab.closest<HTMLElement>('[data-proof-tab-strip-id]')
  if (!strip) return { x: 0.5, y: 0.5 }

  const stripRect = strip.getBoundingClientRect()
  if (strip.dataset.proofTabStripOrientation === 'vertical') {
    return visibleVerticalTabSourcePoint(tab, tabRect, stripRect)
  }

  const visibleLeft = Math.max(tabRect.left, stripRect.left)
  const visibleRight = Math.min(tabRect.right, stripRect.right)
  const visibleWidth = Math.max(0, visibleRight - visibleLeft)
  if (visibleWidth <= 0) return { x: 0.5, y: 0.5 }

  const hitPoint = firstVisibleTabHitPoint(tab, tabRect, visibleLeft, visibleRight)
  if (hitPoint) {
    return {
      x: (hitPoint.x - tabRect.left) / tabRect.width,
      y: (hitPoint.y - tabRect.top) / tabRect.height,
    }
  }

  const sourceX = visibleLeft + Math.min(20, visibleWidth / 2)

  return {
    x: (sourceX - tabRect.left) / tabRect.width,
    y: 0.5,
  }
}

function visibleVerticalTabSourcePoint(tab: HTMLElement, tabRect: DOMRect, stripRect: DOMRect) {
  const visibleTop = Math.max(tabRect.top, stripRect.top)
  const visibleBottom = Math.min(tabRect.bottom, stripRect.bottom)
  const visibleHeight = Math.max(0, visibleBottom - visibleTop)
  if (visibleHeight <= 0) return { x: 0.5, y: 0.5 }

  const hitPoint = firstVisibleVerticalTabHitPoint(tab, tabRect, visibleTop, visibleBottom)
  if (hitPoint) {
    return {
      x: (hitPoint.x - tabRect.left) / tabRect.width,
      y: (hitPoint.y - tabRect.top) / tabRect.height,
    }
  }

  const sourceY = visibleTop + Math.min(20, visibleHeight / 2)

  return {
    x: 0.5,
    y: (sourceY - tabRect.top) / tabRect.height,
  }
}

function firstVisibleTabHitPoint(
  tab: HTMLElement,
  tabRect: DOMRect,
  visibleLeft: number,
  visibleRight: number,
) {
  for (const yRatio of [0.5, 0.3, 0.75]) {
    const point = visibleTabHitPointForY(tab, tabRect, visibleLeft, visibleRight, yRatio)
    if (point) return point
  }

  return null
}

function firstVisibleVerticalTabHitPoint(
  tab: HTMLElement,
  tabRect: DOMRect,
  visibleTop: number,
  visibleBottom: number,
) {
  for (const xRatio of [0.5, 0.3, 0.75]) {
    const point = visibleVerticalTabHitPointForX(tab, tabRect, visibleTop, visibleBottom, xRatio)
    if (point) return point
  }

  return null
}

function visibleTabHitPointForY(
  tab: HTMLElement,
  tabRect: DOMRect,
  visibleLeft: number,
  visibleRight: number,
  yRatio: number,
) {
  const y = tabRect.top + tabRect.height * yRatio

  for (let x = visibleLeft + 8; x <= visibleRight - 8; x += 8) {
    if (pointHitsTab(tab, { x, y })) return { x, y }
  }

  return null
}

function visibleVerticalTabHitPointForX(
  tab: HTMLElement,
  tabRect: DOMRect,
  visibleTop: number,
  visibleBottom: number,
  xRatio: number,
) {
  const x = tabRect.left + tabRect.width * xRatio

  for (let y = visibleTop + 8; y <= visibleBottom - 8; y += 8) {
    if (pointHitsTab(tab, { x, y })) return { x, y }
  }

  return null
}

function sourcePointHitsTab(
  tab: HTMLElement,
  ratio: {
    readonly x: number
    readonly y: number
  },
) {
  const point = tabPointFromRatio(tab, ratio)

  return pointHitsTab(tab, point)
}

function tabPointFromRatio(
  tab: HTMLElement,
  ratio: {
    readonly x: number
    readonly y: number
  },
) {
  const rect = tab.getBoundingClientRect()

  return {
    x: rect.left + rect.width * ratio.x,
    y: rect.top + rect.height * ratio.y,
  }
}

function pointHitsTab(tab: HTMLElement, point: PointerPoint) {
  const hit = document.elementFromPoint(point.x, point.y)
  if (!(hit instanceof HTMLElement)) return false

  return hit.closest('[data-proof-tab-id]') === tab
}

function selectorFor(element: HTMLElement) {
  return page.elementLocator(element).selector
}
