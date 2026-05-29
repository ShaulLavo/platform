import type { ThreadId } from '@workspace/contracts'

import { client } from '@/lib/client'
import { observeClientOperation } from '@/lib/client-logging'
import { gitKeys } from '@/lib/query-keys'
import { unwrapOrchestrationResponse } from '../transport/orchestration-client'
import type { CheckpointDiffDocumentInput } from '@/features/git/diff-document'
import type { FileDiff, FileStatus } from '@/features/git/types'
import type { ChatTurnDiffSummary } from '../state/chat-projection-store'

export type CheckpointDiffQueryInput = {
  fromTurnCount: number
  path?: string
  threadId: ThreadId
  toTurnCount: number
}

export function checkpointDiffQueryKey(input: CheckpointDiffQueryInput) {
  return gitKeys.checkpointDiff({
    fromTurnCount: input.fromTurnCount,
    path: input.path,
    threadId: input.threadId,
    toTurnCount: input.toTurnCount,
  })
}

export function checkpointDiffInputForSummary(
  summary: ChatTurnDiffSummary,
  path?: string,
): CheckpointDiffQueryInput {
  return {
    fromTurnCount: Math.max(0, summary.checkpointTurnCount - 1),
    path,
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
    fromTurnCount: rangeInput.fromTurnCount,
    newObjectId: diff?.newObjectId,
    oldObjectId: diff?.oldObjectId,
    oldPath: diff?.oldPath,
    path,
    status: diff ? diffStatus(diff) : undefined,
    threadId: rangeInput.threadId,
    toTurnCount: rangeInput.toTurnCount,
  }
}

export function matchingCheckpointDiff(diffs: readonly FileDiff[], path: string | undefined) {
  if (!path) return null

  return diffs.find((diff) => checkpointDiffMatchesPath(diff, path)) ?? null
}

export async function fetchCheckpointDiff(input: CheckpointDiffQueryInput, signal?: AbortSignal) {
  return observeClientOperation(
    {
      action: 'chat.checkpoint_diff.http',
      area: 'chat',
      fromTurnCount: input.fromTurnCount,
      path: input.path,
      threadId: input.threadId,
      toTurnCount: input.toTurnCount,
    },
    async () => {
      const response = await client.orchestration['turn-diff'].get({
        fetch: { signal },
        query: {
          fromTurnCount: String(input.fromTurnCount),
          threadId: input.threadId,
          toTurnCount: String(input.toTurnCount),
        },
      })
      const diffs = unwrapOrchestrationResponse<FileDiff[]>(response)

      return filterCheckpointDiffsForPath(diffs, input.path)
    },
    (diffs) => ({ diffCount: diffs.length }),
  )
}

export async function fetchFullThreadCheckpointDiff(
  input: Pick<CheckpointDiffQueryInput, 'threadId' | 'toTurnCount'>,
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
      const response = await client.orchestration['full-thread-diff'].get({
        fetch: { signal },
        query: {
          threadId: input.threadId,
          toTurnCount: String(input.toTurnCount),
        },
      })

      return unwrapOrchestrationResponse<FileDiff[]>(response)
    },
    (diffs) => ({ diffCount: diffs.length }),
  )
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
