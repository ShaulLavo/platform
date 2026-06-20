import { test, expect } from '../../../../test/fixtures'

import {
  NATIVE_WINDOW_DRAG_CLASS,
  NATIVE_WINDOW_NO_DRAG_CLASS,
  markNativeWindowNoDragForCurrentEvent,
} from '../window-drag'

test('marks the closest interactive drag blocker for the current event', async () => {
  const target = renderDragRegion(
    `<div data-native-window-drag-blocker><button><span id="target">src</span></button></div>`,
  )
  const blocker = target.closest('button')

  markNativeWindowNoDragForCurrentEvent(target)

  expect(blocker).toHaveClass(NATIVE_WINDOW_NO_DRAG_CLASS)

  await Promise.resolve()

  expect(blocker).not.toHaveClass(NATIVE_WINDOW_NO_DRAG_CLASS)
})

test('marks semantic drag and drop targets before document bubble handlers run', () => {
  const target = renderDragRegion(`<button role="tab"><span id="target">README.md</span></button>`)
  const observed: boolean[] = []

  document.body.addEventListener(
    'mousedown',
    (event) => markNativeWindowNoDragForCurrentEvent(event.target),
    { capture: true, once: true },
  )
  document.addEventListener(
    'mousedown',
    (event) => {
      observed.push(isElectrobunAppRegionDrag(event.target))
    },
    { once: true },
  )

  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

  expect(observed).toEqual([false])
})

test('leaves persistent no-drag regions alone', async () => {
  const target = renderDragRegion(
    `<button id="target" class="${NATIVE_WINDOW_NO_DRAG_CLASS}">close</button>`,
  )

  markNativeWindowNoDragForCurrentEvent(target)

  await Promise.resolve()

  expect(target).toHaveClass(NATIVE_WINDOW_NO_DRAG_CLASS)
})

function renderDragRegion(html: string): HTMLElement {
  document.body.replaceChildren()

  const root = document.createElement('main')
  root.className = NATIVE_WINDOW_DRAG_CLASS
  root.innerHTML = html
  document.body.append(root)

  const target = document.getElementById('target')
  expect(target).toBeInstanceOf(HTMLElement)

  return target as HTMLElement
}

function isElectrobunAppRegionDrag(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  if (target.closest(`.${NATIVE_WINDOW_NO_DRAG_CLASS}`)) return false

  return target.closest(`.${NATIVE_WINDOW_DRAG_CLASS}`) != null
}
