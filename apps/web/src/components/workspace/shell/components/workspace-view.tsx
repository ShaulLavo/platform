import { SearchRuntime } from '@/components/workspace/search/components/search-runtime'
import { GitStoreProvider } from '@/features/git/providers/git-store-provider'
import { ChatModeSurfaceView } from '@/features/chat-mode/components/surface-view'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { EditorSurfaceLayoutView } from '@/features/workbench/components/editor-surface-layout-view'
import type { PickedFsEntry } from '@/lib/file-system-types'
import type { EditorKeymapLayer } from '@singapor/core'

type WorkspaceViewProps = {
  editorKeymapLayers: readonly EditorKeymapLayer[]
  rootFolder: PickedFsEntry
}

export function WorkspaceView({ editorKeymapLayers, rootFolder }: WorkspaceViewProps) {
  const rootPath = rootFolder.path
  const uiMode = useEditorWorkspaceState((state) => state.uiMode)

  return (
    <GitStoreProvider rootPath={rootPath}>
      <SearchRuntime rootPath={rootPath} />
      <div className='h-full min-h-0 flex-1 overflow-auto'>
        <div className='flex h-full min-w-[1024px] flex-col'>
          <div className='relative min-h-0 flex-1 overflow-hidden' data-terminal-overlay-bounds>
            {uiMode === 'chat' ? (
              <ChatModeSurfaceView editorKeymapLayers={editorKeymapLayers} rootPath={rootPath} />
            ) : (
              <EditorSurfaceLayoutView
                editorKeymapLayers={editorKeymapLayers}
                rootPath={rootPath}
              />
            )}
          </div>
        </div>
      </div>
    </GitStoreProvider>
  )
}
