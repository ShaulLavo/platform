import {
  orchestrationShellStreamItemSchema,
  orchestrationThreadStreamItemSchema,
  type OrchestrationShellStreamItem,
  type OrchestrationThreadStreamItem,
  type ThreadId,
} from '@workspace/contracts'
import * as v from 'valibot'

import { client } from '@/lib/client'
import { parseEdenSseStream } from '@/lib/eden-events'
import { rpcErrorMessage } from '@/lib/file-server'
import { guardOrchestrationStreamSequence } from './orchestration-sequence'

export type OrchestrationStreamInput = {
  afterSequence?: number
  signal?: AbortSignal
}

export async function* subscribeOrchestrationShell(input: OrchestrationStreamInput = {}) {
  const stream = openOrchestrationShellStream(input)

  yield* guardOrchestrationStreamSequence(stream, input.afterSequence ?? -1)
}

export async function* subscribeOrchestrationThreadDetail(
  threadId: ThreadId,
  input: OrchestrationStreamInput = {},
) {
  const stream = openOrchestrationThreadDetailStream(threadId, input)

  yield* guardOrchestrationStreamSequence(stream, input.afterSequence ?? -1)
}

async function* openOrchestrationShellStream({
  afterSequence = 0,
  signal,
}: OrchestrationStreamInput): AsyncGenerator<OrchestrationShellStreamItem> {
  const response = await client.orchestration['shell-stream'].get({
    fetch: { signal },
    query: { afterSequence },
  })
  if (response.error) throw new Error(rpcErrorMessage(response.error))
  if (!response.data) throw new Error('Shell stream response did not include a stream.')

  for await (const event of parseEdenSseStream(response.data)) {
    yield v.parse(orchestrationShellStreamItemSchema, event.data)
  }
}

async function* openOrchestrationThreadDetailStream(
  threadId: ThreadId,
  { afterSequence = 0, signal }: OrchestrationStreamInput,
): AsyncGenerator<OrchestrationThreadStreamItem> {
  const response = await client.orchestration['thread-detail-stream'].get({
    fetch: { signal },
    query: { afterSequence, threadId },
  })
  if (response.error) throw new Error(rpcErrorMessage(response.error))
  if (!response.data) throw new Error('Thread detail stream response did not include a stream.')

  for await (const event of parseEdenSseStream(response.data)) {
    yield v.parse(orchestrationThreadStreamItemSchema, event.data)
  }
}
