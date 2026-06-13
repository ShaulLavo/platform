import { fireEvent, screen, within } from '@testing-library/react'
import { detectPlatform, HotkeysProvider } from '@tanstack/react-hotkeys'

import { ShellProofView } from '@/features/shell-proof/components/view'
import {
  readShellProofStoredLayout,
  resetShellProofStoredLayout,
  shellProofLayoutStorageKey,
} from '@/features/shell-proof/state/persistence'
import { SHELL_PROOF_HOTKEY_BINDINGS } from '@/features/shell-proof/utils/keymap'
import {
  FAKE_FILE_PATHS,
  shellProofInitialLayout,
  shellProofSeedKey,
} from '@/features/shell-proof/utils/seed'
import { serializeWorkspaceLayout } from '@/features/tiling-surface-manager/engine/layout-persistence'
import { expect, test } from '../../../../test/fixtures'
import { renderWithProviders } from '../../../../test/render'

test('toggles rail tools through the shell proof route', () => {
  renderShellProofRoute()

  const rail = shellProofRail()
  expect(screen.queryByRole('log', { name: 'Shell proof drag debug log' })).toBeNull()
  expect(railButton(rail, 'Restore Chat')).toHaveAttribute('data-rail-state', 'background')
  expect(proofWindowCount()).toBe(3)

  fireEvent.click(railButton(rail, 'Restore Chat'))

  expect(railButton(rail, 'Close Chat')).toHaveAttribute('data-rail-state', 'active')
  expect(proofWindowCount()).toBe(4)

  fireEvent.click(railButton(rail, 'Close Chat'))

  expect(railButton(rail, 'Open Chat')).toHaveAttribute('data-rail-state', 'pinned')
  expect(proofWindowCount()).toBe(3)
})

test('renders collapsed shell proof tools with the unified tab strip', () => {
  renderShellProofRoute()

  const rail = shellProofRail()
  fireEvent.click(railButton(rail, 'Restore Chat'))
  clickButtonByLabel('Collapse Chat to rail')

  const collapsed = collapsedProofWindow()
  expect(collapsed).toHaveTextContent('Chat')
  expect(railButton(rail, 'Close Chat')).toHaveAttribute('data-rail-state', 'collapsed')

  clickButtonByLabel('Expand Chat', collapsed)

  expect(document.querySelector('[data-workbench-window-collapsed="true"]')).toBeNull()
  expect(railButton(rail, 'Close Chat')).toHaveAttribute('data-rail-state', 'active')

  clickButtonByLabel('Collapse Chat to row')
  clickButtonByLabel('Close Chat', collapsedProofWindow())

  expect(document.querySelector('[data-workbench-window-collapsed="true"]')).toBeNull()
  expect(railButton(rail, 'Open Chat')).toHaveAttribute('data-rail-state', 'pinned')
  expect(proofWindowCount()).toBe(3)
})

test('toggles bottom tabs through the rail and dock chrome', () => {
  renderShellProofRoute()

  const rail = shellProofRail()
  const bottomPane = screen.getByRole('region', { name: 'Terminal' })
  expect(within(bottomPane).getByRole('tab', { name: 'Terminal' })).toBeVisible()
  expect(within(bottomPane).getByRole('tab', { name: 'Problems' })).toBeVisible()

  fireEvent.click(within(bottomPane).getByRole('button', { name: 'Close Problems' }))

  expect(railButton(rail, 'Open Problems')).toHaveAttribute('data-rail-state', 'pinned')
  expect(proofWindowCount()).toBe(3)

  fireEvent.click(railButton(rail, 'Close Terminal'))

  expect(railButton(rail, 'Open Terminal')).toHaveAttribute('data-rail-state', 'pinned')
  expect(proofWindowCount()).toBe(2)

  fireEvent.click(railButton(rail, 'Open Terminal'))

  expect(railButton(rail, 'Close Terminal')).toHaveAttribute('data-rail-state', 'active')
  expect(proofWindowCount()).toBe(3)

  fireEvent.click(railButton(rail, 'Open Problems'))

  const restoredDock = screen.getByRole('region', { name: 'Problems' })
  expect(within(restoredDock).getByRole('tab', { name: 'Terminal' })).toBeVisible()
  expect(within(restoredDock).getByRole('tab', { name: 'Problems' })).toBeVisible()
  expect(proofWindowCount()).toBe(3)
})

