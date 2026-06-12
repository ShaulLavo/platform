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
  createPlaceholderSurface,
} from '@workspace/tiling/utils/layout-builders'
import { openSurface } from '@workspace/tiling/utils/layout-operations'
import { visibleWindowIdsInOrder } from '@workspace/tiling/utils/layout-normalize'
import { createWorkspaceLayoutStore } from '@/features/tiling-surface-manager/engine/surface-state'
import { LayoutProvider } from '@/features/workbench/providers/layout-provider'
import { LayoutRenderer } from '@/features/workbench/components/layout-renderer'
import { editorSurfaceSerializedState } from '@/features/workbench/utils/editor-surface-layout'
import { EditorSurfaceProvider } from '@/features/workbench/providers/editor-surface-provider'
import { editorSurfaceRendererRegistry } from '@/features/workbench/utils/editor-surface-renderers'
import type {
  Surface,
  SurfaceId,
  WindowId,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

const THEME_STORAGE_KEY = 'platform-workbench-layout-renderer-browser-theme'
const TEST_ROOT_PATH = 'repo'
const FILE_A_PATH = `${TEST_ROOT_PATH}/src/editor-tab-a.ts`
const FILE_B_PATH = `${TEST_ROOT_PATH}/src/editor-tab-b.ts`

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
  currentDragPoint = null
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

  it('keeps the workbench framed at mobile width', async () => {
    renderClassicLayout({ height: 720, width: 390 })

    await vi.waitFor(() => {
      expect(windowRegions()).toHaveLength(3)
      expect(surfaceArea().getBoundingClientRect().width).toBeGreaterThan(300)
      expect(railElement().getBoundingClientRect().width).toBeGreaterThan(30)
    })

    const surfaceRect = surfaceArea().getBoundingClientRect()
    for (const rect of windowRects()) {
      expect(rect.width).toBeGreaterThan(0)
      expect(rect.height).toBeGreaterThan(0)
      expect(rect.x).toBeGreaterThanOrEqual(surfaceRect.x)
      expect(rect.x + rect.width).toBeLessThanOrEqual(surfaceRect.x + surfaceRect.width + 1)
    }
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
    await vi.waitFor(() => {
      expect(windowRects()).not.toEqual(initialRects)
    })

    const movedHandleRect = firstColumnResizeHandle().getBoundingClientRect()
    const movedHandleX = movedHandleRect.left + movedHandleRect.width / 2
    expect(Math.abs(movedHandleX - (startX + 80))).toBeLessThanOrEqual(1)

    handle.dispatchEvent(resizePointerEvent('pointerup', startX + 80, pointerY))
  })

  it('toggles rail panes while another rail pane is open', async () => {
    renderClassicLayout()

    await vi.waitFor(() => {
      expect(buttonWithLabel('Restore Chat')).not.toBeNull()
    })

    buttonWithLabel('Restore Chat').click()

    await vi.waitFor(() => {
      expect(buttonWithLabel('Close Chat').dataset.railState).toBe('active')
    })

    buttonWithLabel('Restore Logs').click()

    await vi.waitFor(() => {
      expect(buttonWithLabel('Close Logs').dataset.railState).toBe('active')
      expect(buttonWithLabel('Close Chat').dataset.railState).toBe('visible')
      expect(windowRegions()).toHaveLength(5)
    })

    buttonWithLabel('Close Chat').click()

    await vi.waitFor(() => {
      expect(buttonWithLabel('Open Chat').dataset.railState).toBe('pinned')
      expect(buttonWithLabel('Close Logs').dataset.railState).toBe('active')
      expect(windowRegions()).toHaveLength(4)
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
      expect(document.body.textContent).toContain('editor-tab-a.ts')
      expect(document.body.textContent).toContain('editor-tab-b.ts')
    })

    expect(editorChromeTabButton('tab-b')).toHaveAttribute('aria-selected', 'true')

    editorChromeTab('tab-a').click()

    await vi.waitFor(() => {
      expect(editorChromeTabButton('tab-a')).toHaveAttribute('aria-selected', 'true')
    })

    await vi.waitFor(() => {
      const fileSnapshots = queryClient
        .getQueryCache()
        .findAll({ queryKey: fileSystemKeys.fileSnapshots() })

      expect(queryClient.isFetching({ queryKey: fileSystemKeys.fileSnapshots() })).toBe(0)
      expect(fileSnapshots.some((query) => query.state.status === 'success')).toBe(true)
    })

    const tabBPoint = centerOf(editorChromeTab('tab-b'))

    startPointerDrag(editorChromeTab('tab-a'))
    movePointerBy(8, 0)
    await nextFrame()
    movePointerTo({ x: tabBPoint.x + 24, y: tabBPoint.y }, editorChromeTab('tab-b'))
    await nextFrame()
    finishPointerDrag({ x: tabBPoint.x + 24, y: tabBPoint.y })

    await vi.waitFor(() => {
      expect(editorChromeTabIds().indexOf('tab-a')).toBeGreaterThan(0)
    })

    editorChromeTab('tab-b').click()

    await vi.waitFor(() => {
      expect(editorChromeTabButton('tab-b')).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('holds editor tab widths immediately after a direct workbench tab close', async () => {
    const container = document.createElement('main')
    const queryClient = new QueryClient()
    const layoutStore = createWorkspaceLayoutStore(editorSurfaceLayout(), {
      checkInvariants: false,
    })
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
                      requestCloseTab={(tabId) => closeEditorSurfaceTab(layoutStore, tabId)}
                      requestCloseTabs={() => true}
                      rootPath={TEST_ROOT_PATH}
                      surfaceIdForEditorTabId={(tabId) => surfaceIdForEditorTabId(tabId)}
                      tabModelForSurface={(surface, active) => tabModelForSurface(surface, active)}
                    >
                      <LayoutProvider store={layoutStore}>
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
      expect(editorChromeTabWidths().every((width) => width > 0)).toBe(true)
    })

    const beforeWidths = editorChromeTabWidthsById()
    closeEditorSurfaceTab(layoutStore, 'tab-b')
    await nextFrame()

    const afterWidths = editorChromeTabWidthsById()
    expect(editorChromeTabs()).toHaveLength(2)
    expect(editorChromeTab('tab-b')).toHaveAttribute('data-editor-tab-phase', 'closing')
    expect(editorChromeTab('tab-b').style.width).toBe('18px')
    expect(widthDelta(afterWidths, beforeWidths, 'tab-a')).toBeLessThanOrEqual(1)
  })

  it('previews normal tab reordering before pointer release', async () => {
    const { store, surfaces } = renderGenericTabbedLayout()

    await waitForWorkbenchTabs(surfaces)

    const beforeLayout = store.getState().layout
    const beforeTabIds = workbenchTabIds()
    const sourceId = activeWindowSurfaceIds(store)[0]
    const targetId = activeWindowSurfaceIds(store).at(-1)
    if (!sourceId) throw new Error('Missing source tab id')
    if (!targetId) throw new Error('Missing target tab id')

    const sourceTab = workbenchTab(sourceId)
    const targetTab = workbenchTab(targetId)
    const targetPoint = centerOf(targetTab)

    startPointerDrag(sourceTab)
    movePointerBy(8, 0)
    await nextFrame()
    movePointerTo({ x: targetPoint.x + 24, y: targetPoint.y }, targetTab)
    await nextFrame()

    expect(store.getState().layout).toBe(beforeLayout)
    await vi.waitFor(() => {
      expect(workbenchTabIds()).not.toEqual(beforeTabIds)
      expect(workbenchTabIds().indexOf(sourceId)).toBeGreaterThan(0)
    })
    expectWorkbenchTabInsideStrip(sourceId)

    finishPointerDrag({ x: targetPoint.x + 24, y: targetPoint.y })
  })

  it('moves an attached tab with the pointer before reordering', async () => {
    const { store, surfaces } = renderGenericTabbedLayout()

    await waitForWorkbenchTabs(surfaces)

    const beforeLayout = store.getState().layout
    const beforeTabIds = workbenchTabIds()
    const sourceId = activeWindowSurfaceIds(store)[0]
    if (!sourceId) throw new Error('Missing source tab id')

    const sourceTab = workbenchTab(sourceId)
    const sourceCenter = centerOf(sourceTab)
    const beforeRect = sourceTab.getBoundingClientRect()

    expect(sourceTab.style.transition).toContain('flex-basis')

    startPointerDrag(sourceTab)
    movePointerBy(8, 0)
    await nextFrame()
    movePointerTo({ x: sourceCenter.x + 48, y: sourceCenter.y + 4 })
    await nextFrame()

    const movedTab = workbenchTab(sourceId)
    const movedRect = movedTab.getBoundingClientRect()
    expect(store.getState().layout).toBe(beforeLayout)
    expect(workbenchTabIds()).toEqual(beforeTabIds)
    expect(movedTab.style.transform).toContain('translate3d')
    expect(movedTab.style.transition).toBe('none')
    expect(movedRect.left).toBeGreaterThan(beforeRect.left + 8)
    expectWorkbenchTabInsideStrip(sourceId)

    finishPointerDrag()
    await nextFrame()

    expect(workbenchTab(sourceId).style.transition).toContain('flex-basis')
  })

  it('commits normal tab reorder on pointer release', async () => {
    const { store, surfaces } = renderGenericTabbedLayout()

    await waitForWorkbenchTabs(surfaces)

    const sourceId = activeWindowSurfaceIds(store)[0]
    const targetId = activeWindowSurfaceIds(store).at(-1)
    if (!sourceId) throw new Error('Missing source tab id')
    if (!targetId) throw new Error('Missing target tab id')

    const sourceTab = workbenchTab(sourceId)
    const targetTab = workbenchTab(targetId)
    const targetPoint = centerOf(targetTab)
    const beforeIds = activeWindowSurfaceIds(store)

    startPointerDrag(sourceTab)
    movePointerBy(8, 0)
    await nextFrame()
    movePointerTo({ x: targetPoint.x + 24, y: targetPoint.y }, targetTab)
    await nextFrame()
    finishPointerDrag({ x: targetPoint.x + 24, y: targetPoint.y })

    await vi.waitFor(() => {
      const reorderedIds = activeWindowSurfaceIds(store)
      expect(reorderedIds.indexOf(sourceId)).toBeGreaterThan(0)
      expect(new Set(reorderedIds)).toEqual(new Set(beforeIds))
    })
  })

  it('keeps a tab attached below the detach threshold', async () => {
    const { store, surfaces } = renderGenericTabbedLayout()

    await waitForWorkbenchTabs(surfaces)

    const tab = workbenchTab(surfaces[0].id)
    const startWindowId = windowIdForSurface(store.getState().layout, surfaces[0].id)
    const beforeWindowIds = visibleWindowIdsInOrder(store.getState().layout)
    const tabCenter = centerOf(tab)

    dragPointerTo(tab, { x: tabCenter.x + 4, y: tabCenter.y + 12 })

    await nextFrame()

    expect(windowIdForSurface(store.getState().layout, surfaces[0].id)).toBe(startWindowId)
    expect(visibleWindowIdsInOrder(store.getState().layout)).toEqual(beforeWindowIds)
  })

  it('keeps an attached tab inside its strip while dragging below detach threshold', async () => {
    const { surfaces } = renderGenericTabbedLayout()

    await waitForWorkbenchTabs(surfaces)

    const tab = workbenchTab(surfaces[0].id)
    const tabCenter = centerOf(tab)

    startPointerDrag(tab)
    movePointerBy(8, 0)
    await nextFrame()
    movePointerTo({ x: tabCenter.x + 120, y: tabCenter.y + 12 })
    await nextFrame()

    expectWorkbenchTabInsideStrip(surfaces[0].id)

    finishPointerDrag()
  })

  it('previews detached tab snapping and commits only on release', async () => {
    const { store, surfaces } = renderGenericTabbedLayout()

    await waitForWorkbenchTabs(surfaces)

    const tab = workbenchTab(surfaces[0].id)
    const beforeLayout = store.getState().layout
    const beforeRects = windowRects()
    const startWindowId = windowIdForSurface(beforeLayout, surfaces[0].id)
    const snapPoint = rootRightSnapPoint()

    startPointerDrag(tab)
    movePointerBy(8, 0)
    await nextFrame()
    movePointerTo(snapPoint)

    await vi.waitFor(() => {
      expect(windowRects()).not.toEqual(beforeRects)
    })

    expect(store.getState().layout).toBe(beforeLayout)

    finishPointerDrag(snapPoint)

    await vi.waitFor(() => {
      expect(store.getState().layout).not.toBe(beforeLayout)
      expect(windowIdForSurface(store.getState().layout, surfaces[0].id)).not.toBe(startWindowId)
    })
  })

  it('keeps bottom pane special tabs constrained by tab capabilities', async () => {
    const store = renderClassicLayoutWithStore()

    await vi.waitFor(() => {
      expect(workbenchTabForRole('Terminal')).not.toBeNull()
    })
    await nextFrame()

    const terminalTab = workbenchTabForRole('Terminal')
    const beforeWindowIds = visibleWindowIdsInOrder(store.getState().layout)
    const beforeBottomPaneIds = bottomPaneSurfaceIds(store.getState().layout)

    dragPointerTo(terminalTab, rootRightSnapPoint())
    await nextFrame()

    expect(terminalTab).not.toHaveAttribute('data-workbench-tab-dragging', 'true')
    expect(visibleWindowIdsInOrder(store.getState().layout)).toEqual(beforeWindowIds)
    expect(bottomPaneSurfaceIds(store.getState().layout)).toEqual(beforeBottomPaneIds)
  })

  it('previews window snapping and commits only on release', async () => {
    const store = renderClassicLayoutWithStore()

    await vi.waitFor(() => {
      expect(windowRegions()).toHaveLength(3)
    })
    await nextFrame()

    const beforeLayout = store.getState().layout
    const beforeRects = windowRects()
    const header = workbenchWindowHeader(activeWindowId(store.getState().layout))
    const snapPoint = rootRightSnapPoint()

    startPointerDrag(header)
    movePointerBy(8, 0)
    await nextFrame()
    movePointerTo(snapPoint)

    await vi.waitFor(() => {
      expect(windowRects()).not.toEqual(beforeRects)
    })

    expect(store.getState().layout).toBe(beforeLayout)

    finishPointerDrag(snapPoint)

    await vi.waitFor(() => {
      expect(store.getState().layout).not.toBe(beforeLayout)
    })
  })

  it('keeps a window drag active while crossing resize handles', async () => {
    const store = renderClassicLayoutWithStore()

    await vi.waitFor(() => {
      expect(firstColumnResizeHandle()).not.toBeNull()
    })
    await nextFrame()

    const beforeLayout = store.getState().layout
    const header = workbenchWindowHeader(activeWindowId(beforeLayout))
    const handleCenter = centerOf(firstColumnResizeHandle())
    const snapPoint = rootRightSnapPoint()

    startPointerDrag(header)
    movePointerBy(8, 0)
    await nextFrame()
    movePointerTo(handleCenter, firstColumnResizeHandle())
    await nextFrame()
    movePointerTo(snapPoint)
    finishPointerDrag(snapPoint)

    await vi.waitFor(() => {
      expect(store.getState().layout).not.toBe(beforeLayout)
    })
  })
})

function renderClassicLayout({
  height = 620,
  width = 920,
}: {
  readonly height?: number
  readonly width?: number
} = {}) {
  renderWorkbenchLayout(createClassicFirstRunWorkspaceLayout(), { height, width })
}

function renderClassicLayoutWithStore(options: RenderWorkbenchLayoutOptions = {}) {
  return renderWorkbenchLayout(createClassicFirstRunWorkspaceLayout(), options)
}

function renderGenericTabbedLayout(options: RenderWorkbenchLayoutOptions = {}) {
  const surfaces = [
    createPlaceholderSurface({
      canClose: true,
      contextKey: 'generic-tab-a',
      title: 'Surface A',
    }),
    createPlaceholderSurface({
      canClose: true,
      contextKey: 'generic-tab-b',
      title: 'Surface B',
    }),
    createPlaceholderSurface({
      canClose: true,
      contextKey: 'generic-tab-c',
      title: 'Surface C',
    }),
  ]
  const layout = surfaces.reduce<WorkspaceLayout>(
    (currentLayout, surface) => openSurface(currentLayout, surface),
    createEmptyWorkspaceLayout(),
  )

  return {
    store: renderWorkbenchLayout(layout, options),
    surfaces,
  }
}

type RenderWorkbenchLayoutOptions = {
  readonly height?: number
  readonly width?: number
}

function renderWorkbenchLayout(
  layout: WorkspaceLayout,
  { height = 620, width = 920 }: RenderWorkbenchLayoutOptions = {},
) {
  const container = document.createElement('main')
  const store = createWorkspaceLayoutStore(layout, { checkInvariants: false })
  container.style.height = `${height}px`
  container.style.left = '0'
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.width = `${width}px`
  document.body.append(container)
  root = createRoot(container)

  flushSync(() => {
    root?.render(
      <ThemeProvider defaultTheme='dark' storageKey={THEME_STORAGE_KEY}>
        <EditorColorThemeProvider>
          <TooltipProvider delay={0}>
            <FocusProvider>
              <LayoutProvider store={store}>
                <LayoutRenderer />
              </LayoutProvider>
            </FocusProvider>
          </TooltipProvider>
        </EditorColorThemeProvider>
      </ThemeProvider>,
    )
  })

  return store
}

function windowRegions() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-window-id]'))
}

