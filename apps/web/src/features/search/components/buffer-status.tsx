import { SearchBufferStatusState } from '@/features/search/components/buffer-status-state'
import { useSearchBufferStatus } from '@/features/search/hooks/use-buffer-status'

export function SearchBufferStatus({ rootPath }: { rootPath: string }) {
  const { error, status, warnings } = useSearchBufferStatus(rootPath)

  return <SearchBufferStatusState error={error} status={status} warnings={warnings} />
}
