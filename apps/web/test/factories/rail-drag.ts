import { onTestFinished } from 'vitest'
import userEvent from '@testing-library/user-event'

export function installVerticalRailRects() {
  const original = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const top = [...document.querySelectorAll('*')].indexOf(this) * 10
    return new DOMRect(0, top, 100, 10)
  }
  onTestFinished(() => {
    Element.prototype.getBoundingClientRect = original
  })
}
export async function dragRailWithKeyboard(handle: HTMLElement, move: string) {
  handle.focus()
  await userEvent.keyboard('{ }')
  await userEvent.keyboard(move)
  await userEvent.keyboard('{ }')
}
