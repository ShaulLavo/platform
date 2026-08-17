import { describe, expect, it } from 'vitest'

import { applyTerminalAppearance } from '@/features/terminal/components/panel'

function fakeTerminal() {
  return { options: { cursorBlink: true, fontSize: 12, scrollback: 10_000 } }
}

describe('applyTerminalAppearance', () => {
  it('mutates the live terminal rather than asking for a new one', () => {
    const terminal = fakeTerminal()

    applyTerminalAppearance(terminal as never, {
      cursorBlink: false,
      fontSize: 18,
      scrollback: 500,
    })

    // Re-creating the Terminal is what a naive "apply settings" would do, and it
    // clears the scrollback — the user's output is the one thing a font-size
    // change must not cost them.
    expect(terminal.options).toEqual({ cursorBlink: false, fontSize: 18, scrollback: 500 })
  })

  it('does nothing before the terminal exists', () => {
    expect(() =>
      applyTerminalAppearance(null, { cursorBlink: true, fontSize: 12, scrollback: 10_000 }),
    ).not.toThrow()
  })
})
