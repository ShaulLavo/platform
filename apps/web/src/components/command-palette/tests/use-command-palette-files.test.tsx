import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { expect, test } from '../../../../test/fixtures'
import type { FilePaletteItem } from '@/components/command-palette/command-palette-types'
import { useCommandPaletteFiles } from '@/components/command-palette/use-command-palette-files'
import type { LoadState } from '@/lib/load-state'
import type { TreeModel } from '@/lib/tree-model'

test('does not show stale quick-open file results after the query changes', async ({ client }) => {
  await client.fs['create-folder'].post({ path: 'repo', recursive: true })
  await client.fs['create-file'].post({ path: 'repo/rendering.ts' })
  await client.fs['create-file'].post({ path: 'repo/default-bindings.ts' })

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const { result, rerender } = renderHook(
    ({ query }: { query: string }) =>
      useCommandPaletteFiles({
        mode: 'files',
        open: true,
        query,
        rootPath: 'repo',
        treeState: emptyTreeState(),
      }),
    {
      initialProps: { query: 'rendering' },
      wrapper: queryClientWrapper(queryClient),
    },
  )

  await waitFor(() =>
    expect(filePaths(result.current.visibleFileItems)).toEqual(['repo/rendering.ts']),
  )

  rerender({ query: 'binding' })

  expect(filePaths(result.current.visibleFileItems)).toEqual([])

  await waitFor(() =>
    expect(filePaths(result.current.visibleFileItems)).toEqual(['repo/default-bindings.ts']),
  )
  queryClient.clear()
})

function queryClientWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function emptyTreeState(): LoadState<TreeModel> {
  return {
    data: {
      entriesByTreePath: new Map(),
      errorByDirectoryPath: new Map(),
      loadedDirectoryPaths: new Set(),
      loadingDirectoryPaths: new Set(),
      paths: [],
    },
    status: 'ready',
  }
}

function filePaths(items: readonly FilePaletteItem[]) {
  return items.map((item) => item.entry.path)
}
