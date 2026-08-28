import { afterEach, beforeEach, vi } from 'vitest'

import { expect, test } from '../../../../../test/fixtures'
import {
  activeEditorThemeUsesShiki,
  activeShikiThemeId,
  clearEditorThemePreview,
  getActiveEditorColorMode,
  getCommittedEditorThemeId,
  getLoadedVscodeThemeRegistration,
  getResolvedShikiThemeContentHash,
  getSelectedEditorThemeId,
  loadEditorThemeForSelection,
  preloadVscodeThemeRegistrations,
  previewEditorTheme,
  resolveEditorShikiThemeRegistration,
  resetEditorColorThemeStore,
  setActiveEditorColorMode,
  setSelectedEditorThemeId,
  subscribeActiveShikiTheme,
  subscribeEditorColorTheme,
} from '@/features/editor/state/color-theme-store'

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
  expect(getSelectedEditorThemeId('dark')).toBe('dark-plus')
  expect(getSelectedEditorThemeId('light')).toBe('light-plus')
})

test('keeps each color mode’s selection independent', () => {
  setSelectedEditorThemeId('dark', 'monokai')
  setSelectedEditorThemeId('light', 'github-light')

  expect(getSelectedEditorThemeId('dark')).toBe('monokai')
  expect(getSelectedEditorThemeId('light')).toBe('github-light')
})

test('ignores theme ids that are in neither catalog', () => {
  setSelectedEditorThemeId('dark', 'not-a-real-theme')

  expect(getSelectedEditorThemeId('dark')).toBe('dark-plus')
})

test('persists a built-in selection across a reload', () => {
  setSelectedEditorThemeId('dark', 'tree-sitter-dark')
  resetEditorColorThemeStore()

  expect(getSelectedEditorThemeId('dark')).toBe('tree-sitter-dark')
})

test('survives a reload through localStorage', () => {
  setSelectedEditorThemeId('dark', 'tokyo-night')

  // What a fresh page load does: drop the in-memory store, read storage back.
  resetEditorColorThemeStore()

  expect(getSelectedEditorThemeId('dark')).toBe('tokyo-night')
  expect(getSelectedEditorThemeId('light')).toBe('light-plus')
})

test('falls back to the mode default on garbage persisted ids', () => {
  localStorage.setItem(
    EDITOR_COLOR_THEME_STORAGE_KEY,
    JSON.stringify({ selection: { dark: 'garbage', light: 'min-light' }, version: 1 }),
  )
  resetEditorColorThemeStore()

  expect(getSelectedEditorThemeId('dark')).toBe('dark-plus')
  expect(getSelectedEditorThemeId('light')).toBe('min-light')
})

test('drops storage written under a different version instead of trusting it', () => {
  localStorage.setItem(
    EDITOR_COLOR_THEME_STORAGE_KEY,
    JSON.stringify({ selection: { dark: 'monokai' }, version: 2 }),
  )
  resetEditorColorThemeStore()

  expect(getSelectedEditorThemeId('dark')).toBe('dark-plus')
})

test('drops malformed storage instead of trusting it', () => {
  localStorage.setItem(EDITOR_COLOR_THEME_STORAGE_KEY, '{not json')
  resetEditorColorThemeStore()

  expect(getSelectedEditorThemeId('dark')).toBe('dark-plus')
})

test('notifies subscribers when a selection changes', () => {
  const listener = vi.fn()
  const unsubscribe = subscribeEditorColorTheme(listener)

  setSelectedEditorThemeId('dark', 'monokai')
  expect(listener).toHaveBeenCalledTimes(1)

  setSelectedEditorThemeId('dark', 'monokai')
  expect(listener).toHaveBeenCalledTimes(1)

  unsubscribe()
  setSelectedEditorThemeId('dark', 'nord')
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
  setSelectedEditorThemeId('dark', 'monokai')

  const loaded = await loadEditorThemeForSelection('dark')

  expect(loaded.definition?.id).toBe('monokai')
  expect(loaded.registration?.name).toBe('monokai')
  expect(loaded.resolvedThemeId).toBe('monokai')
  expect(loaded.editorTheme.backgroundColor).toBeTruthy()
  expect(loaded.editorTheme.foregroundColor).toBeTruthy()
})

