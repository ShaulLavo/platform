import '@workspace/ui/globals.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/components/theme-provider'
import { ShellProofView } from '@/features/shell-proof/components/view'
import {
  resetShellProofStoredLayout,
  shellProofLayoutStorageKey,
} from '@/features/shell-proof/state/persistence'
import { FAKE_FILE_PATHS, shellProofSeedKey } from '@/features/shell-proof/utils/seed'
import { EditorColorThemeProvider } from '@/features/editor/hooks/use-editor-color-theme'
import { TooltipProvider } from '@workspace/ui/components/tooltip'

let root: Root | null = null
let currentDragPoint: PointerPoint | null = null

afterEach(() => {
  if (root) {
    flushSync(() => root?.unmount())
    root = null
  }

  document.body.innerHTML = ''
  document.body.removeAttribute('style')
  currentDragPoint = null
})

describe.sequential('Shell proof recipe behavior', () => {
  it('restores manually dragged tool panes from sticky placement', async () => {
    renderShellProofRoute()

    await waitForShellProofWindows(3)
    railButton('Restore Chat').click()

    await vi.waitFor(() => {
      expect(railButton('Close Chat').dataset.railState).toBe('active')
      expect(proofWindows()).toHaveLength(4)
    })

    dragPointerTo(windowDragHandleIn(proofWindowWithText('Chat')), rootRightSnapPoint())

    await vi.waitFor(() => {
      expectWindowRightOfTab('Chat', 'app.tsx')
    })

    railButton('Close Chat').click()

    await vi.waitFor(() => {
      expect(railButton('Open Chat').dataset.railState).toBe('pinned')
      expect(proofWindows()).toHaveLength(3)
    })

    railButton('Open Chat').click()

    await vi.waitFor(() => {
      expect(railButton('Close Chat').dataset.railState).toBe('active')
      expectWindowRightOfTab('Chat', 'app.tsx')
    })
  })

  it('packs rail-opened tool panes and opens navigator files in the main view', async () => {
    renderShellProofRoute()

    await waitForShellProofWindows(3)
    railButton('Restore Chat').click()
    railButtonForTitle('Search').click()

    await vi.waitFor(() => {
      expect(railButton('Close Chat').dataset.railState).toBe('visible')
      expect(railButtonForTitle('Search').dataset.railState).toBe('active')
      expect(proofWindows()).toHaveLength(5)
      // Balanced columns by arrival: Files and Search stack in the first
      // column while Chat, opened second, keeps the full-height second one.
      expectWindowAbove('Files', 'Search')
      expectWindowRightOfWindow('Chat', 'Files')
    })

    buttonWithLabel('Collapse Chat to rail').click()

    await vi.waitFor(() => {
      expect(railButton('Close Chat').dataset.railState).toBe('collapsed')
      expect(collapsedProofWindow()).toHaveTextContent('Chat')
    })

    buttonWithLabel('Expand Chat').click()

    await vi.waitFor(() => {
      expect(railButton('Close Chat').dataset.railState).toBe('active')
      expect(queryCollapsedProofWindow()).toBeNull()
      expectWindowRightOfWindow('Chat', 'Search')
    })

    railButtonForTitle('Search').click()

    await vi.waitFor(() => {
      expect(railButtonForTitle('Search').dataset.railState).toBe('pinned')
      expect(queryProofWindowWithText('Search')).toBeNull()
      expectWindowRightOfWindow('Chat', 'Files')
    })

    buttonWithLabel(`Open ${FAKE_FILE_PATHS[1]}`).click()

    await vi.waitFor(() => {
      expect(proofTabWithText(fileTitle(FAKE_FILE_PATHS[1]))).toHaveAttribute(
        'aria-selected',
        'true',
      )
      expectTabWindowRightOf(fileTitle(FAKE_FILE_PATHS[1]), 'Files')
    })
  })

  it('persists manually dragged tool placement across remount and rail restore', async () => {
    renderShellProofRoute()

    await waitForShellProofWindows(3)
    railButton('Restore Chat').click()

    await vi.waitFor(() => {
      expect(railButton('Close Chat').dataset.railState).toBe('active')
      expect(proofWindows()).toHaveLength(4)
    })

    dragPointerTo(windowDragHandleIn(proofWindowWithText('Chat')), rootRightSnapPoint())

    await vi.waitFor(() => {
      expectWindowRightOfTab('Chat', 'app.tsx')
    })

    unmountShellProofRoute()
    renderShellProofRoute({ preserveStorage: true })

    await waitForShellProofWindows(4)

    await vi.waitFor(() => {
      expect(railButton('Close Chat').dataset.railState).toBe('active')
      expectWindowRightOfTab('Chat', 'app.tsx')
    })

    railButton('Close Chat').click()

    await vi.waitFor(() => {
      expect(railButton('Open Chat').dataset.railState).toBe('pinned')
      expect(proofWindows()).toHaveLength(3)
    })

    railButton('Open Chat').click()

    await vi.waitFor(() => {
      expect(railButton('Close Chat').dataset.railState).toBe('active')
      expectWindowRightOfTab('Chat', 'app.tsx')
    })
  })

  it('restores manually dragged terminal panes from sticky placement', async () => {
    renderShellProofRoute()

    await waitForShellProofWindows(3)
    railButton('Close Terminal').click()

    await vi.waitFor(() => {
      expect(railButton('Restore Terminal').dataset.railState).toBe('background')
      expect(proofWindows()).toHaveLength(2)
    })

    railButton('Restore Terminal').click()

    await vi.waitFor(() => {
      expect(railButton('Close Terminal').dataset.railState).toBe('active')
      expect(proofWindows()).toHaveLength(3)
      expectWindowRightOf('Terminal', 'Files')
    })

    dragPointerTo(proofTabWithText('Terminal'), rootRightSnapPoint())

    await vi.waitFor(() => {
      expect(proofWindows()).toHaveLength(4)
      expectWindowRightOfTab('Terminal', 'app.tsx')
    })

    railButton('Close Terminal').click()

    await vi.waitFor(() => {
      expect(railButton('Close Terminal').dataset.railState).toBe('visible')
      expect(proofWindows()).toHaveLength(3)
    })

    railButton('Close Terminal').click()

    await vi.waitFor(() => {
      expect(railButton('Restore Terminal').dataset.railState).toBe('background')
      expect(proofWindows()).toHaveLength(2)
    })

    railButton('Restore Terminal').click()

    await vi.waitFor(() => {
      expect(railButton('Close Terminal').dataset.railState).toBe('active')
      expectWindowRightOfTab('Terminal', 'app.tsx')
    })
  })

  it('falls invalid terminal editor merges back to the bottom recipe slot', async () => {
    renderShellProofRoute()

    await waitForShellProofWindows(3)

    const editorWindow = proofWindowWithTabText('app.tsx')
    const initialTerminalRect = rectSnapshot(proofWindowWithText('Terminal'))
    dragPointerTo(proofTabWithText('Terminal'), centerOf(editorWindow))

    await vi.waitFor(() => {
      const nextEditorWindow = proofWindowWithTabText('app.tsx')
      const terminalWindow = proofWindowWithText('Terminal')
      const terminalRect = rectSnapshot(terminalWindow)

      expect(proofWindows()).toHaveLength(3)
      expect(nextEditorWindow.textContent).not.toContain('Terminal')
      expect(terminalRect.left).toBeCloseTo(initialTerminalRect.left, 0)
      expect(terminalRect.top).toBeCloseTo(initialTerminalRect.top, 0)
      expect(terminalRect.width).toBeCloseTo(initialTerminalRect.width, 0)
    })
  })

  it('falls invalid logs terminal merges back to the left tool recipe slot', async () => {
    renderShellProofRoute()

    await waitForShellProofWindows(3)
    railButtonForTitle('Logs').click()

    await vi.waitFor(() => {
      expect(railButtonForTitle('Logs').dataset.railState).toBe('active')
      expect(proofWindows()).toHaveLength(4)
      expectWindowLeftOfTab('Logs', 'app.tsx')
    })

    dragPointerTo(proofTabWithText('Logs'), centerOf(proofWindowWithText('Terminal')))

    await vi.waitFor(() => {
      expect(proofWindows()).toHaveLength(4)
      expect(proofWindowWithText('Terminal').textContent).not.toContain('Logs')
      expectWindowLeftOfTab('Logs', 'app.tsx')
    })
  })
})

