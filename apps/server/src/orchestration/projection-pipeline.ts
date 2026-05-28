import { and, eq } from 'drizzle-orm'
import type { OrchestrationEvent } from './schemas'
import { db as defaultDb } from '../db/client'
import {
  projectionProjects,
  projectionState,
  projectionThreadActivities,
  projectionThreadMessages,
  projectionThreadSessions,
  projectionThreads,
  projectionTurns,
} from '../db/schema'
import type { OrchestrationDatabase } from './event-store'
import { OrchestrationEventStore } from './event-store'
import {
  orchestrationEventBatchSummary,
  orchestrationEventSummary,
  recordChatPipelineInfo,
} from './orchestration-logging'

export const ORCHESTRATION_PROJECTOR_NAME = 'orchestration'

export class OrchestrationProjectionPipeline {
  private readonly database: OrchestrationDatabase
  private readonly eventStore: OrchestrationEventStore

  constructor(
    database: OrchestrationDatabase = defaultDb,
    eventStore = new OrchestrationEventStore(database),
  ) {
    this.database = database
    this.eventStore = eventStore
  }

  catchUp() {
    const afterSequence = this.lastAppliedSequence()
    recordChatPipelineInfo('chat.pipeline.projection.catch_up.start', { afterSequence })
    const events = this.eventStore.readAfter({ afterSequence })
    this.applyEvents(events)
    recordChatPipelineInfo('chat.pipeline.projection.catch_up.complete', {
      afterSequence,
      ...orchestrationEventBatchSummary(events),
    })

    return events
  }

  applyEvents(events: OrchestrationEvent[]) {
    recordChatPipelineInfo('chat.pipeline.projection.apply_events.start', {
      ...orchestrationEventBatchSummary(events),
    })
    for (const event of events) {
      recordChatPipelineInfo('chat.pipeline.projection.apply_event', {
        ...orchestrationEventSummary(event),
      })
      this.applyEvent(event)
      this.markApplied(event.sequence)
    }
    recordChatPipelineInfo('chat.pipeline.projection.apply_events.complete', {
      ...orchestrationEventBatchSummary(events),
    })
  }

  lastAppliedSequence() {
    return (
      this.database
        .select()
        .from(projectionState)
        .where(eq(projectionState.projector, ORCHESTRATION_PROJECTOR_NAME))
        .get()?.lastAppliedSequence ?? 0
    )
  }

