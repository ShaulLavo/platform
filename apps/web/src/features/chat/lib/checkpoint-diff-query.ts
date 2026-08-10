import type { ThreadId } from '@workspace/contracts'

import { getClient } from '@/lib/client'
import { observeClientOperation } from '@/lib/client-logging'
import { unwrapEdenResponse } from '@/lib/eden-events'
import { gitKeys } from '@/lib/query-keys'
import type { CheckpointDiffDocumentInput } from '@/features/git/diff-document'
import type { FileDiff, FileStatus } from '@/features/git/types'
import type { ChatTurnDiffSummary } from '../state/chat-projection-store'

export type CheckpointDiffQueryInput = {
  filePath?: string
  fromTurnCount: number
  /**
   * Every client fetch is a *display* diff, so the builders pin `true`:
   * whitespace-only hunks are noise to a reader. Stat counting is the server's
   * own path (the checkpoint reactor pins `false` there). The flag rides the
   * cache key because the two answers to the same range genuinely differ.
   */
  ignoreWhitespace?: boolean
  path?: string
  scope?: 'file' | 'thread' | 'turn'
  threadId: ThreadId
  toTurnCount: number
}

export function checkpointDiffQueryKey(input: CheckpointDiffQueryInput) {
  return gitKeys.checkpointDiff({
    filePath: input.filePath,
    fromTurnCount: input.fromTurnCount,
    ignoreWhitespace: input.ignoreWhitespace,
    path: input.path,
    scope: input.scope,
    threadId: input.threadId,
    toTurnCount: input.toTurnCount,
  })
}

export function checkpointDiffInputForSummary(
  summary: ChatTurnDiffSummary,
  path?: string,
): CheckpointDiffQueryInput {
  return {
    filePath: path,
    fromTurnCount: Math.max(0, summary.checkpointTurnCount - 1),
    ignoreWhitespace: true,
    path,
    scope: path ? 'file' : 'turn',
    threadId: summary.threadId,
    toTurnCount: summary.checkpointTurnCount,
  }
}

export function checkpointFullThreadDiffInputForSummary(
  summary: ChatTurnDiffSummary,
): CheckpointDiffQueryInput {
  return {
    fromTurnCount: 0,
    ignoreWhitespace: true,
    path: checkpointFullThreadDocumentPath(summary),
    scope: 'thread',
    threadId: summary.threadId,
    toTurnCount: summary.checkpointTurnCount,
  }
}

export function canOpenCheckpointDiff(summary: ChatTurnDiffSummary) {
  if (summary.status !== 'ready') return false

  return summary.files.length > 0
}

export function checkpointDiffDocumentInput(
  summary: ChatTurnDiffSummary,
  path: string,
  diff: FileDiff | null,
): CheckpointDiffDocumentInput {
  const rangeInput = checkpointDiffInputForSummary(summary, path)

  return {
    filePath: path,
    fromTurnCount: rangeInput.fromTurnCount,
    newObjectId: diff?.newObjectId,
    oldObjectId: diff?.oldObjectId,
    oldPath: diff?.oldPath,
    path,
    scope: 'file',
    status: diff ? diffStatus(diff) : undefined,
    threadId: rangeInput.threadId,
    toTurnCount: rangeInput.toTurnCount,
  }
}

export function checkpointTurnDiffDocumentInput(
  summary: ChatTurnDiffSummary,
): CheckpointDiffDocumentInput {
  const rangeInput = checkpointDiffInputForSummary(summary)

  return {
    fromTurnCount: rangeInput.fromTurnCount,
    path: checkpointTurnDocumentPath(summary),
    scope: 'turn',
    threadId: rangeInput.threadId,
    toTurnCount: rangeInput.toTurnCount,
  }
}

export function checkpointFullThreadDiffDocumentInput(
  summary: ChatTurnDiffSummary,
): CheckpointDiffDocumentInput {
  const input = checkpointFullThreadDiffInputForSummary(summary)

  return {
    fromTurnCount: input.fromTurnCount,
    path: input.path ?? checkpointFullThreadDocumentPath(summary),
    scope: 'thread',
    threadId: input.threadId,
    toTurnCount: input.toTurnCount,
  }
}

export function matchingCheckpointDiff(diffs: readonly FileDiff[], path: string | undefined) {
  if (!path) return null

  return diffs.find((diff) => checkpointDiffMatchesPath(diff, path)) ?? null
}