test('mounts the drag debug log behind the debug query flag', () => {
  renderShellProofRoute('?debug')

  expect(screen.getByRole('log', { name: 'Shell proof drag debug log' })).toHaveTextContent(
    'No drag events',
  )
})

test('opens fake navigator files as regular editor tabs without duplicating them', () => {
  renderShellProofRoute()

  const path = FAKE_FILE_PATHS[1]
  const title = fileTitle(path)
  const fileButton = screen.getByRole('button', { name: `Open ${path}` })
  expect(fileButton).toHaveAttribute('data-shell-proof-file-state', 'closed')

  fireEvent.click(fileButton)

  expect(fileButton).toHaveAttribute('data-shell-proof-file-state', 'active')
  expect(screen.getAllByRole('tab', { name: title })).toHaveLength(1)
  expect(screen.getByRole('tab', { name: title })).toHaveAttribute('aria-selected', 'true')

  fireEvent.click(fileButton)

  expect(screen.getAllByRole('tab', { name: title })).toHaveLength(1)
  expect(screen.getByRole('tab', { name: title })).toHaveAttribute('aria-selected', 'true')
})

test('focuses a window when pointer down lands inside a click-swallowing surface', () => {
  renderShellProofRoute()

  const fileButton = screen.getByRole('button', { name: `Open ${FAKE_FILE_PATHS[2]}` })
  const filesWindow = proofWindowOf(fileButton)
  const editorWindow = activeProofWindow()

  expect(filesWindow).not.toBe(editorWindow)
  expect(filesWindow).toHaveAttribute('data-workbench-window-active', 'false')

  // A non-primary button never steals focus.
  fireEvent.pointerDown(fileButton, { button: 2, pointerId: 1 })
  expect(filesWindow).toHaveAttribute('data-workbench-window-active', 'false')

  // Left pointer-down activates the window even though the navigator button
  // swallows the click, so a bubbling onClick would never reach the frame.
  fireEvent.pointerDown(fileButton, { button: 0, pointerId: 1 })

  expect(filesWindow).toHaveAttribute('data-workbench-window-active', 'true')
  expect(editorWindow).toHaveAttribute('data-workbench-window-active', 'false')
})

test('registers app baseline shell proof window command hotkeys', () => {
  expect(shellProofWindowHotkeys()).toEqual(
    expect.arrayContaining(['Alt+Shift+X', 'Alt+Shift+H', 'Alt+Shift+L', 'Alt+Shift+W']),
  )
})

test('runs shell proof window commands from keyboard shortcuts', () => {
  renderShellProofRoute()

  const path = FAKE_FILE_PATHS[1]
  const title = fileTitle(path)
  fireEvent.click(screen.getByRole('button', { name: `Open ${path}` }))
  expect(proofWindowCount()).toBe(3)

  pressAltShiftKey('D')

  expect(proofWindowCount()).toBe(4)
  expect(screen.getByRole('tab', { name: title })).toHaveAttribute('aria-selected', 'true')

  pressKey('ArrowLeft', { altKey: true, ctrlKey: true, shiftKey: true })

  expect(screen.getByRole('tab', { name: 'app.tsx' })).toHaveAttribute('aria-selected', 'true')
})

