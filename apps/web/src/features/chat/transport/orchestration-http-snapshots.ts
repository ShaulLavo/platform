import type {
  OrchestrationShellSnapshot,
  OrchestrationThreadDetailSnapshot,
  ThreadId,
} from '@workspace/contracts'

import { getClient } from '@/lib/client'
import { observeClientOperation } from '@/lib/client-logging'
import { unwrapEdenResponse } from '@/lib/eden-events'

/**
 * `fetch` has no deadline of its own, and the socket requests these replaced
 * gave up at 60s. There is no cheaper fallback read to fail over to, so the
 * bound matches that one rather than tightening it.
 */
const ORCHESTRATION_SNAPSHOT_TIMEOUT_MS = 60_000

/**
 * The two authoritative snapshot reads go over HTTP, never over the
 * orchestration socket. A shell snapshot for a workspace with hundreds of
 * threads is one large frame, and the socket writes frames in order: while it
 * is on the wire, every ping, dispatch and subscription frame waits behind it.
 * Commands, replay and the subscriptions — including the `kind: 'snapshot'`
 * frames they deliver — stay on the socket, where ordering against the event
 * stream is the whole point.
 */
export function fetchOrchestrationShellSnapshotHttp() {
  return observeClientOperation(
    {
      action: 'chat.shell_snapshot.http',
      area: 'chat',
    },
    async () => {
      const response = await getClient().orchestration['shell-snapshot'].get({
        fetch: { signal: snapshotTimeoutSignal() },
      })

      return unwrapEdenResponse<OrchestrationShellSnapshot>(response, {
        emptyMessage: 'the shell snapshot response carried no data',
        // Eden revives every date-shaped string on the way out. The projection
        // writers are typed against the contracts, where these are ISO strings.
        normalizeDates: true,
        requireData: true,
      })
    },
    (snapshot) => ({
      projectCount: snapshot.projects.length,
      snapshotSequence: snapshot.snapshotSequence,
      threadCount: snapshot.threads.length,
    }),
  )
}

export function fetchOrchestrationThreadDetailSnapshotHttp(threadId: ThreadId) {
  return observeClientOperation(
    {
      action: 'chat.thread_detail_snapshot.http',
      area: 'chat',
      threadId,
    },
    async () => {
      const response = await getClient().orchestration['thread-detail'].get({
        fetch: { signal: snapshotTimeoutSignal() },
        query: { threadId },
      })

      return unwrapEdenResponse<OrchestrationThreadDetailSnapshot>(response, {
        emptyMessage: 'the thread detail snapshot response carried no data',
        normalizeDates: true,
        requireData: true,
      })
    },
    (snapshot) => ({
      activityCount: snapshot.thread.activities.length,
      latestTurnState: snapshot.thread.latestTurn?.state ?? null,
      messageCount: snapshot.thread.messages.length,
      sessionStatus: snapshot.thread.session?.status ?? null,
      snapshotSequence: snapshot.snapshotSequence,
    }),
  )
}

function snapshotTimeoutSignal() {
  return AbortSignal.timeout(ORCHESTRATION_SNAPSHOT_TIMEOUT_MS)
}
