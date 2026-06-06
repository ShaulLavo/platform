import {
  errorNumberField,
  errorStringField,
  orchestrationShellStreamItemSchema,
  orchestrationThreadStreamItemSchema,
  type OrchestrationShellStreamItem,
  type OrchestrationThreadStreamItem,
  type ThreadId,
} from '@workspace/contracts'
import * as v from 'valibot'

import { getClient } from '@/lib/client'
import { createWideEventScope, type WideEventScope } from '@/lib/wide-event-scope'
import { parseEdenSseStream } from '@/lib/eden-events'
import { clientErrors, createRpcError } from '@/lib/structured-errors'
import { chatStreamItemSummary } from '../lib/chat-pipeline-logging'
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
  const scope = createOrchestrationStreamScope('orchestration.shell_stream.summary', {
    afterSequence,
  })

  try {
    const response = await getClient().orchestration['shell-stream'].get({
      fetch: { signal },
      query: { afterSequence },
    })
    if (response.error) throw createRpcError(response.error)
    if (!response.data) throw clientErrors.EDEN_STREAM_MISSING({ label: 'Shell stream' })

    scope.increment('stream.openCount')

    for await (const event of parseEdenSseStream(response.data)) {
      if (isOrchestrationHeartbeatEvent(event)) {
        scope.increment('stream.heartbeatCount')
        continue
      }

      const item = v.parse(orchestrationShellStreamItemSchema, event.data)
      recordOrchestrationStreamItem(scope, item)
      yield item
    }
  } catch (error) {
    if (!signal?.aborted) {
      scope.increment('stream.errorCount')
      scope.error(error, { error: streamErrorSummary(error) })
    }

    throw error
  } finally {
    scope.end({
      aborted: signal?.aborted ?? false,
      durationMs: elapsedMs(startedAt),
    })
  }
}

async function* openOrchestrationThreadDetailStream(
  threadId: ThreadId,
  { afterSequence = 0, signal }: OrchestrationStreamInput,
): AsyncGenerator<OrchestrationThreadStreamItem> {
  const startedAt = performance.now()
  const scope = createOrchestrationStreamScope('orchestration.thread_stream.summary', {
    afterSequence,
    threadId,
  })

  try {
    const response = await getClient().orchestration['thread-detail-stream'].get({
      fetch: { signal },
      query: { afterSequence, threadId },
    })
    if (response.error) throw createRpcError(response.error)
    if (!response.data) throw clientErrors.EDEN_STREAM_MISSING({ label: 'Thread detail stream' })

    scope.increment('stream.openCount')

    for await (const event of parseEdenSseStream(response.data)) {
      if (isOrchestrationHeartbeatEvent(event)) {
        scope.increment('stream.heartbeatCount')
        continue
      }

      const item = v.parse(orchestrationThreadStreamItemSchema, event.data)
      recordOrchestrationStreamItem(scope, item)
      yield item
    }
  } catch (error) {
    if (!signal?.aborted) {
      scope.increment('stream.errorCount')
      scope.error(error, { error: streamErrorSummary(error) })
    }

    throw error
  } finally {
    scope.end({
      aborted: signal?.aborted ?? false,
      durationMs: elapsedMs(startedAt),
    })
  }
}

function createOrchestrationStreamScope(action: string, context: Record<string, unknown>) {
  return createWideEventScope({
    action,
    area: 'orchestration',
    ...context,
  })
}

function recordOrchestrationStreamItem(
  scope: WideEventScope,
  item: OrchestrationShellStreamItem | OrchestrationThreadStreamItem,
) {
  scope.increment('stream.itemCount')
  scope.set({
    stream: {
      latestItem: chatStreamItemSummary(item),
    },
  })
}

function streamErrorSummary(error: unknown) {
  if (error instanceof Error) {
    return {
      code: errorStringField(error, 'code'),
      message: error.message,
      name: error.name,
      status: errorNumberField(error, 'statusCode') ?? errorNumberField(error, 'status'),
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