test('tabs active surfaces from app baseline keyboard shortcuts', () => {
  renderShellProofRoute()

  const path = FAKE_FILE_PATHS[1]
  const title = fileTitle(path)
  fireEvent.click(screen.getByRole('button', { name: `Open ${path}` }))

  pressAltShiftKey('D')

  expect(proofWindowCount()).toBe(4)
  expect(screen.getByRole('tab', { name: title })).toHaveAttribute('aria-selected', 'true')

  pressAltShiftKey('H')

  expect(proofWindowCount()).toBe(3)
  expect(screen.getByRole('tab', { name: title })).toHaveAttribute('aria-selected', 'true')
})

test('closes active surfaces from keyboard shortcuts', () => {
  renderShellProofRoute()

  const path = FAKE_FILE_PATHS[1]
  const title = fileTitle(path)
  const fileButton = screen.getByRole('button', { name: `Open ${path}` })
  fireEvent.click(fileButton)

  expect(fileButton).toHaveAttribute('data-shell-proof-file-state', 'active')
  expect(screen.getByRole('tab', { name: title })).toHaveAttribute('aria-selected', 'true')

  pressAltShiftKey('W')

  expect(screen.queryByRole('tab', { name: title })).toBeNull()
  expect(screen.getByRole('tab', { name: 'app.tsx' })).toHaveAttribute('aria-selected', 'true')
  expect(fileButton).toHaveAttribute('data-shell-proof-file-state', 'closed')
})

test('toggles recipe panes from shell proof keyboard shortcuts', () => {
  renderShellProofRoute()

  const rail = shellProofRail()
  expect(railButton(rail, 'Close Files')).toHaveAttribute('data-rail-state', 'visible')
  expect(railButton(rail, 'Close Terminal')).toHaveAttribute('data-rail-state', 'visible')

  pressModKey('b')

  expect(railButton(rail, 'Open Files')).toHaveAttribute('data-rail-state', 'pinned')
  expect(proofWindowCount()).toBe(2)

  pressModKey('b')

  expect(railButton(rail, 'Close Files')).toHaveAttribute('data-rail-state', 'active')
  expect(proofWindowCount()).toBe(3)

  pressModKey('j')

  expect(railButton(rail, 'Open Terminal')).toHaveAttribute('data-rail-state', 'pinned')
  expect(proofWindowCount()).toBe(3)

  pressModKey('j')

  expect(railButton(rail, 'Close Terminal')).toHaveAttribute('data-rail-state', 'active')
  expect(proofWindowCount()).toBe(3)
})

test('persists shell proof layout across route remounts and resets from the keyboard', () => {
  const storageKey = shellProofStorageKey()
  resetShellProofStoredLayout(storageKey)

  const firstRender = renderShellProofRoute('', { preserveStorage: true })
  fireEvent.click(railButton(shellProofRail(), 'Restore Chat'))

  expect(railButton(shellProofRail(), 'Close Chat')).toHaveAttribute('data-rail-state', 'active')
  expect(proofWindowCount()).toBe(4)
  expect(localStorage.getItem(storageKey)).toContain('chat')

  firstRender.unmount()
  const secondRender = renderShellProofRoute('', { preserveStorage: true })

  expect(railButton(shellProofRail(), 'Close Chat')).toHaveAttribute('data-rail-state', 'active')
  expect(proofWindowCount()).toBe(4)

  pressResetLayoutHotkey()

  expect(railButton(shellProofRail(), 'Restore Chat')).toHaveAttribute(
    'data-rail-state',
    'background',
  )
  expect(proofWindowCount()).toBe(3)

  secondRender.unmount()
  renderShellProofRoute('', { preserveStorage: true })

  expect(railButton(shellProofRail(), 'Restore Chat')).toHaveAttribute(
    'data-rail-state',
    'background',
  )
  expect(proofWindowCount()).toBe(3)
})

test('recovers a corrupt shell proof persisted layout by reseeding', () => {
  const storageKey = shellProofStorageKey()
  localStorage.setItem(storageKey, '{')

  renderShellProofRoute('', { preserveStorage: true })

  expect(localStorage.getItem(storageKey)).toBeNull()
  expect(railButton(shellProofRail(), 'Restore Chat')).toHaveAttribute(
    'data-rail-state',
    'background',
  )
  expect(proofWindowCount()).toBe(3)
})

