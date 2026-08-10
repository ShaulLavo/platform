import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * The migration ledger. One row per applied migration, written in the same
 * transaction as that migration's DDL, so a crash can never record a version
 * whose statements did not commit.
 */
export const schemaMigrations = sqliteTable('schema_migrations', {
  version: integer('version').primaryKey(),
  name: text('name').notNull(),
  appliedAt: text('applied_at').notNull(),
})

export const fsMetadata = sqliteTable('fs_metadata', {
  path: text('path').primaryKey(),
  name: text('name').notNull(),
  entryType: text('entry_type', {
    enum: ['file', 'directory', 'symlink', 'other'],
  }).notNull(),
  size: integer('size').notNull(),
  mtimeMs: integer('mtime_ms').notNull(),
  birthtimeMs: integer('birthtime_ms').notNull().default(0),
  lastPickedAt: integer('last_picked_at'),
  pickCount: integer('pick_count').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export type FsMetadataRow = typeof fsMetadata.$inferSelect

export const orchestrationEvents = sqliteTable(
  'orchestration_events',
  {
    sequence: integer('sequence').primaryKey({ autoIncrement: true }),
    eventId: text('event_id').notNull().unique(),
    aggregateKind: text('aggregate_kind', { enum: ['project', 'thread'] }).notNull(),
    aggregateId: text('aggregate_id').notNull(),
    streamVersion: integer('stream_version').notNull(),
    eventType: text('event_type').notNull(),
    occurredAt: text('occurred_at').notNull(),
    commandId: text('command_id'),
    causationEventId: text('causation_event_id'),
    correlationId: text('correlation_id'),
    actorKind: text('actor_kind', { enum: ['client', 'server', 'provider'] }).notNull(),
    payloadJson: text('payload_json').notNull(),
    metadataJson: text('metadata_json').notNull(),
  },
  (table) => [
    uniqueIndex('orchestration_events_stream_version_idx').on(
      table.aggregateKind,
      table.aggregateId,
      table.streamVersion,
    ),
    index('orchestration_events_sequence_idx').on(table.sequence),
    index('orchestration_events_aggregate_sequence_idx').on(
      table.aggregateKind,
      table.aggregateId,
      table.sequence,
    ),
    index('orchestration_events_command_id_idx').on(table.commandId),
    index('orchestration_events_correlation_id_idx').on(table.correlationId),
  ],
)

export const orchestrationCommandReceipts = sqliteTable(
  'orchestration_command_receipts',
  {
    commandId: text('command_id').primaryKey(),
    commandType: text('command_type').notNull(),
    aggregateKind: text('aggregate_kind', { enum: ['project', 'thread'] }).notNull(),
    aggregateId: text('aggregate_id').notNull(),
    acceptedAt: text('accepted_at').notNull(),
    resultSequence: integer('result_sequence'),
    status: text('status', { enum: ['accepted', 'rejected'] }).notNull(),
    commandJson: text('command_json').notNull(),
    resultJson: text('result_json'),
    error: text('error'),
  },
  (table) => [
    index('orchestration_command_receipts_aggregate_idx').on(
      table.aggregateKind,
      table.aggregateId,
    ),
    index('orchestration_command_receipts_sequence_idx').on(table.resultSequence),
  ],
)

export const projectionState = sqliteTable('projection_state', {
  projector: text('projector').primaryKey(),
  lastAppliedSequence: integer('last_applied_sequence').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const projectionProjects = sqliteTable(
  'projection_projects',
  {
    projectId: text('project_id').primaryKey(),
    title: text('title').notNull(),
    workspaceRoot: text('workspace_root').notNull(),
    defaultModelSelectionJson: text('default_model_selection_json'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
    /** Fractional index; the project list sorts on plain string comparison. */
    orderKey: text('order_key'),
  },
  (table) => [index('projection_projects_updated_at_idx').on(table.updatedAt)],
)

export const projectionThreads = sqliteTable(
  'projection_threads',
  {
    threadId: text('thread_id').primaryKey(),
    projectId: text('project_id').notNull(),
    title: text('title').notNull(),
    runtimeMode: text('runtime_mode', {
      enum: ['full-access', 'approval-required', 'auto-accept-edits'],
    }).notNull(),
    interactionMode: text('interaction_mode', { enum: ['default', 'plan'] }).notNull(),
    modelSelectionJson: text('model_selection_json').notNull(),
    branch: text('branch'),
    worktreePath: text('worktree_path'),
    latestTurnId: text('latest_turn_id'),
    latestTurnJson: text('latest_turn_json'),
    latestUserMessageAt: text('latest_user_message_at'),
    pendingApprovalCount: integer('pending_approval_count').notNull().default(0),
    pendingUserInputCount: integer('pending_user_input_count').notNull().default(0),
    hasActionableProposedPlan: integer('has_actionable_proposed_plan', {
      mode: 'boolean',
    })
      .notNull()
      .default(false),
    /**
     * The plan kernel the shell delta serves, projected so a rail row never pays
     * an activity scan to say which step is running. Null is "nothing to
     * narrate".
     */
    planProgressJson: text('plan_progress_json'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    archivedAt: text('archived_at'),
    deletedAt: text('deleted_at'),
    /** null = classify on activity alone; the two values are explicit user intent. */
    settledOverride: text('settled_override', { enum: ['settled', 'active'] }),
    settledAt: text('settled_at'),
    snoozedUntil: text('snoozed_until'),
    snoozedAt: text('snoozed_at'),
    pinnedAt: text('pinned_at'),
    /** Fractional index; the pinned block sorts on plain string comparison. */
    pinOrderKey: text('pin_order_key'),
  },
  (table) => [
    index('projection_threads_project_deleted_created_idx').on(
      table.projectId,
      table.deletedAt,
      table.createdAt,
    ),
    // The thread list reads the pinned block first and orders it by key, so the
    // pinned rows are found without scanning every thread of the project.
    index('projection_threads_pinned_order_idx').on(table.pinnedAt, table.pinOrderKey),
  ],
)

export const projectionThreadMessages = sqliteTable(
  'projection_thread_messages',
  {
    messageId: text('message_id').primaryKey(),
    threadId: text('thread_id').notNull(),
    turnId: text('turn_id'),
    role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
    text: text('text').notNull(),
    attachmentsJson: text('attachments_json').notNull().default('[]'),
    streaming: integer('streaming', { mode: 'boolean' }).notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('projection_thread_messages_thread_created_idx').on(table.threadId, table.createdAt),
  ],
)

export const projectionThreadActivities = sqliteTable(
  'projection_thread_activities',
  {
    activityId: text('activity_id').primaryKey(),
    threadId: text('thread_id').notNull(),
    turnId: text('turn_id'),
    tone: text('tone', { enum: ['info', 'tool', 'thinking', 'approval', 'error'] }).notNull(),
    kind: text('kind').notNull(),
    summary: text('summary').notNull(),
    payloadJson: text('payload_json').notNull(),
    sequence: integer('sequence'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('projection_thread_activities_thread_created_idx').on(table.threadId, table.createdAt),
  ],
)

export const projectionThreadSessions = sqliteTable(
  'projection_thread_sessions',
  {
    threadId: text('thread_id').primaryKey(),
    status: text('status', {
      enum: ['idle', 'starting', 'running', 'ready', 'interrupted', 'stopped', 'error'],
    }).notNull(),
    providerName: text('provider_name'),
    providerInstanceId: text('provider_instance_id').notNull(),
    providerSessionId: text('provider_session_id'),
    providerThreadId: text('provider_thread_id'),
    runtimeMode: text('runtime_mode', {
      enum: ['full-access', 'approval-required', 'auto-accept-edits'],
    }).notNull(),
    activeTurnId: text('active_turn_id'),
    lastError: text('last_error'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('projection_thread_sessions_provider_session_idx').on(table.providerSessionId),
    index('projection_thread_sessions_provider_instance_idx').on(table.providerInstanceId),
  ],
)

export const projectionTurns = sqliteTable(
  'projection_turns',
  {
    rowId: integer('row_id').primaryKey({ autoIncrement: true }),
    threadId: text('thread_id').notNull(),
    turnId: text('turn_id').notNull(),
    userMessageId: text('user_message_id'),
    assistantMessageId: text('assistant_message_id'),
    state: text('state', {
      enum: ['running', 'completed', 'interrupted', 'error'],
    }).notNull(),
    sourceProposedPlanJson: text('source_proposed_plan_json'),
    requestedAt: text('requested_at').notNull(),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
  },
  (table) => [
    uniqueIndex('projection_turns_thread_turn_idx').on(table.threadId, table.turnId),
    index('projection_turns_thread_requested_idx').on(table.threadId, table.requestedAt),
  ],
)

export const projectionThreadProposedPlans = sqliteTable(
  'projection_thread_proposed_plans',
  {
    planId: text('plan_id').primaryKey(),
    threadId: text('thread_id').notNull(),
    turnId: text('turn_id'),
    planMarkdown: text('plan_markdown').notNull(),
    implementedAt: text('implemented_at'),
    implementationThreadId: text('implementation_thread_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('projection_thread_proposed_plans_thread_created_idx').on(
      table.threadId,
      table.createdAt,
    ),
    index('projection_thread_proposed_plans_thread_updated_idx').on(
      table.threadId,
      table.updatedAt,
    ),
  ],
)

export const projectionThreadCheckpoints = sqliteTable(
  'projection_thread_checkpoints',
  {
    threadId: text('thread_id').notNull(),
    turnId: text('turn_id').notNull(),
    checkpointTurnCount: integer('checkpoint_turn_count').notNull(),
    checkpointRef: text('checkpoint_ref').notNull(),
    status: text('status', { enum: ['ready', 'missing', 'error'] }).notNull(),
    filesJson: text('files_json').notNull(),
    assistantMessageId: text('assistant_message_id'),
    completedAt: text('completed_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.threadId, table.turnId] }),
    index('projection_thread_checkpoints_thread_turn_count_idx').on(
      table.threadId,
      table.checkpointTurnCount,
    ),
  ],
)

export const providerSessionRuntime = sqliteTable(
  'provider_session_runtime',
  {
    threadId: text('thread_id').primaryKey(),
    providerDriverKind: text('provider_driver_kind').notNull(),
    providerInstanceId: text('provider_instance_id').notNull(),
    providerSessionId: text('provider_session_id'),
    adapterKey: text('adapter_key').notNull(),
    runtimeMode: text('runtime_mode', {
      enum: ['full-access', 'approval-required', 'auto-accept-edits'],
    }).notNull(),
    status: text('status', {
      enum: ['starting', 'ready', 'running', 'waiting', 'stopped', 'error'],
    }).notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    resumeCursorJson: text('resume_cursor_json'),
    runtimePayloadJson: text('runtime_payload_json'),
  },
  (table) => [
    index('provider_session_runtime_status_idx').on(table.status),
    index('provider_session_runtime_provider_instance_idx').on(table.providerInstanceId),
    index('provider_session_runtime_provider_session_idx').on(table.providerSessionId),
  ],
)

export const appSettings = sqliteTable('app_settings', {
  section: text('section').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export type OrchestrationEventRow = typeof orchestrationEvents.$inferSelect
export type OrchestrationCommandReceiptRow = typeof orchestrationCommandReceipts.$inferSelect
export type ProjectionProjectRow = typeof projectionProjects.$inferSelect
export type ProjectionThreadRow = typeof projectionThreads.$inferSelect
export type OrchestrationThreadMessageRow = typeof projectionThreadMessages.$inferSelect
export type OrchestrationThreadActivityRow = typeof projectionThreadActivities.$inferSelect
export type ProjectionThreadSessionRow = typeof projectionThreadSessions.$inferSelect
export type ProjectionThreadProposedPlanRow = typeof projectionThreadProposedPlans.$inferSelect
export type ProjectionThreadCheckpointRow = typeof projectionThreadCheckpoints.$inferSelect
export type ProviderSessionRuntimeRow = typeof providerSessionRuntime.$inferSelect
