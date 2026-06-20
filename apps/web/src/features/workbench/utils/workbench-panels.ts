import {
  createEditorTabRecord,
  type EditorTabRecord,
} from '@/components/workspace/editor-tabs/utils/editor-tab-model'

export type WorkbenchSidebarTab = 'chat' | 'files' | 'git' | 'logs' | 'search'
export type WorkbenchBottomTab = 'terminal' | 'problems'

export type WorkbenchOuterLayout = {
  readonly main: number
  readonly sidebar: number
}

export type WorkbenchMainLayout = {
  readonly bottom: number
  readonly editor: number
}

export type WorkbenchPanels = {
  readonly activeBottomTab: WorkbenchBottomTab
  readonly activeEditorTabId: string | null
  readonly activeSidebarTab: WorkbenchSidebarTab
  readonly editorTabs: readonly EditorTabRecord[]
  readonly mainLayout: WorkbenchMainLayout
  readonly outerLayout: WorkbenchOuterLayout
}

export const SIDEBAR_MIN_SIZE = 220
export const SIDEBAR_MAX_SIZE = 520
export const BOTTOM_MIN_SIZE = 140
export const BOTTOM_MAX_SIZE = 480

const DEFAULT_OUTER_LAYOUT: WorkbenchOuterLayout = {
  main: 76,
  sidebar: 24,
}
const DEFAULT_MAIN_LAYOUT: WorkbenchMainLayout = {
  bottom: 30,
  editor: 70,
}

export function createDefaultWorkbenchPanels(): WorkbenchPanels {
  return {
    activeBottomTab: 'terminal',
    activeEditorTabId: null,
    activeSidebarTab: 'files',
    editorTabs: [],
    mainLayout: DEFAULT_MAIN_LAYOUT,
    outerLayout: DEFAULT_OUTER_LAYOUT,
  }
}

export function activeEditorPathForWorkbenchPanels(panels: WorkbenchPanels) {
  return activeEditorTabForWorkbenchPanels(panels)?.path ?? null
}

export function activeEditorTabForWorkbenchPanels(panels: WorkbenchPanels) {
  if (!panels.activeEditorTabId) return panels.editorTabs[0] ?? null

  return editorTabById(panels, panels.activeEditorTabId) ?? panels.editorTabs[0] ?? null
}

export function editorOpenPathsForWorkbenchPanels(panels: WorkbenchPanels) {
  return Array.from(new Set(panels.editorTabs.map((tab) => tab.path)))
}

export function editorPathCountsForWorkbenchPanels(panels: WorkbenchPanels) {
  const counts = new Map<string, number>()
  for (const tab of panels.editorTabs) {
    counts.set(tab.path, (counts.get(tab.path) ?? 0) + 1)
  }

  return counts
}

export function editorTabRecordsForWorkbenchPanels(panels: WorkbenchPanels) {
  return panels.editorTabs
}

export function openEditorPathInWorkbenchPanels(panels: WorkbenchPanels, path: string) {
  const existing = panels.editorTabs.find((tab) => tab.path === path)
  if (existing) return selectEditorTabInWorkbenchPanels(panels, existing.id)

  const tab = createEditorTabRecord(path)
  return {
    ...panels,
    activeEditorTabId: tab.id,
    editorTabs: [...panels.editorTabs, tab],
  }
}

export function closeEditorTabInWorkbenchPanels(panels: WorkbenchPanels, tabId: string) {
  const index = panels.editorTabs.findIndex((tab) => tab.id === tabId)
  if (index < 0) return panels

  const editorTabs = panels.editorTabs.filter((tab) => tab.id !== tabId)
  return {
    ...panels,
    activeEditorTabId: activeEditorTabIdAfterClose(panels, editorTabs, index, tabId),
    editorTabs,
  }
}

export function closeEditorPathInWorkbenchPanels(panels: WorkbenchPanels, path: string) {
  const editorTabs = panels.editorTabs.filter((tab) => tab.path !== path)
  if (editorTabs.length === panels.editorTabs.length) return panels

  return {
    ...panels,
    activeEditorTabId: activeEditorTabIdAfterPathClose(panels, editorTabs),
    editorTabs,
  }
}

export function renameEditorPathInWorkbenchPanels(
  panels: WorkbenchPanels,
  from: string,
  to: string,
): WorkbenchPanels {
  let renamed = false
  const editorTabs = panels.editorTabs.map((tab) => {
    if (tab.path !== from) return tab

    renamed = true
    return { ...tab, path: to }
  })
  if (!renamed) return panels

  return { ...panels, editorTabs }
}

export function reorderEditorTabInWorkbenchPanels(
  panels: WorkbenchPanels,
  tabId: string,
  targetIndex: number,
) {
  const sourceIndex = panels.editorTabs.findIndex((tab) => tab.id === tabId)
  if (sourceIndex < 0) return panels
  if (sourceIndex === targetIndex) return panels

  const editorTabs = [...panels.editorTabs]
  const [tab] = editorTabs.splice(sourceIndex, 1)
  if (!tab) return panels

  editorTabs.splice(clampedInsertionIndex(targetIndex, editorTabs.length), 0, tab)
  return { ...panels, editorTabs }
}

