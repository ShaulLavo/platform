import { testRender } from '@opentui/react/test-utils'
import { act } from 'react'

import { Select } from '@/components/select'
import { expect, test } from '../../../test/fixtures'

test.each([false, true])('focused lists wrap with kitty keyboard %s', async (kittyKeyboard) => {
  const selected: number[] = []
  const frame = await testRender(
    <Select
      focused
      options={[
        { name: 'First', description: '' },
        { name: 'Middle', description: '' },
        { name: 'Last', description: '' },
      ]}
      onChange={(index) => selected.push(index)}
      showDescription={false}
    />,
    { width: 30, height: 8, useThread: false, kittyKeyboard },
  )
  try {
    await act(async () => {
      frame.mockInput.pressArrow('up')
    })
    await frame.renderOnce()
    expect(frame.captureCharFrame()).toContain('▶ Last')
    await act(async () => {
      frame.mockInput.pressArrow('down')
    })
    await frame.renderOnce()
    expect(frame.captureCharFrame()).toContain('▶ First')
    expect(selected).toEqual([2, 0])
  } finally {
    frame.renderer.destroy()
  }
})

test.each([0, 1])('lists with %s items keep a valid selection when wrapping', async (count) => {
  const selected: number[] = []
  const frame = await testRender(
    <Select
      focused
      options={Array.from({ length: count }, () => ({ name: 'Only', description: '' }))}
      onChange={(index) => selected.push(index)}
    />,
    { width: 30, height: 8, useThread: false },
  )
  try {
    await act(async () => {
      frame.mockInput.pressArrow('up')
      frame.mockInput.pressArrow('down')
    })
    expect(selected).toEqual(count === 0 ? [] : [0, 0])
  } finally {
    frame.renderer.destroy()
  }
})
