import { afterEach, beforeEach, vi } from 'vitest'

import { expect, test } from '../../../../../test/fixtures'
import {
  clearVscodeThemePreview,
  getActiveEditorColorMode,
  getCommittedVscodeThemeId,
  getLoadedVscodeThemeRegistration,
  getSelectedVscodeThemeId,
  loadEditorThemeForSelection,
  preloadVscodeThemeRegistrations,
  previewVscodeTheme,
  resetEditorColorThemeStore,
  setActiveEditorColorMode,
  setSelectedVscodeThemeId,
  subscribeEditorColorTheme,
} from '@/features/editor/state/editor-color-theme-store'

const EDITOR_COLOR_THEME_STORAGE_KEY = 'platform.editor-color-theme.v1'

// The node project has no DOM, and the point of these tests is what crosses
// localStorage, so stand up a real Map-backed Storage rather than skipping it.
const STORE = new Map<string, string>()

function memoryLocalStorage(): Storage {
  return {
    get length() {
      return STORE.size
    },
    clear: () => STORE.clear(),
    getItem: (key: string) => STORE.get(key) ?? null,
    key: (index: number) => Array.from(STORE.keys())[index] ?? null,
    removeItem: (key: string) => void STORE.delete(key),
    setItem: (key: string, value: string) => void STORE.set(key, value),
  }
}

beforeEach(() => {
  STORE.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: memoryLocalStorage(),
  })
  resetEditorColorThemeStore()
})

afterEach(() => {
  STORE.clear()
  resetEditorColorThemeStore()
  delete (globalThis as { localStorage?: Storage }).localStorage
})

test('defaults to dark-plus and light-plus per color mode', () => {
  expect(getSelectedVscodeThemeId('dark')).toBe('dark-plus')
  expect(getSelectedVscodeThemeId('light')).toBe('light-plus')
})

test('keeps each color mode’s selection independent', () => {
  setSelectedVscodeThemeId('dark', 'monokai')
  setSelectedVscodeThemeId('light', 'github-light')

  expect(getSelectedVscodeThemeId('dark')).toBe('monokai')
  expect(getSelectedVscodeThemeId('light')).toBe('github-light')
})

test('ignores theme ids that are not bundled VSCode themes', () => {
  setSelectedVscodeThemeId('dark', 'not-a-real-theme')

  expect(getSelectedVscodeThemeId('dark')).toBe('dark-plus')
})

test('survives a reload through localStorage', () => {
  setSelectedVscodeThemeId('dark', 'tokyo-night')

  // What a fresh page load does: drop the in-memory store, read storage back.
  resetEditorColorThemeStore()

  expect(getSelectedVscodeThemeId('dark')).toBe('tokyo-night')
  expect(getSelectedVscodeThemeId('light')).toBe('light-plus')
})

test('falls back to the mode default on garbage persisted ids', () => {
  localStorage.setItem(
    EDITOR_COLOR_THEME_STORAGE_KEY,
    JSON.stringify({ selection: { dark: 'garbage', light: 'min-light' }, version: 1 }),
  )
  resetEditorColorThemeStore()

  expect(getSelectedVscodeThemeId('dark')).toBe('dark-plus')
  expect(getSelectedVscodeThemeId('light')).toBe('min-light')
})

test('drops storage written under a different version instead of trusting it', () => {
  localStorage.setItem(
    EDITOR_COLOR_THEME_STORAGE_KEY,
    JSON.stringify({ selection: { dark: 'monokai' }, version: 2 }),
  )
  resetEditorColorThemeStore()

  expect(getSelectedVscodeThemeId('dark')).toBe('dark-plus')
})

test('drops malformed storage instead of trusting it', () => {
  localStorage.setItem(EDITOR_COLOR_THEME_STORAGE_KEY, '{not json')
  resetEditorColorThemeStore()

  expect(getSelectedVscodeThemeId('dark')).toBe('dark-plus')
})

test('notifies subscribers when a selection changes', () => {
  const listener = vi.fn()
  const unsubscribe = subscribeEditorColorTheme(listener)

  setSelectedVscodeThemeId('dark', 'monokai')
  expect(listener).toHaveBeenCalledTimes(1)

  setSelectedVscodeThemeId('dark', 'monokai')
  expect(listener).toHaveBeenCalledTimes(1)

  unsubscribe()
  setSelectedVscodeThemeId('dark', 'nord')
  expect(listener).toHaveBeenCalledTimes(1)
})

