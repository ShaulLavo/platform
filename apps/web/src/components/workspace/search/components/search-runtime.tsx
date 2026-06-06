import { memo } from 'react'

import { searchRuntimeEnabled } from '@/components/workspace/search/utils/search-runtime-state'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { useSearchBufferRuntime } from '@/features/search/use-search-buffer-runtime'

export const SearchRuntime = memo(({ rootPath }: { rootPath: string }) => {
  const enabled = useEditorWorkspaceState((state) => searchRuntimeEnabled(state, rootPath))

  useSearchBufferRuntime(rootPath, enabled)

  return null
})
