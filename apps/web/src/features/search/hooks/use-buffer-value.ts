import type { SearchBufferSnapshot } from '@/features/search/state/buffer-state'
import { useSearchBufferState } from '@/features/search/state/buffer-state'

export function useSearchBufferValue<T>(
  rootPath: string,
  selector: (snapshot: SearchBufferSnapshot) => T,
  fallback: T,
): T {
  return useSearchBufferState((state) => {
    const snapshot = state.active
    if (snapshot?.rootPath !== rootPath) return fallback

    return selector(snapshot)
  })
}
