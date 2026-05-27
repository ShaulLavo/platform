import { memo } from 'react'

import { useSearchBufferRuntime } from '@/features/search/use-search-buffer'

export const WorkspaceSearchRuntime = memo(function WorkspaceSearchRuntime({
  active,
  rootPath,
}: {
  active: boolean
  rootPath: string
}) {
  useSearchBufferRuntime(rootPath, active)

  return null
})
