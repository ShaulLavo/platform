export const NATIVE_WINDOW_DRAG_CLASS = 'electrobun-webkit-app-region-drag'
export const NATIVE_WINDOW_NO_DRAG_CLASS = 'electrobun-webkit-app-region-no-drag'

const WINDOW_DRAG_BLOCKING_SELECTOR = [
  `.${NATIVE_WINDOW_NO_DRAG_CLASS}`,
  '[data-native-window-drag-blocker]',
  '[data-workbench-drag-blocker]',
  'a',
  'button',
  'canvas',
  'iframe',
  'input',
  'label',
  'select',
  'textarea',
  '[contenteditable]:not([contenteditable="false"])',
  '[draggable="true"]',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="gridcell"]',
  '[role="link"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="separator"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="textbox"]',
  '[role="tree"]',
  '[role="treeitem"]',
].join(',')

export function markNativeWindowNoDragForCurrentEvent(target: EventTarget | null) {
  const blocker = nativeWindowDragBlocker(target)
  if (!blocker) return
  if (blocker.classList.contains(NATIVE_WINDOW_NO_DRAG_CLASS)) return

  blocker.classList.add(NATIVE_WINDOW_NO_DRAG_CLASS)
  queueMicrotask(() => blocker.classList.remove(NATIVE_WINDOW_NO_DRAG_CLASS))
}

function nativeWindowDragBlocker(target: EventTarget | null) {
  if (typeof Element === 'undefined') return null
  if (!(target instanceof Element)) return null

  return target.closest(WINDOW_DRAG_BLOCKING_SELECTOR)
}
