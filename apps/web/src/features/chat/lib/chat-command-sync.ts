import type { ThreadId } from '@workspace/contracts'

import type { ChatEnvironment } from '../environment/chat-environment'
import { useChatProjectionStore } from '../state/chat-projection-store'
import {
  chatThreadSnapshotSummary,
  createChatPipelineScope,
  logChatPipelineInfo,
  logChatPipelineWarn,
} from './chat-pipeline-logging'

export type ThreadCommandDispatchResult = {
  deduped: boolean
  sequence: number
}

export async function syncThreadProjectionAfterDispatch({
  environment,
  replayAfterSequence,
  threadId,
}: {
  environment: ChatEnvironment
  replayAfterSequence: number
  threadId: ThreadId
}) {
  const startedAt = performance.now()
  const scope = createChatPipelineScope('chat.dispatch.sync.summary', {
    replayAfterSequence,
    threadId,
  })
  scope.increment('sync.startCount')

  try {
    const replayEvents = environment.replayEvents({
      afterSequence: Math.max(0, replayAfterSequence),
      threadId,
    })
    const threadDetailSnapshot = environment.threadDetailSnapshot(threadId)
    const [replay, snapshot] = await Promise.allSettled([replayEvents, threadDetailSnapshot])
    const store = useChatProjectionStore.getState()

    applyReplaySyncResult(scope, store, replay, replayAfterSequence)
    applySnapshotSyncResult(scope, store, snapshot)
  } finally {
    scope.end({
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    })
  }
}

export function scheduleThreadProjectionSyncAfterDispatch({
  environment,
  replayAfterSequence,
  threadId,
}: {
  environment: ChatEnvironment
  replayAfterSequence: number
  threadId: ThreadId
}) {
  logChatPipelineInfo('chat.dispatch.sync.scheduled', {
    replayAfterSequence,
    threadId,
  })

  void syncThreadProjectionAfterDispatch({ environment, replayAfterSequence, threadId }).catch(
    (error: unknown) => {
      logChatPipelineWarn('chat.dispatch.sync.unhandled_failure', {
        error,
        threadId,
      })
    },
  )
}

export function replayAfterTurnDispatch(result: ThreadCommandDispatchResult) {
  return Math.max(0, result.sequence - 2)
}

export function replayAfterDraftTurnDispatch(result: ThreadCommandDispatchResult) {
  return Math.max(0, result.sequence - 3)
}

function applyReplaySyncResult(
  scope: ReturnType<typeof createChatPipelineScope>,
  store: ReturnType<typeof useChatProjectionStore.getState>,
  replay: PromiseSettledResult<Awaited<ReturnType<ChatEnvironment['replayEvents']>>>,
  replayAfterSequence: number,
) {
  if (replay.status !== 'fulfilled') {
    scope.increment('sync.replayFailedCount')
    scope.warn('Replay sync failed.', { error: replay.reason })
    scope.set({ replayStatus: replay.status })
    return
  }

  store.applyOrchestrationEvents(replay.value.events)
  scope.increment('sync.replayAppliedCount')
  scope.increment('sync.replayEventCount', replay.value.events.length)
  scope.set({
    replay: {
      eventTypes: replay.value.events.map((event) => event.type),
      maxSequence: replay.value.events.at(-1)?.sequence ?? replayAfterSequence,
    },
    replayStatus: replay.status,
  })
}

function applySnapshotSyncResult(
  scope: ReturnType<typeof createChatPipelineScope>,
  store: ReturnType<typeof useChatProjectionStore.getState>,
  snapshot: PromiseSettledResult<Awaited<ReturnType<ChatEnvironment['threadDetailSnapshot']>>>,
) {
  if (snapshot.status !== 'fulfilled') {
    scope.increment('sync.snapshotFailedCount')
    scope.warn('Snapshot sync failed.', { error: snapshot.reason })
    scope.set({ snapshotStatus: snapshot.status })
    return
  }

  store.syncThreadDetailSnapshot(snapshot.value)
  scope.increment('sync.snapshotAppliedCount')
  scope.set({
    snapshot: chatThreadSnapshotSummary(snapshot.value),
    snapshotStatus: snapshot.status,
  })
}
