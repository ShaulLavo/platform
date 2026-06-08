import '@workspace/ui/globals.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRef, useState } from 'react'

import { ChromeEditorTabList } from '@/components/workspace/editor-tabs/components/chrome-editor-tab-list'
import {
  primeChromeVisualTabsCache,
  useChromeVisualTabs,
} from '@/components/workspace/editor-tabs/hooks/use-chrome-visual-tabs'
import {
  CHROME_TAB_ACTIVE_MIN_WIDTH,
  CHROME_TAB_TRAILING_SLOT_WIDTH,
} from '@/components/workspace/editor-tabs/utils/chrome-tab-layout'
import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import { EditorStateProvider } from '@/features/editor/editor-state-provider'
import { EditorColorThemeProvider } from '@/features/editor/hooks/use-editor-color-theme'
import { iconForEntry } from '@/lib/file-icons'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@workspace/ui/components/tooltip'
import {
  WORKBENCH_TAB_DRAG_TYPE,
  type WorkbenchTabDragData,
} from '@/features/workbench/utils/drag-drop-data'
import {
  fileEditorSurfaceId,
  workbenchWindowId,
} from '@/features/tiling-surface-manager/engine/layout-ids'

const THEME_STORAGE_KEY = 'platform-chrome-tab-list-browser-theme'

let root: Root | null = null
let nextHarnessId = 0

afterEach(() => {
  if (root) {
    flushSync(() => root?.unmount())
    root = null
  }

  document.body.innerHTML = ''
  localStorage.removeItem(THEME_STORAGE_KEY)
})

