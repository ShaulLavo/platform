import { mkdir, writeFile } from 'node:fs/promises'
import { act } from 'react'
import { InputRenderable } from '@opentui/core'

import { Application } from '@/components/application'
import { createTestSettingsSession } from '../../../test/factories/session'
import { test, expect } from '../../../test/fixtures'
import { renderTui } from '../../../test/render'

test.for([
  { width: 110, height: 32 },
  { width: 60, height: 20 },
])(
  'picker keeps lists and preview inside its $width×$height dialog',
  async ({ width, height }, { server }) => {
    await mkdir(`${server.root}/docs`)
    await writeFile(`${server.root}/README.md`, 'Preview first line\nPreview second line\n')
    await writeFile(`${server.root}/package.json`, '{}\n')
    const session = createTestSettingsSession(server)
    await session.refresh()
    const frame = await renderTui(<Application session={session} noColor onExit={() => {}} />, {
      width,
      height,
      useThread: false,
    })
    try {
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
        .toContain('docs/')
      expect(frame.captureCharFrame()).toContain('README.md')
      expect(frame.captureCharFrame().split('\n')[height - 2]?.trim()).toBe(
        `└${'─'.repeat(width - 4)}┘`,
      )
      expect(frame.renderer.currentFocusedRenderable?.id).toBe('file-picker-filter')
      await act(async () => {
        await frame.mockInput.typeText('README')
      })
      await frame.renderOnce()
      await act(async () => {
        frame.mockInput.pressEnter()
      })
      await expect
        .poll(async () => {
          await act(async () => {
            await frame.renderOnce()
          })
          return frame.captureCharFrame()
        })
        .toContain('Preview first line')
      expect(frame.captureCharFrame()).toContain('Preview second line')
      expect(frame.captureCharFrame().split('\n')[height - 2]?.trim()).toBe(
        `└${'─'.repeat(width - 4)}┘`,
      )
      if (width < 90) {
        await act(async () => {
          frame.mockInput.pressEscape()
        })
        await expect
          .poll(async () => {
            await act(async () => {
              await frame.renderOnce()
            })
            return frame.captureCharFrame()
          })
          .toContain('▶ README.md')
        expect(frame.captureCharFrame()).not.toContain('Preview first line')
      }
      await act(async () => {
        frame.mockInput.pressKey('TAB')
      })
      expect(frame.renderer.currentFocusedRenderable?.id).toBe('file-picker-path')
      const input = frame.renderer.currentFocusedRenderable
      if (!(input instanceof InputRenderable)) return expect.unreachable('Expected path input')
      await act(async () => {
        frame.mockInput.pressKey('u', { ctrl: true })
        await frame.mockInput.typeText(`${server.root}/do`)
      })
      await act(async () => {
        frame.mockInput.pressKey('TAB')
      })
      await expect.poll(() => input.value).toBe(`${server.root}/docs/`)
      await frame.renderOnce()
      await act(async () => {
        frame.mockInput.pressKey('TAB', { shift: true })
      })
      expect(frame.renderer.currentFocusedRenderable?.id).toBe('file-picker-filter')
      await act(async () => {
        frame.mockInput.pressKey('TAB', { shift: true })
      })
      expect(frame.renderer.currentFocusedRenderable?.id).toBe('file-picker-places')
      await act(async () => {
        frame.mockInput.pressArrow('up')
      })
      await frame.renderOnce()
      expect(frame.captureCharFrame()).toContain('▶ Server root')
      await act(async () => {
        frame.mockInput.pressEscape()
      })
      await expect.poll(() => frame.renderer.currentFocusedRenderable?.id).toBe('settings-search')
    } finally {
      await frame.cleanup()
      session.dispose()
    }
  },
)