function workbenchWindow(windowId: WindowId) {
  const windowElement = document.querySelector<HTMLElement>(`[data-window-id="${windowId}"]`)
  if (!windowElement) throw new Error(`Missing workbench window ${windowId}`)

  return windowElement
}

function workbenchWindowHeader(windowId: WindowId) {
  const header = workbenchWindow(windowId).querySelector<HTMLElement>(
    '[data-workbench-window-drag-handle]',
  )
  if (!header) throw new Error(`Missing workbench window header ${windowId}`)

  return header
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

function workbenchTab(surfaceId: SurfaceId) {
  const tab = document.querySelector<HTMLElement>(`[data-workbench-tab-id="${surfaceId}"]`)
  if (!tab) throw new Error(`Missing workbench tab ${surfaceId}`)

  return tab
}

function workbenchTabIds() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-workbench-tab-id]')).map(
    (tab) => tab.dataset.workbenchTabId ?? '',
  )
}

function expectWorkbenchTabInsideStrip(surfaceId: SurfaceId) {
  const tab = workbenchTab(surfaceId)
  const strip = tab.closest<HTMLElement>('[data-workbench-tab-strip-id]')
  if (!strip) throw new Error(`Missing tab strip for ${surfaceId}`)

  const tabRect = tab.getBoundingClientRect()
  const stripRect = strip.getBoundingClientRect()

  expect(tabRect.top).toBeGreaterThanOrEqual(stripRect.top - 1)
  expect(tabRect.bottom).toBeLessThanOrEqual(stripRect.bottom + 1)
}

