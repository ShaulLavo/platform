import {
  orchestrationShellStreamItemSchema,
  orchestrationThreadStreamItemSchema,
  type OrchestrationShellStreamItem,
  type OrchestrationThreadStreamItem,
  type ThreadId,
} from '@workspace/contracts'
import * as v from 'valibot'

import { client } from '@/lib/client'
import { logClientEvent } from '@/lib/client-logging'
import { parseEdenSseStream } from '@/lib/eden-events'
import { rpcErrorMessage } from '@/lib/file-server'
import { guardOrchestrationStreamSequence } from './orchestration-sequence'

const ORCHESTRATION_STREAM_HEARTBEAT_EVENT = 'heartbeat'

export type OrchestrationStreamInput = {
  afterSequence?: number
  signal?: AbortSignal
}

export async function* subscribeOrchestrationShell(input: OrchestrationStreamInput = {}) {
  const stream = openOrchestrationShellStream(input)

  yield* guardOrchestrationStreamSequence(stream, streamGuardSequence(input.afterSequence))
}

export async function* subscribeOrchestrationThreadDetail(
  threadId: ThreadId,
  input: OrchestrationStreamInput = {},
) {
  const stream = openOrchestrationThreadDetailStream(threadId, input)

  yield* guardOrchestrationStreamSequence(stream, streamGuardSequence(input.afterSequence))
}

function streamGuardSequence(afterSequence: number | undefined) {
  return afterSequence === undefined ? -1 : afterSequence - 1
}

async function* openOrchestrationShellStream({
  afterSequence = 0,
  signal,
}: OrchestrationStreamInput): AsyncGenerator<OrchestrationShellStreamItem> {
  const startedAt = performance.now()

  try {
    const response = await client.orchestration['shell-stream'].get({
      fetch: { signal },
      query: { afterSequence },
    })
    if (response.error) throw new Error(rpcErrorMessage(response.error))
    if (!response.data) throw new Error('Shell stream response did not include a stream.')

    logOrchestrationStream('orchestration.shell_stream.open', afterSequence, startedAt)

    for await (const event of parseEdenSseStream(response.data)) {
      if (isOrchestrationHeartbeatEvent(event)) continue

      yield v.parse(orchestrationShellStreamItemSchema, event.data)
    }
  } catch (error) {
    if (!signal?.aborted) {
      logOrchestrationStream('orchestration.shell_stream.error', afterSequence, startedAt, error)
    }

    throw error
  }
}

async function* openOrchestrationThreadDetailStream(
  threadId: ThreadId,
  { afterSequence = 0, signal }: OrchestrationStreamInput,
): AsyncGenerator<OrchestrationThreadStreamItem> {
  const startedAt = performance.now()

  try {
    const response = await client.orchestration['thread-detail-stream'].get({
      fetch: { signal },
      query: { afterSequence, threadId },
    })
    if (response.error) throw new Error(rpcErrorMessage(response.error))
    if (!response.data) throw new Error('Thread detail stream response did not include a stream.')

    logOrchestrationStream(
      'orchestration.thread_stream.open',
      afterSequence,
      startedAt,
      undefined,
      {
        threadId,
      },
    )

    for await (const event of parseEdenSseStream(response.data)) {
      if (isOrchestrationHeartbeatEvent(event)) continue

      yield v.parse(orchestrationThreadStreamItemSchema, event.data)
    }
  } catch (error) {
    if (!signal?.aborted) {
      logOrchestrationStream('orchestration.thread_stream.error', afterSequence, startedAt, error, {
        threadId,
      })
    }

    throw error
  }
}

function logOrchestrationStream(
  action: string,
  afterSequence: number,
  startedAt: number,
  error?: unknown,
  context: Record<string, unknown> = {},
) {
  logClientEvent({
    action,
    afterSequence,
    area: 'orchestration',
    durationMs: elapsedMs(startedAt),
    error: error === undefined ? undefined : streamErrorSummary(error),
    level: error === undefined ? 'info' : 'warn',
    outcome: error === undefined ? 'ok' : 'error',
    ...context,
  })
}

function streamErrorSummary(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    }
  }

  return {
    message: String(error),
    name: typeof error,
  }
}

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100
}

function isOrchestrationHeartbeatEvent(event: { event: string }) {
  return event.event === ORCHESTRATION_STREAM_HEARTBEAT_EVENT
}