test('notifies subscribers when the active color mode changes', () => {
  const listener = vi.fn()
  subscribeEditorColorTheme(listener)

  expect(getActiveEditorColorMode()).toBe('dark')
  setActiveEditorColorMode('light')
  expect(getActiveEditorColorMode()).toBe('light')
  expect(listener).toHaveBeenCalledTimes(1)

  setActiveEditorColorMode('light')
  expect(listener).toHaveBeenCalledTimes(1)
})

test('loads the selected theme registration and derived editor theme', async () => {
  setSelectedVscodeThemeId('dark', 'monokai')

  const loaded = await loadEditorThemeForSelection('dark')

  expect(loaded.definition.id).toBe('monokai')
  expect(loaded.registration.name).toBe('monokai')
  expect(loaded.editorTheme.backgroundColor).toBeTruthy()
  expect(loaded.editorTheme.foregroundColor).toBeTruthy()
})

test('memoizes loaded themes by id', async () => {
  const first = await loadEditorThemeForSelection('dark')
  const second = await loadEditorThemeForSelection('dark')

  expect(first).toBe(second)
})

test('a hover-preview overlays the selection without persisting', () => {
  setSelectedVscodeThemeId('dark', 'monokai')

  previewVscodeTheme('dark', 'dracula')

  expect(getSelectedVscodeThemeId('dark')).toBe('dracula')
  // The committed id stays on the persisted selection — the palette badge and
  // any "what did the user actually pick" reader use this, not the live preview.
  expect(getCommittedVscodeThemeId('dark')).toBe('monokai')

  clearVscodeThemePreview()

  expect(getSelectedVscodeThemeId('dark')).toBe('monokai')
})

test('preview is ignored when it targets the already-selected theme', () => {
  const listener = vi.fn()
  subscribeEditorColorTheme(listener)
  setSelectedVscodeThemeId('dark', 'monokai')
  listener.mockClear()

  previewVscodeTheme('dark', 'monokai')

  expect(listener).not.toHaveBeenCalled()
})

test('preview is a no-op for repeated calls with the same theme', () => {
  const listener = vi.fn()
  subscribeEditorColorTheme(listener)

  previewVscodeTheme('dark', 'monokai')
  listener.mockClear()

  previewVscodeTheme('dark', 'monokai')
  expect(listener).not.toHaveBeenCalled()
})

test('commit drops the preview and persists the selection', () => {
  setSelectedVscodeThemeId('dark', 'monokai')
  previewVscodeTheme('dark', 'dracula')

  setSelectedVscodeThemeId('dark', 'dracula')

  expect(getCommittedVscodeThemeId('dark')).toBe('dracula')
  // No preview overlay anymore: the selected and committed ids agree.
  expect(getSelectedVscodeThemeId('dark')).toBe('dracula')
  resetEditorColorThemeStore()

  expect(getCommittedVscodeThemeId('dark')).toBe('dracula')
})

test('preview starts the registration load so the worker can use it synchronously', async () => {
  previewVscodeTheme('dark', 'andromeeda')

  // The first call kicks the load off; the sync cache is empty until it lands.
  expect(getLoadedVscodeThemeRegistration('andromeeda')).toBeUndefined()

  // Give the dynamic import a tick to resolve. `loadVscodeThemeRegistration`
  // caches by id, so a follow-up load on the same id resolves from the same
  // promise the preview started.
  await loadEditorThemeForSelection('dark')

  expect(getLoadedVscodeThemeRegistration('andromeeda')?.name).toBe('andromeeda')
})

test('preview re-notifies listeners once the registration has loaded', async () => {
  const listener = vi.fn()
  subscribeEditorColorTheme(listener)

  previewVscodeTheme('dark', 'andromeeda')
  const notifiedForPreview = listener.mock.calls.length
  await loadEditorThemeForSelection('dark')

  expect(listener.mock.calls.length).toBeGreaterThan(notifiedForPreview)
})

test('preload warms the sync cache without re-notifying listeners', async () => {
  const listener = vi.fn()
  subscribeEditorColorTheme(listener)
  const beforePreload = listener.mock.calls.length

  await preloadVscodeThemeRegistrations()

  expect(getLoadedVscodeThemeRegistration('dark-plus')?.name).toBe('dark-plus')
  expect(getLoadedVscodeThemeRegistration('andromeeda')?.name).toBe('andromeeda')
  expect(listener.mock.calls.length).toBe(beforePreload)
})
