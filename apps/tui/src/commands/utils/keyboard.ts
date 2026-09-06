import type { KeyEvent } from '@opentui/core'

export type TerminalKeyEvent = Pick<
  KeyEvent,
  'name' | 'ctrl' | 'shift' | 'meta' | 'option' | 'eventType' | 'preventDefault' | 'stopPropagation'
> &
  Partial<Pick<KeyEvent, 'super' | 'repeated' | 'defaultPrevented'>>

const keyNames: Readonly<Record<string, string>> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  return: 'Enter',
  enter: 'Enter',
  escape: 'Escape',
  esc: 'Escape',
  backspace: 'Backspace',
  delete: 'Delete',
  insert: 'Insert',
  tab: 'Tab',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  space: 'Space',
}

export function terminalKeyboardEvent(event: TerminalKeyEvent) {
  const key = keyNames[event.name] ?? event.name
  const printedSymbol =
    key.length === 1 &&
    !/[a-z0-9]/iu.test(key) &&
    !event.ctrl &&
    !event.meta &&
    !event.option &&
    !event.super
  return {
    key,
    code: '',
    ctrlKey: event.ctrl,
    shiftKey: event.shift && !printedSymbol,
    altKey: event.meta || event.option,
    metaKey: event.super === true,
  }
}