function renderShellProofRoute(options: { readonly preserveStorage?: boolean } = {}) {
  if (!options.preserveStorage) {
    resetShellProofStoredLayout(shellProofLayoutStorageKey(shellProofSeedKey('')))
  }

  window.history.pushState(null, '', '/shell-proof')
  document.body.style.margin = '0'

  const container = document.createElement('main')
  container.style.height = '720px'
  container.style.width = '1120px'
  document.body.append(container)

  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retry: false } },
  })
  root = createRoot(container)

  flushSync(() => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme='dark' storageKey='platform-shell-proof-browser-theme'>
          <EditorColorThemeProvider>
            <TooltipProvider delay={0}>
              <HotkeysProvider>
                <ShellProofView />
              </HotkeysProvider>
            </TooltipProvider>
          </EditorColorThemeProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    )
  })
}

function unmountShellProofRoute() {
  if (!root) return

  flushSync(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
}

async function waitForShellProofWindows(count: number) {
  await vi.waitFor(() => {
    expect(proofWindows()).toHaveLength(count)
  })
  await nextFrame()
}

function shellProofRail() {
  const rail = document.querySelector<HTMLElement>('[data-workbench-rail]')
  if (!rail) throw new Error('Missing shell proof rail')

  return rail
}

function railButton(label: string) {
  const button = Array.from(shellProofRail().querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.getAttribute('aria-label') === label,
  )
  if (!button) throw new Error(`Missing rail button ${label}`)

  return button
}

function railButtonForTitle(title: string) {
  const button = Array.from(shellProofRail().querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.getAttribute('aria-label')?.endsWith(` ${title}`),
  )
  if (!button) throw new Error(`Missing rail button for ${title}`)

  return button
}

function proofWindows() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-proof-window-id]'))
}

