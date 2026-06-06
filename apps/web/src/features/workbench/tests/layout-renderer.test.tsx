import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'

import { TooltipProvider } from '@workspace/ui/components/tooltip'

import { createGitStore } from '@/features/git/state'
import { createEditorPaneLayoutForPaths } from '@/features/editor/state/editor-pane-state'
import { TerminalStateProvider } from '@/components/workspace/terminal/providers/terminal-state-provider'
import { ThemeProviderContext } from '@/components/theme-context'
import { FocusContext, createFocusStore } from '@/components/workspace/focus/providers/focus-state'
import type { LoadState } from '@/lib/load-state'
import type { TreeModel } from '@/lib/tree-model'

import {
  CLASSIC_DIAGNOSTICS_WINDOW_ID,
  createClassicFirstRunWorkspaceLayout,
  createChatSurface,
  createDiagnosticsSurface,
  createEmptyWorkspaceLayout,
  createFileEditorSurface,
  createLogsSurface,
  createTerminalSurface,
} from '@/features/tiling-surface-manager/utils/layout-builders'
import {
  minimizeSurface,
  openSurface,
} from '@/features/tiling-surface-manager/utils/layout-operations'
import { LayoutProvider } from '@/features/workbench/providers/layout-provider'
import { LayoutRenderer } from '@/features/workbench/components/layout-renderer'
import type { WorkspaceLayout } from '@/features/tiling-surface-manager/utils/layout-types'
import { EditorSurfaceProvider } from '@/features/workbench/providers/editor-surface-provider'
import { editorSurfaceRendererRegistry } from '@/features/workbench/utils/editor-surface-renderers'
import { workspaceLayoutForEditorPaneLayout } from '@/features/workbench/utils/editor-surface-layout'
import { ResizeOverlay } from '@/features/workbench/components/resize-overlay'
import { layoutNodeId, overlayId } from '@/features/tiling-surface-manager/utils/layout-ids'
import type { LayoutOperation } from '@/features/tiling-surface-manager/utils/layout-types'
import { createWorkspaceLayoutStore } from '@/features/tiling-surface-manager/utils/surface-state'
import {
  findNodeIdForWindow,
  visibleSurfaceIdsInOrder,
} from '@/features/tiling-surface-manager/utils/layout-normalize'

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

  it('renders split windows and resize/drop overlay layers', () => {
    const html = renderLayout(createClassicFirstRunWorkspaceLayout())

    expect(matchCount(html, 'data-window-id=')).toBeGreaterThanOrEqual(3)
    expect(html).toContain('data-workbench-resize-overlay')
    expect(html).toContain('data-workbench-drop-overlay')
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

  it('renders minimized surfaces in the rail', () => {
    const file = createFileEditorSurface({ path: '/repo/src/minimized.ts' })
    const opened = openSurface(createEmptyWorkspaceLayout(), file)
    const layout = minimizeSurface(opened, file.id)
    const html = renderLayout(layout)

    expect(html).toContain('data-workbench-rail')
    expect(html).toContain('data-rail-state="minimized"')
    expect(html).toContain('Restore minimized.ts')
    expect(html).not.toContain('absolute top-3 right-3')
  })

  it('renders current default rail entries', () => {
    const html = renderLayout(createEmptyWorkspaceLayout())

    expect(html).toContain('Focus Files')
    expect(html).toContain('Focus Chat')
    expect(html).toContain('Focus Logs')
    expect(html).toContain('Focus Terminal')
  })

  it('dispatches pointer drag resize operations from handles', () => {
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
    fireEvent.pointerMove(handle, { clientX: 432, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: 432, clientY: 10, pointerId: 1 })

    expect(operations).toEqual([
      {
        deltaPx: 32,
        handleIndex: 0,
        splitId: layoutNodeId('split-test'),
        type: 'resizeSplit',
      },
    ])
  })

  it('hides the classic bottom tool pane from its window controls', () => {
    const store = renderInteractiveLayout(createClassicFirstRunWorkspaceLayout())

    fireEvent.click(screen.getAllByLabelText('Hide bottom tool pane')[0])

    expect(findNodeIdForWindow(store.getState().layout, CLASSIC_DIAGNOSTICS_WINDOW_ID)).toBeNull()
  })

  it('closes the classic bottom tool pane from its window close control', () => {
    const terminal = createTerminalSurface({ sessionId: 'terminal-1' })
    const diagnostics = createDiagnosticsSurface()
    const store = renderInteractiveLayout(createClassicFirstRunWorkspaceLayout())

    fireEvent.click(screen.getByLabelText('Close bottom tool pane'))

    const layout = store.getState().layout
    expect(findNodeIdForWindow(layout, CLASSIC_DIAGNOSTICS_WINDOW_ID)).toBeNull()
    expect(layout.surfacesById[terminal.id]).toBeDefined()
    expect(layout.surfacesById[diagnostics.id]).toBeDefined()
  })

  it('keeps classic bottom tool pane tab close scoped to the active surface', () => {
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

    expect(visibleSurfaceIdsInOrder(store.getState().layout)).not.toContain(chat.id)
    expect(railButtonForSurface(chat.id)).toHaveAttribute('data-rail-state', 'minimized')
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

  it('renders editor placeholders without fixture debug UI', () => {
    const layout = workspaceLayoutForEditorPaneLayout(createEditorPaneLayoutForPaths([], null))
    const html = renderLayout(layout, {
      surfaceRenderers: editorSurfaceRendererRegistry,
      withEditorSurfaceProvider: true,
    })

    expect(html).toContain('No file selected')
    expect(html).not.toContain('data-surface-renderer="fixture"')
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
        <TerminalStateProvider>
          <FocusContext value={createFocusStore()}>
            <TooltipProvider>
              {options.withEditorSurfaceProvider ? withEditorSurfaceProvider(renderer) : renderer}
            </TooltipProvider>
          </FocusContext>
        </TerminalStateProvider>
      </ThemeProviderContext>
    </QueryClientProvider>,
  )
}

function renderInteractiveLayout(layout: WorkspaceLayout) {
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
        <TerminalStateProvider>
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
                />
              </LayoutProvider>
            </TooltipProvider>
          </FocusContext>
        </TerminalStateProvider>
      </ThemeProviderContext>
    </QueryClientProvider>,
  )

  return store
}

function railButtonForSurface(surfaceId: string) {
  const button = document.querySelector<HTMLButtonElement>(`[data-rail-surface-id="${surfaceId}"]`)
  if (!button) throw new Error(`Missing rail button ${surfaceId}`)

  return button
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
      toolSurfaceState={{
        treeState: LOADING_TREE_STATE,
        visibleTreeItemCount: null,
        onLoadDirectory: noop,
        onPrefetchDirectory: noop,
        onVisibleTreeItemCountChange: noop,
      }}
    >
      {children}
    </EditorSurfaceProvider>
  )
}

function matchCount(value: string, pattern: string) {
  return value.split(pattern).length - 1
}

const LOADING_TREE_STATE = { status: 'loading' } satisfies LoadState<TreeModel>

function noop() {}
