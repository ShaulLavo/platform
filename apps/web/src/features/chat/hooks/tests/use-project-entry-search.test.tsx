import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { useProjectEntrySearch } from '@/features/chat/hooks/use-project-entry-search'
import { expect, test } from '../../../../../test/fixtures'

const rootPath = '/repo/platform'

test('a burst of keystrokes costs one workspace search, not one per character', async ({
  client,
}) => {
  // The fixture points the app's RPC singleton at the real in-process server.
  expect(client).toBeDefined()

  const queryClient = createQueryClient()
  const { rerender } = renderHook((query: string) => useProjectEntrySearch(search(query)), {
    initialProps: '',
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })

  rerender('s')
  rerender('sr')
  rerender('src')

  // Only the settled query ever reaches the cache: 's' and 'sr' never ran.
  await waitFor(() => {
    expect(searchedQueries(queryClient)).toEqual(['', 'src'])
  })
})

test('the menu keeps reporting a search while keystrokes are ahead of the settled query', async ({
  client,
}) => {
  expect(client).toBeDefined()

  const queryClient = createQueryClient()
  const { rerender, result } = renderHook((query: string) => useProjectEntrySearch(search(query)), {
    initialProps: '',
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })

  rerender('src')

  expect(result.current.isSearching).toBe(true)
  await waitFor(() => {
    expect(result.current.isSearching).toBe(false)
  })
})

function search(query: string) {
  return { enabled: true, query, rootPath }
}

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

/** The query string each cached mention search ran with, oldest first. */
function searchedQueries(queryClient: QueryClient) {
  return queryClient
    .getQueryCache()
    .getAll()
    .filter((query) => query.queryKey[0] === 'chat-project-entries')
    .map((query) => query.queryKey[2])
}
