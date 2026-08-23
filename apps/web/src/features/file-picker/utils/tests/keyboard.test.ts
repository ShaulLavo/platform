import { expect, test } from '../../../../../test/fixtures'

import {
  isGoToFolderShortcut,
  isGoUpShortcut,
  isPrintablePickerKey,
  isToggleHiddenShortcut,
  type PickerKeyboardEvent,
} from '@/features/file-picker/utils/keyboard'

test('recognizes picker command shortcuts on macOS and non-macOS keyboards', () => {
  expect(isGoToFolderShortcut(keyEvent('g', { metaKey: true, shiftKey: true }))).toBe(true)
  expect(isToggleHiddenShortcut(keyEvent('.', { ctrlKey: true, shiftKey: true }))).toBe(true)
  expect(
    isToggleHiddenShortcut(keyEvent('>', { code: 'Period', metaKey: true, shiftKey: true })),
  ).toBe(true)
  expect(isGoUpShortcut(keyEvent('ArrowUp', { metaKey: true }))).toBe(true)
})

test('forwards only unmodified printable keys into search', () => {
  expect(isPrintablePickerKey(keyEvent('g'))).toBe(true)
  expect(isPrintablePickerKey(keyEvent(' ', { shiftKey: true }))).toBe(true)
  expect(isPrintablePickerKey(keyEvent('g', { metaKey: true }))).toBe(false)
  expect(isPrintablePickerKey(keyEvent('ArrowDown'))).toBe(false)
})

function keyEvent(key: string, overrides: Partial<PickerKeyboardEvent> = {}): PickerKeyboardEvent {
  return {
    altKey: false,
    ctrlKey: false,
    key,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  }
}
