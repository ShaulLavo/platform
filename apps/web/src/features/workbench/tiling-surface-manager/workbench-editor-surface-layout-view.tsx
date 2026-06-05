import { EMPTY_GIT_FILES, editorTabModel } from '@/components/workspace/editor-tab-model'
import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import { useEditorConflictState } from '@/features/editor/state/editor-conflict-state'
import { useStatus } from '@/features/git/hooks'
import type { EditorKeymapLayer } from '@editor/core'

import { WorkbenchLayoutProvider } from './workbench-layout-provider'
import { WorkbenchLayoutRenderer } from './workbench-layout-renderer'
import { editorSurfaceSerializedState } from './workbench-editor-surface-layout'
import { useWorkbenchEditorSurfaceStore } from './use-workbench-editor-surface-store'
import { WorkbenchEditorSurfaceProvider } from './workbench-editor-surface-provider'
import { workbenchEditorSurfaceRendererRegistry } from './workbench-editor-surface-renderers'
import type { Surface } from './layout-types'

export function WorkbenchEditorSurfaceLayoutView({
  editorKeymapLayers,
  rootPath,
  onRequestCloseTab,
  onRequestCloseTabs,
}: {
  readonly editorKeymapLayers: readonly EditorKeymapLayer[]
  readonly rootPath: string
  readonly onRequestCloseTab: RequestCloseTab
  readonly onRequestCloseTabs: RequestCloseTabs
}) {
  const store = useWorkbenchEditorSurfaceStore({
    requestCloseTab: onRequestCloseTab,
  })
  const conflicts = useEditorConflictState((state) => state.conflicts)
  const gitStatus = useStatus(rootPath)
  const gitFiles = gitStatus.data?.files ?? EMPTY_GIT_FILES

  return (
    <WorkbenchEditorSurfaceProvider
      editorKeymapLayers={editorKeymapLayers}
      requestCloseTab={onRequestCloseTab}
      requestCloseTabs={onRequestCloseTabs}
      rootPath={rootPath}
      surfaceIdForEditorTabId={(tabId) => {
        const surface = Object.values(store.getState().layout.surfacesById).find(
          (surface) => editorSurfaceSerializedState(surface)?.editorTabId === tabId,
        )

        return surface?.id ?? null
      }}
      tabModelForSurface={(surface, active) =>
        editorTabModelForSurface(surface, {
          active,
          conflicts,
          gitFiles,
          rootPath,
        })
      }
    >
      <WorkbenchLayoutProvider store={store}>
        <WorkbenchLayoutRenderer surfaceRenderers={workbenchEditorSurfaceRendererRegistry} />
      </WorkbenchLayoutProvider>
    </WorkbenchEditorSurfaceProvider>
  )
}

function editorTabModelForSurface(
  surface: Surface,
  {
    active,
    conflicts,
    gitFiles,
    rootPath,
  }: {
    readonly active: boolean
    readonly conflicts: Parameters<typeof editorTabModel>[0]['conflicts']
    readonly gitFiles: Parameters<typeof editorTabModel>[0]['gitFiles']
    readonly rootPath: string
  },
) {
  const editorState = editorSurfaceSerializedState(surface)
  if (!editorState) return null
  if (!surface.resourceKey) return null

  return editorTabModel({
    conflicts,
    gitFiles,
    rootPath,
    selectedTabId: active ? editorState.editorTabId : null,
    tab: {
      id: editorState.editorTabId,
      path: surface.resourceKey,
    },
  })
}
