import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import {
  FILE_SNAPSHOT_QUERY_GC_TIME_MS,
  pruneFileSnapshotQueryCache,
  setFileSnapshotQueryData,
} from '@/lib/file-snapshot-query-cache'
import type { FileResult } from '@/lib/file-system-types'
import { fileSystemKeys } from '@/lib/query-keys'

describe('file snapshot query cache policy', () => {
  it('applies a shorter gc time to file snapshot queries', () => {
    const client = new QueryClient()

    setFileSnapshotQueryData(client, file('repo/a.ts'))

    const query = client
      .getQueryCache()
      .find({ queryKey: fileSystemKeys.fileSnapshot('repo/a.ts') })
    expect(query?.gcTime).toBe(FILE_SNAPSHOT_QUERY_GC_TIME_MS)
  })

  it('evicts the oldest inactive file snapshot queries above the limit', () => {
    const client = new QueryClient()
    setFileSnapshotQueryData(client, file('repo/a.ts'), { updatedAt: 1 })
    setFileSnapshotQueryData(client, file('repo/b.ts'), { updatedAt: 2 })
    setFileSnapshotQueryData(client, file('repo/c.ts'), { updatedAt: 3 })
    client.setQueryData(fileSystemKeys.quickOpenFiles('repo', 'a'), ['repo/a.ts'])

    expect(pruneFileSnapshotQueryCache(client, 2)).toBe(1)
    expect(client.getQueryData(fileSystemKeys.fileSnapshot('repo/a.ts'))).toBeUndefined()
    expect(client.getQueryData(fileSystemKeys.fileSnapshot('repo/b.ts'))).toEqual(file('repo/b.ts'))
    expect(client.getQueryData(fileSystemKeys.fileSnapshot('repo/c.ts'))).toEqual(file('repo/c.ts'))
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