function workbenchTabForRole(name: string) {
  const tabButton = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]')).find(
    (candidate) => candidate.textContent?.trim() === name,
  )
  if (!tabButton) throw new Error(`Missing tab ${name}`)

  const tab = tabButton.closest<HTMLElement>('[data-workbench-tab-id]')
  if (!tab) throw new Error(`Missing workbench tab root ${name}`)

  return tab
}

async function waitForWorkbenchTabs(surfaces: readonly Surface[]) {
  await vi.waitFor(() => {
    expect(surfaces.map((surface) => workbenchTab(surface.id))).toHaveLength(surfaces.length)
  })
  await nextFrame()
}

function buttonWithLabel(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.getAttribute('aria-label') === label,
  )
  if (!button) throw new Error(`Missing button ${label}`)

  return button
}

function activeWindowId(layout: WorkspaceLayout) {
  if (!layout.activeWindowId) throw new Error('Missing active window')

  return layout.activeWindowId
}

function activeWindowSurfaceIds(store: ReturnType<typeof createWorkspaceLayoutStore>) {
  const layout = store.getState().layout
  const window = layout.windowsById[activeWindowId(layout)]
  if (!window) throw new Error('Missing active window state')

  return window.surfaceIds
}

function windowIdForSurface(layout: WorkspaceLayout, surfaceId: SurfaceId) {
  const window = Object.values(layout.windowsById).find((candidate) =>
    candidate.surfaceIds.includes(surfaceId),
  )
  if (!window) throw new Error(`Missing window for surface ${surfaceId}`)

  return window.id
}

