import { createContext } from 'react'

import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import type { EditorTabModel } from '@/components/workspace/editor-tab-types'
import type { EditorKeymapLayer } from '@editor/core'

import type { Surface, SurfaceId } from './layout-types'

export type WorkbenchEditorSurfaceContextValue = {
  readonly editorKeymapLayers: readonly EditorKeymapLayer[]
  readonly requestCloseTab: RequestCloseTab
  readonly requestCloseTabs: RequestCloseTabs
  readonly rootPath: string
  readonly surfaceIdForEditorTabId: (tabId: string) => SurfaceId | null
  readonly tabModelForSurface: (surface: Surface, active: boolean) => EditorTabModel | null
}

export const WorkbenchEditorSurfaceContext =
  createContext<WorkbenchEditorSurfaceContextValue | null>(null)