  private applyEvent(event: OrchestrationEvent) {
    switch (event.type) {
      case 'project.created':
        this.upsertProject(event)
        return
      case 'project.meta-updated':
        this.updateProject(event.payload.projectId, {
          defaultModelSelectionJson: jsonOrNull(event.payload.defaultModelSelection),
          title: event.payload.title,
          updatedAt: event.payload.updatedAt,
          workspaceRoot: event.payload.workspaceRoot,
        })
        return
      case 'project.deleted':
        this.updateProject(event.payload.projectId, {
          deletedAt: event.payload.deletedAt,
          updatedAt: event.payload.deletedAt,
        })
        return
      case 'thread.created':
        this.upsertThread(event)
        return
      case 'thread.meta-updated':
        this.updateThread(event.payload.threadId, {
          branch: event.payload.branch,
          modelSelectionJson: jsonOrUndefined(event.payload.modelSelection),
          title: event.payload.title,
          updatedAt: event.payload.updatedAt,
          worktreePath: event.payload.worktreePath,
        })
        return
      case 'thread.message-sent':
        this.upsertMessage(event)
        return
      case 'thread.turn-start-requested':
        this.upsertTurn(event)
        return
      case 'thread.session-set':
        this.upsertSession(event)
        return
      case 'thread.activity-appended':
        this.insertActivity(event)
        this.updateTurnForActivity(event)
        return
      case 'thread.deleted':
        this.updateThread(event.payload.threadId, {
          deletedAt: event.payload.deletedAt,
          updatedAt: event.payload.deletedAt,
        })
        return
      case 'thread.archived':
        this.updateThread(event.payload.threadId, {
          archivedAt: event.payload.archivedAt,
          updatedAt: event.payload.updatedAt,
        })
        return
      case 'thread.unarchived':
        this.updateThread(event.payload.threadId, {
          archivedAt: null,
          updatedAt: event.payload.updatedAt,
        })
        return
      case 'thread.runtime-mode-set':
        this.updateThread(event.payload.threadId, {
          runtimeMode: event.payload.runtimeMode,
          updatedAt: event.payload.updatedAt,
        })
        return
      case 'thread.interaction-mode-set':
        this.updateThread(event.payload.threadId, {
          interactionMode: event.payload.interactionMode,
          updatedAt: event.payload.updatedAt,
        })
        return
      case 'thread.turn-interrupt-requested':
        this.completeTurn(
          event.payload.threadId,
          event.payload.turnId,
          'interrupted',
          event.payload.createdAt,
        )
        return
      case 'thread.turn-diff-completed':
        this.completeTurn(
          event.payload.threadId,
          event.payload.turnId,
          event.payload.status === 'error' ? 'error' : 'completed',
          event.payload.completedAt,
          event.payload.assistantMessageId,
        )
        return
      case 'thread.session-stop-requested':
        this.updateSessionStatus(event.payload.threadId, 'stopped', event.payload.createdAt)
        return
      case 'thread.proposed-plan-upserted':
        this.updateThread(event.payload.threadId, { hasActionableProposedPlan: true })
        return
      case 'thread.reverted':
      case 'thread.approval-response-requested':
      case 'thread.user-input-response-requested':
        return
    }
  }

  private upsertProject(event: Extract<OrchestrationEvent, { type: 'project.created' }>) {
    this.database
      .insert(projectionProjects)
      .values({
        createdAt: event.payload.createdAt,
        defaultModelSelectionJson: jsonOrNull(event.payload.defaultModelSelection),
        deletedAt: null,
        projectId: event.payload.projectId,
        title: event.payload.title,
        updatedAt: event.payload.updatedAt,
        workspaceRoot: event.payload.workspaceRoot,
      })
      .onConflictDoUpdate({
        target: projectionProjects.projectId,
        set: {
          defaultModelSelectionJson: jsonOrNull(event.payload.defaultModelSelection),
          deletedAt: null,
          title: event.payload.title,
          updatedAt: event.payload.updatedAt,
          workspaceRoot: event.payload.workspaceRoot,
        },
      })
      .run()
  }

  private upsertThread(event: Extract<OrchestrationEvent, { type: 'thread.created' }>) {
    this.database
      .insert(projectionThreads)
      .values({
        archivedAt: null,
        branch: event.payload.branch,
        createdAt: event.payload.createdAt,
        deletedAt: null,
        hasActionableProposedPlan: false,
        interactionMode: event.payload.interactionMode,
        latestTurnId: null,
        latestTurnJson: null,
        latestUserMessageAt: null,
        modelSelectionJson: JSON.stringify(event.payload.modelSelection),
        pendingApprovalCount: 0,
        pendingUserInputCount: 0,
        projectId: event.payload.projectId,
        runtimeMode: event.payload.runtimeMode,
        threadId: event.payload.threadId,
        title: event.payload.title,
        updatedAt: event.payload.updatedAt,
        worktreePath: event.payload.worktreePath,
      })
      .onConflictDoUpdate({
        target: projectionThreads.threadId,
        set: {
          archivedAt: null,
          branch: event.payload.branch,
          deletedAt: null,
          interactionMode: event.payload.interactionMode,
          modelSelectionJson: JSON.stringify(event.payload.modelSelection),
          projectId: event.payload.projectId,
          runtimeMode: event.payload.runtimeMode,
          title: event.payload.title,
          updatedAt: event.payload.updatedAt,
          worktreePath: event.payload.worktreePath,
        },
      })
      .run()
  }

