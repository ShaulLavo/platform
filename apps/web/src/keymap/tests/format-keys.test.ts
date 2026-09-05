import { commandShortcut, formatChord, hotkeyTokenLabel } from '@/keymap/utils/format-keys'
import { CHORD_DISPLAY_SEPARATOR } from '@/keymap/utils/chord'
import { binding } from '../../../test/factories/key-binding'
import { expect, test } from '../../../test/fixtures'

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
    binding('Mod+S', { command: 'workspace.saveFile' }),
    binding('Mod+W', { command: 'workspace.closeCurrentTab' }),
  ]

  expect(commandShortcut('workspace.closeCurrentTab', bindings)).toContain('W')
})

test('returns null when no key runs the command, so menus render no hint', () => {
  expect(commandShortcut('workspace.saveFile', [])).toBeNull()
})

test('ignores bindings that are wired to no command', () => {
  const orphan = binding('Mod+W', { command: null })

  expect(commandShortcut('workspace.closeCurrentTab', [orphan])).toBeNull()
})

test.each([
  { platform: 'mac', single: '⌘S', chord: `⌘K${CHORD_DISPLAY_SEPARATOR}⌘S` },
  { platform: 'linux', single: 'Ctrl+S', chord: `Ctrl+K${CHORD_DISPLAY_SEPARATOR}Ctrl+S` },
  { platform: 'windows', single: 'Ctrl+S', chord: `Ctrl+K${CHORD_DISPLAY_SEPARATOR}Ctrl+S` },
] as const)('formats singles and chords on $platform', ({ platform, single, chord }) => {
  expect(formatChord('Mod+S', platform)).toBe(single)
  expect(formatChord('Mod+K Mod+S', platform)).toBe(chord)
})

test('uses canonical keys for raw and string chord strokes alike', () => {
  const shortcut = binding('Mod+K Mod+S', { command: 'workspace.showSettings' })
  expect(commandShortcut('workspace.showSettings', [shortcut])).toBe(formatChord('Mod+K Mod+S'))
})
