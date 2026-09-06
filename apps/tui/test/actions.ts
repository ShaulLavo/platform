import { act } from 'react'
import type { renderTui } from './render'

export async function runPaletteCommand(
  frame: Awaited<ReturnType<typeof renderTui>>,
  title: string,
) {
  await act(async () => {
    frame.mockInput.pressKey('F1')
  })
  await act(async () => {
    await frame.mockInput.typeText(title)
  })
  await act(async () => {
    frame.mockInput.pressEnter()
  })
}
