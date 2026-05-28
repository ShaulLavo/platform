import type {
  ClientOrchestrationCommand,
  OrchestrationReplayEventsInput,
  OrchestrationReplayEventsResult,
  OrchestrationShellSnapshot,
  OrchestrationThreadDetailSnapshot,
  ThreadId,
} from '@workspace/contracts'

import { client } from '@/lib/client'
import { observeClientOperation } from '@/lib/client-logging'
import { createRpcError } from '@/lib/structured-errors'
import { chatCommandSummary, chatReplaySummary } from '../lib/chat-pipeline-logging'

export async function dispatchOrchestrationCommand(command: ClientOrchestrationCommand) {
  return observeClientOperation(
    {
      action: 'chat.command.http',
      area: 'chat',
      ...chatCommandSummary(command),
    },
    async () => {
      const response = await client.orchestration.commands.post(command)

      return unwrapOrchestrationResponse<{ deduped: boolean; sequence: number }>(response)
    },
    (result) => ({
      deduped: result.deduped,
      sequence: result.sequence,
    }),
  )
}

export async function fetchOrchestrationShellSnapshot(signal?: AbortSignal) {
  return observeClientOperation(
    {
      action: 'chat.shell_snapshot.http',
      area: 'chat',
    },
    async () => {
      const response = await client.orchestration['shell-snapshot'].get({
        fetch: { signal },
      })

      return unwrapOrchestrationResponse<OrchestrationShellSnapshot>(response)
    },
    (snapshot) => ({
      projectCount: snapshot.projects.length,
      snapshotSequence: snapshot.snapshotSequence,
      threadCount: snapshot.threads.length,
    }),
  )
}

export async function fetchOrchestrationThreadDetailSnapshot(
  threadId: ThreadId,
  signal?: AbortSignal,
) {
  return observeClientOperation(
    {
      action: 'chat.thread_detail_snapshot.http',
      area: 'chat',
      threadId,
    },
    async () => {
      const response = await client.orchestration['thread-detail'].get({
        fetch: { signal },
        query: { threadId },
      })

      return unwrapOrchestrationResponse<OrchestrationThreadDetailSnapshot>(response)
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

export async function replayOrchestrationEvents(input: OrchestrationReplayEventsInput) {
  return observeClientOperation(
    {
      action: 'chat.replay.http',
      area: 'chat',
      ...chatReplaySummary(input),
    },
    async () => {
      const response = await client.orchestration.replay.post(input)

      return unwrapOrchestrationResponse<OrchestrationReplayEventsResult>(response)
    },
    (result) => ({
      eventCount: result.events.length,
      eventTypes: result.events.map((event) => event.type),
      maxSequence: result.events.at(-1)?.sequence ?? input.afterSequence,
    }),
  )
}

export function unwrapOrchestrationResponse<T>(response: { data?: unknown; error?: unknown }): T {
  if (response.error) throw createRpcError(response.error)

  return response.data as T
}
