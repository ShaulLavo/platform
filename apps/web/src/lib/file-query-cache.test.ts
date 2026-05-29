import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'bun:test'

import {
  FILE_CONTENT_QUERY_GC_TIME_MS,
  pruneFileContentQueryCache,
  setFileContentQueryData,
} from '@/lib/file-query-cache'
import type { FileResult } from '@/lib/file-system-types'
import { fileSystemKeys } from '@/lib/query-keys'

describe('file content query cache policy', () => {
  it('applies a shorter gc time to file content queries', () => {
    const client = new QueryClient()

    setFileContentQueryData(client, file('repo/a.ts'))

    const query = client.getQueryCache().find({ queryKey: fileSystemKeys.file('repo/a.ts') })
    expect(query?.gcTime).toBe(FILE_CONTENT_QUERY_GC_TIME_MS)
  })

  it('evicts the oldest inactive file content queries above the limit', () => {
    const client = new QueryClient()
    setFileContentQueryData(client, file('repo/a.ts'), { updatedAt: 1 })
    setFileContentQueryData(client, file('repo/b.ts'), { updatedAt: 2 })
    setFileContentQueryData(client, file('repo/c.ts'), { updatedAt: 3 })
    client.setQueryData(fileSystemKeys.quickOpenFiles('repo', 'a'), ['repo/a.ts'])

    expect(pruneFileContentQueryCache(client, 2)).toBe(1)
    expect(client.getQueryData(fileSystemKeys.file('repo/a.ts'))).toBeUndefined()
    expect(client.getQueryData(fileSystemKeys.file('repo/b.ts'))).toEqual(file('repo/b.ts'))
    expect(client.getQueryData(fileSystemKeys.file('repo/c.ts'))).toEqual(file('repo/c.ts'))
    expect(client.getQueryData(fileSystemKeys.quickOpenFiles('repo', 'a'))).toEqual(['repo/a.ts'])
  })
})

function file(path: string): FileResult {
  return {
    content: path,
    mtimeMs: 1,
    path,
    size: path.length,
    version: `test:1:${path.length}`,
  }
}
