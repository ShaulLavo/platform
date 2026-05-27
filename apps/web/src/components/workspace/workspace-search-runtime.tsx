import { memo } from 'react'

import { workspaceSearchRuntimeEnabled } from '@/components/workspace/workspace-search-runtime-state'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { useSearchBufferRuntime } from '@/features/search/use-search-buffer'

export const WorkspaceSearchRuntime = memo(function WorkspaceSearchRuntime({
  rootPath,
}: {
  rootPath: string
}) {
  const enabled = useEditorWorkspaceState((state) =>
    workspaceSearchRuntimeEnabled(state, rootPath),
  )

  useSearchBufferRuntime(rootPath, enabled)

  return null
})