function bottomPaneSurfaceIds(layout: WorkspaceLayout) {
  const window = Object.values(layout.windowsById).find((candidate) =>
    candidate.surfaceIds.some((surfaceId) => {
      const title = layout.surfacesById[surfaceId]?.title
      return title === 'Terminal' || title === 'Problems'
    }),
  )
  if (!window) throw new Error('Missing bottom pane window')

  return window.surfaceIds
}

function editorChromeTabs() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-editor-tab-id]'))
}

function editorChromeTabIds() {
  return editorChromeTabs().map((tab) => tab.dataset.editorTabId ?? '')
}

function editorChromeTab(tabId: string) {
  const tab = document.querySelector<HTMLElement>(`[data-editor-tab-id="${tabId}"]`)
  if (!tab) throw new Error(`Missing editor tab ${tabId}`)

  return tab
}

function editorChromeTabButton(tabId: string) {
  const button = editorChromeTab(tabId).querySelector<HTMLElement>('[role="tab"]')
  if (!button) throw new Error(`Missing editor tab button ${tabId}`)

  return button
}

function editorChromeTabWidths() {
  return editorChromeTabs().map((tab) => tab.getBoundingClientRect().width)
}

function editorChromeTabWidthsById() {
  return new Map(editorChromeTabs().map((tab) => [tab.dataset.editorTabId ?? '', tab.offsetWidth]))
}

function widthDelta(
  current: ReadonlyMap<string, number>,
  previous: ReadonlyMap<string, number>,
  id: string,
) {
  return Math.abs((current.get(id) ?? 0) - (previous.get(id) ?? 0))
}

function closeEditorSurfaceTab(
  layoutStore: ReturnType<typeof createWorkspaceLayoutStore>,
  tabId: string,
) {
  const surfaceId = surfaceIdForEditorTabId(tabId)
  if (!surfaceId) return false

  layoutStore.getState().dispatchLayoutOperation({ surfaceId, type: 'closeSurface' })
  return true
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

type PointerPoint = {
  readonly x: number
  readonly y: number
}

let currentDragPoint: PointerPoint | null = null

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

function rootRightSnapPoint(): PointerPoint {
  const rects = windowRegions().map((windowElement) => windowElement.getBoundingClientRect())
  const right = Math.max(...rects.map((rect) => rect.right))
  const top = Math.min(...rects.map((rect) => rect.top))
  const bottom = Math.max(...rects.map((rect) => rect.bottom))

  return {
    x: right - 12,
    y: top + (bottom - top) / 2,
  }
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
      editorGroupId: 'group-editor',
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
