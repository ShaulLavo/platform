import '@workspace/ui/globals.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMemo, useRef, useState } from 'react'

import { ChromeEditorTabList } from '@/components/workspace/editor-tabs/components/chrome-editor-tab-list'
import type { EditorTabDragController } from '@/components/workspace/editor-tabs/hooks/use-editor-tab-drag'
import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import { EditorStateProvider } from '@/features/editor/editor-state-provider'
import { EditorColorThemeProvider } from '@/features/editor/hooks/use-editor-color-theme'
import { iconForEntry } from '@/lib/file-icons'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@workspace/ui/components/tooltip'

const THEME_STORAGE_KEY = 'platform-chrome-tab-list-browser-theme'

let root: Root | null = null

afterEach(() => {
  if (root) {
    flushSync(() => root?.unmount())
    root = null
  }

  document.body.innerHTML = ''
  localStorage.removeItem(THEME_STORAGE_KEY)
})

describe('ChromeEditorTabList browser layout', () => {
  it('removes a close-button tab immediately and slides survivors into place', async () => {
    renderTabHarness({ closeDelayMs: 80 })

    await vi.waitFor(() => {
      expect(editorTabs()).toHaveLength(3)
      expect(editorTabs().every((tab) => tab.getBoundingClientRect().width > 0)).toBe(true)
    })

    const beforeWidths = editorTabWidths()
    closeButton('Close b.ts').click()
    await settledReactUpdate()

    expect(queryEditorTab('b.ts')).toBeNull()
    expect(editorTabs()).toHaveLength(2)
    expect(closeSpacerWidth()).toBeGreaterThan(0)
    expect(editorTab('c.ts').style.transform).toMatch(/^translateX/u)
    expect(Math.max(...editorTabWidths())).toBeLessThanOrEqual(Math.max(...beforeWidths))

    await nextFrame()

    expect(editorTab('c.ts').style.transform).toBe('')
  })

  it('slides survivors when a tab disappears outside the close button path', async () => {
    renderTabHarness()

    await vi.waitFor(() => {
      expect(editorTabs()).toHaveLength(3)
      expect(editorTabs().every((tab) => tab.getBoundingClientRect().width > 0)).toBe(true)
    })

    const beforeWidths = editorTabWidths()
    closeButton('Direct close b.ts').click()
    await settledReactUpdate()

    expect(queryEditorTab('b.ts')).toBeNull()
    expect(editorTabs()).toHaveLength(2)
    expect(closeSpacerWidth()).toBeGreaterThan(0)
    expect(editorTab('c.ts').style.transform).toMatch(/^translateX/u)
    expect(Math.max(...editorTabWidths())).toBeLessThanOrEqual(Math.max(...beforeWidths))

    await nextFrame()

    expect(editorTab('c.ts').style.transform).toBe('')
  })

  it('does not resize cramped tabs on the first close frame', async () => {
    renderTabHarness({
      activeName: 'tab-5.ts',
      closeName: 'tab-5.ts',
      containerWidth: 460,
      names: crampedTabNames(),
    })

    await vi.waitFor(() => {
      expect(editorTabs()).toHaveLength(10)
      expect(editorTabs().every((tab) => tab.getBoundingClientRect().width > 0)).toBe(true)
    })

    const beforeWidths = editorTabWidthsById()
    closeButton('Close tab-5.ts').click()
    await settledReactUpdate()

    const afterWidths = editorTabWidthsById()
    expect(queryEditorTab('tab-5.ts')).toBeNull()
    expect(widthDelta(afterWidths, beforeWidths, 'tab-6.ts')).toBeLessThanOrEqual(1)
    expect(widthDelta(afterWidths, beforeWidths, 'tab-7.ts')).toBeLessThanOrEqual(1)
    expect(editorTab('tab-6.ts').style.transform).toMatch(/^translateX/u)
  })

  it('uses the pointer cursor across the tab body but not the close button', async () => {
    renderTabHarness()

    await vi.waitFor(() => {
      expect(editorTabs()).toHaveLength(3)
    })

    const activeTab = editorTab('b.ts')
    const selectButton = tabSelectButton(activeTab)

    expect(getComputedStyle(activeTab).cursor).toBe('pointer')
    expect(getComputedStyle(selectButton).cursor).toBe('pointer')
    expect(getComputedStyle(closeButton('Close b.ts')).cursor).toBe('default')
  })
})

