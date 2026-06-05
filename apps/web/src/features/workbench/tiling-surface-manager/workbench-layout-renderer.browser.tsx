import '@workspace/ui/globals.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/components/theme-provider'
import {
  EMPTY_GIT_FILES,
  editorTabModel,
} from '@/components/workspace/editor-tabs/utils/editor-tab-model'
import { EditorStateProvider } from '@/features/editor/editor-state-provider'
import { TooltipProvider } from '@workspace/ui/components/tooltip'

import {
  createClassicFirstRunWorkspaceLayout,
  createEmptyWorkspaceLayout,
  createFileEditorSurface,
} from './layout-builders'
import { openSurface } from './layout-operations'
import { WorkbenchLayoutProvider } from './workbench-layout-provider'
import { WorkbenchLayoutRenderer } from './workbench-layout-renderer'
import { editorSurfaceSerializedState } from './workbench-editor-surface-layout'
import { WorkbenchEditorSurfaceProvider } from './workbench-editor-surface-provider'
import { workbenchEditorSurfaceRendererRegistry } from './workbench-editor-surface-renderers'
import type { Surface } from './layout-types'

const THEME_STORAGE_KEY = 'platform-workbench-layout-renderer-browser-theme'

let root: Root | null = null

afterEach(() => {
  if (root) {
    flushSync(() => root?.unmount())
    root = null
  }

  document.body.innerHTML = ''
  localStorage.removeItem(THEME_STORAGE_KEY)
})

describe('WorkbenchLayoutRenderer browser rendering', () => {
  it('renders nonblank windows and keeps tab focusable', async () => {
    const container = document.createElement('main')
    container.style.height = '620px'
    container.style.width = '920px'
    document.body.append(container)
    root = createRoot(container)

    flushSync(() => {
      root?.render(
        <ThemeProvider defaultTheme='dark' storageKey={THEME_STORAGE_KEY}>
          <TooltipProvider delay={0}>
            <WorkbenchLayoutProvider initialLayout={createClassicFirstRunWorkspaceLayout()}>
              <WorkbenchLayoutRenderer />
            </WorkbenchLayoutProvider>
          </TooltipProvider>
        </ThemeProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(windowRegions()).toHaveLength(3)
      expect(document.body.textContent).toContain('No file selected')
      expect(firstWindowRect().width).toBeGreaterThan(100)
      expect(firstWindowRect().height).toBeGreaterThan(100)
    })

    const tab = firstTab()
    tab.focus()

    expect(document.activeElement).toBe(tab)
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
          <TooltipProvider delay={0}>
            <QueryClientProvider client={queryClient}>
              <EditorStateProvider>
                <WorkbenchEditorSurfaceProvider
                  editorKeymapLayers={[]}
                  requestCloseTab={() => true}
                  requestCloseTabs={() => true}
                  rootPath='/repo'
                  surfaceIdForEditorTabId={(tabId) => surfaceIdForEditorTabId(tabId)}
                  tabModelForSurface={(surface, active) => tabModelForSurface(surface, active)}
                >
                  <WorkbenchLayoutProvider initialLayout={editorSurfaceLayout()}>
                    <WorkbenchLayoutRenderer
                      surfaceRenderers={workbenchEditorSurfaceRendererRegistry}
                    />
                  </WorkbenchLayoutProvider>
                </WorkbenchEditorSurfaceProvider>
              </EditorStateProvider>
            </QueryClientProvider>
          </TooltipProvider>
        </ThemeProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(editorChromeTabs()).toHaveLength(2)
      expect(document.body.textContent).toContain('a.ts')
      expect(document.body.textContent).toContain('b.ts')
    })
  })
})

function windowRegions() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-window-id]'))
}

function firstWindowRect() {
  const firstWindow = windowRegions()[0]
  if (!firstWindow) throw new Error('Missing workbench window')

  return firstWindow.getBoundingClientRect()
}

function firstTab() {
  const tab = document.querySelector<HTMLElement>('[role="tab"]')
  if (!tab) throw new Error('Missing workbench tab')

  return tab
}

function editorChromeTabs() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-editor-tab-id]'))
}

function editorSurfaceLayout() {
  const fileA = editorSurface('/repo/src/a.ts', 'tab-a')
  const fileB = editorSurface('/repo/src/b.ts', 'tab-b')

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
    rootPath: '/repo',
    selectedTabId: active ? state.editorTabId : null,
    tab: {
      id: state.editorTabId,
      path: surface.resourceKey,
    },
  })
}
