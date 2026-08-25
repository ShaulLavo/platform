import { detectPlatform } from '@tanstack/react-hotkeys'
import { renderHook } from '@testing-library/react'

import { commandShortcut, formatHotkey } from '@/features/menus/utils/shortcut'
import { resolvedPlatformKeyBindings } from '@/keymap/active-bindings'
import { defaultPlatformKeyBindings } from '@/keymap/default-bindings'
import type { PlatformCommandBus } from '@/keymap/providers/command-context'
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

test('leaves a bare-key shortcut alone inside a shadow-DOM text field', () => {
  const dispatched = mountKeymap()
  const host = document.createElement('div')
  const shadow = host.attachShadow({ mode: 'open' })
  const input = document.createElement('input')
  shadow.append(input)
  document.body.append(host)
  input.focus()

  pressKey(input, { code: 'F1', composed: true, key: 'F1' })

  expect(dispatched).toEqual([])
  host.remove()
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

test('leaves a trusted key alone when the command declines synchronously', () => {
  const declined = mountBindings(keyTable(), false)
  const declinedEvent = pressKey(document.body, { code: 'F1', key: 'F1' })

  expect(declinedEvent.defaultPrevented).toBe(false)
  expect(declined).toEqual(['workspace.showCommandPalette'])
})

test('suppresses a trusted key after the command claims it synchronously', () => {
  const claimed = mountBindings(keyTable(), true)
  const event = pressKey(document.body, { code: 'F1', key: 'F1' })

  expect(event.defaultPrevented).toBe(true)
  expect(claimed).toEqual(['workspace.showCommandPalette'])
})

test('suppresses a reserved browser chord without dispatching', () => {
  const dispatched = mountBindings(keyTable())
  const event = pressKey(document.body, { code: 'Tab', ctrlKey: true, key: 'Tab' })

  expect(event.defaultPrevented).toBe(true)
  expect(dispatched).toEqual([])
})

function keyTable(overrides: Record<string, string | null> = {}) {
  const platform = detectPlatform()

  return resolvedPlatformKeyBindings(defaultPlatformKeyBindings(platform), overrides, platform)
}

function mountKeymap(overrides: Record<string, string | null> = {}) {
  return mountBindings(keyTable(overrides))
}

function mountBindings(bindings: ReturnType<typeof keyTable>, claimed = true) {
  const dispatched: PlatformCommandId[] = []
  const bus = {
    dispatch: (command: PlatformCommandId) => {
      dispatched.push(command)
      return { claimed, completion: Promise.resolve({ status: 'handled' } as const) }
    },
  } as unknown as PlatformCommandBus

  renderHook(() =>
    useAppKeymap({
      bindings,
      bus,
      focusedPane: 'global',
    }),
  )

  return dispatched
}

function pressKey(target: EventTarget, init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

/** `Mod` is Command on macOS and Control everywhere else. */
function modifierKeys() {
  if (detectPlatform() === 'mac') return { metaKey: true }

  return { ctrlKey: true }
}
