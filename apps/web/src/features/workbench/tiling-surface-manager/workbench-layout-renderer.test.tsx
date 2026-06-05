import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { TooltipProvider } from '@workspace/ui/components/tooltip'

import {
  createClassicFirstRunWorkspaceLayout,
  createEmptyWorkspaceLayout,
  createFileEditorSurface,
} from './layout-builders'
import { minimizeSurface, openSurface } from './layout-operations'
import { WorkbenchLayoutProvider } from './workbench-layout-provider'
import { WorkbenchLayoutRenderer } from './workbench-layout-renderer'
import type { WorkspaceLayout } from './layout-types'

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
})

function renderLayout(layout: WorkspaceLayout) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <WorkbenchLayoutProvider initialLayout={layout}>
        <WorkbenchLayoutRenderer
          initialRect={{
            height: 720,
            width: 1080,
            x: 0,
            y: 0,
          }}
        />
      </WorkbenchLayoutProvider>
    </TooltipProvider>,
  )
}

function matchCount(value: string, pattern: string) {
  return value.split(pattern).length - 1
}
