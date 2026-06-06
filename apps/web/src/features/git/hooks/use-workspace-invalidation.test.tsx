import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { fileSystemKeys, gitKeys } from '@/lib/query-keys'
import { useWorkspaceInvalidation } from './use-workspace-invalidation'

// Real QueryClient + real provider — the only stand-in is the spy used to count
// invalidations, and it calls straight through to the real method.
describe('useWorkspaceInvalidation', () => {
  it('invalidates git and filesystem queries on the active query client', () => {
    const queryClient = new QueryClient()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useWorkspaceInvalidation(), { wrapper })
    result.current()

    expect(invalidateQueries).toHaveBeenCalledTimes(3)
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: gitKeys.all })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: fileSystemKeys.fileSnapshots() })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: fileSystemKeys.trees() })
  })
})
