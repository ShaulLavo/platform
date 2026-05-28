import {
  messageIdSchema,
  threadIdSchema,
  turnIdSchema,
  type InternalOrchestrationCommand,
} from '@workspace/contracts'
import { describe, expect, it } from 'bun:test'
import * as v from 'valibot'
import { MAX_BUFFERED_ASSISTANT_CHARS } from './provider-runtime-buffers'
import { ProviderRuntimeIngestion } from './provider-runtime-ingestion'

const now = '2026-05-24T00:00:00.000Z'
const later = '2026-05-24T00:01:00.000Z'
const threadId = v.parse(threadIdSchema, 'thread-1')
const turnId = v.parse(turnIdSchema, 'turn-1')
const messageId = v.parse(messageIdSchema, 'assistant:turn-1')

describe('provider runtime ingestion', () => {
  it('streams assistant deltas by default', async () => {
    const { dispatched, ingestion } = fixture()

    await ingestion.ingest(assistantDelta('delta-1', 'Hello '))
    await ingestion.ingest(assistantDelta('delta-2', 'world'))

    expect(dispatched).toMatchObject([
      { delta: 'Hello ', type: 'thread.message.assistant.delta' },
      { delta: 'world', type: 'thread.message.assistant.delta' },
    ])

    await ingestion.ingest(assistantComplete('complete-1'))

    expect(dispatched).toMatchObject([
      { delta: 'Hello ', type: 'thread.message.assistant.delta' },
      { delta: 'world', type: 'thread.message.assistant.delta' },
      { type: 'thread.message.assistant.complete' },
    ])
  })

  it('can buffer assistant deltas and flush them at completion', async () => {
    const { dispatched, ingestion } = fixture({ assistantDeliveryMode: 'buffered' })

    await ingestion.ingest(assistantDelta('delta-1', 'Hello '))
    await ingestion.ingest(assistantDelta('delta-2', 'world'))

    expect(dispatched).toHaveLength(0)

    await ingestion.ingest(assistantComplete('complete-1'))

    expect(dispatched).toMatchObject([
      { delta: 'Hello world', type: 'thread.message.assistant.delta' },
      { type: 'thread.message.assistant.complete' },
    ])
  })

  it('flushes buffered assistant text before the cap is exceeded', async () => {
    const { dispatched, ingestion } = fixture({ assistantDeliveryMode: 'buffered' })
    const oversized = 'x'.repeat(MAX_BUFFERED_ASSISTANT_CHARS + 1)

    await ingestion.ingest(assistantDelta('delta-1', oversized))
    await ingestion.ingest(assistantComplete('complete-1'))

    expect(dispatched).toMatchObject([
      { delta: oversized, type: 'thread.message.assistant.delta' },
      { type: 'thread.message.assistant.complete' },
    ])
  })

  it('rolls over assistant segment message IDs after a pause event', async () => {
    const { dispatched, ingestion } = fixture()

    await ingestion.ingest(contentDelta('content-1', 'assistant-item', 'First'))
    await ingestion.ingest({
      createdAt: later,
      eventId: 'approval-1',
      payload: { requestType: 'command_execution_approval' },
      threadId,
      turnId,
      type: 'request.opened',
    })
    await ingestion.ingest(contentDelta('content-2', 'assistant-item', 'Second'))
    await ingestion.ingest({
      createdAt: later,
      eventId: 'turn-complete-1',
      payload: { state: 'completed' },
      threadId,
      turnId,
      type: 'turn.completed',
    })

    const messageCommands = dispatched.filter((command) =>
      command.type.startsWith('thread.message.assistant'),
    )

    expect(messageCommands).toMatchObject([
      {
        delta: 'First',
        messageId: 'assistant:assistant-item',
        type: 'thread.message.assistant.delta',
      },
      {
        messageId: 'assistant:assistant-item',
        type: 'thread.message.assistant.complete',
      },
      {
        delta: 'Second',
        messageId: 'assistant:assistant-item:segment:1',
        type: 'thread.message.assistant.delta',
      },
      {
        messageId: 'assistant:assistant-item:segment:1',
        type: 'thread.message.assistant.complete',
      },
    ])
  })

  it('buffers proposed plan text and upserts deterministically', async () => {
    const { dispatched, ingestion } = fixture()

    await ingestion.ingest({
      createdAt: now,
      eventId: 'plan-delta-1',
      payload: { delta: '1. Inspect\n' },
      threadId,
      turnId,
      type: 'turn.proposed.delta',
    })
    await ingestion.ingest({
      createdAt: later,
      eventId: 'plan-complete-1',
      payload: { planMarkdown: 'unused fallback' },
      threadId,
      turnId,
      type: 'turn.proposed.completed',
    })

    expect(dispatched).toMatchObject([
      {
        proposedPlan: {
          id: 'plan:thread-1:turn:turn-1',
          planMarkdown: '1. Inspect',
        },
        type: 'thread.proposed-plan.upsert',
      },
    ])
  })

  it('drains unawaited ingestion work when idle', async () => {
    const { dispatched, ingestion } = fixture()

    void ingestion.ingest(assistantDelta('delta-1', 'queued'))
    void ingestion.ingest(assistantComplete('complete-1'))
    await ingestion.drain()

    expect(dispatched).toMatchObject([
      { delta: 'queued', type: 'thread.message.assistant.delta' },
      { type: 'thread.message.assistant.complete' },
    ])
  })

  it('normalizes tool lifecycle events into activities', async () => {
    const { dispatched, ingestion } = fixture()

    await ingestion.ingest({
      createdAt: now,
      eventId: 'tool-1',
      payload: {
        detail: 'ls -la',
        itemType: 'command_execution',
        title: 'List files',
      },
      threadId,
      turnId,
      type: 'item.started',
    })

    expect(dispatched).toMatchObject([
      {
        activity: {
          kind: 'tool.started',
          payload: { detail: 'ls -la', itemType: 'command_execution' },
          summary: 'List files started',
          tone: 'tool',
        },
        type: 'thread.activity.append',
      },
    ])
  })
})

function fixture(options: ConstructorParameters<typeof ProviderRuntimeIngestion>[1] = {}) {
  const dispatched: InternalOrchestrationCommand[] = []
  const ingestion = new ProviderRuntimeIngestion(async (command) => {
    dispatched.push(command)
  }, options)

  return { dispatched, ingestion }
}

function assistantDelta(eventId: string, delta: string) {
  return {
    createdAt: now,
    delta,
    eventId,
    messageId,
    threadId,
    turnId,
    type: 'assistant.delta' as const,
  }
}

function assistantComplete(eventId: string) {
  return {
    completedAt: later,
    eventId,
    messageId,
    threadId,
    turnId,
    type: 'assistant.complete' as const,
  }
}

function contentDelta(eventId: string, itemId: string, delta: string) {
  return {
    createdAt: now,
    eventId,
    itemId,
    payload: { delta, streamKind: 'assistant_text' as const },
    threadId,
    turnId,
    type: 'content.delta' as const,
  }
}
