import '@workspace/ui/globals.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/components/theme-provider'
import {
  EMPTY_GIT_FILES,
  editorTabModel,
} from '@/components/workspace/editor-tabs/utils/editor-tab-model'
import { FocusProvider } from '@/components/workspace/focus/providers/focus-provider'
import { EditorStateProvider } from '@/features/editor/editor-state-provider'
import { createGitStore } from '@/features/git/state'
import { EditorColorThemeProvider } from '@/features/editor/hooks/use-editor-color-theme'
import { disposeEditorTreeSitterSyntaxProvider } from '@/features/editor/editor-plugins'
import { serverUrl } from '@/lib/client'
import { fileSystemKeys } from '@/lib/query-keys'
import { TooltipProvider } from '@workspace/ui/components/tooltip'

import {
  createClassicFirstRunWorkspaceLayout,
  createEmptyWorkspaceLayout,
  createFileEditorSurface,
} from '@/features/tiling-surface-manager/engine/layout-builders'
import { openSurface } from '@/features/tiling-surface-manager/engine/layout-operations'
import { LayoutProvider } from '@/features/workbench/providers/layout-provider'
import { LayoutRenderer } from '@/features/workbench/components/layout-renderer'
import { editorSurfaceSerializedState } from '@/features/workbench/utils/editor-surface-layout'
import { EditorSurfaceProvider } from '@/features/workbench/providers/editor-surface-provider'
import { editorSurfaceRendererRegistry } from '@/features/workbench/utils/editor-surface-renderers'
import type { Surface } from '@/features/tiling-surface-manager/engine/layout-types'

const THEME_STORAGE_KEY = 'platform-workbench-layout-renderer-browser-theme'
const TEST_ROOT_PATH = 'repo'
const FILE_A_PATH = `${TEST_ROOT_PATH}/src/a.ts`
const FILE_B_PATH = `${TEST_ROOT_PATH}/src/b.ts`

let root: Root | null = null

beforeAll(async () => {
  await waitForFileServer()
})

afterEach(() => {
  if (root) {
    flushSync(() => root?.unmount())
    root = null
  }

  document.body.innerHTML = ''
  localStorage.removeItem(THEME_STORAGE_KEY)
})

afterAll(async () => {
  await disposeEditorTreeSitterSyntaxProvider()
})

