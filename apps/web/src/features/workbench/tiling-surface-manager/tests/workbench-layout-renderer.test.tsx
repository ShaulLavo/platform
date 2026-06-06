import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { TooltipProvider } from '@workspace/ui/components/tooltip'

import { createEditorPaneLayoutForPaths } from '@/features/editor/state/editor-pane-state'
import { TerminalStateProvider } from '@/components/workspace/terminal/providers/terminal-state-provider'
import { ThemeProviderContext } from '@/components/theme-context'
import { FocusContext, createFocusStore } from '@/components/workspace/focus/providers/focus-state'
import type { LoadState } from '@/lib/load-state'
import type { TreeModel } from '@/lib/tree-model'

import {
  createClassicFirstRunWorkspaceLayout,
  createEmptyWorkspaceLayout,
  createFileEditorSurface,
  createTerminalSurface,
} from '../layout-builders'
import { minimizeSurface, openSurface } from '../layout-operations'
import { WorkbenchLayoutProvider } from '../workbench-layout-provider'
import { WorkbenchLayoutRenderer } from '../workbench-layout-renderer'
import type { WorkspaceLayout } from '../layout-types'
import { WorkbenchEditorSurfaceProvider } from '../workbench-editor-surface-provider'
import { workbenchEditorSurfaceRendererRegistry } from '../workbench-editor-surface-renderers'
import { workspaceLayoutForEditorPaneLayout } from '../workbench-editor-surface-layout'

describe('WorkbenchLayoutRenderer', () => {
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
  })

  it('renders multiple tabs in a window', () => {
    const fileA = createFileEditorSurface({ path: '/repo/src/a.ts' })
    const fileB = createFileEditorSurface({ path: '/repo/src/b.ts' })
    const layout = openSurface(openSurface(createClassicFirstRunWorkspaceLayout(), fileA), fileB)
    const html = renderLayout(layout)

    expect(html).toContain('data-surface-tab-id')
    expect(html).toContain('a.ts')
    expect(html).toContain('b.ts')
    expect(html).toContain('Close b.ts')
  })

  it('renders minimized surfaces in the rail', () => {
    const file = createFileEditorSurface({ path: '/repo/src/minimized.ts' })
    const opened = openSurface(createEmptyWorkspaceLayout(), file)
    const layout = minimizeSurface(opened, file.id)
    const html = renderLayout(layout)

    expect(html).toContain('data-workbench-rail')
    expect(html).toContain('data-rail-state="minimized"')
    expect(html).toContain('Restore minimized.ts')
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
      surfaceRenderers: workbenchEditorSurfaceRendererRegistry,
      withEditorSurfaceProvider: true,
    })

    expect(html).toContain('No file selected')
    expect(html).not.toContain('data-surface-renderer="fixture"')
  })
})

function renderLayout(
  layout: WorkspaceLayout,
  options: {
    surfaceRenderers?: Parameters<typeof WorkbenchLayoutRenderer>[0]['surfaceRenderers']
    withEditorSurfaceProvider?: boolean
  } = {},
) {
  const renderer = (
    <WorkbenchLayoutProvider initialLayout={layout}>
      <WorkbenchLayoutRenderer
        initialRect={{
          height: 720,
          width: 1080,
          x: 0,
          y: 0,
        }}
        surfaceRenderers={options.surfaceRenderers}
      />
    </WorkbenchLayoutProvider>
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

function withEditorSurfaceProvider(children: ReactNode) {
  return (
    <WorkbenchEditorSurfaceProvider
      editorKeymapLayers={[]}
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
    </WorkbenchEditorSurfaceProvider>
  )
}

function matchCount(value: string, pattern: string) {
  return value.split(pattern).length - 1
}

const LOADING_TREE_STATE = { status: 'loading' } satisfies LoadState<TreeModel>

function noop() {}
