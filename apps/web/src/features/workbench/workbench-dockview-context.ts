import { createContext } from 'react'

import type { EditorTabConflictMap } from '@/components/workspace/editor-tab-types'
import type {
  EditorTabDragController,
  EditorTabDragItem,
} from '@/components/workspace/use-editor-tab-drag'
import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import type { FileStatus } from '@/features/git/types'
import type { EditorKeymapLayer } from '@editor/core'

import type { WorkbenchDockviewPanelRecord } from './workbench-dockview-model'

export type WorkbenchDockviewContextValue = {
  readonly chromeTabDrag: WorkbenchDockviewChromeTabDragContext | null
  readonly conflicts: EditorTabConflictMap
  readonly editorKeymapLayers: readonly EditorKeymapLayer[]
  readonly gitFiles: readonly FileStatus[]
  readonly recordsById: ReadonlyMap<string, WorkbenchDockviewPanelRecord>
  readonly requestCloseTab: RequestCloseTab
  readonly requestCloseTabs: RequestCloseTabs
  readonly rootPath: string
}

export type WorkbenchDockviewChromeTabDragContext = {
  readonly controller: EditorTabDragController
  readonly setTabListElement: (element: HTMLDivElement | null) => void
  readonly tabs: readonly EditorTabDragItem[]
}

export const WorkbenchDockviewContext = createContext<WorkbenchDockviewContextValue | null>(null)
