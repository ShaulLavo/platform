import type { LayoutRect } from '@workspace/tiling/utils/layout-geometry'
import type { WindowId } from '@workspace/tiling/utils/layout-types'

export type TestTabRect = {
  readonly id: string
  readonly rect: LayoutRect
}

export function mountTestWindowWithTabStrip({
  stripRect,
  tabs,
  windowId,
  windowRect,
}: {
  readonly stripRect: LayoutRect
  readonly tabs: readonly TestTabRect[]
  readonly windowId: WindowId
  readonly windowRect: LayoutRect
}) {
  const windowElement = mountTestWindow(windowId, windowRect)
  const stripElement = mountTestTabStrip({ rect: stripRect, tabs, windowId })

  return { stripElement, windowElement }
}

export function mountTestWindow(windowId: WindowId, rectValue: LayoutRect) {
  const element = document.createElement('section')
  element.dataset.tilingWindowId = windowId
  element.getBoundingClientRect = () => testDomRect(rectValue)
  document.body.append(element)

  return element
}

export function mountTestTabStrip({
  orientation = 'horizontal',
  rect,
  tabs,
  windowId,
}: {
  readonly orientation?: 'horizontal' | 'vertical'
  readonly rect: LayoutRect
  readonly tabs: readonly TestTabRect[]
  readonly windowId: WindowId
}) {
  const element = document.createElement('div')
  element.dataset.tilingTabStripId = windowId
  element.dataset.tilingTabStripOrientation = orientation
  element.getBoundingClientRect = () => testDomRect(rect)

  for (const tab of tabs) {
    element.append(testTabElement(tab))
  }

  document.body.append(element)

  return element
}

export function testTabRect(id: string, rect: LayoutRect): TestTabRect {
  return { id, rect }
}

export function testDomRect({ height, width, x, y }: LayoutRect): DOMRect {
  return {
    bottom: y + height,
    height,
    left: x,
    right: x + width,
    toJSON: () => ({}),
    top: y,
    width,
    x,
    y,
  }
}

function testTabElement(tab: TestTabRect) {
  const element = document.createElement('button')
  element.dataset.tilingTabId = tab.id
  element.getBoundingClientRect = () => testDomRect(tab.rect)

  return element
}
