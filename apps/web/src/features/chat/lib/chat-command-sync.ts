import type { ThreadId } from '@workspace/contracts'

import type { ChatEnvironment } from '../environment/chat-environment'
import { useChatProjectionStore } from '../state/chat-projection-store'
import {
  chatThreadSnapshotSummary,
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
  logChatPipelineInfo('chat.dispatch.sync.start', {
    replayAfterSequence,
    threadId,
  })

  const replayEvents = environment.replayEvents({
    afterSequence: Math.max(0, replayAfterSequence),
    threadId,
  })
  const threadDetailSnapshot = environment.threadDetailSnapshot(threadId)
  const [replay, snapshot] = await Promise.allSettled([replayEvents, threadDetailSnapshot])
  const store = useChatProjectionStore.getState()

  if (replay.status === 'fulfilled') {
    store.applyOrchestrationEvents(replay.value.events)
    logChatPipelineInfo('chat.dispatch.sync.replay_applied', {
      eventCount: replay.value.events.length,
      eventTypes: replay.value.events.map((event) => event.type),
      maxSequence: replay.value.events.at(-1)?.sequence ?? replayAfterSequence,
      threadId,
    })
  } else {
    logChatPipelineWarn('chat.dispatch.sync.replay_failed', {
      error: replay.reason,
      threadId,
    })
  }

  if (snapshot.status === 'fulfilled') {
    store.syncThreadDetailSnapshot(snapshot.value)
    logChatPipelineInfo('chat.dispatch.sync.snapshot_applied', {
      ...chatThreadSnapshotSummary(snapshot.value),
      threadId,
    })
  } else {
    logChatPipelineWarn('chat.dispatch.sync.snapshot_failed', {
      error: snapshot.reason,
      threadId,
    })
  }

  logChatPipelineInfo('chat.dispatch.sync.complete', {
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    replayStatus: replay.status,
    snapshotStatus: snapshot.status,
    threadId,
  })
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