  private upsertMessage(event: Extract<OrchestrationEvent, { type: 'thread.message-sent' }>) {
    const existing = this.database
      .select()
      .from(projectionThreadMessages)
      .where(eq(projectionThreadMessages.messageId, event.payload.messageId))
      .get()
    const text = existing ? `${existing.text}${event.payload.text}` : event.payload.text

    this.database
      .insert(projectionThreadMessages)
      .values({
        attachmentsJson: JSON.stringify(event.payload.attachments),
        createdAt: event.payload.createdAt,
        messageId: event.payload.messageId,
        role: event.payload.role,
        streaming: event.payload.streaming,
        text,
        threadId: event.payload.threadId,
        turnId: event.payload.turnId,
        updatedAt: event.payload.updatedAt,
      })
      .onConflictDoUpdate({
        target: projectionThreadMessages.messageId,
        set: {
          streaming: event.payload.streaming,
          text,
          updatedAt: event.payload.updatedAt,
        },
      })
      .run()

    this.updateThreadForMessage(event)
  }

  private updateThreadForMessage(
    event: Extract<OrchestrationEvent, { type: 'thread.message-sent' }>,
  ) {
    if (event.payload.role === 'user') {
      this.updateThread(event.payload.threadId, {
        latestUserMessageAt: event.payload.createdAt,
        updatedAt: event.payload.updatedAt,
      })
      return
    }

    this.updateThread(event.payload.threadId, { updatedAt: event.payload.updatedAt })
    this.updateAssistantTurn(event)
  }

  private updateAssistantTurn(event: Extract<OrchestrationEvent, { type: 'thread.message-sent' }>) {
    if (event.payload.role !== 'assistant') return
    if (!event.payload.turnId) return

    const turn = this.selectTurn(event.payload.threadId, event.payload.turnId)
    const state = assistantTurnState(turn?.state, event.payload.streaming)
    const completedAt = assistantTurnCompletedAt(turn?.completedAt, event)
    const startedAt = turn?.startedAt ?? event.payload.createdAt
    const requestedAt = turn?.requestedAt ?? event.payload.createdAt

    this.upsertAssistantTurn(event, { completedAt, requestedAt, startedAt, state })
    this.updateThreadLatestTurnForAssistantMessage(event, {
      completedAt,
      requestedAt,
      startedAt,
      state,
    })
  }

  private upsertTurn(event: Extract<OrchestrationEvent, { type: 'thread.turn-start-requested' }>) {
    const latestTurn = {
      assistantMessageId: null,
      completedAt: null,
      requestedAt: event.payload.createdAt,
      sourceProposedPlan: event.payload.sourceProposedPlan,
      startedAt: null,
      state: 'running',
      turnId: event.payload.turnId,
    }

    this.database
      .insert(projectionTurns)
      .values({
        assistantMessageId: null,
        completedAt: null,
        requestedAt: event.payload.createdAt,
        sourceProposedPlanJson: jsonOrUndefined(event.payload.sourceProposedPlan),
        startedAt: null,
        state: 'running',
        threadId: event.payload.threadId,
        turnId: event.payload.turnId,
        userMessageId: event.payload.messageId,
      })
      .onConflictDoUpdate({
        target: [projectionTurns.threadId, projectionTurns.turnId],
        set: {
          requestedAt: event.payload.createdAt,
          state: 'running',
          userMessageId: event.payload.messageId,
        },
      })
      .run()

    this.updateThread(event.payload.threadId, {
      interactionMode: event.payload.interactionMode,
      latestTurnId: event.payload.turnId,
      latestTurnJson: JSON.stringify(latestTurn),
      runtimeMode: event.payload.runtimeMode,
      updatedAt: event.payload.createdAt,
    })
  }

