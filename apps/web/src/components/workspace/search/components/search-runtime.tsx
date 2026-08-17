import { searchRuntimeEnabled } from '@/components/workspace/search/utils/search-runtime-state'
import { useSearchBufferRuntime } from '@/features/search/hooks/use-buffer-runtime'

export function SearchRuntime({ rootPath }: { rootPath: string }) {
  const enabled = searchRuntimeEnabled(rootPath)

  useSearchBufferRuntime(rootPath, enabled)

  return null
}
