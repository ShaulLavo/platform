import { SearchBufferStatusState } from '@/features/search/search-buffer-status-state'
import { useSearchBufferStatus } from '@/features/search/use-search-buffer-status'

export function SearchBufferStatus({ rootPath }: { rootPath: string }) {
  const { error, status } = useSearchBufferStatus(rootPath)

  return <SearchBufferStatusState error={error} status={status} />
}
