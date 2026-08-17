import type { SearchBufferStatus } from '@/features/search/state/buffer-state'
import { useSearchBufferValue } from '@/features/search/hooks/use-buffer-value'

export function useSearchBufferStatus(rootPath: string) {
  const error = useSearchBufferValue(rootPath, (snapshot) => snapshot.error, null)
  const status = useSearchBufferValue<SearchBufferStatus>(
    rootPath,
    (snapshot) => snapshot.status,
    'idle',
  )

  return { error, status }
}
