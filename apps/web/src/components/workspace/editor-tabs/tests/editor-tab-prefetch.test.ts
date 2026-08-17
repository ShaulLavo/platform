import { describe, expect, it } from 'vitest'

import {
  editorTabPrefetchRegistrationKey,
  editorTabPrefetchTarget,
} from '@/components/workspace/editor-tabs/utils/editor-tab-prefetch'
import { conflictDiffDocumentId } from '@/features/editor/conflict-diff-document'
import { snapshotDiffDocumentId } from '@/features/git/diff-document'
import type { FileDiff } from '@/features/git/types'
import { searchBufferDocumentId } from '@/features/search/utils/buffer-document'

describe('editor tab prefetch helpers', () => {
  it('creates stable registration keys from tab ids and paths', () => {
    expect(editorTabPrefetchRegistrationKey({ id: 'tab-a', path: '/repo/src/app.ts' })).toBe(
      'tab-a:/repo/src/app.ts',
    )
  })

  it('targets file-backed tabs for intent prefetching', () => {
    expect(editorTabPrefetchTarget({ id: 'tab-a', path: '/repo/src/app.ts' })).toEqual({
      id: 'tab-a',
      path: '/repo/src/app.ts',
    })
  })

  it('ignores virtual document tabs for intent prefetching', () => {
    expect(
      editorTabPrefetchTarget({
        id: 'tab-b',
        path: snapshotDiffDocumentId(snapshotDiff('/repo/src/app.ts')),
      }),
    ).toBeNull()
    expect(
      editorTabPrefetchTarget({ id: 'tab-c', path: conflictDiffDocumentId('conflict-1') }),
    ).toBeNull()
    expect(
      editorTabPrefetchTarget({ id: 'tab-d', path: searchBufferDocumentId('/repo') }),
    ).toBeNull()
  })
})

function snapshotDiff(path: string): FileDiff & { newObjectId: string; oldObjectId: string } {
  return {
    hunks: [],
    newObjectId: 'b'.repeat(40),
    oldObjectId: 'a'.repeat(40),
    patch: '',
    path,
    staged: false,
  }
}