function proofWindowWithText(text: string) {
  const windowElement = proofWindows().find((candidate) => candidate.textContent?.includes(text))
  if (!windowElement) throw new Error(`Missing proof window containing ${text}`)

  return windowElement
}

function queryProofWindowWithText(text: string) {
  return proofWindows().find((candidate) => candidate.textContent?.includes(text)) ?? null
}

function proofTabWithText(text: string) {
  const tab = Array.from(document.querySelectorAll<HTMLElement>('[data-proof-tab-id]')).find(
    (candidate) => candidate.textContent?.includes(text),
  )
  if (!tab) throw new Error(`Missing proof tab containing ${text}`)

  return tab
}

function proofWindowWithTabText(text: string) {
  const windowElement = proofTabWithText(text).closest<HTMLElement>('[data-proof-window-id]')
  if (!windowElement) throw new Error(`Missing proof window for tab ${text}`)

  return windowElement
}

function windowDragHandleIn(windowElement: HTMLElement) {
  const handle = windowElement.querySelector<HTMLElement>('[data-proof-window-drag-handle]')
  if (!handle) throw new Error('Missing proof window drag handle')

  return handle
}

function buttonWithLabel(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!button) throw new Error(`Missing button ${label}`)

  return button
}

function collapsedProofWindow() {
  const window = queryCollapsedProofWindow()
  if (!window) throw new Error('Missing collapsed proof window')

  return window
}