describe('LayoutRenderer browser rendering', () => {
  it('renders nonblank windows and keeps tab focusable', async () => {
    renderClassicLayout()

    await vi.waitFor(() => {
      expect(windowRegions()).toHaveLength(3)
      expect(document.body.textContent).toContain('No file selected')
      expect(firstWindowRect().width).toBeGreaterThan(100)
      expect(firstWindowRect().height).toBeGreaterThan(100)
      expect(firstWindowOuterInset()).toEqual({ left: 8, top: 8 })
    })

    const tab = firstTab()
    tab.focus()

    expect(document.activeElement).toBe(tab)
  })

  it('keeps resize overlays click-through outside handles', async () => {
    renderClassicLayout()

    await vi.waitFor(() => {
      expect(windowRegions()).toHaveLength(3)
      expect(surfaceArea()).not.toBeNull()
      expect(railElement()).not.toBeNull()
      expect(resizeOverlay()).not.toBeNull()
      expect(firstColumnResizeHandle()).not.toBeNull()
    })

    expect(getComputedStyle(resizeOverlay()).pointerEvents).toBe('none')
    expect(getComputedStyle(firstColumnResizeHandle()).pointerEvents).toBe('auto')

    const railRect = railElement().getBoundingClientRect()
    const surfaceRect = surfaceArea().getBoundingClientRect()
    expect(railRect.right).toBeLessThanOrEqual(surfaceRect.left + 1)
    expect(railRect.height).toBeGreaterThan(railRect.width)
  })

  it('resizes split windows with pointer drag handles', async () => {
    renderClassicLayout()

    await vi.waitFor(() => {
      expect(windowRegions()).toHaveLength(3)
      expect(firstColumnResizeHandle()).not.toBeNull()
    })

    const handle = firstColumnResizeHandle()
    const handleRect = handle.getBoundingClientRect()
    const initialRects = windowRects()
    const pointerY = handleRect.top + handleRect.height / 2
    const startX = handleRect.left + handleRect.width / 2

    handle.dispatchEvent(resizePointerEvent('pointerdown', startX, pointerY))
    handle.dispatchEvent(resizePointerEvent('pointermove', startX + 80, pointerY))
    handle.dispatchEvent(resizePointerEvent('pointerup', startX + 80, pointerY))

    await vi.waitFor(() => {
      expect(windowRects()).not.toEqual(initialRects)
    })
  })

  it('activates rail panes while another rail pane is open', async () => {
    renderClassicLayout()

    await vi.waitFor(() => {
      expect(buttonWithLabel('Restore Chat')).not.toBeNull()
    })

    buttonWithLabel('Restore Chat').click()

    await vi.waitFor(() => {
      expect(buttonWithLabel('Collapse Chat').dataset.railState).toBe('active')
    })

    buttonWithLabel('Restore Logs').click()

    await vi.waitFor(() => {
      expect(buttonWithLabel('Collapse Logs').dataset.railState).toBe('active')
      expect(buttonWithLabel('Collapse Chat').dataset.railState).toBe('visible')
      expect(windowRegions()).toHaveLength(5)
    })

    buttonWithLabel('Collapse Chat').click()

    await vi.waitFor(() => {
      expect(buttonWithLabel('Collapse Chat').dataset.railState).toBe('active')
      expect(buttonWithLabel('Collapse Logs').dataset.railState).toBe('visible')
      expect(windowRegions()).toHaveLength(5)
    })
  })

  it('renders editor-backed surfaces with Chrome editor tabs', async () => {
    const container = document.createElement('main')
    const queryClient = new QueryClient()
    container.style.height = '420px'
    container.style.width = '780px'
    document.body.append(container)
    root = createRoot(container)

    flushSync(() => {
      root?.render(
        <ThemeProvider defaultTheme='dark' storageKey={THEME_STORAGE_KEY}>
          <EditorColorThemeProvider>
            <TooltipProvider delay={0}>
              <FocusProvider>
                <QueryClientProvider client={queryClient}>
                  <EditorStateProvider>
                    <EditorSurfaceProvider
                      editorKeymapLayers={[]}
                      gitStore={createGitStore()}
                      requestCloseTab={() => true}
                      requestCloseTabs={() => true}
                      rootPath={TEST_ROOT_PATH}
                      surfaceIdForEditorTabId={(tabId) => surfaceIdForEditorTabId(tabId)}
                      tabModelForSurface={(surface, active) => tabModelForSurface(surface, active)}
                    >
                      <LayoutProvider initialLayout={editorSurfaceLayout()}>
                        <LayoutRenderer surfaceRenderers={editorSurfaceRendererRegistry} />
                      </LayoutProvider>
                    </EditorSurfaceProvider>
                  </EditorStateProvider>
                </QueryClientProvider>
              </FocusProvider>
            </TooltipProvider>
          </EditorColorThemeProvider>
        </ThemeProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(editorChromeTabs()).toHaveLength(2)
      expect(document.body.textContent).toContain('a.ts')
      expect(document.body.textContent).toContain('b.ts')
    })

    await vi.waitFor(() => {
      const fileSnapshots = queryClient
        .getQueryCache()
        .findAll({ queryKey: fileSystemKeys.fileSnapshots() })

      expect(queryClient.isFetching({ queryKey: fileSystemKeys.fileSnapshots() })).toBe(0)
      expect(fileSnapshots.some((query) => query.state.status === 'success')).toBe(true)
    })
  })
})

function renderClassicLayout() {
  const container = document.createElement('main')
  container.style.height = '620px'
  container.style.left = '0'
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.width = '920px'
  document.body.append(container)
  root = createRoot(container)

  flushSync(() => {
    root?.render(
      <ThemeProvider defaultTheme='dark' storageKey={THEME_STORAGE_KEY}>
        <EditorColorThemeProvider>
          <TooltipProvider delay={0}>
            <FocusProvider>
              <LayoutProvider initialLayout={createClassicFirstRunWorkspaceLayout()}>
                <LayoutRenderer />
              </LayoutProvider>
            </FocusProvider>
          </TooltipProvider>
        </EditorColorThemeProvider>
      </ThemeProvider>,
    )
  })
}

function windowRegions() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-window-id]'))
}

