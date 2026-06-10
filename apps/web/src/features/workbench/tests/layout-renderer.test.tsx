import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TooltipProvider } from '@workspace/ui/components/tooltip'

import { createGitStore } from '@/features/git/state'
import { ThemeProviderContext } from '@/components/theme-context'
import { FocusContext, createFocusStore } from '@/components/workspace/focus/providers/focus-state'
import { EditorStateProvider } from '@/features/editor/editor-state-provider'

import {
  EMPTY_GIT_FILES,
  editorTabModel,
} from '@/components/workspace/editor-tabs/utils/editor-tab-model'
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
} from '@workspace/tiling/utils/layout-builders'
import { closeSurface, moveSurface, openSurface } from '@workspace/tiling/utils/layout-operations'
import { LayoutProvider } from '@/features/workbench/providers/layout-provider'
import {
  LayoutRenderer,
  surfaceAreaLayoutEqual,
} from '@/features/workbench/components/layout-renderer'
import type { Surface, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'
import { EditorSurfaceProvider } from '@/features/workbench/providers/editor-surface-provider'
import { editorSurfaceRendererRegistry } from '@/features/workbench/utils/editor-surface-renderers'
import { editorSurfaceSerializedState } from '@/features/workbench/utils/editor-surface-layout'
import {
  createSurfaceRendererRegistry,
  type SurfaceRenderer,
} from '@/features/workbench/utils/surface-renderer-registry'
import { ResizeOverlay } from '@/features/workbench/components/resize-overlay'
import { layoutNodeId, overlayId } from '@workspace/tiling/utils/layout-ids'
import type { LayoutOperation } from '@workspace/tiling/utils/layout-types'
import { createWorkspaceLayoutStore } from '@/features/tiling-surface-manager/engine/surface-state'
import {
  findNodeIdForWindow,
  visibleSurfaceIdsInOrder,
} from '@workspace/tiling/utils/layout-normalize'

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
    const terminal = createTerminalSurface({ sessionId: 'terminal-1' })
    const diagnostics = createDiagnosticsSurface()
    const html = renderLayout(createEmptyWorkspaceLayout())

    expect(html).toContain('Focus Files')
    expect(html).toContain('Focus Chat')
    expect(html).toContain('Focus Logs')
    expect(html).toContain('Open Terminal')
    expect(html).toContain('data-rail-pane-id="bottom-pane"')
    expect(html).not.toContain(`data-rail-surface-id="${terminal.id}"`)
    expect(html).not.toContain(`data-rail-surface-id="${diagnostics.id}"`)
    expect(html).not.toContain('Classic recipe active')
    expect(html).not.toContain('data-rail-recipe-id=')
  })

  it('dispatches pointer drag resize operations live', () => {
    const operations: LayoutOperation[] = []

    render(
      <ResizeOverlay
        resizeHandleRects={[
          {
            axis: 'horizontal',
            handleIndex: 0,
            id: overlayId('resize:test:0'),
            rect: { height: 720, width: 8, x: 400, y: 0 },
            resizeReferencePx: 800,
            splitId: layoutNodeId('split-test'),
          },
        ]}
        onDispatch={(operation) => operations.push(operation)}
      />,
    )

    const handle = screen.getByRole('separator', { name: 'Resize columns' })
    fireEvent.pointerDown(handle, { button: 0, clientX: 400, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(handle, { buttons: 1, clientX: 432, clientY: 10, pointerId: 1 })

    expect(operations).toEqual([
      {
        deltaPx: 32,
        handleIndex: 0,
        referencePx: 800,
        splitId: layoutNodeId('split-test'),
        type: 'resizeSplit',
      },
    ])

    fireEvent.pointerUp(handle, { clientX: 432, clientY: 10, pointerId: 1 })

    expect(operations).toHaveLength(1)
  })

  it('reports pointer drag resize lifecycle', () => {
    const lifecycleEvents: string[] = []

    render(
      <ResizeOverlay
        resizeHandleRects={[
          {
            axis: 'horizontal',
            handleIndex: 0,
            id: overlayId('resize:test:0'),
            rect: { height: 720, width: 8, x: 400, y: 0 },
            resizeReferencePx: 800,
            splitId: layoutNodeId('split-test'),
          },
        ]}
        onDispatch={() => undefined}
        onResizeEnd={() => lifecycleEvents.push('end')}
        onResizeStart={() => lifecycleEvents.push('start')}
      />,
    )

    const handle = screen.getByRole('separator', { name: 'Resize columns' })
    fireEvent.pointerDown(handle, { button: 0, clientX: 400, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: 432, clientY: 10, pointerId: 1 })

    expect(lifecycleEvents).toEqual(['start', 'end'])
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
            resizeReferencePx: 800,
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

  it('ends pointer drag resize when pointerup happens outside the handle', () => {
    const operations: LayoutOperation[] = []

    render(
      <ResizeOverlay
        resizeHandleRects={[
          {
            axis: 'horizontal',
            handleIndex: 0,
            id: overlayId('resize:test:0'),
            rect: { height: 720, width: 8, x: 400, y: 0 },
            resizeReferencePx: 800,
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

    expect(operations).toEqual([
      {
        deltaPx: 32,
        handleIndex: 0,
        referencePx: 800,
        splitId: layoutNodeId('split-test'),
        type: 'resizeSplit',
      },
    ])
  })

  it('collapses the terminal window from its window controls', () => {
    const store = renderInteractiveLayout(createClassicFirstRunWorkspaceLayout())
    const bottomPane = screen.getByRole('region', { name: 'Window: Terminal' })

    fireEvent.click(within(bottomPane).getByLabelText('Collapse Terminal'))

    expect(store.getState().layout.windowsById[CLASSIC_DIAGNOSTICS_WINDOW_ID].mode).toBe(
      'collapsed',
    )
  })

  it('renders a pane close control but no bottom tab close controls', () => {
    const terminal = createTerminalSurface({ sessionId: 'terminal-1' })
    const diagnostics = createDiagnosticsSurface()
    renderInteractiveLayout(createClassicFirstRunWorkspaceLayout())
    const bottomPane = screen.getByRole('region', { name: 'Window: Terminal' })

    expect(within(bottomPane).getByLabelText('Close Terminal')).toBeVisible()
    expect(screen.queryByLabelText('Close Terminal tab')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Close Problems tab')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Terminal' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Problems' })).toBeVisible()
    expect(terminal.id).toBeDefined()
    expect(diagnostics.id).toBeDefined()
  })

  it('closes the bottom pane from the rail without deleting its surfaces', () => {
    const terminal = createTerminalSurface({ sessionId: 'terminal-1' })
    const diagnostics = createDiagnosticsSurface()
    const store = renderInteractiveLayout(createClassicFirstRunWorkspaceLayout())

    fireEvent.click(railButtonForBottomPane())
    const layout = store.getState().layout

    expect(layout.surfacesById[terminal.id]).toBeDefined()
    expect(layout.surfacesById[diagnostics.id]).toBeDefined()
    expect(visibleSurfaceIdsInOrder(layout)).not.toContain(terminal.id)
    expect(visibleSurfaceIdsInOrder(layout)).not.toContain(diagnostics.id)
    expect(findNodeIdForWindow(layout, CLASSIC_DIAGNOSTICS_WINDOW_ID)).toBeNull()
  })

  it('closes the bottom pane from its close control without deleting surfaces', () => {
    const terminal = createTerminalSurface({ sessionId: 'terminal-1' })
    const diagnostics = createDiagnosticsSurface()
    const store = renderInteractiveLayout(createClassicFirstRunWorkspaceLayout())
    const bottomPane = screen.getByRole('region', { name: 'Window: Terminal' })

    fireEvent.click(within(bottomPane).getByLabelText('Close Terminal'))
    const layout = store.getState().layout

    expect(layout.surfacesById[terminal.id]).toBeDefined()
    expect(layout.surfacesById[diagnostics.id]).toBeDefined()
    expect(visibleSurfaceIdsInOrder(layout)).not.toContain(terminal.id)
    expect(visibleSurfaceIdsInOrder(layout)).not.toContain(diagnostics.id)
    expect(findNodeIdForWindow(layout, CLASSIC_DIAGNOSTICS_WINDOW_ID)).toBeNull()
  })

  it('hides bottom pane tabs from the context menu without deleting surfaces', async () => {
    const terminal = createTerminalSurface({ sessionId: 'terminal-1' })
    const diagnostics = createDiagnosticsSurface()
    const user = userEvent.setup()
    const store = renderInteractiveLayout(createClassicFirstRunWorkspaceLayout())
    const tabList = bottomPaneTabList()

    fireEvent.contextMenu(tabList)
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Problems' }))
    const layout = store.getState().layout

    expect(layout.surfacesById[terminal.id]).toBeDefined()
    expect(layout.surfacesById[diagnostics.id]).toBeDefined()
    expect(visibleSurfaceIdsInOrder(layout)).toContain(terminal.id)
    expect(visibleSurfaceIdsInOrder(layout)).not.toContain(diagnostics.id)
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

  it('selects an editor tab when the click is retargeted to the draggable tab root', () => {
    const fileA = createEditorSurfaceWithTab('/repo/src/a.ts', 'tab-a')
    const fileB = createEditorSurfaceWithTab('/repo/src/b.ts', 'tab-b')
    const layout = openSurface(openSurface(createEmptyWorkspaceLayout(), fileA), fileB)
    const store = renderInteractiveEditorSurfaceLayout(layout)

    expect(store.getState().layout.activeSurfaceId).toBe(fileB.id)

    fireEvent.click(editorTabRoot('tab-a'))

    expect(store.getState().layout.activeSurfaceId).toBe(fileA.id)
    expect(editorTabButton('tab-a')).toHaveAttribute('aria-selected', 'true')
  })

  it('activates a window when pointer down starts inside event-consuming surface content', () => {
    const file = createFileEditorSurface({ path: '/repo/src/app.ts' })
    const registry = createEventConsumingSurfaceRendererRegistry()
    const store = renderInteractiveLayout(
      openSurface(createClassicFirstRunWorkspaceLayout(), file),
      {
        surfaceRenderers: registry,
      },
    )
    const content = screen.getByRole('button', { name: 'Files' })
    const host = content.closest('[data-surface-host]')
    if (!(host instanceof HTMLElement)) throw new Error('Missing file navigator host')

    fireEvent.pointerDown(content, { button: 0, pointerId: 1 })

    expect(store.getState().layout.activeSurfaceId).toBe(host.dataset.surfaceId)
    expect(host.closest('[data-window-id]')).toHaveAttribute('data-active', 'true')
    expect(content).toHaveAttribute('data-active', 'true')
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

function renderInteractiveEditorSurfaceLayout(layout: WorkspaceLayout) {
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
            <EditorStateProvider>
              <EditorSurfaceProvider
                editorKeymapLayers={[]}
                gitStore={createGitStore()}
                requestCloseTab={() => true}
                requestCloseTabs={() => true}
                rootPath='/repo'
                surfaceIdForEditorTabId={(tabId) => editorSurfaceIdForTabId(store, tabId)}
                tabModelForSurface={(surface, active) => editorTabModelForSurface(surface, active)}
              >
                <LayoutProvider store={store}>
                  <LayoutRenderer surfaceRenderers={editorSurfaceRendererRegistry} />
                </LayoutProvider>
              </EditorSurfaceProvider>
            </EditorStateProvider>
          </TooltipProvider>
        </FocusContext>
      </ThemeProviderContext>
    </QueryClientProvider>,
  )

  return store
}

function editorSurfaceIdForTabId(
  store: ReturnType<typeof createWorkspaceLayoutStore>,
  tabId: string,
) {
  const surface = Object.values(store.getState().layout.surfacesById).find(
    (candidate) => editorSurfaceSerializedState(candidate)?.editorTabId === tabId,
  )

  return surface?.id ?? null
}

function createEditorSurfaceWithTab(path: string, tabId: string): Surface {
  return {
    ...createFileEditorSurface({ path }),
    serializedState: {
      editorGroupId: 'test-editor-group',
      editorTabId: tabId,
    },
  }
}

function editorTabModelForSurface(surface: Surface, active: boolean) {
  const state = editorSurfaceSerializedState(surface)
  if (!state) return null
  if (!surface.resourceKey) return null

  return editorTabModel({
    conflicts: {},
    gitFiles: EMPTY_GIT_FILES,
    rootPath: '/repo',
    selectedTabId: active ? state.editorTabId : null,
    tab: {
      id: state.editorTabId,
      path: surface.resourceKey,
    },
  })
}

function editorTabRoot(tabId: string) {
  const tab = document.querySelector<HTMLElement>(`[data-editor-tab-id="${tabId}"]`)
  if (!tab) throw new Error(`Missing editor tab ${tabId}`)

  return tab
}

function editorTabButton(tabId: string) {
  const button = editorTabRoot(tabId).querySelector<HTMLElement>('[role="tab"]')
  if (!button) throw new Error(`Missing editor tab button ${tabId}`)

  return button
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

function createEventConsumingSurfaceRendererRegistry() {
  const EventConsumingRenderer: SurfaceRenderer = ({ active, surface }) => (
    <button
      data-active={active ? 'true' : 'false'}
      data-consuming-surface={surface.type}
      type='button'
      onFocus={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {surface.title}
    </button>
  )

  return createSurfaceRendererRegistry([
    { renderer: EventConsumingRenderer, type: 'chat' },
    { renderer: EventConsumingRenderer, type: 'diagnostics' },
    { renderer: EventConsumingRenderer, type: 'diff' },
    { renderer: EventConsumingRenderer, type: 'file-editor' },
    { renderer: EventConsumingRenderer, type: 'file-navigator' },
    { renderer: EventConsumingRenderer, type: 'git-changes' },
    { renderer: EventConsumingRenderer, type: 'logs' },
    { renderer: EventConsumingRenderer, type: 'placeholder' },
    { renderer: EventConsumingRenderer, type: 'search-preview' },
    { renderer: EventConsumingRenderer, type: 'search-results' },
    { renderer: EventConsumingRenderer, type: 'terminal' },
  ])
}

function railButtonForSurface(surfaceId: string) {
  const button = document.querySelector<HTMLButtonElement>(`[data-rail-surface-id="${surfaceId}"]`)
  if (!button) throw new Error(`Missing rail button ${surfaceId}`)

  return button
}

function railButtonForBottomPane() {
  const button = document.querySelector<HTMLButtonElement>('[data-rail-pane-id="bottom-pane"]')
  if (!button) throw new Error('Missing bottom pane rail button')

  return button
}

function bottomPaneTabList() {
  const terminalTab = screen.getByRole('tab', { name: 'Terminal' })
  const tabList = terminalTab.closest<HTMLElement>('[role="tablist"]')
  if (!tabList) throw new Error('Missing bottom pane tab list')

  return tabList
}

function backgroundSurface(layout: WorkspaceLayout, surfaceId: WorkspaceLayout['activeSurfaceId']) {
  if (!surfaceId) return layout

  return moveSurface(layout, surfaceId, { kind: 'background' })
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

function noop() {}