  private upsertSession(event: Extract<OrchestrationEvent, { type: 'thread.session-set' }>) {
    this.database
      .insert(projectionThreadSessions)
      .values({
        activeTurnId: event.payload.session.activeTurnId,
        lastError: event.payload.session.lastError,
        providerInstanceId: event.payload.session.providerInstanceId ?? 'codex',
        providerName: event.payload.session.providerName,
        providerSessionId: event.payload.session.providerSessionId,
        providerThreadId: null,
        runtimeMode: event.payload.session.runtimeMode ?? 'full-access',
        status: event.payload.session.status,
        threadId: event.payload.threadId,
        updatedAt: event.payload.session.updatedAt,
      })
      .onConflictDoUpdate({
        target: projectionThreadSessions.threadId,
        set: {
          activeTurnId: event.payload.session.activeTurnId,
          lastError: event.payload.session.lastError,
          providerInstanceId: event.payload.session.providerInstanceId ?? 'codex',
          providerName: event.payload.session.providerName,
          providerSessionId: event.payload.session.providerSessionId,
          runtimeMode: event.payload.session.runtimeMode ?? 'full-access',
          status: event.payload.session.status,
          updatedAt: event.payload.session.updatedAt,
        },
      })
      .run()
  }

  private insertActivity(event: Extract<OrchestrationEvent, { type: 'thread.activity-appended' }>) {
    this.database
      .insert(projectionThreadActivities)
      .values({
        activityId: event.payload.activity.id,
        createdAt: event.payload.activity.createdAt,
        kind: event.payload.activity.kind,
        payloadJson: JSON.stringify(event.payload.activity.payload),
        sequence: event.payload.activity.sequence ?? event.sequence,
        summary: event.payload.activity.summary,
        threadId: event.payload.threadId,
        tone: event.payload.activity.tone,
        turnId: event.payload.activity.turnId,
      })
      .onConflictDoNothing()
      .run()
  }

  private updateTurnForActivity(
    event: Extract<OrchestrationEvent, { type: 'thread.activity-appended' }>,
  ) {
    if (event.payload.activity.kind !== 'provider.turn.failed') return
    if (!event.payload.activity.turnId) return

    this.completeTurn(
      event.payload.threadId,
      event.payload.activity.turnId,
      'error',
      event.payload.activity.createdAt,
    )
  }

  private completeTurn(
    threadId: string,
    turnId: string | undefined,
    state: 'completed' | 'interrupted' | 'error',
    completedAt: string,
    assistantMessageId?: string | null,
  ) {
    if (!turnId) return

    const turn = this.selectTurn(threadId, turnId)
    const nextAssistantMessageId =
      assistantMessageId === undefined ? (turn?.assistantMessageId ?? null) : assistantMessageId

    this.database
      .update(projectionTurns)
      .set({ assistantMessageId: nextAssistantMessageId, completedAt, state })
      .where(and(eq(projectionTurns.threadId, threadId), eq(projectionTurns.turnId, turnId)))
      .run()
    const row = this.database
      .select()
      .from(projectionThreads)
      .where(eq(projectionThreads.threadId, threadId))
      .get()
    const current = row?.latestTurnJson ? (JSON.parse(row.latestTurnJson) as object) : {}

    this.updateThread(threadId, {
      latestTurnJson: JSON.stringify({
        ...current,
        assistantMessageId: nextAssistantMessageId,
        completedAt,
        state,
        turnId,
      }),
      updatedAt: completedAt,
    })
  }

  private selectTurn(threadId: string, turnId: string) {
    return this.database
      .select()
      .from(projectionTurns)
      .where(and(eq(projectionTurns.threadId, threadId), eq(projectionTurns.turnId, turnId)))
      .get()
  }

