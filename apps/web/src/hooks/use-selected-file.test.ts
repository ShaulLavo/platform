import { describe, expect, it } from 'bun:test'

import { fileLoadState } from '@/hooks/use-selected-file'
import type { FileResult } from '@/lib/file-system-types'

describe('fileLoadState', () => {
  it('does not enter a loading state for placeholder data from another path', () => {
    const state = fileLoadState(
      {
        data: file('repo/a.ts'),
        error: null,
        isError: false,
        isPending: false,
      },
      'repo/b.ts',
    )

    expect(state).toEqual({ status: 'idle' })
  })

  it('returns ready when the loaded file matches the selected path', () => {
    const loadedFile = file('repo/a.ts')
    const state = fileLoadState(
      {
        data: loadedFile,
        error: null,
        isError: false,
        isPending: false,
      },
      'repo/a.ts',
    )

    expect(state).toEqual({ status: 'ready', data: loadedFile })
  })
})

function file(path: string): FileResult {
  return {
    content: '',
    mtimeMs: 1,
    path,
    size: 1,
    version: 'test:1:1',
  }
}
