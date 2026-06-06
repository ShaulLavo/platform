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
import { EditorColorThemeProvider } from '@/features/editor/hooks/use-editor-color-theme'
import { disposeEditorTreeSitterSyntaxProvider } from '@/features/editor/editor-plugins'
import { serverUrl } from '@/lib/client'
import { fileSystemKeys } from '@/lib/query-keys'
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
          <EditorColorThemeProvider>
            <TooltipProvider delay={0}>
              <FocusProvider>
                <WorkbenchLayoutProvider initialLayout={createClassicFirstRunWorkspaceLayout()}>
                  <WorkbenchLayoutRenderer />
                </WorkbenchLayoutProvider>
              </FocusProvider>
            </TooltipProvider>
          </EditorColorThemeProvider>
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
          <EditorColorThemeProvider>
            <TooltipProvider delay={0}>
              <FocusProvider>
                <QueryClientProvider client={queryClient}>
                  <EditorStateProvider>
                    <WorkbenchEditorSurfaceProvider
                      editorKeymapLayers={[]}
                      requestCloseTab={() => true}
                      requestCloseTabs={() => true}
                      rootPath={TEST_ROOT_PATH}
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
