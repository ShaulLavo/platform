import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createEvent, fireEvent, render, screen } from '@testing-library/react'

import { TooltipProvider } from '@workspace/ui/components/tooltip'

import { createGitStore } from '@/features/git/state'
import { ThemeProviderContext } from '@/components/theme-context'
import { FocusContext, createFocusStore } from '@/components/workspace/focus/providers/focus-state'

import {
  EDITOR_TAB_DRAG_KIND,
  EDITOR_TAB_DRAG_MIME,
  EDITOR_TAB_POINTER_DRAG_EVENT,
  EDITOR_TAB_POINTER_DROP_EVENT,
} from '@/components/workspace/editor-tabs/hooks/use-editor-tab-drag'
import {
  WORKBENCH_WINDOW_POINTER_DRAG_EVENT,
  WORKBENCH_WINDOW_POINTER_DROP_EVENT,
  dispatchWorkbenchWindowPointerDragEvent,
} from '@/features/workbench/utils/window-drag-events'
import {
  CLASSIC_DIAGNOSTICS_WINDOW_ID,
  createClassicFirstRunWorkspaceLayout,
  createChatSurface,
  createDiagnosticsSurface,
  createEmptyWorkspaceLayout,
  createFileEditorSurface,
  createPlaceholderSurface,
  createLogsSurface,
  createSearchPreviewSurface,
  createSearchResultsSurface,
  createTerminalSurface,
} from '@/features/tiling-surface-manager/engine/layout-builders'
import {
  closeSurface,
  moveSurface,
  openSurface,
} from '@/features/tiling-surface-manager/engine/layout-operations'
import { LayoutProvider } from '@/features/workbench/providers/layout-provider'
import {
  LayoutRenderer,
  surfaceAreaLayoutEqual,
} from '@/features/workbench/components/layout-renderer'
import type { WorkspaceLayout } from '@/features/tiling-surface-manager/engine/layout-types'
import { SnappedDragController } from '@/features/workbench/components/snapped-drag-controller'
import { EditorSurfaceProvider } from '@/features/workbench/providers/editor-surface-provider'
import { editorSurfaceRendererRegistry } from '@/features/workbench/utils/editor-surface-renderers'
import {
  createSurfaceRendererRegistry,
  type SurfaceRenderer,
} from '@/features/workbench/utils/surface-renderer-registry'
import { ResizeOverlay } from '@/features/workbench/components/resize-overlay'
import {
  layoutNodeId,
  overlayId,
  workbenchWindowId,
} from '@/features/tiling-surface-manager/engine/layout-ids'
import type { LayoutOperation } from '@/features/tiling-surface-manager/engine/layout-types'
import { createWorkspaceLayoutStore } from '@/features/tiling-surface-manager/engine/surface-state'
import {
  findNodeIdForWindow,
  visibleSurfaceIdsInOrder,
} from '@/features/tiling-surface-manager/engine/layout-normalize'

