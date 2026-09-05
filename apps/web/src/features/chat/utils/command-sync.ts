import type { ThreadId } from '@workspace/contracts'

import type { ChatTransport } from '@/features/chat/transport/chat-transport'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { elapsedMs } from '@/features/chat/utils/elapsed-ms'
import {
  chatThreadSnapshotSummary,
  createChatPipelineScope,
  logChatPipelineInfo,
  logChatPipelineWarn,
} from '@/features/chat/utils/pipeline-logging'

export async function syncThreadProjectionAfterDispatch({
  transport,
  replayAfterSequence,
  threadId,
}: {
  transport: ChatTransport
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
    const replayEvents = transport.replayEvents({
      afterSequence: Math.max(0, replayAfterSequence),
      threadId,
    })
    const threadDetailSnapshot = transport.threadDetailSnapshot(threadId)
    const [replay, snapshot] = await Promise.allSettled([replayEvents, threadDetailSnapshot])
    if (transport.closed) return
    const store = useChatProjectionStore.getState()

    applyReplaySyncResult(scope, store, replay, replayAfterSequence)
    applySnapshotSyncResult(scope, store, snapshot)
  } finally {
    scope.end({ durationMs: elapsedMs(startedAt) })
  }
}

export function scheduleThreadProjectionSyncAfterDispatch({
  transport,
  replayAfterSequence,
  threadId,
}: {
  transport: ChatTransport
  replayAfterSequence: number
  threadId: ThreadId
}) {
  logChatPipelineInfo('chat.dispatch.sync.scheduled', {
    replayAfterSequence,
    threadId,
  })

  void syncThreadProjectionAfterDispatch({ transport, replayAfterSequence, threadId }).catch(
    (error: unknown) => {
      logChatPipelineWarn('chat.dispatch.sync.unhandled_failure', {
        error,
        threadId,
      })
    },
  )
}

function applyReplaySyncResult(
  scope: ReturnType<typeof createChatPipelineScope>,
  store: ReturnType<typeof useChatProjectionStore.getState>,
  replay: PromiseSettledResult<Awaited<ReturnType<ChatTransport['replayEvents']>>>,
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
  snapshot: PromiseSettledResult<Awaited<ReturnType<ChatTransport['threadDetailSnapshot']>>>,
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
