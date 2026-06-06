import { createContext } from 'react'

import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import type { TreeEntry } from '@/lib/file-system-types'
import type { LoadState } from '@/lib/load-state'
import type { DirectoryLoadOptions, TreeModel } from '@/lib/tree-model'
import type { EditorKeymapLayer } from '@editor/core'

import type { Surface, SurfaceId } from './layout-types'

export type WorkbenchEditorSurfaceContextValue = {
  readonly editorKeymapLayers: readonly EditorKeymapLayer[]
  readonly requestCloseTab: RequestCloseTab
  readonly requestCloseTabs: RequestCloseTabs
  readonly rootPath: string
  readonly surfaceIdForEditorTabId: (tabId: string) => SurfaceId | null
  readonly tabModelForSurface: (surface: Surface, active: boolean) => EditorTabModel | null
  readonly toolSurfaceState?: {
    readonly treeState: LoadState<TreeModel>
    readonly visibleTreeItemCount: number | null
    readonly onLoadDirectory: (
      entry: TreeEntry,
      treePath: string,
      options?: DirectoryLoadOptions,
    ) => void
    readonly onPrefetchDirectory: (entry: TreeEntry, treePath: string) => void
    readonly onVisibleTreeItemCountChange: (count: number) => void
  }
}

export const WorkbenchEditorSurfaceContext =
  createContext<WorkbenchEditorSurfaceContextValue | null>(null)
