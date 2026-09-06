import { act } from 'react'
import { writeFile } from 'node:fs/promises'
import { InputRenderable, SelectRenderable } from '@opentui/core'

import { Application } from '@/components/application'
import { settingsAddress } from '@/navigation/utils/address'
import { createTestSettingsSession } from '../../../test/factories/session'
import { test, expect } from '../../../test/fixtures'
import { renderTui } from '../../../test/render'
import { runPaletteCommand } from '../../../test/actions'

test('a settings editor opened from the file palette owns arrows and dismissal', async ({
  server,
}) => {
  await writeFile(`${server.root}/visible.txt`, 'visible')
  const session = createTestSettingsSession(server)
  await session.refresh()
  const frame = await renderTui(<Application session={session} noColor onExit={() => {}} />, {
    width: 110,
    height: 32,
    useThread: false,
    kittyKeyboard: true,
  })
  try {
    await act(async () => {
      await frame.mockInput.typeText('workbench.colorTheme')
    })
    await act(async () => {
      frame.mockInput.pressKey('TAB')
    })
    expect(frame.renderer.currentFocusedRenderable?.id).toBe('settings-list')
    await act(async () => {
      frame.mockInput.pressKey('p', { ctrl: true })
    })
    await expect
      .poll(async () => {
        await act(async () => {
          await frame.renderOnce()
        })
        return frame.captureCharFrame()
      })
      .toContain('visible.txt')
    await runPaletteCommand(frame, 'Edit selected setting')
    await act(async () => {
      await frame.renderOnce()
    })
    expect(frame.renderer.currentFocusedRenderable?.id).toBe('settings-editor')
    expect(frame.renderer.root.findDescendantById('file-picker-filter')).toBeUndefined()
    const editor = frame.renderer.currentFocusedRenderable
    if (!(editor instanceof SelectRenderable)) return expect.unreachable('Expected editor choices')
    const selected = editor.getSelectedIndex()
    await act(async () => {
      frame.mockInput.pressArrow('down')
    })
    expect(editor.getSelectedIndex()).toBe((selected + 1) % 3)
    await act(async () => {
      frame.mockInput.pressEscape()
    })
    expect(frame.renderer.root.findDescendantById('settings-editor')).toBeUndefined()
    expect(frame.renderer.currentFocusedRenderable?.id).toBe('settings-list')
  } finally {
    await frame.cleanup()
    session.dispose()
    await session.flush()
  }
})

test('direct address commands replace drafts and retain a usable request lifetime in both directions', async ({
  server,
}) => {
  const session = createTestSettingsSession(server)
  await session.refresh()
  const state = session.getSnapshot()
  if (state.kind !== 'ready') return expect.unreachable('Expected ready session')
  const submission = state.owner.submit('user', [
    { kind: 'keybinding.set', command: 'workspace.openAddress', keys: 'F8' },
    { kind: 'keybinding.set', command: 'workspace.copyAddress', keys: 'F9' },
  ])
  if (submission.kind === 'submitted') await submission.settled
  const frame = await renderTui(<Application session={session} noColor onExit={() => {}} />, {
    width: 110,
    height: 32,
    useThread: false,
    kittyKeyboard: true,
  })
  try {
    await act(async () => {
      frame.mockInput.pressKey('F8')
    })
    await act(async () => {
      await frame.mockInput.typeText('unfinished address')
    })
    await act(async () => {
      frame.mockInput.pressKey('F9')
    })
    const copy = frame.renderer.currentFocusedRenderable
    if (!(copy instanceof InputRenderable)) return expect.unreachable('Expected copy input')
    expect(copy.value).toBe(settingsAddress(state.descriptor.environmentId))
    await act(async () => {
      frame.mockInput.pressEnter()
    })
    expect(frame.renderer.currentFocusedRenderable?.id).toBe('settings-search')
    await act(async () => {
      frame.mockInput.pressKey('F9')
    })
    await act(async () => {
      frame.mockInput.pressKey('F8')
    })
    const open = frame.renderer.currentFocusedRenderable
    if (!(open instanceof InputRenderable)) return expect.unreachable('Expected open input')
    expect(open.value).toBe('')
    await act(async () => {
      await frame.mockInput.typeText(
        settingsAddress(state.descriptor.environmentId, 'reduceMotion'),
      )
      frame.mockInput.pressEnter()
    })
    expect(frame.renderer.currentFocusedRenderable?.id).toBe('settings-search')
    const search = frame.renderer.currentFocusedRenderable
    if (!(search instanceof InputRenderable)) return expect.unreachable('Expected settings search')
    expect(search.value).toBe('reduceMotion')
  } finally {
    await frame.cleanup()
    session.dispose()
    await session.flush()
  }
})
