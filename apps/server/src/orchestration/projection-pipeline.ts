import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm'
import type { OrchestrationSessionStatus } from '@workspace/contracts'
import type { OrchestrationEvent } from './schemas'
import { getDefaultPlatformDatabase } from '../db/client'
import {
  projectionProjects,
  projectionState,
  projectionThreadActivities,
  projectionThreadCheckpoints,
  projectionThreadMessages,
  projectionThreadProposedPlans,
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
import { mergedMessageText, settledTurnStateForSessionStatus } from './read-model'

export const ORCHESTRATION_PROJECTOR_NAME = 'orchestration'

export class OrchestrationProjectionPipeline {
  private readonly database: OrchestrationDatabase
  private readonly eventStore: OrchestrationEventStore

  constructor(
    database: OrchestrationDatabase = getDefaultPlatformDatabase(),
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
      this.applyEventAtomically(event)
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

  /**
   * The cursor advance rides in the same transaction as the projection write.
   * Split, a crash in between replays an already-applied event on the next
   * start, and a streaming assistant frame appends its text a second time.
   * Nested under the engine's command transaction this is a savepoint.
   */
  private applyEventAtomically(event: OrchestrationEvent) {
    this.database.transaction(() => {
      this.applyEvent(event)
      this.markApplied(event.sequence)
    })
  }

  private applyEvent(event: OrchestrationEvent) {
    switch (event.type) {
      case 'project.created':
        this.upsertProject(event)
        return
      case 'project.meta-updated':
        this.updateProject(event.payload.projectId, {
          defaultModelSelectionJson: jsonPatch(event.payload.defaultModelSelection),
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
        this.settleRunningTurns(
          event.payload.threadId,
          event.payload.session.status,
          event.payload.session.updatedAt,
        )
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
      case 'thread.settled':
        this.updateThread(event.payload.threadId, {
          settledAt: event.payload.settledAt,
          settledOverride: 'settled',
          updatedAt: event.payload.updatedAt,
        })
        return
      case 'thread.unsettled':
        // "user" is an explicit keep-active override; "activity" resets to
        // neutral so the thread can settle on its own again.
        this.updateThread(event.payload.threadId, {
          settledAt: null,
          settledOverride: event.payload.reason === 'user' ? 'active' : null,
          updatedAt: event.payload.updatedAt,
        })
        return
      case 'thread.snoozed':
        this.updateThread(event.payload.threadId, {
          snoozedAt: event.payload.snoozedAt,
          snoozedUntil: event.payload.snoozedUntil,
          updatedAt: event.payload.updatedAt,
        })
        return
      case 'thread.unsnoozed':
        this.updateThread(event.payload.threadId, {
          snoozedAt: null,
          snoozedUntil: null,
          updatedAt: event.payload.updatedAt,
        })
        return
      case 'thread.pinned':
        // An absent key is "keep what is there": a re-pin must not overwrite the
        // slot the user already dragged this thread into.
        this.updateThread(event.payload.threadId, {
          pinOrderKey: event.payload.pinOrderKey,
          pinnedAt: event.payload.pinnedAt,
          updatedAt: event.payload.updatedAt,
        })
        return
      case 'thread.unpinned':
        this.updateThread(event.payload.threadId, {
          pinOrderKey: null,
          pinnedAt: null,
          updatedAt: event.payload.updatedAt,
        })
        return
      case 'thread.pin-reordered':
        this.updateThread(event.payload.threadId, {
          pinOrderKey: event.payload.orderKey,
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
        this.upsertCheckpoint(event)
        return
      case 'thread.session-stop-requested':
        this.updateSessionStatus(event.payload.threadId, 'stopped', event.payload.createdAt)
        this.settleRunningTurns(event.payload.threadId, 'stopped', event.payload.createdAt)
        return
      case 'thread.proposed-plan-upserted':
        this.upsertProposedPlan(event)
        return
      case 'thread.checkpoint-revert-requested':
        return
      case 'thread.reverted':
        this.pruneThreadAfterRevert(event)
        return
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
        pinOrderKey: null,
        pinnedAt: null,
        projectId: event.payload.projectId,
        runtimeMode: event.payload.runtimeMode,
        settledAt: null,
        settledOverride: null,
        snoozedAt: null,
        snoozedUntil: null,
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
    const text = mergedMessageText(existing?.text ?? null, event.payload)
    // turnId and attachments are backfilled, never erased: a later frame that
    // carries neither (a bare completion) must keep what the first one bound.
    const turnId = event.payload.turnId ?? existing?.turnId ?? null
    const attachmentsJson =
      event.payload.attachments.length > 0
        ? JSON.stringify(event.payload.attachments)
        : (existing?.attachmentsJson ?? '[]')

    this.database
      .insert(projectionThreadMessages)
      .values({
        attachmentsJson,
        createdAt: event.payload.createdAt,
        messageId: event.payload.messageId,
        role: event.payload.role,
        streaming: event.payload.streaming,
        text,
        threadId: event.payload.threadId,
        turnId,
        updatedAt: event.payload.updatedAt,
      })
      .onConflictDoUpdate({
        target: projectionThreadMessages.messageId,
        set: {
          attachmentsJson,
          streaming: event.payload.streaming,
          text,
          turnId,
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
    this.updateThreadLatestTurnForAssistantMessage(event)
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
      // turn-start's modelSelection is optional but never null, so absent means
      // "leave it alone" — jsonOrUndefined, not jsonPatch.
      modelSelectionJson: jsonOrUndefined(event.payload.modelSelection),
      runtimeMode: event.payload.runtimeMode,
      updatedAt: event.payload.createdAt,
    })
    this.markProposedPlanImplemented(event)
  }

  /**
   * Starting a turn from a plan is the moment the plan stops being actionable.
   * The plan can live on another thread, so the flag is refreshed there, not on
   * the thread that ran the turn.
   */
  private markProposedPlanImplemented(
    event: Extract<OrchestrationEvent, { type: 'thread.turn-start-requested' }>,
  ) {
    const source = event.payload.sourceProposedPlan
    if (!source) return

    this.database
      .update(projectionThreadProposedPlans)
      .set({
        implementationThreadId: event.payload.threadId,
        implementedAt: event.payload.createdAt,
        updatedAt: event.payload.createdAt,
      })
      .where(
        and(
          eq(projectionThreadProposedPlans.planId, source.planId),
          isNull(projectionThreadProposedPlans.implementedAt),
        ),
      )
      .run()
    this.refreshActionableProposedPlan(source.threadId)
  }

  private upsertProposedPlan(
    event: Extract<OrchestrationEvent, { type: 'thread.proposed-plan-upserted' }>,
  ) {
    const plan = event.payload.proposedPlan
    const row = {
      createdAt: plan.createdAt,
      implementationThreadId: plan.implementationThreadId ?? null,
      implementedAt: plan.implementedAt ?? null,
      planId: plan.id,
      planMarkdown: plan.planMarkdown,
      threadId: event.payload.threadId,
      turnId: plan.turnId,
      updatedAt: plan.updatedAt,
    }

    this.database
      .insert(projectionThreadProposedPlans)
      .values(row)
      .onConflictDoUpdate({
        target: projectionThreadProposedPlans.planId,
        set: {
          implementationThreadId: row.implementationThreadId,
          implementedAt: row.implementedAt,
          planMarkdown: row.planMarkdown,
          turnId: row.turnId,
          updatedAt: row.updatedAt,
        },
      })
      .run()
    this.updateThread(event.payload.threadId, { updatedAt: plan.updatedAt })
    this.refreshActionableProposedPlan(event.payload.threadId)
  }

  /**
   * Derived, never latched: the newest plan decides. The in-memory projector
   * carries no plan history, so both projections read "the last plan we heard
   * about" and agree.
   */
  private refreshActionableProposedPlan(threadId: string) {
    const latest = this.latestProposedPlan(threadId)

    this.updateThread(threadId, {
      hasActionableProposedPlan: latest !== undefined && latest.implementedAt === null,
    })
  }

  private latestProposedPlan(threadId: string) {
    return this.database
      .select()
      .from(projectionThreadProposedPlans)
      .where(eq(projectionThreadProposedPlans.threadId, threadId))
      .orderBy(
        desc(projectionThreadProposedPlans.updatedAt),
        desc(projectionThreadProposedPlans.planId),
      )
      .limit(1)
      .get()
  }

  private upsertCheckpoint(
    event: Extract<OrchestrationEvent, { type: 'thread.turn-diff-completed' }>,
  ) {
    const { assistantMessageId, completedAt, status, threadId, turnId } = event.payload
    const existing = this.selectCheckpoint(threadId, turnId)
    // Mid-turn diff updates carry a placeholder ref with status "missing". Once
    // a real capture has landed, a later placeholder must change nothing at all
    // — not the ref, and not the turn's state.
    if (existing && existing.status !== 'missing' && status === 'missing') return

    this.database
      .insert(projectionThreadCheckpoints)
      .values({
        assistantMessageId,
        checkpointRef: event.payload.checkpointRef,
        checkpointTurnCount: event.payload.checkpointTurnCount,
        completedAt,
        filesJson: JSON.stringify(event.payload.files),
        status,
        threadId,
        turnId,
      })
      .onConflictDoUpdate({
        target: [projectionThreadCheckpoints.threadId, projectionThreadCheckpoints.turnId],
        set: {
          assistantMessageId,
          checkpointRef: event.payload.checkpointRef,
          checkpointTurnCount: event.payload.checkpointTurnCount,
          completedAt,
          filesJson: JSON.stringify(event.payload.files),
          status,
        },
      })
      .run()
    // Recording a checkpoint is not a turn ending: a placeholder arrives while
    // the session is still streaming the very turn it describes.
    if (this.isSessionRunningTurn(threadId, turnId)) return

    this.completeTurn(
      threadId,
      turnId,
      status === 'error' ? 'error' : 'completed',
      completedAt,
      assistantMessageId,
    )
  }

  private isSessionRunningTurn(threadId: string, turnId: string) {
    const session = this.database
      .select()
      .from(projectionThreadSessions)
      .where(eq(projectionThreadSessions.threadId, threadId))
      .get()
    if (session?.status !== 'running') return false

    return session.activeTurnId === turnId
  }

  private selectCheckpoint(threadId: string, turnId: string) {
    return this.database
      .select()
      .from(projectionThreadCheckpoints)
      .where(
        and(
          eq(projectionThreadCheckpoints.threadId, threadId),
          eq(projectionThreadCheckpoints.turnId, turnId),
        ),
      )
      .get()
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
    if (!isProviderTurnFailureActivity(event.payload.activity.kind)) return
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
    const updatedTurn = this.selectTurn(threadId, turnId)

    this.updateThread(threadId, {
      latestTurnJson: updatedTurn ? JSON.stringify(latestTurnJson(updatedTurn)) : null,
      updatedAt: completedAt,
    })
  }

  /**
   * Leaving the "running" session status is the turn-end signal. Without it a
   * turn that ended with no assistant message — or whose session errored
   * mid-turn — stays `running` in SQL forever and the thread spins.
   */
  private settleRunningTurns(
    threadId: string,
    status: OrchestrationSessionStatus,
    settledAt: string,
  ) {
    const state = settledTurnStateForSessionStatus(status)
    if (!state) return

    const running = this.database
      .select({ turnId: projectionTurns.turnId })
      .from(projectionTurns)
      .where(and(eq(projectionTurns.threadId, threadId), eq(projectionTurns.state, 'running')))
      .all()
    // Touching nothing keeps the thread's updatedAt — and the shell snapshot
    // timestamp — stable when a session status carries no turn news.
    if (running.length === 0) return

    this.database
      .update(projectionTurns)
      .set({ completedAt: settledAt, state })
      .where(and(eq(projectionTurns.threadId, threadId), eq(projectionTurns.state, 'running')))
      .run()
    this.refreshLatestTurn(threadId, settledAt)
  }

  private refreshLatestTurn(threadId: string, updatedAt: string) {
    const row = this.database
      .select()
      .from(projectionThreads)
      .where(eq(projectionThreads.threadId, threadId))
      .get()
    if (!row?.latestTurnId) return

    const turn = this.selectTurn(threadId, row.latestTurnId)
    if (!turn) return

    this.updateThread(threadId, {
      latestTurnJson: JSON.stringify(latestTurnJson(turn)),
      updatedAt,
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
  ) {
    const turnId = event.payload.turnId
    if (!turnId) return

    const row = this.database
      .select()
      .from(projectionThreads)
      .where(eq(projectionThreads.threadId, event.payload.threadId))
      .get()
    if (row?.latestTurnId && row.latestTurnId !== turnId) return

    const updatedTurn = this.selectTurn(event.payload.threadId, turnId)

    this.updateThread(event.payload.threadId, {
      latestTurnId: turnId,
      latestTurnJson: updatedTurn ? JSON.stringify(latestTurnJson(updatedTurn)) : null,
      updatedAt: event.payload.updatedAt,
    })
  }

  private pruneThreadAfterRevert(event: Extract<OrchestrationEvent, { type: 'thread.reverted' }>) {
    const threadId = event.payload.threadId
    const retainedTurnIds = new Set(
      this.dropCheckpointsAfterRevert(threadId, event.payload.turnCount).map((row) => row.turnId),
    )
    const messages = this.database
      .select()
      .from(projectionThreadMessages)
      .where(eq(projectionThreadMessages.threadId, threadId))
      .all()
      .filter((message) => shouldRetainAfterRevert(message.turnId, retainedTurnIds))
    const activities = this.database
      .select()
      .from(projectionThreadActivities)
      .where(eq(projectionThreadActivities.threadId, threadId))
      .all()
      .filter((activity) => shouldRetainAfterRevert(activity.turnId, retainedTurnIds))
    const turns = this.database
      .select()
      .from(projectionTurns)
      .where(eq(projectionTurns.threadId, threadId))
      .all()
      .filter((turn) => retainedTurnIds.has(turn.turnId))
    const latestTurn = latestProjectionTurn(turns)

    this.replaceThreadMessages(threadId, messages)
    this.replaceThreadActivities(threadId, activities)
    this.database.delete(projectionTurns).where(eq(projectionTurns.threadId, threadId)).run()
    if (turns.length > 0) {
      this.database.insert(projectionTurns).values(turns.map(turnInsertRow)).run()
    }

    this.updateThread(threadId, {
      latestTurnId: latestTurn?.turnId ?? null,
      latestTurnJson: latestTurn ? JSON.stringify(latestTurnJson(latestTurn)) : null,
      latestUserMessageAt: latestUserMessageAt(messages),
      updatedAt: event.payload.revertedAt,
    })
    this.dropProposedPlansAfterRevert(threadId, retainedTurnIds)
    this.refreshActionableProposedPlan(threadId)
  }

  /** Drops the checkpoints the revert undid and returns the ones that survive. */
  private dropCheckpointsAfterRevert(threadId: string, turnCount: number) {
    this.database
      .delete(projectionThreadCheckpoints)
      .where(
        and(
          eq(projectionThreadCheckpoints.threadId, threadId),
          gt(projectionThreadCheckpoints.checkpointTurnCount, turnCount),
        ),
      )
      .run()

    return this.threadCheckpointRows(threadId)
  }

  /** A plan belongs to the turn that proposed it; an unturned plan outlives every revert. */
  private dropProposedPlansAfterRevert(threadId: string, retainedTurnIds: Set<string>) {
    const droppedIds = this.database
      .select({
        planId: projectionThreadProposedPlans.planId,
        turnId: projectionThreadProposedPlans.turnId,
      })
      .from(projectionThreadProposedPlans)
      .where(eq(projectionThreadProposedPlans.threadId, threadId))
      .all()
      .filter((plan) => !shouldRetainAfterRevert(plan.turnId, retainedTurnIds))
      .map((plan) => plan.planId)
    if (droppedIds.length === 0) return

    this.database
      .delete(projectionThreadProposedPlans)
      .where(inArray(projectionThreadProposedPlans.planId, droppedIds))
      .run()
  }

  private threadCheckpointRows(threadId: string) {
    return this.database
      .select()
      .from(projectionThreadCheckpoints)
      .where(eq(projectionThreadCheckpoints.threadId, threadId))
      .all()
  }

  private replaceThreadMessages(
    threadId: string,
    rows: Array<typeof projectionThreadMessages.$inferSelect>,
  ) {
    this.database
      .delete(projectionThreadMessages)
      .where(eq(projectionThreadMessages.threadId, threadId))
      .run()
    if (rows.length === 0) return

    this.database.insert(projectionThreadMessages).values(rows).run()
  }

  private replaceThreadActivities(
    threadId: string,
    rows: Array<typeof projectionThreadActivities.$inferSelect>,
  ) {
    this.database
      .delete(projectionThreadActivities)
      .where(eq(projectionThreadActivities.threadId, threadId))
      .run()
    if (rows.length === 0) return

    this.database.insert(projectionThreadActivities).values(rows).run()
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

/**
 * Three-way, for nullable-and-optional payload fields: absent leaves the column alone
 * (compactPatch drops undefined), explicit null clears it. Collapsing the two would let
 * a partial update — say a rename carrying no defaultModelSelection — wipe the stored value.
 */
function jsonPatch(value: unknown) {
  if (value === undefined) return undefined
  if (value === null) return null

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

function isProviderTurnFailureActivity(kind: string) {
  return kind === 'provider.turn.start.failed' || kind === 'provider.turn.failed'
}

function assistantTurnCompletedAt(
  current: string | null | undefined,
  event: Extract<OrchestrationEvent, { type: 'thread.message-sent' }>,
) {
  if (event.payload.streaming) return current ?? null

  return current ?? event.payload.updatedAt
}

function shouldRetainAfterRevert(turnId: string | null, retainedTurnIds: Set<string>) {
  if (!turnId) return true

  return retainedTurnIds.has(turnId)
}

function latestProjectionTurn(turns: Array<typeof projectionTurns.$inferSelect>) {
  return turns
    .toSorted((left, right) => {
      const requestedOrder = left.requestedAt.localeCompare(right.requestedAt)
      if (requestedOrder !== 0) return requestedOrder

      return left.turnId.localeCompare(right.turnId)
    })
    .at(-1)
}

function latestTurnJson(turn: typeof projectionTurns.$inferSelect) {
  return {
    assistantMessageId: turn.assistantMessageId,
    completedAt: turn.completedAt,
    requestedAt: turn.requestedAt,
    sourceProposedPlan: parseJsonOrUndefined(turn.sourceProposedPlanJson),
    startedAt: turn.startedAt,
    state: turn.state,
    turnId: turn.turnId,
  }
}

function turnInsertRow(
  turn: typeof projectionTurns.$inferSelect,
): typeof projectionTurns.$inferInsert {
  return {
    assistantMessageId: turn.assistantMessageId,
    completedAt: turn.completedAt,
    requestedAt: turn.requestedAt,
    sourceProposedPlanJson: turn.sourceProposedPlanJson,
    startedAt: turn.startedAt,
    state: turn.state,
    threadId: turn.threadId,
    turnId: turn.turnId,
    userMessageId: turn.userMessageId,
  }
}

function latestUserMessageAt(messages: Array<typeof projectionThreadMessages.$inferSelect>) {
  return (
    messages
      .filter((message) => message.role === 'user')
      .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))
      .at(-1)?.createdAt ?? null
  )
}

function parseJsonOrUndefined(value: string | null) {
  if (!value) return undefined

  return JSON.parse(value) as unknown
}