function renderTabHarness(options: TabHarnessOptions = {}) {
  const container = document.createElement('main')
  container.style.height = '120px'
  container.style.width = `${options.containerWidth ?? 780}px`
  document.body.append(container)
  root = createRoot(container)

  flushSync(() => {
    root?.render(
      <ThemeProvider defaultTheme='dark' storageKey={THEME_STORAGE_KEY}>
        <EditorColorThemeProvider>
          <TooltipProvider delay={0}>
            <QueryClientProvider client={new QueryClient()}>
              <EditorStateProvider>
                <TabHarness
                  activeName={options.activeName ?? 'b.ts'}
                  closeDelayMs={options.closeDelayMs ?? 0}
                  closeName={options.closeName ?? 'b.ts'}
                  names={options.names ?? ['a.ts', 'b.ts', 'c.ts']}
                />
              </EditorStateProvider>
            </QueryClientProvider>
          </TooltipProvider>
        </EditorColorThemeProvider>
      </ThemeProvider>,
    )
  })
}

type TabHarnessOptions = {
  readonly activeName?: string
  readonly closeDelayMs?: number
  readonly closeName?: string
  readonly containerWidth?: number
  readonly names?: readonly string[]
}

function TabHarness({
  activeName,
  closeDelayMs,
  closeName,
  names,
}: Required<Pick<TabHarnessOptions, 'activeName' | 'closeDelayMs' | 'closeName' | 'names'>>) {
  const tabListRef = useRef<HTMLDivElement | null>(null)
  const selectedTabRef = useRef<HTMLDivElement | null>(null)
  const [tabs, setTabs] = useState(() => editorTabModels(names, activeName))
  const visualTabs = useMemo(() => tabs.map((tab) => ({ phase: 'present' as const, tab })), [tabs])

  function closeTab(tabId: string) {
    setTabs((current) => {
      const next = current.filter((tab) => tab.id !== tabId)
      return next.map((tab, index) => ({ ...tab, active: index === 0 }))
    })
  }

  function handleClose(tabId: string) {
    if (closeDelayMs > 0) {
      window.setTimeout(() => closeTab(tabId), closeDelayMs)
      return true
    }

    closeTab(tabId)

    return true
  }

  return (
    <>
      <button
        type='button'
        aria-label={`Direct close ${closeName}`}
        onClick={() => closeTab(closeName)}
      />
      <div ref={tabListRef} role='tablist'>
        <ChromeEditorTabList
          drag={idleDragController()}
          selectedTabRef={selectedTabRef}
          tabListRef={tabListRef}
          tabs={visualTabs}
          onClose={handleClose}
          onCloseTabs={() => true}
          onSelect={() => undefined}
          onSplit={() => true}
        />
      </div>
    </>
  )
}

function editorTabModels(names: readonly string[], activeName: string): EditorTabModel[] {
  return names.map((name) => ({
    active: name === activeName,
    copyPath: name,
    copyRelativePath: name,
    diffStatus: null,
    diffSuffix: '',
    icon: iconForEntry({ name, type: 'file' }),
    id: name,
    name,
    path: name,
    title: name,
  }))
}

function idleDragController(): EditorTabDragController {
  return {
    draggedTabId: null,
    state: null,
    onDragEnd: () => undefined,
    onDragLeave: () => undefined,
    onDragOver: () => undefined,
    onDragStart: () => undefined,
    onDrop: () => undefined,
  }
}

function editorTabs() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-editor-tab-id]'))
}

function editorTab(tabId: string) {
  const tab = document.querySelector<HTMLElement>(`[data-editor-tab-id="${tabId}"]`)
  if (!tab) throw new Error(`Missing tab ${tabId}`)

  return tab
}

function queryEditorTab(tabId: string) {
  return document.querySelector<HTMLElement>(`[data-editor-tab-id="${tabId}"]`)
}

function tabSelectButton(tab: HTMLElement) {
  const button = tab.querySelector<HTMLElement>('[role="tab"]')
  if (!button) throw new Error('Missing tab select button')

  return button
}

function editorTabWidths() {
  return editorTabs().map((tab) => tab.getBoundingClientRect().width)
}

function editorTabWidthsById() {
  return new Map(editorTabs().map((tab) => [tab.dataset.editorTabId ?? '', tab.offsetWidth]))
}

function widthDelta(
  current: ReadonlyMap<string, number>,
  previous: ReadonlyMap<string, number>,
  id: string,
) {
  return Math.abs((current.get(id) ?? 0) - (previous.get(id) ?? 0))
}

function crampedTabNames() {
  return Array.from({ length: 10 }, (_value, index) => `tab-${index + 1}.ts`)
}

function closeButton(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!button) throw new Error(`Missing ${label}`)

  return button
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function settledReactUpdate() {
  return Promise.resolve()
}

function closeSpacerWidth() {
  const spacer = document.querySelector<HTMLElement>('[data-chrome-close-spacer]')
  if (!spacer) throw new Error('Missing close spacer')

  return spacer.getBoundingClientRect().width
}