function firstWindowRect() {
  const firstWindow = windowRegions()[0]
  if (!firstWindow) throw new Error('Missing workbench window')

  return firstWindow.getBoundingClientRect()
}

function firstWindowOuterInset() {
  const surfaceRect = surfaceArea().getBoundingClientRect()
  const windowRect = firstWindowRect()

  return {
    left: Math.round(windowRect.left - surfaceRect.left),
    top: Math.round(windowRect.top - surfaceRect.top),
  }
}

function windowRects() {
  return windowRegions().map((window) => {
    const rect = window.getBoundingClientRect()
    return {
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    }
  })
}

function surfaceArea() {
  const area = document.querySelector<HTMLElement>('[data-workbench-surface-area]')
  if (!area) throw new Error('Missing workbench surface area')

  return area
}

function railElement() {
  const rail = document.querySelector<HTMLElement>('[data-workbench-rail]')
  if (!rail) throw new Error('Missing workbench rail')

  return rail
}

function resizeOverlay() {
  const overlay = document.querySelector<HTMLElement>('[data-workbench-resize-overlay]')
  if (!overlay) throw new Error('Missing resize overlay')

  return overlay
}

function firstColumnResizeHandle() {
  const handle = document.querySelector<HTMLElement>('[aria-label="Resize columns"]')
  if (!handle) throw new Error('Missing resize handle')

  return handle
}

function firstTab() {
  const tab = document.querySelector<HTMLElement>('[role="tab"]')
  if (!tab) throw new Error('Missing workbench tab')

  return tab
}

function buttonWithLabel(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.getAttribute('aria-label') === label,
  )
  if (!button) throw new Error(`Missing button ${label}`)

  return button
}

function editorChromeTabs() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-editor-tab-id]'))
}

function resizePointerEvent(type: string, clientX: number, clientY: number) {
  return new PointerEvent(type, {
    bubbles: true,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX,
    clientY,
    pointerId: 1,
  })
}

function editorSurfaceLayout() {
  const fileA = editorSurface(FILE_A_PATH, 'tab-a')
  const fileB = editorSurface(FILE_B_PATH, 'tab-b')

  return openSurface(openSurface(createEmptyWorkspaceLayout(), fileA), fileB)
}

function editorSurface(path: string, tabId: string): Surface {
  return {
    ...createFileEditorSurface({ path }),
    serializedState: {
      editorPaneId: 'pane-editor',
      editorTabId: tabId,
    },
  }
}

function surfaceIdForEditorTabId(tabId: string) {
  const surface = Object.values(editorSurfaceLayout().surfacesById).find(
    (surface) => editorSurfaceSerializedState(surface)?.editorTabId === tabId,
  )

  return surface?.id ?? null
}

function tabModelForSurface(surface: Surface, active: boolean) {
  const state = editorSurfaceSerializedState(surface)
  if (!state) return null
  if (!surface.resourceKey) return null

  return editorTabModel({
    conflicts: {},
    gitFiles: EMPTY_GIT_FILES,
    rootPath: TEST_ROOT_PATH,
    selectedTabId: active ? state.editorTabId : null,
    tab: {
      id: state.editorTabId,
      path: surface.resourceKey,
    },
  })
}

async function waitForFileServer() {
  await vi.waitFor(async () => {
    const response = await fetch(`${serverUrl}/fs/read?path=${encodeURIComponent(FILE_A_PATH)}`)

    expect(response.ok).toBe(true)
  })
}
