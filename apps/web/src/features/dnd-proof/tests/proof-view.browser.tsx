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

describe('dnd proof browser behavior', () => {
  it('renders root guides at the real full surface edges', async () => {
    renderProof()

    await waitForProof()

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

    await nativeDragTabToStrip(sourceId, targetStrip)

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

      await dragTabToSnap(sourceId, snapLabel)

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
  } = {},
) {
  const sourceTab = proofTab(tabId)
  const sourceCenter = centerOf(sourceTab)
  const snapPoint = snapDestinationDropPoint(snapLabel)

  startPointerDrag(sourceTab)
  movePointerBy(8, 0)
  await nextFrame()
  movePointerTo({ x: sourceCenter.x, y: sourceCenter.y + 70 })
  await nextFrame()
  movePointerTo(snapPoint)
  await holdPointerOver(snapPoint, 2)
  if (options.assertActive !== false) {
    await vi.waitFor(() => {
      expect(activeSnapDestination()?.textContent?.trim()).toBe(snapLabel)
    })
  }
  finishPointerDrag(snapPoint)
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
    steps: [
      { dx: 8, dy: 0, kind: 'move-by', steps: 4 },
      { dx: 0, dy: 70, kind: 'move-by', steps: 8 },
      snapDestinationMouseStep(snapLabel),
      { kind: 'pause', ms: 32 },
    ],
  })
}

async function nativeDragTabToStrip(tabId: string, targetStrip: HTMLElement) {
  await commands.proofMouseDrag({
    sourceSelector: selectorFor(proofTab(tabId)),
    steps: [
      { dx: 8, dy: 0, kind: 'move-by', steps: 4 },
      { dx: 0, dy: 70, kind: 'move-by', steps: 8 },
      {
        kind: 'move-to-selector',
        selector: selectorFor(targetStrip),
        steps: 18,
        x: 0.92,
        y: 0.5,
      },
      { kind: 'pause', ms: 32 },
    ],
  })
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
    return { kind: 'move-to-selector', offsetX: -6, selector, steps: 18, x: 1, y: 0.5 }
  }
  if (label === 'window right') {
    return { kind: 'move-to-selector', offsetX: 6, selector, steps: 18, x: 0, y: 0.5 }
  }
  if (label === 'window top') {
    return { kind: 'move-to-selector', offsetX: -96, offsetY: 12, selector, steps: 18, x: 1, y: 1 }
  }
  if (label === 'window bottom') {
    return { kind: 'move-to-selector', offsetY: 6, selector, steps: 18, x: 0.5, y: 0 }
  }

  return { kind: 'move-to-selector', selector, steps: 18, x: 0.5, y: 0.5 }
}

function snapDestinationDropPoint(label: string): PointerPoint {
  const destination = snapDestinationWithLabel(label)
  const rect = destination.getBoundingClientRect()
  if (label === 'root left') {
    return {
      x: rect.left + 6,
      y: rect.top + rect.height / 2,
    }
  }
  if (label === 'root top') {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + 6,
    }
  }
  if (label === 'root bottom') {
    return {
      x: rect.left + rect.width / 2,
      y: rect.bottom - 6,
    }
  }
  if (label === 'root right') {
    return {
      x: rect.right - 6,
      y: rect.top + rect.height / 2,
    }
  }
  if (label === 'window left') {
    return {
      x: rect.right - 6,
      y: rect.top + rect.height / 2,
    }
  }
  if (label === 'window right') {
    return {
      x: rect.left + 6,
      y: rect.top + rect.height / 2,
    }
  }
  if (label === 'window top') {
    return {
      x: rect.right - Math.min(96, rect.width / 3),
      y: rect.bottom + 12,
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
  const destination = snapDestinationsWithLabel(label)[0]
  if (!destination) throw new Error(`Missing snap destination ${label}`)

  return destination
}

function snapDestinationsWithLabel(label: string) {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-proof-snap-destination]')).filter(
    (candidate) => candidate.textContent?.trim() === label,
  )
}

function activeSnapDestination() {
  return document.querySelector<HTMLElement>('[data-proof-snap-active="true"]')
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
  const handle = document.querySelector<HTMLElement>('[data-proof-resize-handle]')
  if (!handle) throw new Error('Missing proof resize handle')

  return handle
}

function firstWindowDragHandle() {
  const handle = document.querySelector<HTMLElement>('[data-proof-window-drag-handle]')
  if (!handle) throw new Error('Missing proof window drag handle')

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

function selectorFor(element: HTMLElement) {
  return page.elementLocator(element).selector
}
