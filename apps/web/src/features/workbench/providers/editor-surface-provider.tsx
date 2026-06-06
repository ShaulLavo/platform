import type { ReactNode } from 'react'

import { EditorSurfaceContext } from '@/features/workbench/providers/editor-surface-context'
import type { EditorSurfaceContextValue } from '@/features/workbench/providers/editor-surface-context'

export function EditorSurfaceProvider({
  children,
  editorKeymapLayers,
  gitStore,
  requestCloseTab,
  requestCloseTabs,
  rootPath,
  surfaceIdForEditorTabId,
  tabModelForSurface,
}: EditorSurfaceContextValue & {
  readonly children: ReactNode
}) {
  return (
    <EditorSurfaceContext.Provider
      value={{
        editorKeymapLayers,
        gitStore,
        requestCloseTab,
        requestCloseTabs,
        rootPath,
        surfaceIdForEditorTabId,
        tabModelForSurface,
      }}
    >
      {children}
    </EditorSurfaceContext.Provider>
  )
}
