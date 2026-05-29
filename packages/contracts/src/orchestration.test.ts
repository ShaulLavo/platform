import { describe, expect, it } from 'bun:test'
import * as v from 'valibot'
import {
  clientOrchestrationCommandSchema,
  DEFAULT_CODEX_PROVIDER_SETTINGS,
  modelSelectionSchema,
  orchestrationCommandReceiptSchema,
  orchestrationEventSchema,
  orchestrationEventTypes,
  providerListResultSchema,
  orchestrationReplayEventsInputSchema,
  orchestrationShellSnapshotSchema,
  orchestrationWsClientMessageSchema,
  orchestrationWsServerMessageSchema,
  threadTurnStartCommandSchema,
} from './index'

const now = '2026-05-24T00:00:00.000Z'
const modelSelection = {
  providerInstanceId: 'codex',
  model: 'gpt-5-codex',
}

describe('orchestration contracts', () => {
  it('validates model selection with the Codex default provider instance shape', () => {
    const parsed = v.parse(modelSelectionSchema, modelSelection as unknown)

    expect(parsed.providerInstanceId as string).toBe('codex')
    expect(parsed.model).toBe('gpt-5-codex')
    expect(() =>
      v.parse(modelSelectionSchema, {
        providerInstanceId: 'not a slug',
        model: 'gpt-5-codex',
      } as unknown),
    ).toThrow()
  })

  it('validates Phase 7 provider snapshots with open driver and instance ids', () => {
    const parsed = v.parse(providerListResultSchema, {
      providers: [
        {
          ...DEFAULT_CODEX_PROVIDER_SETTINGS,
          auth: { status: 'unknown' },
          checkedAt: now,
          installed: true,
          models: [
            {
              capabilities: null,
              isCustom: false,
              name: 'GPT-5.5',
              shortName: 'GPT-5.5',
              slug: 'gpt-5.5',
            },
          ],
          status: 'ready',
          version: 'codex-cli 0.130.0',
        },
      ],
    })

    expect(parsed.providers[0]?.providerInstanceId as string).toBe('codex')
    expect(parsed.providers[0]?.driverKind as string).toBe('codex')
    expect(parsed.providers[0]?.traits.supportsStreaming).toBe(true)
  })

  it('validates Phase 1 client commands and defaults empty attachments', () => {
    const command = v.parse(threadTurnStartCommandSchema, {
      commandId: 'cmd-1',
      type: 'thread.turn.start',
      threadId: 'thread-1',
      turnId: 'turn-1',
      message: {
        messageId: 'message-1',
        role: 'user',
        text: 'Build the first slice',
      },
      createdAt: now,
    })

    expect(command.message.attachments).toEqual([])
    expect(command.runtimeMode).toBe('full-access')
    expect(command.interactionMode).toBe('default')
  })

  it('validates T3-style turn bootstrap create-thread metadata', () => {
    const command = v.parse(threadTurnStartCommandSchema, {
      commandId: 'cmd-1',
      type: 'thread.turn.start',
      threadId: 'thread-1',
      turnId: 'turn-1',
      message: {
        messageId: 'message-1',
        role: 'user',
        text: 'Build the first slice',
      },
      bootstrap: {
        createThread: {
          createdAt: now,
          modelSelection,
          projectId: 'project-1',
          title: 'Build the first slice',
        },
      },
      createdAt: now,
    })

    expect(command.bootstrap?.createThread?.projectId as string).toBe('project-1')
    expect(command.bootstrap?.createThread?.runtimeMode).toBe('full-access')
    expect(command.bootstrap?.createThread?.interactionMode).toBe('default')
  })

  it('rejects proposed-plan client commands deferred beyond Phase 1', () => {
    expect(() =>
      v.parse(clientOrchestrationCommandSchema, {
        commandId: 'cmd-2',
        type: 'thread.proposed-plan.accept',
        threadId: 'thread-1',
        planId: 'plan-1',
        createdAt: now,
      }),
    ).toThrow()
  })

  it('keeps the locked Phase 1 event list without synthetic turn lifecycle events', () => {
    expect(orchestrationEventTypes).toEqual([
      'project.created',
      'project.meta-updated',
      'project.deleted',
      'thread.created',
      'thread.meta-updated',
      'thread.deleted',
      'thread.archived',
      'thread.unarchived',
      'thread.runtime-mode-set',
      'thread.interaction-mode-set',
      'thread.message-sent',
      'thread.turn-start-requested',
      'thread.turn-interrupt-requested',
      'thread.session-stop-requested',
      'thread.session-set',
      'thread.activity-appended',
      'thread.proposed-plan-upserted',
      'thread.turn-diff-completed',
      'thread.checkpoint-revert-requested',
      'thread.reverted',
      'thread.approval-response-requested',
      'thread.user-input-response-requested',
    ])
    expect(orchestrationEventTypes).not.toContain('thread.turn-started')
    expect(orchestrationEventTypes).not.toContain('thread.turn-completed')
    expect(orchestrationEventTypes).not.toContain('thread.turn-failed')
  })

  it('round-trips domain events through JSON and contract validation', () => {
    const event = {
      sequence: 7,
      eventId: 'event-7',
      aggregateKind: 'thread',
      aggregateId: 'thread-1',
      occurredAt: now,
      commandId: 'cmd-1',
      causationEventId: null,
      correlationId: 'cmd-1',
      actorKind: 'client',
      metadata: {},
      type: 'thread.turn-start-requested',
      payload: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        messageId: 'message-1',
        runtimeMode: 'full-access',
        interactionMode: 'default',
        createdAt: now,
      },
    } as const

    const parsed = v.parse(orchestrationEventSchema, event)
    const serialized = JSON.stringify(parsed)

    expect(v.parse(orchestrationEventSchema, JSON.parse(serialized))).toEqual(parsed)
  })

  it('validates shell snapshots for summary lookup paths', () => {
    const snapshot = v.parse(orchestrationShellSnapshotSchema, {
      snapshotSequence: 7,
      projects: [
        {
          id: 'project-1',
          title: 'Platform',
          workspaceRoot: '/workspace',
          defaultModelSelection: modelSelection,
          createdAt: now,
          updatedAt: now,
        },
      ],
      threads: [
        {
          id: 'thread-1',
          projectId: 'project-1',
          title: 'Phase 1',
          modelSelection,
          runtimeMode: 'full-access',
          interactionMode: 'default',
          branch: null,
          worktreePath: null,
          latestTurn: null,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
          session: null,
          latestUserMessageAt: now,
          pendingApprovalCount: 0,
          pendingUserInputCount: 0,
          hasActionableProposedPlan: false,
        },
      ],
      updatedAt: now,
    })

    expect(snapshot.snapshotSequence).toBe(7)
    expect(snapshot.threads[0]?.pendingApprovalCount).toBe(0)
  })

  it('validates replay input with sequence and optional aggregate filters', () => {
    const replayInput = v.parse(orchestrationReplayEventsInputSchema, {
      afterSequence: 7,
      aggregateKind: 'thread',
      aggregateId: 'thread-1',
      threadId: 'thread-1',
    } as unknown)

    expect(replayInput.afterSequence).toBe(7)
    expect(replayInput.aggregateKind).toBe('thread')
    expect(replayInput.aggregateId as string).toBe('thread-1')
    expect(replayInput.threadId as string).toBe('thread-1')
  })

  it('validates command receipts for idempotent dispatch results', () => {
    const receipt = v.parse(orchestrationCommandReceiptSchema, {
      commandId: 'cmd-1',
      commandType: 'thread.turn.start',
      aggregateKind: 'thread',
      aggregateId: 'thread-1',
      acceptedAt: now,
      resultSequence: 7,
      status: 'accepted',
      error: null,
    })

    expect(receipt.commandType).toBe('thread.turn.start')
    expect(receipt.resultSequence).toBe(7)
  })

  it('validates T3-style orchestration WebSocket RPC messages', () => {
    const request = v.parse(orchestrationWsClientMessageSchema, {
      kind: 'request',
      requestId: 'request-1',
      method: 'dispatchCommand',
      command: {
        commandId: 'cmd-1',
        type: 'thread.turn.start',
        threadId: 'thread-1',
        turnId: 'turn-1',
        message: {
          messageId: 'message-1',
          role: 'user',
          text: 'Build the first slice',
        },
        createdAt: now,
      },
    })
    const subscription = v.parse(orchestrationWsClientMessageSchema, {
      afterSequence: 7,
      kind: 'subscribe',
      method: 'subscribeThread',
      subscriptionId: 'subscription-1',
      threadId: 'thread-1',
    })
    const response = v.parse(orchestrationWsServerMessageSchema, {
      data: { deduped: false, sequence: 8 },
      kind: 'response',
      ok: true,
      requestId: 'request-1',
    })

    expect(request.kind).toBe('request')
    expect(subscription.kind).toBe('subscribe')
    expect(response.kind).toBe('response')
  })
})