test('keeps recoverable shell proof persisted layouts and rewrites the cleaned payload', () => {
  const storageKey = shellProofStorageKey()
  const seedLayout = shellProofInitialLayout('')
  const serialized = serializeWorkspaceLayout(seedLayout)
  const droppedSurfaceId = 'surface:shell-proof-dropped-entry'
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      ...serialized,
      surfaces: [
        ...serialized.surfaces,
        {
          id: droppedSurfaceId,
          surface: { title: 'Dropped', type: 'missing-shell-proof-surface' },
        },
      ],
    }),
  )

  readShellProofStoredLayout(storageKey, seedLayout)

  const cleaned = storedShellProofPayload(storageKey)
  expect(cleaned).not.toBeNull()
  expect(JSON.stringify(cleaned)).not.toContain(droppedSurfaceId)
})

function renderShellProofRoute(search = '', options: { readonly preserveStorage?: boolean } = {}) {
  if (!options.preserveStorage) {
    resetShellProofStoredLayout(shellProofStorageKey(search))
  }

  window.history.pushState(null, '', `/shell-proof${search}`)

  return renderWithProviders(
    <HotkeysProvider>
      <ShellProofView />
    </HotkeysProvider>,
  )
}

function shellProofRail() {
  return screen.getByLabelText('Workbench rail')
}

function railButton(rail: HTMLElement, name: string) {
  return within(rail).getByRole('button', { name })
}

function proofWindowCount() {
  return document.querySelectorAll('[data-workbench-window-id]').length
}

function proofWindowOf(element: Element) {
  const window = element.closest('[data-workbench-window-id]')
  if (!(window instanceof HTMLElement)) throw new Error('Expected an enclosing proof window')

  return window
}

function activeProofWindow() {
  const window = document.querySelector('[data-workbench-window-active="true"]')
  if (!(window instanceof HTMLElement)) throw new Error('Expected an active proof window')

  return window
}

function shellProofWindowHotkeys() {
  return SHELL_PROOF_HOTKEY_BINDINGS.flatMap((binding) => {
    if (binding.kind !== 'window-command') return []

    return [binding.hotkey]
  })
}

function fileTitle(path: string) {
  return path.split('/').at(-1) ?? path
}

function collapsedProofWindow() {
  const window = document.querySelector('[data-workbench-window-collapsed="true"]')
  if (!(window instanceof HTMLElement)) throw new Error('Expected collapsed proof window')

  return window
}

function clickButtonByLabel(label: string, root: ParentNode = document) {
  const button = root.querySelector(`button[aria-label="${label}"]`)
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Expected ${label} button`)

  fireEvent.click(button)
}

function pressAltShiftKey(key: string) {
  pressKey(key, { altKey: true, shiftKey: true })
}

function pressModKey(key: string) {
  pressKey(key, modKeyOptions())
}

function pressResetLayoutHotkey() {
  pressKey('Backspace', { altKey: true, ctrlKey: true, shiftKey: true })
}

function pressKey(
  key: string,
  options: {
    readonly altKey?: boolean
    readonly ctrlKey?: boolean
    readonly metaKey?: boolean
    readonly shiftKey?: boolean
  },
) {
  fireEvent.keyDown(document, {
    code: keyCode(key),
    key,
    ...options,
  })
}

function modKeyOptions() {
  if (detectPlatform() === 'mac') return { metaKey: true }

  return { ctrlKey: true }
}

function keyCode(key: string) {
  if (key.startsWith('Arrow')) return key
  if (key.length !== 1) return key

  return `Key${key.toUpperCase()}`
}

function shellProofStorageKey(search = '') {
  return shellProofLayoutStorageKey(shellProofSeedKey(search))
}

function storedShellProofPayload(storageKey: string) {
  const value = localStorage.getItem(storageKey)
  if (!value) return null

  return JSON.parse(value)
}