export async function fetchCheckpointDiff(input: CheckpointDiffQueryInput, signal?: AbortSignal) {
  if (input.scope === 'thread') {
    return fetchFullThreadCheckpointDiff(input, signal)
  }

  return observeClientOperation(
    {
      action: 'chat.checkpoint_diff.http',
      area: 'chat',
      fromTurnCount: input.fromTurnCount,
      path: checkpointDiffFilePath(input),
      scope: input.scope,
      threadId: input.threadId,
      toTurnCount: input.toTurnCount,
    },
    async () => {
      const response = await getClient().orchestration['turn-diff'].get({
        fetch: { signal },
        query: {
          fromTurnCount: input.fromTurnCount,
          ignoreWhitespace: input.ignoreWhitespace ?? true,
          threadId: input.threadId,
          toTurnCount: input.toTurnCount,
        },
      })
      const diffs = unwrapEdenResponse<FileDiff[]>(response)

      return filterCheckpointDiffsForPath(diffs, checkpointDiffFilePath(input))
    },
    (diffs) => ({ diffCount: diffs.length }),
  )
}

async function fetchFullThreadCheckpointDiff(
  input: Pick<CheckpointDiffQueryInput, 'ignoreWhitespace' | 'threadId' | 'toTurnCount'>,
  signal?: AbortSignal,
) {
  return observeClientOperation(
    {
      action: 'chat.full_thread_checkpoint_diff.http',
      area: 'chat',
      threadId: input.threadId,
      toTurnCount: input.toTurnCount,
    },
    async () => {
      const response = await getClient().orchestration['full-thread-diff'].get({
        fetch: { signal },
        query: {
          ignoreWhitespace: input.ignoreWhitespace ?? true,
          threadId: input.threadId,
          toTurnCount: input.toTurnCount,
        },
      })

      return unwrapEdenResponse<FileDiff[]>(response)
    },
    (diffs) => ({ diffCount: diffs.length }),
  )
}

/**
 * Retry policy off the typed catalog code, not the message: a reworded message
 * used to silently turn a permanent range failure into a retry loop. Only
 * RANGE_INVALID is permanent — a missing ref or a turn count overtaken by a
 * revert can resolve itself as the projection catches up.
 */
export function checkpointDiffRetry(failureCount: number, error: unknown) {
  if (failureCount >= 2) return false

  return structuredErrorCode(error) !== 'checkpoint.RANGE_INVALID'
}

function structuredErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') return null
  if (!('code' in error)) return null

  const code = error.code
  return typeof code === 'string' ? code : null
}

export function checkpointDiffRetryDelay(attemptIndex: number) {
  return Math.min(250 * 2 ** attemptIndex, 1_000)
}

function checkpointDiffFilePath(input: CheckpointDiffQueryInput) {
  return input.filePath ?? (input.scope === 'file' ? input.path : undefined)
}

function filterCheckpointDiffsForPath(diffs: readonly FileDiff[], path: string | undefined) {
  if (!path) return diffs

  return diffs.filter((diff) => checkpointDiffMatchesPath(diff, path))
}

function checkpointDiffMatchesPath(diff: FileDiff, path: string) {
  if (samePath(diff.path, path)) return true
  if (!diff.oldPath) return false

  return samePath(diff.oldPath, path)
}

function samePath(left: string, right: string) {
  const normalizedLeft = normalizeDiffPath(left)
  const normalizedRight = normalizeDiffPath(right)
  if (normalizedLeft === normalizedRight) return true
  if (normalizedLeft.endsWith(`/${normalizedRight}`)) return true

  return normalizedRight.endsWith(`/${normalizedLeft}`)
}

function normalizeDiffPath(path: string) {
  return path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '')
}

function diffStatus(diff: FileDiff): FileStatus['index'] | FileStatus['worktree'] {
  if (diff.oldPath && diff.oldPath !== diff.path) return 'renamed'
  if (diff.oldFileMissing) return 'added'
  if (diff.newFileMissing) return 'deleted'

  return 'modified'
}

function checkpointTurnDocumentPath(summary: ChatTurnDiffSummary) {
  return `checkpoint-turn-${summary.checkpointTurnCount}`
}

function checkpointFullThreadDocumentPath(summary: ChatTurnDiffSummary) {
  return `checkpoint-thread-${summary.checkpointTurnCount}`
}
