import {
  diffDocumentLabel,
  diffDocumentTitle,
  parseDiffDocumentId,
} from '@/features/git/diff-document'
import { basename, displayPath } from '@/lib/path-formatters'

import {
  createDiffWorkbenchPanel,
  createFileWorkbenchPanel,
  createSearchWorkbenchPanel,
  createTerminalWorkbenchPanel,
  WORKBENCH_SEARCH_PANEL_ID,
} from './workbench-panel-ids'
import type {
  WorkbenchCloseContext,
  WorkbenchClosePolicy,
  WorkbenchPanel,
  WorkbenchPanelDescriptor,
  WorkbenchPanelRegistry,
  WorkbenchPanelRendererPolicy,
  WorkbenchPanelType,
  WorkbenchRestoreContext,
} from './workbench-panel-types'

export const WORKBENCH_DOCKVIEW_COMPONENT = 'workbenchPanel'

export const defaultWorkbenchPanelRegistry = createWorkbenchPanelRegistry([
  {
    closePolicy: fileClosePolicy,
    component: WORKBENCH_DOCKVIEW_COMPONENT,
    rendererPolicy: editorRendererPolicy,
    restore: restoreFilePanel,
    serialize: serializePanel,
    title: filePanelTitle,
    type: 'file',
  },
  {
    closePolicy: cleanClosePolicy,
    component: WORKBENCH_DOCKVIEW_COMPONENT,
    rendererPolicy: visibleRendererPolicy,
    restore: restoreDiffPanel,
    serialize: serializePanel,
    title: diffPanelTitle,
    type: 'diff',
  },
  {
    closePolicy: terminalClosePolicy,
    component: WORKBENCH_DOCKVIEW_COMPONENT,
    rendererPolicy: editorRendererPolicy,
    restore: restoreTerminalPanel,
    serialize: serializePanel,
    title: terminalPanelTitle,
    type: 'terminal',
  },
  {
    closePolicy: cleanClosePolicy,
    component: WORKBENCH_DOCKVIEW_COMPONENT,
    rendererPolicy: visibleRendererPolicy,
    restore: restoreSearchPanel,
    serialize: serializePanel,
    title: searchPanelTitle,
    type: 'search',
  },
])

export function createWorkbenchPanelRegistry(
  descriptors: readonly WorkbenchPanelDescriptor[],
): WorkbenchPanelRegistry {
  const registry = new Map<WorkbenchPanelType, WorkbenchPanelDescriptor>()

  for (const descriptor of descriptors) {
    if (registry.has(descriptor.type)) {
      throw new Error(`Duplicate workbench panel descriptor: ${descriptor.type}`)
    }

    registry.set(descriptor.type, descriptor)
  }

  return registry
}

export function workbenchPanelDescriptor(
  registry: WorkbenchPanelRegistry,
  type: WorkbenchPanelType,
) {
  return registry.get(type) ?? null
}

export function restoreWorkbenchPanel(
  registry: WorkbenchPanelRegistry,
  data: unknown,
  context: WorkbenchRestoreContext,
) {
  const type = serializedWorkbenchPanelType(data)
  if (!type) return null

  return registry.get(type)?.restore(data, context) ?? null
}

function serializePanel(panel: WorkbenchPanel) {
  return panel
}

function editorRendererPolicy(): WorkbenchPanelRendererPolicy {
  return 'always'
}

function visibleRendererPolicy(): WorkbenchPanelRendererPolicy {
  return 'onlyWhenVisible'
}

function fileClosePolicy(
  panel: WorkbenchPanel,
  context: WorkbenchCloseContext,
): WorkbenchClosePolicy {
  if (panel.type !== 'file') return { type: 'close' }
  if (!context.isDirtyFile?.(panel.path)) return { type: 'close' }

  return { path: panel.path, type: 'confirm-dirty-file' }
}

function cleanClosePolicy(): WorkbenchClosePolicy {
  return { type: 'close' }
}

function terminalClosePolicy(panel: WorkbenchPanel): WorkbenchClosePolicy {
  if (panel.type !== 'terminal') return { type: 'close' }

  return { sessionId: panel.sessionId, type: 'dispose-terminal-session' }
}

function restoreFilePanel(data: unknown, context: WorkbenchRestoreContext) {
  if (!isRecord(data)) return null
  if (data.type !== 'file') return null
  if (typeof data.path !== 'string') return null
  if (!isPathInWorkspace(data.path, context.rootPath)) return null

  return createFileWorkbenchPanel(data.path)
}

function restoreDiffPanel(data: unknown, context: WorkbenchRestoreContext) {
  if (!isRecord(data)) return null
  if (data.type !== 'diff') return null
  if (typeof data.diffDocumentId !== 'string') return null

  const diff = parseDiffDocumentId(data.diffDocumentId)
  if (!diff) return null
  if (!isPathInWorkspace(diff.path, context.rootPath)) return null

  return createDiffWorkbenchPanel(data.diffDocumentId)
}

function restoreTerminalPanel(data: unknown, context: WorkbenchRestoreContext) {
  if (!context.rootPath) return null
  if (!isRecord(data)) return null
  if (data.type !== 'terminal') return null
  if (typeof data.sessionId !== 'string') return null
  if (!data.sessionId) return null
  if (data.title !== null && data.title !== undefined && typeof data.title !== 'string') {
    return null
  }

  return createTerminalWorkbenchPanel({
    sessionId: data.sessionId,
    title: data.title ?? null,
  })
}

function restoreSearchPanel(data: unknown, context: WorkbenchRestoreContext) {
  if (!context.rootPath) return null
  if (!isRecord(data)) return null
  if (data.type !== 'search') return null
  if (data.id !== WORKBENCH_SEARCH_PANEL_ID) return null

  return createSearchWorkbenchPanel()
}

function filePanelTitle(panel: WorkbenchPanel) {
  if (panel.type !== 'file') return ''

  return basename(panel.path)
}

function diffPanelTitle(panel: WorkbenchPanel) {
  if (panel.type !== 'diff') return ''

  return diffDocumentLabel(panel.diffDocumentId)
}

function terminalPanelTitle(panel: WorkbenchPanel) {
  if (panel.type !== 'terminal') return ''

  return panel.title ?? 'Terminal'
}

function searchPanelTitle() {
  return 'Search'
}

export function workbenchPanelTooltip(panel: WorkbenchPanel, rootPath: string | null) {
  if (panel.type === 'file') return displayWorkbenchPath(panel.path)
  if (panel.type === 'diff') return diffDocumentTitle(panel.diffDocumentId)
  if (panel.type === 'search')
    return rootPath ? `${displayWorkbenchPath(rootPath)} search results` : 'Search'
  if (panel.title) return panel.title

  return `Terminal ${panel.sessionId}`
}

function displayWorkbenchPath(path: string) {
  if (path.startsWith('/')) return path

  return displayPath(path)
}

function serializedWorkbenchPanelType(data: unknown) {
  if (!isRecord(data)) return null
  if (!isWorkbenchPanelType(data.type)) return null

  return data.type
}

function isWorkbenchPanelType(value: unknown): value is WorkbenchPanelType {
  return value === 'file' || value === 'diff' || value === 'terminal' || value === 'search'
}

function isPathInWorkspace(path: string, rootPath: string | null) {
  if (!rootPath) return false
  if (path === rootPath) return true

  return path.startsWith(`${rootPath}/`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
