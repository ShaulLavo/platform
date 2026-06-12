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
import { TooltipProvider } from '@workspace/ui/components/tooltip'

import {
  createEmptyWorkspaceLayout,
  createFileEditorSurface,
} from '@workspace/tiling/utils/layout-builders'
import { openSurface } from '@workspace/tiling/utils/layout-operations'
import { LayoutProvider } from '@/features/workbench/providers/layout-provider'
import { LayoutRenderer } from '@/features/workbench/components/layout-renderer'
import { editorSurfaceSerializedState } from '@/features/workbench/utils/editor-surface-layout'
import { EditorSurfaceProvider } from '@/features/workbench/providers/editor-surface-provider'
import { editorSurfaceRendererRegistry } from '@/features/workbench/utils/editor-surface-renderers'
import type { Surface, SurfaceId, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

const THEME_STORAGE_KEY = 'platform-workbench-surface-host-cold-reveal-theme'
const TEST_ROOT_PATH = 'repo'
const FILE_A_PATH = `${TEST_ROOT_PATH}/src/a.ts`
const FILE_B_PATH = `${TEST_ROOT_PATH}/src/b.ts`
const FILE_C_PATH = `${TEST_ROOT_PATH}/src/c.ts`
const FILE_A_TEXT = 'real browser fixture A'
const FILE_C_TEXT = 'real browser fixture C'

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

describe('SurfaceHost cold-until-first-reveal lifecycle', () => {
  it('keeps never-revealed editor tabs cold while the active tab renders', async () => {
    const [fileA, fileB, fileC] = renderThreeTabLayout()

    await vi.waitFor(() => {
      expect(editorContent(surfaceHost(fileC.id))).not.toBeNull()
      expect(surfaceHost(fileC.id).textContent).toContain(FILE_C_TEXT)
    })

    expect(surfaceHost(fileC.id).hasAttribute('data-surface-cold')).toBe(false)

    for (const surface of [fileA, fileB]) {
      const host = surfaceHost(surface.id)
      expect(host.hasAttribute('data-surface-cold')).toBe(true)
      expect(host.childElementCount).toBe(0)
      expect(editorContent(host)).toBeNull()
    }
  })

  it('mounts the editor on first reveal and accepts typing', async () => {
    const [fileA] = renderThreeTabLayout()

    await vi.waitFor(() => {
      expect(surfaceHost(fileA.id).hasAttribute('data-surface-cold')).toBe(true)
    })

    editorChromeTab('tab-a').click()

    await vi.waitFor(() => {
      const host = surfaceHost(fileA.id)
      expect(host.hasAttribute('data-surface-cold')).toBe(false)
      expect(host.hasAttribute('hidden')).toBe(false)
      expect(editorContent(host)).not.toBeNull()
      expect(host.textContent).toContain(FILE_A_TEXT)
    })

    typeIntoEditor(surfaceHost(fileA.id), 'ZZZ')

    await vi.waitFor(() => {
      expect(surfaceHost(fileA.id).textContent).toContain('ZZZ')
    })
  })

  it('keeps a previously revealed editor mounted and stateful while hidden', async () => {
    const [fileA] = renderThreeTabLayout()

    await vi.waitFor(() => {
      expect(surfaceHost(fileA.id).hasAttribute('data-surface-cold')).toBe(true)
    })

    editorChromeTab('tab-a').click()

    await vi.waitFor(() => {
      expect(surfaceHost(fileA.id).textContent).toContain(FILE_A_TEXT)
    })

    typeIntoEditor(surfaceHost(fileA.id), 'ZZZ')

    await vi.waitFor(() => {
      expect(surfaceHost(fileA.id).textContent).toContain('ZZZ')
    })

    editorChromeTab('tab-c').click()

    await vi.waitFor(() => {
      expect(surfaceHost(fileA.id).hasAttribute('hidden')).toBe(true)
    })

    const hiddenHost = surfaceHost(fileA.id)
    expect(hiddenHost.hasAttribute('data-surface-cold')).toBe(false)
    expect(editorContent(hiddenHost)).not.toBeNull()
    expect(hiddenHost.textContent).toContain('ZZZ')

    editorChromeTab('tab-a').click()

    await vi.waitFor(() => {
      expect(surfaceHost(fileA.id).hasAttribute('hidden')).toBe(false)
      expect(surfaceHost(fileA.id).textContent).toContain('ZZZ')
    })
  })
})

function renderThreeTabLayout() {
  const surfaces = [
    editorSurface(FILE_A_PATH, 'tab-a'),
    editorSurface(FILE_B_PATH, 'tab-b'),
    editorSurface(FILE_C_PATH, 'tab-c'),
  ] as const
  const layout = surfaces.reduce<WorkspaceLayout>(
    (currentLayout, surface) => openSurface(currentLayout, surface),
    createEmptyWorkspaceLayout(),
  )
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
                    surfaceIdForEditorTabId={(tabId) => surfaceIdForEditorTabId(surfaces, tabId)}
                    tabModelForSurface={(surface, active) => tabModelForSurface(surface, active)}
                  >
                    <LayoutProvider initialLayout={layout}>
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

  return surfaces
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

function surfaceIdForEditorTabId(surfaces: readonly Surface[], tabId: string) {
  const surface = surfaces.find(
    (candidate) => editorSurfaceSerializedState(candidate)?.editorTabId === tabId,
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

function surfaceHost(surfaceId: SurfaceId) {
  const host = document.querySelector<HTMLElement>(
    `[data-surface-host][data-surface-id="${surfaceId}"]`,
  )
  if (!host) throw new Error(`Missing surface host ${surfaceId}`)

  return host
}

function editorContent(host: HTMLElement) {
  return host.querySelector('.app-editor-host')
}

function editorChromeTab(tabId: string) {
  const tab = document.querySelector<HTMLElement>(`[data-editor-tab-id="${tabId}"]`)
  if (!tab) throw new Error(`Missing editor tab ${tabId}`)

  return tab
}

function typeIntoEditor(host: HTMLElement, text: string) {
  const editorElement = host.querySelector<HTMLElement>('.editor-virtualized')
  if (!editorElement) throw new Error('Missing editor element')

  editorElement.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      data: text,
      inputType: 'insertText',
    }),
  )
}

async function waitForFileServer() {
  await vi.waitFor(async () => {
    const response = await fetch(`${serverUrl}/fs/read?path=${encodeURIComponent(FILE_A_PATH)}`)

    expect(response.ok).toBe(true)
  })
}
