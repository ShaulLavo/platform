import { describe, expect, it } from 'bun:test'

import {
  editorTabIntentPrefetchKey,
  editorTabPrefetchRegistrationKey,
} from '@/components/workspace/editor-tab-prefetch'
import { conflictDiffDocumentId } from '@/features/editor/conflict-diff-document'
import { diffDocumentId } from '@/features/git/diff-document'
import { searchBufferDocumentId } from '@/features/search/search-buffer-document'

describe('editor tab prefetch helpers', () => {
  it('creates stable registration keys from tab ids and paths', () => {
    expect(editorTabPrefetchRegistrationKey({ id: 'tab-a', path: '/repo/src/app.ts' })).toBe(
      'tab-a:/repo/src/app.ts',
    )
  })

  it('keys only file-backed tabs for intent prefetching', () => {
    expect(
      editorTabIntentPrefetchKey([
        { id: 'tab-a', path: '/repo/src/app.ts' },
        { id: 'tab-b', path: diffDocumentId('/repo/src/app.ts', false) },
        { id: 'tab-c', path: conflictDiffDocumentId('conflict-1') },
        { id: 'tab-d', path: searchBufferDocumentId('/repo') },
      ]),
    ).toBe('tab-a:/repo/src/app.ts')
  })
})
