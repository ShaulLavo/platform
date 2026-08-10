import { detectPlatform } from '@tanstack/react-hotkeys'
import { renderHook } from '@testing-library/react'

import { commandShortcut, formatHotkey } from '@/features/menus/utils/shortcut'
import { resolvedPlatformKeyBindings } from '@/keymap/active-bindings'
import { defaultPlatformKeyBindings } from '@/keymap/default-bindings'
import { useAppKeymap } from '@/keymap/use-app-keymap'
import type { PlatformCommandId } from '@/keymap/types'

import { expect, test } from '../../../test/fixtures'

test('runs the command a pressed key is bound to', () => {
  const dispatched = mountKeymap()

  pressKey(document.body, { code: 'F1', key: 'F1' })

  expect(dispatched).toEqual(['workspace.showCommandPalette'])
})

test('leaves a bare-key shortcut alone while a text field has the caret', () => {
  const dispatched = mountKeymap()
  const input = document.createElement('input')
  document.body.append(input)
  input.focus()

  pressKey(input, { code: 'F1', key: 'F1' })

  expect(dispatched).toEqual([])
  input.remove()
})

test('runs the override instead of the default once a command is rebound', () => {
  const dispatched = mountKeymap({ 'workspace.saveFile': 'Mod+Alt+S' })

  pressKey(document.body, { code: 'KeyS', key: 's', ...modifierKeys() })
  expect(dispatched).toEqual([])

  pressKey(document.body, { altKey: true, code: 'KeyS', key: 's', ...modifierKeys() })
  expect(dispatched).toEqual(['workspace.saveFile'])
})

test('runs the shortcut the menus and palette print for a rebound command', () => {
  // The hint surfaces read the table the hook is handed, so the two cannot
  // disagree: pressing what the hint spells has to reach the command.
  const bindings = keyTable({ 'workspace.saveFile': 'Mod+Alt+S' })
  const dispatched = mountBindings(bindings)

  expect(commandShortcut('workspace.saveFile', bindings)).toBe(formatHotkey('Mod+Alt+S'))
  expect(commandShortcut('workspace.saveFile', bindings)).not.toBe(formatHotkey('Mod+S'))
  pressKey(document.body, { altKey: true, code: 'KeyS', key: 's', ...modifierKeys() })

  expect(dispatched).toEqual(['workspace.saveFile'])
})

test('stops running a default whose key an override took', () => {
  // Mod+B is the sidebar toggle by default; handing it to Save leaves the
  // toggle with nothing to answer, which is what the settings row reports.
  const dispatched = mountKeymap({ 'workspace.saveFile': 'Mod+B' })

  pressKey(document.body, { code: 'KeyB', key: 'b', ...modifierKeys() })

  expect(dispatched).toEqual(['workspace.saveFile'])
})

function keyTable(overrides: Record<string, string | null> = {}) {
  const platform = detectPlatform()

  return resolvedPlatformKeyBindings(defaultPlatformKeyBindings(platform), overrides, platform)
}

function mountKeymap(overrides: Record<string, string | null> = {}) {
  return mountBindings(keyTable(overrides))
}

function mountBindings(bindings: ReturnType<typeof keyTable>) {
  const dispatched: PlatformCommandId[] = []

  renderHook(() =>
    useAppKeymap({
      bindings,
      dispatch: (command) => {
        dispatched.push(command)
      },
      focusedPane: 'global',
    }),
  )

  return dispatched
}

function pressKey(target: EventTarget, init: KeyboardEventInit) {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
}

/** `Mod` is Command on macOS and Control everywhere else. */
function modifierKeys() {
  if (detectPlatform() === 'mac') return { metaKey: true }

  return { ctrlKey: true }
}