  private upsertAssistantTurn(
    event: Extract<OrchestrationEvent, { type: 'thread.message-sent' }>,
    turn: {
      completedAt: string | null
      requestedAt: string
      startedAt: string
      state: 'running' | 'completed' | 'interrupted' | 'error'
    },
  ) {
    const turnId = event.payload.turnId
    if (!turnId) return

    this.database
      .insert(projectionTurns)
      .values({
        assistantMessageId: event.payload.messageId,
        completedAt: turn.completedAt,
        requestedAt: turn.requestedAt,
        sourceProposedPlanJson: null,
        startedAt: turn.startedAt,
        state: turn.state,
        threadId: event.payload.threadId,
        turnId,
        userMessageId: null,
      })
      .onConflictDoUpdate({
        target: [projectionTurns.threadId, projectionTurns.turnId],
        set: {
          assistantMessageId: event.payload.messageId,
          completedAt: turn.completedAt,
          requestedAt: turn.requestedAt,
          startedAt: turn.startedAt,
          state: turn.state,
        },
      })
      .run()
  }

  private updateThreadLatestTurnForAssistantMessage(
    event: Extract<OrchestrationEvent, { type: 'thread.message-sent' }>,
    turn: {
      completedAt: string | null
      requestedAt: string
      startedAt: string
      state: 'running' | 'completed' | 'interrupted' | 'error'
    },
  ) {
    const row = this.database
      .select()
      .from(projectionThreads)
      .where(eq(projectionThreads.threadId, event.payload.threadId))
      .get()
    const current = row?.latestTurnJson
      ? (JSON.parse(row.latestTurnJson) as { turnId?: string })
      : null
    if (current?.turnId && current.turnId !== event.payload.turnId) return

    this.updateThread(event.payload.threadId, {
      latestTurnId: event.payload.turnId,
      latestTurnJson: JSON.stringify({
        ...current,
        assistantMessageId: event.payload.messageId,
        completedAt: turn.completedAt,
        requestedAt: turn.requestedAt,
        startedAt: turn.startedAt,
        state: turn.state,
        turnId: event.payload.turnId,
      }),
      updatedAt: event.payload.updatedAt,
    })
  }

  private updateSessionStatus(threadId: string, status: 'stopped', updatedAt: string) {
    this.database
      .update(projectionThreadSessions)
      .set({ status, updatedAt })
      .where(eq(projectionThreadSessions.threadId, threadId))
      .run()
  }

  private updateProject(projectId: string, patch: Partial<typeof projectionProjects.$inferInsert>) {
    this.database
      .update(projectionProjects)
      .set(compactPatch(patch))
      .where(eq(projectionProjects.projectId, projectId))
      .run()
  }

  private updateThread(threadId: string, patch: Partial<typeof projectionThreads.$inferInsert>) {
    this.database
      .update(projectionThreads)
      .set(compactPatch(patch))
      .where(eq(projectionThreads.threadId, threadId))
      .run()
  }

  private markApplied(sequence: number) {
    const updatedAt = new Date().toISOString()

    this.database
      .insert(projectionState)
      .values({
        lastAppliedSequence: sequence,
        projector: ORCHESTRATION_PROJECTOR_NAME,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: projectionState.projector,
        set: {
          lastAppliedSequence: sequence,
          updatedAt,
        },
      })
      .run()
  }
}

function compactPatch<T extends Record<string, unknown>>(patch: T) {
  return Object.fromEntries(
    Object.entries(patch).filter((entry) => entry[1] !== undefined),
  ) as Partial<T>
}

function jsonOrNull(value: unknown) {
  if (value === undefined || value === null) return null

  return JSON.stringify(value)
}

function jsonOrUndefined(value: unknown) {
  if (value === undefined) return undefined

  return JSON.stringify(value)
}

function assistantTurnState(
  current: 'running' | 'completed' | 'interrupted' | 'error' | undefined,
  streaming: boolean,
) {
  if (streaming) return current ?? 'running'
  if (current === 'interrupted' || current === 'error') return current

  return 'completed'
}

function assistantTurnCompletedAt(
  current: string | null | undefined,
  event: Extract<OrchestrationEvent, { type: 'thread.message-sent' }>,
) {
  if (event.payload.streaming) return current ?? null

  return current ?? event.payload.updatedAt
}
