import { describe, expect, it } from 'bun:test'
import {
  checkpointDiffDocumentId,
  diffDocumentId,
  diffDocumentLabel,
  diffDocumentShortHash,
  diffDocumentTitle,
  parseDiffDocumentId,
} from './diff-document'
import type { FileDiff } from './types'

describe('git diff document ids', () => {
  it('round-trips snapshot diff documents', () => {
    const diff: FileDiff = {
      hunks: [],
      newObjectId: 'b'.repeat(40),
      oldObjectId: 'a'.repeat(40),
      oldPath: '/repo/src/old.ts',
      patch: '',
      path: '/repo/src/new.ts',
      staged: false,
    }

    const id = diffDocumentId(diff)

    expect(parseDiffDocumentId(id)).toEqual({
      id,
      kind: 'snapshot',
      path: '/repo/src/new.ts',
      query: {
        newObjectId: 'b'.repeat(40),
        oldObjectId: 'a'.repeat(40),
        oldPath: '/repo/src/old.ts',
        path: '/repo/src/new.ts',
      },
      source: 'worktree',
      status: 'renamed',
    })
    expect(diffDocumentLabel(id)).toBe('new.ts')
    expect(diffDocumentShortHash(id)).toBe('b'.repeat(7))
    expect(diffDocumentTitle(id)).toBe(`/repo/src/new.ts diff at ${'b'.repeat(7)}`)
  })

  it('parses legacy staged and worktree diff documents', () => {
    const staged = diffDocumentId('/repo/src/app.ts', true)
    const worktree = diffDocumentId('/repo/src/app.ts', false)

    expect(parseDiffDocumentId(staged)).toMatchObject({
      kind: 'legacy',
      path: '/repo/src/app.ts',
      staged: true,
    })
    expect(parseDiffDocumentId(worktree)).toMatchObject({
      kind: 'legacy',
      path: '/repo/src/app.ts',
      staged: false,
    })
    expect(diffDocumentLabel(worktree)).toBe('app.ts')
  })

  it('round-trips checkpoint diff documents without falling back to live diffs', () => {
    const id = checkpointDiffDocumentId({
      filePath: '/repo/src/app.ts',
      fromTurnCount: 1,
      newObjectId: 'b'.repeat(40),
      oldObjectId: 'a'.repeat(40),
      path: '/repo/src/app.ts',
      scope: 'file',
      status: 'modified',
      threadId: 'thread-1',
      toTurnCount: 2,
    })

    expect(parseDiffDocumentId(id)).toEqual({
      id,
      kind: 'checkpoint',
      path: '/repo/src/app.ts',
      query: {
        filePath: '/repo/src/app.ts',
        fromTurnCount: 1,
        newObjectId: 'b'.repeat(40),
        oldObjectId: 'a'.repeat(40),
        path: '/repo/src/app.ts',
        scope: 'file',
        status: 'modified',
        threadId: 'thread-1',
        toTurnCount: 2,
        version: 1,
      },
      status: 'modified',
    })
    expect(diffDocumentLabel(id)).toBe('app.ts')
    expect(diffDocumentTitle(id)).toBe('/repo/src/app.ts checkpoint diff 1-2')
  })

  it('labels multi-file checkpoint diff documents by scope', () => {
    const turn = checkpointDiffDocumentId({
      fromTurnCount: 1,
      path: 'checkpoint-turn-2',
      scope: 'turn',
      threadId: 'thread-1',
      toTurnCount: 2,
    })
    const thread = checkpointDiffDocumentId({
      fromTurnCount: 0,
      path: 'checkpoint-thread-2',
      scope: 'thread',
      threadId: 'thread-1',
      toTurnCount: 2,
    })

    expect(diffDocumentLabel(turn)).toBe('Turn diff 1-2')
    expect(diffDocumentTitle(turn)).toBe('Turn checkpoint diff 1-2')
    expect(diffDocumentLabel(thread)).toBe('Thread diff 2')
    expect(diffDocumentTitle(thread)).toBe('Thread checkpoint diff 0-2')
  })

  it('falls back to legacy ids when a diff has no snapshot objects', () => {
    const diff: FileDiff = {
      hunks: [],
      patch: '',
      path: '/repo/src/large.bin',
      staged: false,
    }

    const id = diffDocumentId(diff)

    expect(parseDiffDocumentId(id)).toMatchObject({
      kind: 'legacy',
      path: '/repo/src/large.bin',
      staged: false,
    })
  })
})
