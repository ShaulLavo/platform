import type {
  ClientOrchestrationCommand,
  OrchestrationReplayEventsInput,
  OrchestrationReplayEventsResult,
  OrchestrationShellSnapshot,
  OrchestrationThreadDetailSnapshot,
  ThreadId,
} from '@workspace/contracts'

import { client } from '@/lib/client'
import { createRpcError } from '@/lib/structured-errors'

export async function dispatchOrchestrationCommand(command: ClientOrchestrationCommand) {
  const response = await client.orchestration.commands.post(command)

  return unwrapOrchestrationResponse<{ deduped: boolean; sequence: number }>(response)
}

export async function fetchOrchestrationShellSnapshot(signal?: AbortSignal) {
  const response = await client.orchestration['shell-snapshot'].get({
    fetch: { signal },
  })

  return unwrapOrchestrationResponse<OrchestrationShellSnapshot>(response)
}

export async function fetchOrchestrationThreadDetailSnapshot(
  threadId: ThreadId,
  signal?: AbortSignal,
) {
  const response = await client.orchestration['thread-detail'].get({
    fetch: { signal },
    query: { threadId },
  })

  return unwrapOrchestrationResponse<OrchestrationThreadDetailSnapshot>(response)
}

export async function replayOrchestrationEvents(input: OrchestrationReplayEventsInput) {
  const response = await client.orchestration.replay.post(input)

  return unwrapOrchestrationResponse<OrchestrationReplayEventsResult>(response)
}

export function unwrapOrchestrationResponse<T>(response: { data?: unknown; error?: unknown }): T {
  if (response.error) throw createRpcError(response.error)

  return response.data as T
}