describe('LayoutRenderer', () => {
  it('renders an empty layout state', () => {
    const html = renderLayout(createEmptyWorkspaceLayout())

    expect(html).toContain('data-workbench-layout-renderer')
    expect(html).toContain('No surfaces')
  })

  it('renders one window from the layout model', () => {
    const file = createFileEditorSurface({ path: '/repo/src/app.ts' })
    const layout = openSurface(createEmptyWorkspaceLayout(), file)
    const html = renderLayout(layout)

    expect(html).toContain('data-window-id=')
    expect(html).toContain('app.ts')
    expect(html).toContain('data-surface-renderer="fixture"')
  })

  it('collapses a window without removing its surface from the layout', () => {
    const file = createFileEditorSurface({ path: '/repo/src/app.ts' })
    const layout = openSurface(createEmptyWorkspaceLayout(), file)
    const store = renderInteractiveLayout(layout)

    fireEvent.click(screen.getByLabelText('Collapse app.ts'))

    const collapsedLayout = store.getState().layout
    const activeWindowId = collapsedLayout.activeWindowId

    expect(activeWindowId).toBeDefined()
    expect(activeWindowId ? collapsedLayout.windowsById[activeWindowId]?.mode : undefined).toBe(
      'collapsed',
    )
    expect(visibleSurfaceIdsInOrder(collapsedLayout)).toContain(file.id)
    expect(screen.getByLabelText('Expand app.ts')).toBeInTheDocument()
  })

  it('renders split windows and resize handles without target chrome', () => {
    const html = renderLayout(createClassicFirstRunWorkspaceLayout())

    expect(matchCount(html, 'data-window-id=')).toBeGreaterThanOrEqual(3)
    expect(html).toContain('data-workbench-wallpaper')
    expect(html).toContain('data-workbench-resize-overlay')
    expect(html).not.toContain('data-workbench-drop-overlay')
    expect(html).not.toContain('data-drop-zone-id')
    expect(html).toContain('pointer-events-none absolute inset-0 z-30')
    expect(html).toContain('pointer-events-auto absolute')
  })

  it('renders multiple tabs in a window', () => {
    const fileA = createFileEditorSurface({ path: '/repo/src/a.ts' })
    const fileB = createFileEditorSurface({ path: '/repo/src/b.ts' })
    const layout = openSurface(openSurface(createClassicFirstRunWorkspaceLayout(), fileA), fileB)
    const html = renderLayout(layout)

    expect(html).toContain('data-surface-tab-id')
    expect(html).toContain('a.ts')
    expect(html).toContain('b.ts')
    expect(html).toContain('Close b.ts tab')
  })

  it('renders background surfaces in the rail', () => {
    const file = createFileEditorSurface({ path: '/repo/src/backgrounded.ts' })
    const opened = openSurface(createEmptyWorkspaceLayout(), file)
    const layout = backgroundSurface(opened, file.id)
    const html = renderLayout(layout)

    expect(html).toContain('data-workbench-rail')
    expect(html).toContain('data-rail-state="background"')
    expect(html).toContain('Restore backgrounded.ts')
    expect(html).not.toContain('absolute top-3 right-3')
  })

  it('renders current default rail entries', () => {
    const html = renderLayout(createEmptyWorkspaceLayout())

    expect(html).toContain('Focus Files')
    expect(html).toContain('Focus Chat')
    expect(html).toContain('Focus Logs')
    expect(html).toContain('Focus Terminal')
    expect(html).not.toContain('Classic recipe active')
    expect(html).not.toContain('data-rail-recipe-id=')
  })

  it('previews pointer drag resize operations locally and commits on release', async () => {
    const operations: LayoutOperation[] = []

    render(
      <ResizeOverlay
        resizeHandleRects={[
          {
            axis: 'horizontal',
            handleIndex: 0,
            id: overlayId('resize:test:0'),
            rect: { height: 720, width: 8, x: 400, y: 0 },
            splitId: layoutNodeId('split-test'),
          },
        ]}
        onDispatch={(operation) => operations.push(operation)}
      />,
    )

    const handle = screen.getByRole('separator', { name: 'Resize columns' })
    fireEvent.pointerDown(handle, { button: 0, clientX: 400, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(handle, { buttons: 1, clientX: 432, clientY: 10, pointerId: 1 })

    expect(operations).toEqual([])

    await act(async () => {
      await nextAnimationFrame()
    })

    expect(handle).toHaveStyle({ transform: 'translate3d(32px, 0, 0)' })

    fireEvent.pointerUp(handle, { clientX: 432, clientY: 10, pointerId: 1 })

    expect(operations).toEqual([
      {
        deltaPx: 32,
        handleIndex: 0,
        splitId: layoutNodeId('split-test'),
        type: 'resizeSplit',
      },
    ])
    expect(handle).not.toHaveStyle({ transform: 'translate3d(32px, 0, 0)' })
  })

  it('dispatches snapped move operations from document editor tab drags without rendering targets', () => {
    const file = createFileEditorSurface({ path: '/repo/src/app.ts' })
    const operations: LayoutOperation[] = []
    const previews: (LayoutOperation | null)[] = []
    const destination = {
      edge: 'right' as const,
      kind: 'window-edge' as const,
      windowId: workbenchWindowId('target'),
    }

    render(
      <SnappedDragController
        snapDestinationRects={[
          {
            destination,
            edge: 'right',
            id: overlayId('snap:test:right'),
            kind: 'window-edge',
            rect: { height: 240, width: 160, x: 480, y: 0 },
            windowId: destination.windowId,
          },
        ]}
        surfaceIdForEditorTabId={(tabId) => (tabId === 'tab-app' ? file.id : null)}
        onDispatch={(operation) => operations.push(operation)}
        onPreview={(operation) => previews.push(operation)}
      />,
    )

    const dataTransfer = editorTabDataTransfer({ path: '/repo/src/app.ts', tabId: 'tab-app' })

    expect(screen.queryByRole('button')).toBeNull()

    const dragOver = fireDocumentEditorTabDragEvent('dragover', dataTransfer, {
      clientX: 500,
      clientY: 12,
    })
    expect(dataTransfer.dropEffect).toBe('move')
    expect(dragOver.defaultPrevented).toBe(true)
    expect(lastItem(previews)).toEqual({
      destination,
      surfaceId: file.id,
      type: 'moveSurface',
    })

    fireDocumentEditorTabDragEvent('drop', dataTransfer, { clientX: 500, clientY: 12 })

    expect(operations).toEqual([
      {
        destination,
        surfaceId: file.id,
        type: 'moveSurface',
      },
    ])
    expect(lastItem(previews)).toBeNull()
  })

  it('dispatches snapped move operations from detached pointer tab drags', () => {
    const file = createFileEditorSurface({ path: '/repo/src/app.ts' })
    const operations: LayoutOperation[] = []
    const previews: (LayoutOperation | null)[] = []
    const destination = {
      edge: 'right' as const,
      kind: 'window-edge' as const,
      windowId: workbenchWindowId('target'),
    }

    render(
      <SnappedDragController
        snapDestinationRects={[
          {
            destination,
            edge: 'right',
            id: overlayId('snap:test:right'),
            kind: 'window-edge',
            rect: { height: 240, width: 160, x: 480, y: 0 },
            windowId: destination.windowId,
          },
        ]}
        surfaceIdForEditorTabId={(tabId) => (tabId === 'tab-app' ? file.id : null)}
        onDispatch={(operation) => operations.push(operation)}
        onPreview={(operation) => previews.push(operation)}
      />,
    )

    expect(screen.queryByRole('button')).toBeNull()

    act(() => {
      dispatchEditorTabPointerDragEvent(EDITOR_TAB_POINTER_DRAG_EVENT, {
        clientX: 500,
        clientY: 12,
        detached: true,
        detachProgress: 1,
        paneId: 'pane-a',
        path: '/repo/src/app.ts',
        tabId: 'tab-app',
      })
    })

    expect(operations).toEqual([])
    expect(lastItem(previews)).toEqual({
      destination,
      surfaceId: file.id,
      type: 'moveSurface',
    })

    act(() => {
      dispatchEditorTabPointerDragEvent(EDITOR_TAB_POINTER_DROP_EVENT, {
        clientX: 500,
        clientY: 12,
        detached: true,
        detachProgress: 1,
        paneId: 'pane-a',
        path: '/repo/src/app.ts',
        tabId: 'tab-app',
      })
    })

    expect(operations).toEqual([
      {
        destination,
        surfaceId: file.id,
        type: 'moveSurface',
      },
    ])
    expect(lastItem(previews)).toBeNull()
  })

  it('dispatches snapped move operations from pointer window drags', () => {
    const operations: LayoutOperation[] = []
    const previews: (LayoutOperation | null)[] = []
    const sourceWindowId = workbenchWindowId('source')
    const destination = {
      edge: 'right' as const,
      kind: 'window-edge' as const,
      windowId: workbenchWindowId('target'),
    }

    render(
      <SnappedDragController
        snapDestinationRects={[
          {
            destination,
            edge: 'right',
            id: overlayId('snap:test:right'),
            kind: 'window-edge',
            rect: { height: 240, width: 160, x: 480, y: 0 },
            windowId: destination.windowId,
          },
        ]}
        onDispatch={(operation) => operations.push(operation)}
        onPreview={(operation) => previews.push(operation)}
      />,
    )

    expect(screen.queryByRole('button')).toBeNull()

    act(() => {
      dispatchWorkbenchWindowPointerDragEvent(WORKBENCH_WINDOW_POINTER_DRAG_EVENT, {
        clientX: 500,
        clientY: 12,
        windowId: sourceWindowId,
      })
    })

    expect(operations).toEqual([])
    expect(lastItem(previews)).toEqual({
      destination,
      type: 'moveWindow',
      windowId: sourceWindowId,
    })

    act(() => {
      dispatchWorkbenchWindowPointerDragEvent(WORKBENCH_WINDOW_POINTER_DROP_EVENT, {
        clientX: 500,
        clientY: 12,
        windowId: sourceWindowId,
      })
    })

    expect(operations).toEqual([
      {
        destination,
        type: 'moveWindow',
        windowId: sourceWindowId,
      },
    ])
    expect(lastItem(previews)).toBeNull()
  })

  it('ignores editor tab drops that cannot resolve to a surface', () => {
    const operations: LayoutOperation[] = []

    render(
      <SnappedDragController
        snapDestinationRects={[
          {
            destination: { kind: 'background' },
            id: overlayId('snap:test:background'),
            kind: 'background',
            rect: { height: 120, width: 120, x: 200, y: 160 },
          },
        ]}
        surfaceIdForEditorTabId={() => null}
        onDispatch={(operation) => operations.push(operation)}
      />,
    )

    fireDocumentEditorTabDragEvent(
      'drop',
      editorTabDataTransfer({ path: '/repo/src/missing.ts', tabId: 'tab-missing' }),
      { clientX: 220, clientY: 180 },
    )

    expect(operations).toEqual([])
  })

  it('stops pointer drag resize when hover moves no longer have the primary button down', () => {
    const operations: LayoutOperation[] = []

    render(
      <ResizeOverlay
        resizeHandleRects={[
          {
            axis: 'horizontal',
            handleIndex: 0,
            id: overlayId('resize:test:0'),
            rect: { height: 720, width: 8, x: 400, y: 0 },
            splitId: layoutNodeId('split-test'),
          },
        ]}
        onDispatch={(operation) => operations.push(operation)}
      />,
    )

    const handle = screen.getByRole('separator', { name: 'Resize columns' })
    fireEvent.pointerDown(handle, { button: 0, clientX: 400, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(handle, { buttons: 0, clientX: 432, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(handle, { buttons: 0, clientX: 464, clientY: 10, pointerId: 1 })

    expect(operations).toEqual([])
  })

  it('stops pointer drag resize when pointerup happens outside the handle', () => {
    const operations: LayoutOperation[] = []

    render(
      <ResizeOverlay
        resizeHandleRects={[
          {
            axis: 'horizontal',
            handleIndex: 0,
            id: overlayId('resize:test:0'),
            rect: { height: 720, width: 8, x: 400, y: 0 },
            splitId: layoutNodeId('split-test'),
          },
        ]}
        onDispatch={(operation) => operations.push(operation)}
      />,
    )

    const handle = screen.getByRole('separator', { name: 'Resize columns' })
    fireEvent.pointerDown(handle, { button: 0, clientX: 400, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(window, { clientX: 432, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(handle, { buttons: 1, clientX: 464, clientY: 10, pointerId: 1 })

    expect(operations).toEqual([])
  })

  it('collapses the terminal window from its window controls', () => {
    const store = renderInteractiveLayout(createClassicFirstRunWorkspaceLayout())

    fireEvent.click(screen.getAllByLabelText('Collapse Terminal')[1])

    expect(store.getState().layout.windowsById[CLASSIC_DIAGNOSTICS_WINDOW_ID].mode).toBe(
      'collapsed',
    )
  })

  it('closes the active terminal surface from its window close control', () => {
    const terminal = createTerminalSurface({ sessionId: 'terminal-1' })
    const diagnostics = createDiagnosticsSurface()
    const store = renderInteractiveLayout(createClassicFirstRunWorkspaceLayout())

    fireEvent.click(screen.getByLabelText('Close Terminal'))

    const layout = store.getState().layout
    expect(findNodeIdForWindow(layout, CLASSIC_DIAGNOSTICS_WINDOW_ID)).toEqual(expect.any(String))
    expect(layout.surfacesById[terminal.id]).toBeUndefined()
    expect(layout.surfacesById[diagnostics.id]).toBeDefined()
  })

  it('keeps bottom window tab close scoped to the active surface', () => {
    const terminal = createTerminalSurface({ sessionId: 'terminal-1' })
    const diagnostics = createDiagnosticsSurface()
    const store = renderInteractiveLayout(createClassicFirstRunWorkspaceLayout())

    expect(screen.getByLabelText('Close Problems tab')).toBeVisible()

    fireEvent.click(screen.getByLabelText('Close Terminal tab'))

    const layout = store.getState().layout
    expect(layout.surfacesById[terminal.id]).toBeUndefined()
    expect(layout.surfacesById[diagnostics.id]).toBeDefined()
    expect(visibleSurfaceIdsInOrder(layout)).toContain(diagnostics.id)
    expect(findNodeIdForWindow(layout, CLASSIC_DIAGNOSTICS_WINDOW_ID)).toEqual(expect.any(String))
  })

  it('activates rail panes when another rail pane is already open', () => {
    const chat = createChatSurface()
    const logs = createLogsSurface()
    const store = renderInteractiveLayout(createClassicFirstRunWorkspaceLayout())

    fireEvent.click(screen.getByLabelText('Restore Chat'))

    expect(store.getState().layout.activeSurfaceId).toBe(chat.id)
    expect(railButtonForSurface(chat.id)).toHaveAttribute('data-rail-state', 'active')

    fireEvent.click(screen.getByLabelText('Restore Logs'))

    expect(store.getState().layout.activeSurfaceId).toBe(logs.id)
    expect(railButtonForSurface(logs.id)).toHaveAttribute('data-rail-state', 'active')
    expect(railButtonForSurface(chat.id)).toHaveAttribute('data-rail-state', 'visible')

    fireEvent.click(railButtonForSurface(chat.id))

    expect(store.getState().layout.activeSurfaceId).toBe(chat.id)
    expect(visibleSurfaceIdsInOrder(store.getState().layout)).toContain(chat.id)
    expect(railButtonForSurface(chat.id)).toHaveAttribute('data-rail-state', 'active')
    expect(railButtonForSurface(logs.id)).toHaveAttribute('data-rail-state', 'visible')
  })

  it('does not let tool pane focus steal active editor selection', () => {
    const file = createFileEditorSurface({ path: '/repo/src/app.ts' })
    const store = renderInteractiveLayout(openSurface(createClassicFirstRunWorkspaceLayout(), file))

    const toolSurface = document.querySelector(
      '[data-surface-host][data-surface-type="file-navigator"]',
    )
    if (!(toolSurface instanceof HTMLElement)) throw new Error('Missing file navigator host')

    fireEvent.focus(toolSurface)

    expect(store.getState().layout.activeSurfaceId).toBe(file.id)
  })

  it('does not duplicate visible running surfaces in hidden hosts', () => {
    const terminal = createTerminalSurface({
      sessionId: 'visible-terminal',
      title: 'Visible Terminal',
    })
    const layout = openSurface(createClassicFirstRunWorkspaceLayout(), terminal)
    const html = renderLayout(layout)

    expect(matchCount(html, `data-surface-id="${terminal.id}"`)).toBe(1)
    expect(html).not.toContain('data-workbench-hidden-surface-hosts')
  })

  it('renders terminal surfaces without an embedded terminal tab store', () => {
    const terminal = createTerminalSurface({
      sessionId: 'terminal-2',
      title: 'Terminal 2',
    })
    const layout = openSurface(createEmptyWorkspaceLayout(), terminal)
    const html = renderLayout(layout, {
      surfaceRenderers: editorSurfaceRendererRegistry,
      withEditorSurfaceProvider: true,
    })

    expect(html).toContain('aria-label="Terminal"')
    expect(html).not.toContain('Terminal tabs')
    expect(html).not.toContain('New terminal tab')
  })

  it('renders editor placeholders without fixture debug UI', () => {
    const placeholder = createPlaceholderSurface({
      contextKey: 'empty-editor',
      title: 'No file selected',
    })
    const layout = openSurface(createEmptyWorkspaceLayout(), placeholder)
    const html = renderLayout(layout, {
      surfaceRenderers: editorSurfaceRendererRegistry,
      withEditorSurfaceProvider: true,
    })

    expect(html).toContain('No file selected')
    expect(html).not.toContain('data-surface-renderer="fixture"')
  })

  it('renders search previews with the production renderer', () => {
    const search = createSearchResultsSurface()
    const preview = createSearchPreviewSurface({
      ownerContextKey: 'result:/repo/src/app.ts:1',
      ownerSurfaceId: search.id,
      resourceKey: '/repo/src/app.ts',
      title: 'app.ts:1',
    })
    const layout = openSurface(openSurface(createEmptyWorkspaceLayout(), search), preview)
    const html = renderLayout(layout, {
      surfaceRenderers: editorSurfaceRendererRegistry,
      withEditorSurfaceProvider: true,
    })

    expect(html).toContain('data-search-preview-surface')
    expect(html).toContain('/repo/src/app.ts')
    expect(html).not.toContain('data-surface-renderer="fixture"')
  })

  it('does not rerender unrelated surfaces when closing an inactive editor tab', async () => {
    const counts = {
      fileEditor: 0,
      fileNavigator: 0,
      fixture: 0,
    }
    const registry = createCountingSurfaceRendererRegistry(counts)
    const fileA = createFileEditorSurface({ path: '/repo/src/a.ts' })
    const fileB = createFileEditorSurface({ path: '/repo/src/b.ts' })
    const layout = openSurface(openSurface(createClassicFirstRunWorkspaceLayout(), fileA), fileB)
    const store = renderInteractiveLayout(layout, { surfaceRenderers: registry })

    await act(async () => {})

    const initialFileEditorCount = counts.fileEditor
    const initialFileNavigatorCount = counts.fileNavigator

    act(() => {
      store.getState().dispatchLayoutOperation({ surfaceId: fileA.id, type: 'closeSurface' })
    })

    expect(counts.fileEditor).toBe(initialFileEditorCount)
    expect(counts.fileNavigator).toBe(initialFileNavigatorCount)
  })

  it('keeps surface-area geometry equal when inactive tab close only rewrites node ids', () => {
    const fileA = createFileEditorSurface({ path: '/repo/src/a.ts' })
    const fileB = createFileEditorSurface({ path: '/repo/src/b.ts' })
    const layout = openSurface(openSurface(createClassicFirstRunWorkspaceLayout(), fileA), fileB)
    const nextLayout = closeSurface(layout, fileA.id)

    expect(layout.rootNodeId).not.toBe(nextLayout.rootNodeId)
    expect(surfaceAreaLayoutEqual(layout, nextLayout)).toBe(true)
  })
})

function renderLayout(
  layout: WorkspaceLayout,
  options: {
    surfaceRenderers?: Parameters<typeof LayoutRenderer>[0]['surfaceRenderers']
    withEditorSurfaceProvider?: boolean
  } = {},
) {
  const renderer = (
    <LayoutProvider initialLayout={layout}>
      <LayoutRenderer
        initialRect={{
          height: 720,
          width: 1080,
          x: 0,
          y: 0,
        }}
        surfaceRenderers={options.surfaceRenderers}
      />
    </LayoutProvider>
  )

  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProviderContext
        value={{
          resolvedTheme: 'dark',
          theme: 'dark',
          setTheme: noop,
        }}
      >
        <FocusContext value={createFocusStore()}>
          <TooltipProvider>
            {options.withEditorSurfaceProvider ? withEditorSurfaceProvider(renderer) : renderer}
          </TooltipProvider>
        </FocusContext>
      </ThemeProviderContext>
    </QueryClientProvider>,
  )
}

function renderInteractiveLayout(
  layout: WorkspaceLayout,
  options: { surfaceRenderers?: Parameters<typeof LayoutRenderer>[0]['surfaceRenderers'] } = {},
) {
  const store = createWorkspaceLayoutStore(layout, { checkInvariants: false })

  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProviderContext
        value={{
          resolvedTheme: 'dark',
          theme: 'dark',
          setTheme: noop,
        }}
      >
        <FocusContext value={createFocusStore()}>
          <TooltipProvider>
            <LayoutProvider store={store}>
              <LayoutRenderer
                initialRect={{
                  height: 720,
                  width: 1080,
                  x: 0,
                  y: 0,
                }}
                surfaceRenderers={options.surfaceRenderers}
              />
            </LayoutProvider>
          </TooltipProvider>
        </FocusContext>
      </ThemeProviderContext>
    </QueryClientProvider>,
  )

  return store
}

function createCountingSurfaceRendererRegistry(counts: {
  fileEditor: number
  fileNavigator: number
  fixture: number
}) {
  const FileNavigatorRenderer: SurfaceRenderer = () => {
    counts.fileNavigator += 1
    return <div data-counting-surface='file-navigator' />
  }
  const FileEditorRenderer: SurfaceRenderer = () => {
    counts.fileEditor += 1
    return <div data-counting-surface='file-editor' />
  }
  const FixtureRenderer: SurfaceRenderer = ({ surface }) => {
    counts.fixture += 1
    return <div data-counting-surface={surface.type} />
  }

  return createSurfaceRendererRegistry([
    { renderer: FixtureRenderer, type: 'chat' },
    { renderer: FixtureRenderer, type: 'diagnostics' },
    { renderer: FixtureRenderer, type: 'diff' },
    { renderer: FileEditorRenderer, type: 'file-editor' },
    { renderer: FileNavigatorRenderer, type: 'file-navigator' },
    { renderer: FixtureRenderer, type: 'git-changes' },
    { renderer: FixtureRenderer, type: 'logs' },
    { renderer: FixtureRenderer, type: 'placeholder' },
    { renderer: FixtureRenderer, type: 'search-preview' },
    { renderer: FixtureRenderer, type: 'search-results' },
    { renderer: FixtureRenderer, type: 'terminal' },
  ])
}

function railButtonForSurface(surfaceId: string) {
  const button = document.querySelector<HTMLButtonElement>(`[data-rail-surface-id="${surfaceId}"]`)
  if (!button) throw new Error(`Missing rail button ${surfaceId}`)

  return button
}

function backgroundSurface(layout: WorkspaceLayout, surfaceId: WorkspaceLayout['activeSurfaceId']) {
  if (!surfaceId) return layout

  return moveSurface(layout, surfaceId, { kind: 'background' })
}

function editorTabDataTransfer({ path, tabId }: { path: string; tabId: string }): DataTransfer {
  const values = new Map([
    [
      EDITOR_TAB_DRAG_MIME,
      JSON.stringify({
        kind: EDITOR_TAB_DRAG_KIND,
        paneId: 'pane-a',
        path,
        tabId,
      }),
    ],
    ['text/plain', path],
  ])
  const types = Array.from(values.keys())

  return {
    dropEffect: 'none',
    effectAllowed: 'move',
    getData: (format: string) => values.get(format) ?? '',
    setData: (format: string, value: string) => {
      values.set(format, value)
      if (types.includes(format)) return

      types.push(format)
    },
    types,
  } as unknown as DataTransfer
}

function fireDocumentEditorTabDragEvent(
  type: 'dragover' | 'drop',
  dataTransfer: DataTransfer,
  point: {
    readonly clientX: number
    readonly clientY: number
  },
) {
  const event =
    type === 'dragover' ? createEvent.dragOver(document.body) : createEvent.drop(document.body)
  Object.defineProperty(event, 'clientX', { value: point.clientX })
  Object.defineProperty(event, 'clientY', { value: point.clientY })
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
  fireEvent(document.body, event)

  return event
}

function dispatchEditorTabPointerDragEvent(
  type: typeof EDITOR_TAB_POINTER_DRAG_EVENT | typeof EDITOR_TAB_POINTER_DROP_EVENT,
  detail: {
    readonly clientX: number
    readonly clientY: number
    readonly detached: boolean
    readonly detachProgress: number
    readonly paneId: string
    readonly path: string
    readonly tabId: string
  },
) {
  document.dispatchEvent(
    new CustomEvent(type, {
      detail: {
        ...detail,
        kind: EDITOR_TAB_DRAG_KIND,
      },
    }),
  )
}

function withEditorSurfaceProvider(children: ReactNode) {
  return (
    <EditorSurfaceProvider
      editorKeymapLayers={[]}
      gitStore={createGitStore()}
      requestCloseTab={() => true}
      requestCloseTabs={() => true}
      rootPath='/repo'
      surfaceIdForEditorTabId={() => null}
      tabModelForSurface={() => null}
    >
      {children}
    </EditorSurfaceProvider>
  )
}

function matchCount(value: string, pattern: string) {
  return value.split(pattern).length - 1
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => {
    if (!window.requestAnimationFrame) {
      resolve()
      return
    }

    window.requestAnimationFrame(() => resolve())
  })
}

function lastItem<T>(items: readonly T[]) {
  return items[items.length - 1]
}

function noop() {}
