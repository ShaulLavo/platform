import { act } from 'react'

import type { renderTui } from './render'

export async function openPaletteSearch(
  frame: Awaited<ReturnType<typeof renderTui>>,
  query: string,
) {
  await act(async () => {
    frame.mockInput.pressKey('F1')
  })
  await act(async () => {
    frame.mockInput.pressKey('END')
    frame.mockInput.pressKey('BACKSPACE')
    await frame.mockInput.typeText(query)
  })
  await frame.renderOnce()
}

export async function submitPaletteSearch(
  frame: Awaited<ReturnType<typeof renderTui>>,
  query: string,
) {
  await act(async () => {
    frame.mockInput.pressKey('F1')
  })
  await act(async () => {
    frame.mockInput.pressKey('END')
    frame.mockInput.pressKey('BACKSPACE')
    await frame.mockInput.typeText(query)
    frame.mockInput.pressEnter()
  })
}
