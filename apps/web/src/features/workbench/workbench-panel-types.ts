import type { ComponentType } from 'react'
import type { SerializedDockview } from 'dockview-react'

export const SERIALIZED_WORKBENCH_STATE_VERSION = 1

export type WorkbenchPanelType = 'file' | 'diff' | 'terminal' | 'search'

export type WorkbenchFileEditorPanel = {
  readonly id: string
  readonly path: string
  readonly type: 'file'
}

export type WorkbenchDiffEditorPanel = {
  readonly diffDocumentId: string
  readonly id: string
  readonly type: 'diff'
}

export type WorkbenchTerminalPanel = {
  readonly id: string
  readonly sessionId: string
  readonly title: string | null
  readonly type: 'terminal'
}

export type WorkbenchSearchPanel = {
  readonly id: string
  readonly type: 'search'
}

export type WorkbenchPanel =
  | WorkbenchFileEditorPanel
  | WorkbenchDiffEditorPanel
  | WorkbenchTerminalPanel
  | WorkbenchSearchPanel

export type SerializedWorkbenchFileEditorPanel = WorkbenchFileEditorPanel
export type SerializedWorkbenchDiffEditorPanel = WorkbenchDiffEditorPanel
export type SerializedWorkbenchTerminalPanel = WorkbenchTerminalPanel
export type SerializedWorkbenchSearchPanel = WorkbenchSearchPanel

export type SerializedWorkbenchPanel =
  | SerializedWorkbenchFileEditorPanel
  | SerializedWorkbenchDiffEditorPanel
  | SerializedWorkbenchTerminalPanel
  | SerializedWorkbenchSearchPanel

export type WorkbenchState = {
  readonly activePanelId: string | null
  readonly layout: SerializedDockview | null
  readonly panels: readonly WorkbenchPanel[]
  readonly version: typeof SERIALIZED_WORKBENCH_STATE_VERSION
}

export type SerializedWorkbenchState = {
  readonly activePanelId: string | null
  readonly layout: SerializedDockview | null
  readonly panels: readonly SerializedWorkbenchPanel[]
  readonly version: typeof SERIALIZED_WORKBENCH_STATE_VERSION
}

export type WorkbenchPanelRendererPolicy = 'always' | 'onlyWhenVisible'

export type WorkbenchClosePolicy =
  | { readonly type: 'close' }
  | { readonly path: string; readonly type: 'confirm-dirty-file' }
  | { readonly sessionId: string; readonly type: 'dispose-terminal-session' }

export type WorkbenchPanelRenderProps<TPanel extends WorkbenchPanel = WorkbenchPanel> = {
  readonly active: boolean
  readonly panel: TPanel
}

export type WorkbenchPanelRenderer<TPanel extends WorkbenchPanel = WorkbenchPanel> = ComponentType<
  WorkbenchPanelRenderProps<TPanel>
>

export type WorkbenchCloseContext = {
  readonly isDirtyFile?: (path: string) => boolean
}

export type WorkbenchRestoreContext = {
  readonly rootPath: string | null
}

export type WorkbenchPanelDescriptor = {
  readonly closePolicy: (
    panel: WorkbenchPanel,
    context: WorkbenchCloseContext,
  ) => WorkbenchClosePolicy
  readonly component: string
  readonly rendererPolicy: (panel: WorkbenchPanel) => WorkbenchPanelRendererPolicy
  readonly restore: (data: unknown, context: WorkbenchRestoreContext) => WorkbenchPanel | null
  readonly serialize: (panel: WorkbenchPanel) => SerializedWorkbenchPanel
  readonly title: (panel: WorkbenchPanel) => string
  readonly type: WorkbenchPanelType
}

export type WorkbenchPanelRegistry = ReadonlyMap<WorkbenchPanelType, WorkbenchPanelDescriptor>
