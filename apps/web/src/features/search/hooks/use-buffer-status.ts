import type { WorkspaceSearchWarningEvent } from '@workspace/contracts'

import type { SearchBufferStatus } from '@/features/search/state/buffer-state'
import { useSearchBufferValue } from '@/features/search/hooks/use-buffer-value'

const NO_SEARCH_WARNINGS: readonly WorkspaceSearchWarningEvent[] = []

export function useSearchBufferStatus(rootPath: string) {
  const error = useSearchBufferValue(rootPath, (snapshot) => snapshot.error, null)
  const status = useSearchBufferValue<SearchBufferStatus>(
    rootPath,
    (snapshot) => snapshot.status,
    'idle',
  )
  const warnings = useSearchBufferValue(
    rootPath,
    (snapshot) => snapshot.warnings,
    NO_SEARCH_WARNINGS,
  )

  return { error, status, warnings }
}
