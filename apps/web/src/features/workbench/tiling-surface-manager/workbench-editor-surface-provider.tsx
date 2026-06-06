import type { ReactNode } from 'react'

import { WorkbenchEditorSurfaceContext } from './workbench-editor-surface-context'
import type { WorkbenchEditorSurfaceContextValue } from './workbench-editor-surface-context'

export function WorkbenchEditorSurfaceProvider({
  children,
  editorKeymapLayers,
  requestCloseTab,
  requestCloseTabs,
  rootPath,
  surfaceIdForEditorTabId,
  tabModelForSurface,
  toolSurfaceState,
}: WorkbenchEditorSurfaceContextValue & {
  readonly children: ReactNode
}) {
  return (
    <WorkbenchEditorSurfaceContext.Provider
      value={{
        editorKeymapLayers,
        requestCloseTab,
        requestCloseTabs,
        rootPath,
        surfaceIdForEditorTabId,
        tabModelForSurface,
        toolSurfaceState,
      }}
    >
      {children}
    </WorkbenchEditorSurfaceContext.Provider>
  )
}