export function selectEditorTabInWorkbenchPanels(panels: WorkbenchPanels, tabId: string) {
  if (!editorTabById(panels, tabId)) return panels
  if (panels.activeEditorTabId === tabId) return panels

  return { ...panels, activeEditorTabId: tabId }
}

export function setWorkbenchSidebarTab(
  panels: WorkbenchPanels,
  activeSidebarTab: WorkbenchSidebarTab,
) {
  if (panels.activeSidebarTab === activeSidebarTab) return panels

  return { ...panels, activeSidebarTab }
}

export function setWorkbenchBottomTab(
  panels: WorkbenchPanels,
  activeBottomTab: WorkbenchBottomTab,
) {
  if (panels.activeBottomTab === activeBottomTab) return panels

  return { ...panels, activeBottomTab }
}

export function setWorkbenchOuterLayout(
  panels: WorkbenchPanels,
  layout: Partial<Record<keyof WorkbenchOuterLayout, number>>,
) {
  const outerLayout = normalizeOuterLayout(layout)
  if (outerLayoutsEqual(panels.outerLayout, outerLayout)) return panels

  return { ...panels, outerLayout }
}

export function setWorkbenchMainLayout(
  panels: WorkbenchPanels,
  layout: Partial<Record<keyof WorkbenchMainLayout, number>>,
) {
  const mainLayout = normalizeMainLayout(layout)
  if (mainLayoutsEqual(panels.mainLayout, mainLayout)) return panels

  return { ...panels, mainLayout }
}

export function normalizeWorkbenchPanels(value: WorkbenchPanels): WorkbenchPanels {
  return {
    activeBottomTab: value.activeBottomTab,
    activeEditorTabId: normalizedActiveTabId(value),
    activeSidebarTab: value.activeSidebarTab,
    editorTabs: value.editorTabs,
    mainLayout: normalizeMainLayout(value.mainLayout),
    outerLayout: normalizeOuterLayout(value.outerLayout),
  }
}

function editorTabById(panels: WorkbenchPanels, tabId: string) {
  return panels.editorTabs.find((tab) => tab.id === tabId) ?? null
}

function activeEditorTabIdAfterClose(
  panels: WorkbenchPanels,
  nextTabs: readonly EditorTabRecord[],
  closedIndex: number,
  closedTabId: string,
) {
  if (panels.activeEditorTabId !== closedTabId) return normalizedActiveTabIdFor(nextTabs, panels)

  return nextTabs[Math.min(closedIndex, nextTabs.length - 1)]?.id ?? null
}

function activeEditorTabIdAfterPathClose(
  panels: WorkbenchPanels,
  nextTabs: readonly EditorTabRecord[],
) {
  return normalizedActiveTabIdFor(nextTabs, panels)
}

function normalizedActiveTabId(panels: WorkbenchPanels) {
  return normalizedActiveTabIdFor(panels.editorTabs, panels)
}

function normalizedActiveTabIdFor(
  tabs: readonly EditorTabRecord[],
  panels: Pick<WorkbenchPanels, 'activeEditorTabId'>,
) {
  if (!panels.activeEditorTabId) return tabs[0]?.id ?? null
  if (tabs.some((tab) => tab.id === panels.activeEditorTabId)) return panels.activeEditorTabId

  return tabs[0]?.id ?? null
}

function clampedInsertionIndex(index: number, length: number) {
  return clamp(index, 0, length)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeOuterLayout(
  layout: Partial<Record<keyof WorkbenchOuterLayout, number>>,
): WorkbenchOuterLayout {
  const normalized = normalizeSplitLayout(
    layout.sidebar,
    layout.main,
    DEFAULT_OUTER_LAYOUT.sidebar,
    DEFAULT_OUTER_LAYOUT.main,
  )

  return {
    main: normalized.second,
    sidebar: normalized.first,
  }
}

function normalizeMainLayout(
  layout: Partial<Record<keyof WorkbenchMainLayout, number>>,
): WorkbenchMainLayout {
  const normalized = normalizeSplitLayout(
    layout.editor,
    layout.bottom,
    DEFAULT_MAIN_LAYOUT.editor,
    DEFAULT_MAIN_LAYOUT.bottom,
  )

  return {
    bottom: normalized.second,
    editor: normalized.first,
  }
}

function normalizeSplitLayout(
  first: number | undefined,
  second: number | undefined,
  fallbackFirst: number,
  fallbackSecond: number,
) {
  const fallback = {
    first: fallbackFirst,
    second: fallbackSecond,
  }
  if (!isLayoutSize(first)) return fallback
  if (!isLayoutSize(second)) return fallback

  const total = first + second
  if (total <= 0) return fallback

  const normalizedFirst = (first / total) * 100
  return {
    first: normalizedFirst,
    second: 100 - normalizedFirst,
  }
}

function isLayoutSize(value: number | undefined): value is number {
  if (typeof value !== 'number') return false
  if (!Number.isFinite(value)) return false

  return value >= 0 && value <= 100
}

function outerLayoutsEqual(left: WorkbenchOuterLayout, right: WorkbenchOuterLayout) {
  if (left.sidebar !== right.sidebar) return false

  return left.main === right.main
}

function mainLayoutsEqual(left: WorkbenchMainLayout, right: WorkbenchMainLayout) {
  if (left.editor !== right.editor) return false

  return left.bottom === right.bottom
}