test('serves the built-in themes from their inline palette, with no shiki backing', async () => {
  setSelectedEditorThemeId('dark', 'tree-sitter-dark')

  const loaded = await loadEditorThemeForSelection('dark')

  // No VSCode definition and no registration: nothing to hand the shiki worker,
  // which is the point — these colors are for tree-sitter's captures.
  expect(loaded.definition).toBeNull()
  expect(loaded.registration).toBeNull()
  expect(loaded.resolvedThemeId).toBe('tree-sitter-dark')
  expect(loaded.editorTheme.syntax?.keyword).toBe('#6ee7b7')
})

test('a built-in selection takes the shiki highlighter off the active color mode', () => {
  expect(activeEditorThemeUsesShiki()).toBe(true)

  setSelectedEditorThemeId('dark', 'tree-sitter-dark')
  expect(activeEditorThemeUsesShiki()).toBe(false)
  // The resolver still has to name a theme shiki can load, for the window
  // between the selection landing and the provider being deregistered.
  expect(activeShikiThemeId()).toBe('dark-plus')

  // Light keeps its own selection, so switching mode brings shiki back.
  setActiveEditorColorMode('light')
  expect(activeEditorThemeUsesShiki()).toBe(true)
  expect(activeShikiThemeId()).toBe('light-plus')
})

test('hover-previewing a built-in theme turns shiki off without persisting', () => {
  previewEditorTheme('dark', 'tree-sitter-dark')

  expect(activeEditorThemeUsesShiki()).toBe(false)
  expect(getCommittedEditorThemeId('dark')).toBe('dark-plus')

  clearEditorThemePreview()

  expect(activeEditorThemeUsesShiki()).toBe(true)
})

test('memoizes loaded themes by id', async () => {
  const first = await loadEditorThemeForSelection('dark')
  const second = await loadEditorThemeForSelection('dark')

  expect(first).toBe(second)
})

test('a hover-preview overlays the selection without persisting', () => {
  setSelectedEditorThemeId('dark', 'monokai')

  previewEditorTheme('dark', 'dracula')

  expect(getSelectedEditorThemeId('dark')).toBe('dracula')
  // The committed id stays on the persisted selection — the palette badge and
  // any "what did the user actually pick" reader use this, not the live preview.
  expect(getCommittedEditorThemeId('dark')).toBe('monokai')

  clearEditorThemePreview()

  expect(getSelectedEditorThemeId('dark')).toBe('monokai')
})

