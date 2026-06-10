import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTabStripBodyAutoscroller } from '@workspace/tiling/state/tab-strip-body-autoscroller'

describe('tab strip body autoscroller', () => {
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrameId = 1

  beforeEach(() => {
    frames.clear()
    nextFrameId = 1
    vi.stubGlobal('requestAnimationFrame', requestFrame)
    vi.stubGlobal('cancelAnimationFrame', cancelFrame)
  })

  afterEach(() => {
    frames.clear()
    document.body.replaceChildren()
    vi.unstubAllGlobals()
  })

  it('keeps requestAnimationFrame state isolated per autoscroller', () => {
    const first = createTabStripBodyAutoscroller()
    const second = createTabStripBodyAutoscroller()
    const firstElements = autoscrollElements()
    const secondElements = autoscrollElements()
    let firstScrolls = 0
    let secondScrolls = 0

    first.update({
      onAutoScroll: () => {
        firstScrolls += 1
      },
      point: { x: 390, y: 150 },
      stripElement: firstElements.stripElement,
      windowElement: firstElements.windowElement,
    })
    second.update({
      onAutoScroll: () => {
        secondScrolls += 1
      },
      point: { x: 390, y: 150 },
      stripElement: secondElements.stripElement,
      windowElement: secondElements.windowElement,
    })

    expect(frameIds()).toEqual([1, 2])

    first.stop()
    runFrame(2)

    expect(frameIds()).toEqual([3])
    expect(firstScrolls).toBe(0)
    expect(secondScrolls).toBe(1)
    expect(firstElements.stripElement.scrollLeft).toBe(0)
    expect(secondElements.stripElement.scrollLeft).toBeGreaterThan(0)

    second.stop()
    expect(frameIds()).toEqual([])
  })

  function requestFrame(callback: FrameRequestCallback) {
    const frameId = nextFrameId
    frames.set(frameId, callback)
    nextFrameId += 1

    return frameId
  }

  function cancelFrame(frameId: number) {
    frames.delete(frameId)
  }

  function runFrame(frameId: number) {
    const callback = frames.get(frameId)
    frames.delete(frameId)
    callback?.(performance.now())
  }

  function frameIds() {
    return Array.from(frames.keys()).toSorted((left, right) => left - right)
  }
})

function autoscrollElements() {
  const windowElement = document.createElement('section')
  windowElement.getBoundingClientRect = () => rect({ height: 300, width: 400, x: 0, y: 0 })

  const stripElement = document.createElement('div')
  stripElement.dataset.tilingTabStripOrientation = 'horizontal'
  stripElement.getBoundingClientRect = () => rect({ height: 40, width: 200, x: 0, y: 0 })

  document.body.append(windowElement, stripElement)

  return { stripElement, windowElement }
}

function rect({
  height,
  width,
  x,
  y,
}: {
  readonly height: number
  readonly width: number
  readonly x: number
  readonly y: number
}): DOMRect {
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