describe('ChromeEditorTabList browser layout', () => {
  it('collapses a closed tab through CSS and holds survivor widths', async () => {
    renderTabHarness({ activeName: 'a.ts' })

    await vi.waitFor(() => {
      expect(editorTabs()).toHaveLength(3)
      expect(editorTabs().every((tab) => tab.getBoundingClientRect().width > 0)).toBe(true)
    })

    const beforeWidths = editorTabWidthsById()
    closeButton('Close b.ts').click()
    await settledReactUpdate()

    const closingTab = editorTab('b.ts')
    const afterWidths = editorTabWidthsById()
    expect(editorTabs()).toHaveLength(3)
    expect(closingTab).toHaveAttribute('data-editor-tab-phase', 'closing')
    expect(closingTab.style.width).toBe('18px')
    expect(editorTab('c.ts').style.transform).toBe('')
    expect(widthDelta(afterWidths, beforeWidths, 'a.ts')).toBeLessThanOrEqual(1)
    expect(widthDelta(afterWidths, beforeWidths, 'c.ts')).toBeLessThanOrEqual(1)
  })

  it('marks direct source removals as closing before delayed removal', async () => {
    renderTabHarness()

    await vi.waitFor(() => {
      expect(editorTabs()).toHaveLength(3)
      expect(editorTabs().every((tab) => tab.getBoundingClientRect().width > 0)).toBe(true)
    })

    closeButton('Direct close b.ts').click()
    await settledReactUpdate()

    expect(editorTabs()).toHaveLength(3)
    expect(editorTab('b.ts')).toHaveAttribute('data-editor-tab-phase', 'closing')
    expect(editorTab('b.ts').style.width).toBe('18px')
    expect(editorTab('c.ts').style.transform).toBe('')
  })

  it('retargets clicks on a closing tab to the next non-closing tab', async () => {
    renderTabHarness({ activeName: 'a.ts' })

    await vi.waitFor(() => {
      expect(editorTabs()).toHaveLength(3)
    })

    closeButton('Close b.ts').click()
    await settledReactUpdate()

    editorTab('b.ts').click()
    await settledReactUpdate()

    expect(editorTab('b.ts')).toHaveAttribute('data-editor-tab-phase', 'closing')
    expect(editorTab('c.ts')).toHaveAttribute('data-editor-tab-phase', 'closing')
  })

  it('does not resize cramped tabs on the first close frame', async () => {
    renderTabHarness({
      activeName: 'tab-1.ts',
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
    expect(queryEditorTab('tab-5.ts')).toHaveAttribute('data-editor-tab-phase', 'closing')
    expect(widthDelta(afterWidths, beforeWidths, 'tab-6.ts')).toBeLessThanOrEqual(1)
    expect(widthDelta(afterWidths, beforeWidths, 'tab-7.ts')).toBeLessThanOrEqual(1)
    expect(editorTab('tab-6.ts').style.transform).toBe('')
  })

  it('promotes the next tab to active width when the active tab closes', async () => {
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
    expect(queryEditorTab('tab-5.ts')).toHaveAttribute('data-editor-tab-phase', 'closing')
    expect(afterWidths.get('tab-6.ts')).toBe(
      CHROME_TAB_ACTIVE_MIN_WIDTH + CHROME_TAB_TRAILING_SLOT_WIDTH,
    )
    expect((afterWidths.get('tab-6.ts') ?? 0) > (beforeWidths.get('tab-6.ts') ?? 0)).toBe(true)
    expect(widthDelta(afterWidths, beforeWidths, 'tab-7.ts')).toBeLessThanOrEqual(1)
  })

  it('keeps the next close target under the same click point during a close burst', async () => {
    renderTabHarness({
      activeName: 'tab-1.ts',
      closeName: 'tab-5.ts',
      containerWidth: 460,
      names: crampedTabNames(),
    })

    await vi.waitFor(() => {
      expect(editorTabs()).toHaveLength(10)
      expect(editorTabs().every((tab) => tab.getBoundingClientRect().width > 0)).toBe(true)
    })

    const closePoint = elementCenter(closeButton('Close tab-5.ts'))
    closeButton('Close tab-5.ts').click()
    await settledReactUpdate()
    clickPoint(closePoint)
    await settledReactUpdate()

    expect(editorTab('tab-5.ts')).toHaveAttribute('data-editor-tab-phase', 'closing')
    expect(editorTab('tab-6.ts')).toHaveAttribute('data-editor-tab-phase', 'closing')
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
  const cacheKeyRef = useRef(`chrome-tab-browser-harness-${nextHarnessId++}`)
  const [tabs, setTabs] = useState(() => editorTabModels(names, activeName))
  const visualTabs = useChromeVisualTabs(tabs, true, sameEditorTab, cacheKeyRef.current)

  function closeTab(tabId: string) {
    setTabs((current) => {
      const closingIndex = current.findIndex((tab) => tab.id === tabId)
      const closingTab = current[closingIndex]
      const next = current.filter((tab) => tab.id !== tabId)
      if (!closingTab?.active) return next

      const activeIndex = Math.max(0, Math.min(closingIndex, next.length - 1))
      return next.map((tab, index) => ({ ...tab, active: index === activeIndex }))
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
      <div data-workbench-tab-strip-id='test-strip' ref={tabListRef} role='tablist'>
        <ChromeEditorTabList
          closeLayoutCacheKey={cacheKeyRef.current}
          dndByTabId={tabDndById(tabs)}
          selectedTabRef={selectedTabRef}
          tabListRef={tabListRef}
          tabs={visualTabs}
          onBeforeClose={() => primeChromeVisualTabsCache(cacheKeyRef.current, tabs, visualTabs)}
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

function sameEditorTab(left: EditorTabModel, right: EditorTabModel) {
  return left.id === right.id && left.active === right.active
}

function tabDndById(tabs: readonly EditorTabModel[]) {
  return new Map(tabs.map((tab, index) => [tab.id, tabDndData(tab, index)]))
}

function tabDndData(tab: EditorTabModel, index: number): WorkbenchTabDragData {
  return {
    capabilities: {
      canDetach: true,
      canDrag: true,
      canReorder: true,
    },
    dragType: WORKBENCH_TAB_DRAG_TYPE,
    sourceIndex: index,
    sourceWindowId: workbenchWindowId('test-window'),
    stripId: 'test-strip',
    surfaceId: fileEditorSurfaceId(tab.path),
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

function elementCenter(element: HTMLElement) {
  const rect = element.getBoundingClientRect()

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  }
}

function clickPoint(point: { readonly x: number; readonly y: number }) {
  const target = document.elementFromPoint(point.x, point.y)
  if (!target) throw new Error('Missing click target')

  target.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      clientX: point.x,
      clientY: point.y,
    }),
  )
}

function settledReactUpdate() {
  return Promise.resolve()
}
