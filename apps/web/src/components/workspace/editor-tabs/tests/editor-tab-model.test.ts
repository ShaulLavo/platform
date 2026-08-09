import {
  createEditorTabRecord,
  editorTabModel,
} from '@/components/workspace/editor-tabs/utils/editor-tab-model'
import type { EditorTabConflictMap } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import { conflictDiffDocumentId } from '@/features/editor/conflict-diff-document'
import { checkpointDiffDocumentId, snapshotDiffDocumentId } from '@/features/git/diff-document'
import type { FileStatus } from '@/features/git/types'
import type { GitFileDiff, ThreadId } from '@workspace/contracts'
import { expect, test } from '../../../../../test/fixtures'
import { gitFileDiff } from '../../../../../test/factories/git-diff'

const ROOT = '/repo'
const THREAD_ID = 'thread-1' as ThreadId

test('a plain file tab has no diff source to jump to', () => {
  expect(model('/repo/src/a.ts').diffSource).toBeNull()
})

test('a snapshot diff tab points at the file it compares', () => {
  expect(model(snapshotDiff()).diffSource).toEqual({ onDisk: true, path: '/repo/src/a.ts' })
})

test('a diff of a file deleted in the worktree has nothing left on disk', () => {
  const deleted = snapshotDiff({ newFileMissing: true })

  expect(model(deleted).diffSource).toEqual({ onDisk: false, path: '/repo/src/a.ts' })
})

test('live status wins over the status baked into the document id', () => {
  const deleted = snapshotDiff({ newFileMissing: true })
  const restored = fileStatus({ path: '/repo/src/a.ts', worktree: 'modified' })

  expect(model(deleted, { gitFiles: [restored] }).diffSource?.onDisk).toBe(true)
})

test('a file-scoped checkpoint diff points at its file', () => {
  const diff = checkpointDiffDocumentId({
    filePath: '/repo/src/a.ts',
    fromTurnCount: 1,
    path: '/repo/src/a.ts',
    scope: 'file',
    threadId: THREAD_ID,
    toTurnCount: 2,
  })

  expect(model(diff).diffSource).toEqual({ onDisk: true, path: '/repo/src/a.ts' })
})

test('turn and thread checkpoint diffs span many files, so they target none', () => {
  const turn = checkpointDiffDocumentId({
    fromTurnCount: 1,
    path: 'checkpoint-turn',
    scope: 'turn',
    threadId: THREAD_ID,
    toTurnCount: 2,
  })
  const thread = checkpointDiffDocumentId({
    fromTurnCount: 0,
    path: 'checkpoint-thread',
    scope: 'thread',
    threadId: THREAD_ID,
    toTurnCount: 2,
  })

  expect(model(turn).diffSource).toBeNull()
  expect(model(thread).diffSource).toBeNull()
})

test('a conflict diff targets the file on disk it is reconciling', () => {
  const conflicts: EditorTabConflictMap = { 'conflict-1': { remotePath: '/repo/src/a.ts' } }

  expect(model(conflictDiffDocumentId('conflict-1'), { conflicts }).diffSource).toEqual({
    onDisk: true,
    path: '/repo/src/a.ts',
  })
})

/** A worktree diff of `src/a.ts` against its indexed blob. */
function snapshotDiff(overrides: Partial<GitFileDiff> = {}) {
  return snapshotDiffDocumentId({
    ...gitFileDiff({ path: '/repo/src/a.ts', ...overrides }),
    oldObjectId: 'old1',
  })
}

function model(
  path: string,
  {
    conflicts = {},
    gitFiles = [],
  }: { conflicts?: EditorTabConflictMap; gitFiles?: readonly FileStatus[] } = {},
) {
  return editorTabModel({
    conflicts,
    gitFiles,
    rootPath: ROOT,
    selectedTabId: null,
    tab: createEditorTabRecord(path),
  })
}

function fileStatus(overrides: Partial<FileStatus> & { path: string }): FileStatus {
  return {
    index: 'unmodified',
    status: 'modified',
    worktree: 'modified',
    ...overrides,
  }
}