test('a peak-sized theme scrub produces one active Shiki notification', async () => {
  setSelectedEditorThemeId('dark', 'monokai')
  await loadEditorThemeForSelection('dark')
  setSelectedEditorThemeId('dark', 'dracula')
  await loadEditorThemeForSelection('dark')

  const listener = vi.fn()
  subscribeActiveShikiTheme(listener)

  for (let index = 0; index < 303; index += 1) {
    previewEditorTheme('dark', index % 2 === 0 ? 'monokai' : 'dracula')
  }

  // The selection follows the pointer immediately, so badges stay honest...
  expect(getSelectedEditorThemeId('dark')).toBe('monokai')
  // ...but the historical 303-event peak has not reached the highlighter.
  expect(listener).not.toHaveBeenCalled()

  await vi.waitFor(() => {
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

test('active Shiki subscribers ignore an inactive color-mode selection', () => {
  const listener = vi.fn()
  subscribeActiveShikiTheme(listener)

  setSelectedEditorThemeId('light', 'github-light')

  expect(listener).not.toHaveBeenCalled()
})

test('committing the effective preview theme does not reload Shiki', async () => {
  setSelectedEditorThemeId('dark', 'monokai')
  await loadEditorThemeForSelection('dark')
  previewEditorTheme('dark', 'dracula')
  await loadEditorThemeForSelection('dark')

  const listener = vi.fn()
  subscribeActiveShikiTheme(listener)

  setSelectedEditorThemeId('dark', 'dracula')

  expect(listener).not.toHaveBeenCalled()
})

test('resolved Shiki content hashes are stable and distinguish loaded content', async () => {
  const nameOnlyHash = getResolvedShikiThemeContentHash('dark-plus')
  await loadEditorThemeForSelection('dark')
  const loadedHash = getResolvedShikiThemeContentHash('dark-plus')

  expect(nameOnlyHash).toMatch(/^[0-9a-f]{8}$/)
  expect(loadedHash).toMatch(/^[0-9a-f]{8}$/)
  expect(loadedHash).not.toBe(nameOnlyHash)
  expect(getResolvedShikiThemeContentHash('dark-plus')).toBe(loadedHash)
})

test('preview is ignored when it targets the already-selected theme', () => {
  const listener = vi.fn()
  subscribeEditorColorTheme(listener)
  setSelectedEditorThemeId('dark', 'monokai')
  listener.mockClear()

  previewEditorTheme('dark', 'monokai')

  expect(listener).not.toHaveBeenCalled()
})

test('preview is a no-op for repeated calls with the same theme', () => {
  const listener = vi.fn()
  subscribeEditorColorTheme(listener)

  previewEditorTheme('dark', 'monokai')
  listener.mockClear()

  previewEditorTheme('dark', 'monokai')
  expect(listener).not.toHaveBeenCalled()
})

test('commit drops the preview and persists the selection', () => {
  setSelectedEditorThemeId('dark', 'monokai')
  previewEditorTheme('dark', 'dracula')

  setSelectedEditorThemeId('dark', 'dracula')

  expect(getCommittedEditorThemeId('dark')).toBe('dracula')
  // No preview overlay anymore: the selected and committed ids agree.
  expect(getSelectedEditorThemeId('dark')).toBe('dracula')
  resetEditorColorThemeStore()

  expect(getCommittedEditorThemeId('dark')).toBe('dracula')
})

test('preview starts the registration load so the worker can use it synchronously', async () => {
  previewEditorTheme('dark', 'andromeeda')

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

  previewEditorTheme('dark', 'andromeeda')
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

test('resolves the worker theme to the app-owned registration', async () => {
  const registration = await resolveEditorShikiThemeRegistration('github-dark')

  expect(registration.name).toBe('github-dark')
  expect(getLoadedVscodeThemeRegistration('github-dark')).toBe(registration)
})

test('a failed requested theme reports the actual fallback id', async () => {
  vi.resetModules()
  vi.doMock('@/features/editor/utils/shiki-themes', async () => {
    const actual = await vi.importActual<typeof import('@/features/editor/utils/shiki-themes')>(
      '@/features/editor/utils/shiki-themes',
    )

    return {
      ...actual,
      loadVscodeThemeRegistration: (
        definition: Parameters<typeof actual.loadVscodeThemeRegistration>[0],
      ) => {
        if (typeof definition !== 'string' && definition.id === 'monokai') {
          return Promise.reject(new DOMException('theme load failed'))
        }

        return actual.loadVscodeThemeRegistration(definition)
      },
    }
  })

  try {
    const isolatedStore = await import('@/features/editor/state/color-theme-store')
    isolatedStore.resetEditorColorThemeStore()
    isolatedStore.setSelectedEditorThemeId('dark', 'monokai')

    const loaded = await isolatedStore.loadEditorThemeForSelection('dark')

    expect(loaded.definition?.id).toBe('dark-plus')
    expect(loaded.registration?.name).toBe('dark-plus')
    expect(loaded.resolvedThemeId).toBe('dark-plus')
  } finally {
    vi.doUnmock('@/features/editor/utils/shiki-themes')
    vi.resetModules()
  }
})
