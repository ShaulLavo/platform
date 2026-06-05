import type {
  WorkbenchDiffEditorPanel,
  WorkbenchFileEditorPanel,
  WorkbenchSearchPanel,
  WorkbenchTerminalPanel,
} from '@/features/workbench/workbench-panel-types'

export const WORKBENCH_SEARCH_PANEL_ID = 'search:workspace'

export function fileWorkbenchPanelId(path: string) {
  return `file:${encodeWorkbenchPanelIdPart(path)}`
}

export function diffWorkbenchPanelId(diffDocumentId: string) {
  return `diff:${encodeWorkbenchPanelIdPart(diffDocumentId)}`
}

export function terminalWorkbenchPanelId(sessionId: string) {
  return `terminal:${encodeWorkbenchPanelIdPart(sessionId)}`
}

export function createFileWorkbenchPanel(path: string): WorkbenchFileEditorPanel {
  return {
    id: fileWorkbenchPanelId(path),
    path,
    type: 'file',
  }
}

export function createDiffWorkbenchPanel(diffDocumentId: string): WorkbenchDiffEditorPanel {
  return {
    diffDocumentId,
    id: diffWorkbenchPanelId(diffDocumentId),
    type: 'diff',
  }
}

export function createTerminalWorkbenchPanel({
  sessionId,
  title = null,
}: {
  sessionId: string
  title?: string | null
}): WorkbenchTerminalPanel {
  return {
    id: terminalWorkbenchPanelId(sessionId),
    sessionId,
    title,
    type: 'terminal',
  }
}

export function createSearchWorkbenchPanel(): WorkbenchSearchPanel {
  return {
    id: WORKBENCH_SEARCH_PANEL_ID,
    type: 'search',
  }
}

function encodeWorkbenchPanelIdPart(value: string) {
  return encodeURIComponent(value)
}
