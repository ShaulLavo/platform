import { commandShortcut, hotkeyTokenLabel } from '@/features/menus/utils/shortcut'
import type { PlatformCommandId, PlatformKeyBinding } from '@/keymap/types'
import { expect, test } from '../../../../../test/fixtures'

test('renders mac modifiers as glyphs and other platforms as words', () => {
  expect(hotkeyTokenLabel('mod', true)).toBe('⌘')
  expect(hotkeyTokenLabel('mod', false)).toBe('Ctrl')
  expect(hotkeyTokenLabel('shift', true)).toBe('⇧')
  expect(hotkeyTokenLabel('alt', true)).toBe('⌥')
})

test('uppercases single character keys and names the special ones', () => {
  expect(hotkeyTokenLabel('w', true)).toBe('W')
  expect(hotkeyTokenLabel('enter', true)).toBe('↵')
  expect(hotkeyTokenLabel('escape', true)).toBe('Esc')
})

test('finds the binding that runs a command', () => {
  const bindings = [
    binding('Mod+S', 'workspace.saveFile'),
    binding('Mod+W', 'workspace.closeCurrentTab'),
  ]

  expect(commandShortcut('workspace.closeCurrentTab', bindings)).toContain('W')
})

test('returns null when no key runs the command, so menus render no hint', () => {
  expect(commandShortcut('workspace.saveFile', [])).toBeNull()
})

test('ignores bindings that are wired to no command', () => {
  const orphan: PlatformKeyBinding = {
    command: null,
    hotkey: 'Mod+W',
    keys: 'Mod+W',
    source: 'default',
  }

  expect(commandShortcut('workspace.closeCurrentTab', [orphan])).toBeNull()
})

function binding(hotkey: 'Mod+S' | 'Mod+W', command: PlatformCommandId): PlatformKeyBinding {
  return { command, hotkey, keys: hotkey, source: 'default' }
}