function queryCollapsedProofWindow() {
  return document.querySelector<HTMLElement>('[data-proof-window-collapsed="true"]')
}

function expectWindowRightOf(windowText: string, leftWindowText: string) {
  expect(proofWindowWithText(windowText).getBoundingClientRect().left).toBeGreaterThan(
    proofWindowWithText(leftWindowText).getBoundingClientRect().right - 4,
  )
}

function expectWindowRightOfTab(windowText: string, leftTabText: string) {
  expect(proofWindowWithText(windowText).getBoundingClientRect().left).toBeGreaterThan(
    proofWindowWithTabText(leftTabText).getBoundingClientRect().right - 4,
  )
}

function expectTabWindowRightOf(tabText: string, leftWindowText: string) {
  expect(proofWindowWithTabText(tabText).getBoundingClientRect().left).toBeGreaterThan(
    proofWindowWithText(leftWindowText).getBoundingClientRect().right - 4,
  )
}

function expectWindowLeftOfTab(windowText: string, rightTabText: string) {
  expect(proofWindowWithText(windowText).getBoundingClientRect().right).toBeLessThan(
    proofWindowWithTabText(rightTabText).getBoundingClientRect().left + 4,
  )
}

function expectWindowAbove(windowText: string, bottomWindowText: string) {
  expect(proofWindowWithText(windowText).getBoundingClientRect().top).toBeLessThan(
    proofWindowWithText(bottomWindowText).getBoundingClientRect().top,
  )
}

function expectWindowRightOfWindow(windowText: string, leftWindowText: string) {
  expect(proofWindowWithText(windowText).getBoundingClientRect().left).toBeGreaterThan(
    proofWindowWithText(leftWindowText).getBoundingClientRect().right - 4,
  )
}

function rootRightSnapPoint(): PointerPoint {
  const surfaceArea = document.querySelector<HTMLElement>('[data-shell-proof-surface-area]')
  if (!surfaceArea) throw new Error('Missing shell proof surface area')

  const rect = surfaceArea.getBoundingClientRect()

  return {
    x: rect.right - 12,
    y: rect.top + rect.height / 2,
  }
}

type PointerPoint = {
  readonly x: number
  readonly y: number
}

function dragPointerTo(element: HTMLElement, point: PointerPoint) {
  startPointerDrag(element)
  movePointerBy(8, 0)
  movePointerTo(point)
  finishPointerDrag(point)
}

function startPointerDrag(element: HTMLElement, point: PointerPoint = centerOf(element)) {
  currentDragPoint = point
  element.dispatchEvent(pointerEvent('pointerdown', point, 1))
}

function movePointerBy(deltaX: number, deltaY: number, target: EventTarget = document) {
  if (!currentDragPoint) throw new Error('Cannot move a pointer before pointerdown')

  movePointerTo(
    {
      x: currentDragPoint.x + deltaX,
      y: currentDragPoint.y + deltaY,
    },
    target,
  )
}

function movePointerTo(point: PointerPoint, target: EventTarget = document) {
  currentDragPoint = point
  target.dispatchEvent(pointerEvent('pointermove', point, 1))
}

function finishPointerDrag(point: PointerPoint = currentDragPoint ?? { x: 0, y: 0 }) {
  document.dispatchEvent(pointerEvent('pointerup', point, 0))
  currentDragPoint = null
}

function pointerEvent(type: string, point: PointerPoint, buttons: number) {
  return new PointerEvent(type, {
    bubbles: true,
    button: 0,
    buttons,
    cancelable: true,
    clientX: point.x,
    clientY: point.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'mouse',
  })
}

function centerOf(element: HTMLElement): PointerPoint {
  const rect = element.getBoundingClientRect()

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  }
}

function rectSnapshot(element: HTMLElement) {
  const rect = element.getBoundingClientRect()

  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  }
}

function fileTitle(path: string) {
  return path.split('/').at(-1) ?? path
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}
