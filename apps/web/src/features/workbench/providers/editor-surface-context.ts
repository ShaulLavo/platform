import { createContext } from 'react'

import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import type { GitStoreApi } from '@/features/git/state'
import type { EditorKeymapLayer } from '@singapor/core'

import type { Surface, SurfaceId } from '@workspace/tiling/utils/layout-types'

export type EditorSurfaceContextValue = {
  readonly editorKeymapLayers: readonly EditorKeymapLayer[]
  readonly gitStore: GitStoreApi
  readonly requestCloseTab: RequestCloseTab
  readonly requestCloseTabs: RequestCloseTabs
  readonly rootPath: string
  readonly surfaceIdForEditorTabId: (tabId: string) => SurfaceId | null
  readonly tabModelForSurface: (surface: Surface, active: boolean) => EditorTabModel | null
}

export const EditorSurfaceContext = createContext<EditorSurfaceContextValue | null>(null)
