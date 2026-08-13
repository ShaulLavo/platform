import { eq, sql } from 'drizzle-orm'
import { elapsedMs } from '../observability/logging'
import { recordProcessInfo } from '../observability/runtime'
import { createStructuredError } from '../observability/structured-errors'
import { getDefaultPlatformDatabase, type PlatformDatabase } from './client'
import { schemaMigrations } from './schema'

export type Migration = {
  readonly version: number
  readonly name: string
  readonly up: (database: PlatformDatabase) => void
}

/**
 * The ordered, forward-only ledger for the platform database. Append new
 * versions here; never edit or renumber an existing one — a developer database
 * that already recorded it will not run it again.
 *
 * Version 1 is the baseline: it is the whole schema as it stood before the
 * ledger existed, written entirely with `IF NOT EXISTS`. That is what makes it
 * safe against developer databases created by the old ad-hoc migrate function —
 * against those it does nothing and only records the baseline row, which is
 * exactly the reconciliation later versions need to start from.
 */
export const platformMigrations: readonly Migration[] = [
  { version: 1, name: 'platform_baseline', up: applyPlatformBaseline },
  {
    version: 2,
    name: 'thread_proposed_plan_and_checkpoint_projections',
    up: applyThreadProposedPlanAndCheckpointProjections,
  },
  { version: 3, name: 'app_settings', up: applyAppSettings },
  { version: 4, name: 'thread_lifecycle_columns', up: applyThreadLifecycleColumns },
  { version: 5, name: 'project_order_key', up: applyProjectOrderKey },
  { version: 6, name: 'thread_plan_progress', up: applyThreadPlanProgress },
  { version: 7, name: 'project_scripts', up: applyProjectScripts },
  { version: 8, name: 'drop_app_settings', up: applyDropAppSettings },
]

/**
 * Applies every migration the database has not recorded yet, in version order.
 *
 * Each migration runs in its own `IMMEDIATE` transaction together with its
 * ledger row, so the write lock is held for the whole step: two processes
 * starting at once cannot both apply the same version, and a crash mid-step
 * leaves neither the DDL nor the ledger row behind.
 */
export function migratePlatformDatabase(
  database: PlatformDatabase = getDefaultPlatformDatabase(),
  migrations: readonly Migration[] = platformMigrations,
): readonly Migration[] {
  const startedAt = performance.now()
  createLedger(database)

  const recorded = recordedVersions(database)
  const applied: Migration[] = []

  for (const migration of migrations) {
    if (recorded.has(migration.version)) continue
    if (!applyMigration(database, migration)) continue
    applied.push(migration)
  }

  reportApplied(applied, startedAt)

  return applied
}

/**
 * Feature entry points. The platform runs on a single SQLite file, so both of
 * these run the same ledger over the same tables.
 */
export function migrateMetadataDatabase(database: PlatformDatabase = getDefaultPlatformDatabase()) {
  return migratePlatformDatabase(database)
}

export function migrateOrchestrationDatabase(
  database: PlatformDatabase = getDefaultPlatformDatabase(),
) {
  return migratePlatformDatabase(database)
}

function applyMigration(database: PlatformDatabase, migration: Migration) {
  try {
    return database.transaction(
      (transaction) => {
        // The transaction handle exposes the same query API as the database; the
        // cast lets migrations be written as plain database code (same pattern as
        // `OrchestrationEngine.commitCommand`).
        const scoped = transaction as unknown as PlatformDatabase
        // Re-checked under the write lock: a peer process may have applied this
        // version between our ledger read and this transaction.
        if (isRecorded(scoped, migration.version)) return false

        migration.up(scoped)
        recordApplied(scoped, migration)

        return true
      },
      { behavior: 'immediate' },
    )
  } catch (cause) {
    throw createStructuredError({
      cause,
      code: 'db.MIGRATION_FAILED',
      fix: 'Fix the migration statements, then restart the server. The database is unchanged — the failed version rolled back and was not recorded.',
      internal: { migrationName: migration.name, migrationVersion: migration.version },
      message: `Database migration ${migration.version}_${migration.name} failed`,
      status: 500,
      why: 'A migration threw while applying its statements, so its transaction rolled back.',
    })
  }
}

function createLedger(database: PlatformDatabase) {
  database.run(sql`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY NOT NULL,
			name TEXT NOT NULL,
			applied_at TEXT NOT NULL
		)
	`)
}

function recordedVersions(database: PlatformDatabase) {
  const rows = database.select({ version: schemaMigrations.version }).from(schemaMigrations).all()

  return new Set(rows.map((row) => row.version))
}

function isRecorded(database: PlatformDatabase, version: number) {
  const row = database
    .select({ version: schemaMigrations.version })
    .from(schemaMigrations)
    .where(eq(schemaMigrations.version, version))
    .get()

  return row !== undefined
}

function recordApplied(database: PlatformDatabase, migration: Migration) {
  database
    .insert(schemaMigrations)
    .values({
      appliedAt: new Date().toISOString(),
      name: migration.name,
      version: migration.version,
    })
    .run()
}

/**
 * One wide event for the whole run, not one per migration. A startup that
 * applied nothing is the normal case and stays silent.
 */
function reportApplied(applied: readonly Migration[], startedAt: number) {
  if (applied.length === 0) return

  recordProcessInfo('db.migrations.applied', {
    area: 'db',
    migrations: {
      appliedCount: applied.length,
      durationMs: elapsedMs(startedAt),
      latestVersion: applied.at(-1)?.version,
      names: applied.map((migration) => migration.name),
      versions: applied.map((migration) => migration.version),
    },
    operation: 'migrate',
  })
}

function applyPlatformBaseline(database: PlatformDatabase) {
  createFileMetadataTables(database)
  createOrchestrationEventTables(database)
  createProjectionTables(database)
  createProviderRuntimeTables(database)
}

function createFileMetadataTables(database: PlatformDatabase) {
  database.run(sql`
		CREATE TABLE IF NOT EXISTS fs_metadata (
			path TEXT PRIMARY KEY NOT NULL,
			name TEXT NOT NULL,
			entry_type TEXT NOT NULL,
			size INTEGER NOT NULL,
			mtime_ms INTEGER NOT NULL,
			birthtime_ms INTEGER NOT NULL DEFAULT 0,
			last_picked_at INTEGER,
			pick_count INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		)
	`)
  database.run(sql`
		CREATE INDEX IF NOT EXISTS fs_metadata_recent_idx
		ON fs_metadata (last_picked_at DESC)
	`)
  database.run(sql`
		CREATE INDEX IF NOT EXISTS fs_metadata_entry_type_idx
		ON fs_metadata (entry_type)
	`)
}

function createOrchestrationEventTables(database: PlatformDatabase) {
  database.run(sql`
		CREATE TABLE IF NOT EXISTS orchestration_events (
			sequence INTEGER PRIMARY KEY AUTOINCREMENT,
			event_id TEXT NOT NULL UNIQUE,
			aggregate_kind TEXT NOT NULL,
			aggregate_id TEXT NOT NULL,
			stream_version INTEGER NOT NULL,
			event_type TEXT NOT NULL,
			occurred_at TEXT NOT NULL,
			command_id TEXT,
			causation_event_id TEXT,
			correlation_id TEXT,
			actor_kind TEXT NOT NULL,
			payload_json TEXT NOT NULL,
			metadata_json TEXT NOT NULL
		)
	`)
  database.run(sql`
		CREATE UNIQUE INDEX IF NOT EXISTS orchestration_events_stream_version_idx
		ON orchestration_events (aggregate_kind, aggregate_id, stream_version)
	`)
  database.run(sql`
		CREATE INDEX IF NOT EXISTS orchestration_events_sequence_idx
		ON orchestration_events (sequence)
	`)
  database.run(sql`
		CREATE INDEX IF NOT EXISTS orchestration_events_aggregate_sequence_idx
		ON orchestration_events (aggregate_kind, aggregate_id, sequence)
	`)
  database.run(sql`
		CREATE INDEX IF NOT EXISTS orchestration_events_command_id_idx
		ON orchestration_events (command_id)
	`)
  database.run(sql`
		CREATE INDEX IF NOT EXISTS orchestration_events_correlation_id_idx
		ON orchestration_events (correlation_id)
	`)

  database.run(sql`
		CREATE TABLE IF NOT EXISTS orchestration_command_receipts (
			command_id TEXT PRIMARY KEY NOT NULL,
			command_type TEXT NOT NULL,
			aggregate_kind TEXT NOT NULL,
			aggregate_id TEXT NOT NULL,
			accepted_at TEXT NOT NULL,
			result_sequence INTEGER,
			status TEXT NOT NULL,
			command_json TEXT NOT NULL,
			result_json TEXT,
			error TEXT
		)
	`)
  database.run(sql`
		CREATE INDEX IF NOT EXISTS orchestration_command_receipts_aggregate_idx
		ON orchestration_command_receipts (aggregate_kind, aggregate_id)
	`)
  database.run(sql`
		CREATE INDEX IF NOT EXISTS orchestration_command_receipts_sequence_idx
		ON orchestration_command_receipts (result_sequence)
	`)
}

function createProjectionTables(database: PlatformDatabase) {
  database.run(sql`
		CREATE TABLE IF NOT EXISTS projection_state (
			projector TEXT PRIMARY KEY NOT NULL,
			last_applied_sequence INTEGER NOT NULL,
			updated_at TEXT NOT NULL
		)
	`)

  database.run(sql`
		CREATE TABLE IF NOT EXISTS projection_projects (
			project_id TEXT PRIMARY KEY NOT NULL,
			title TEXT NOT NULL,
			workspace_root TEXT NOT NULL,
			default_model_selection_json TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			deleted_at TEXT
		)
	`)
  database.run(sql`
		CREATE INDEX IF NOT EXISTS projection_projects_updated_at_idx
		ON projection_projects (updated_at)
	`)

  database.run(sql`
		CREATE TABLE IF NOT EXISTS projection_threads (
			thread_id TEXT PRIMARY KEY NOT NULL,
			project_id TEXT NOT NULL,
			title TEXT NOT NULL,
			runtime_mode TEXT NOT NULL,
			interaction_mode TEXT NOT NULL,
			model_selection_json TEXT NOT NULL,
			branch TEXT,
			worktree_path TEXT,
			latest_turn_id TEXT,
			latest_turn_json TEXT,
			latest_user_message_at TEXT,
			pending_approval_count INTEGER NOT NULL DEFAULT 0,
			pending_user_input_count INTEGER NOT NULL DEFAULT 0,
			has_actionable_proposed_plan INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			archived_at TEXT,
			deleted_at TEXT
		)
	`)
  database.run(sql`
		CREATE INDEX IF NOT EXISTS projection_threads_project_deleted_created_idx
		ON projection_threads (project_id, deleted_at, created_at)
	`)

  database.run(sql`
		CREATE TABLE IF NOT EXISTS projection_thread_messages (
			message_id TEXT PRIMARY KEY NOT NULL,
			thread_id TEXT NOT NULL,
			turn_id TEXT,
			role TEXT NOT NULL,
			text TEXT NOT NULL,
			attachments_json TEXT NOT NULL DEFAULT '[]',
			streaming INTEGER NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)
	`)
  database.run(sql`
		CREATE INDEX IF NOT EXISTS projection_thread_messages_thread_created_idx
		ON projection_thread_messages (thread_id, created_at)
	`)

  database.run(sql`
		CREATE TABLE IF NOT EXISTS projection_thread_activities (
			activity_id TEXT PRIMARY KEY NOT NULL,
			thread_id TEXT NOT NULL,
			turn_id TEXT,
			tone TEXT NOT NULL,
			kind TEXT NOT NULL,
			summary TEXT NOT NULL,
			payload_json TEXT NOT NULL,
			sequence INTEGER,
			created_at TEXT NOT NULL
		)
	`)
  database.run(sql`
		CREATE INDEX IF NOT EXISTS projection_thread_activities_thread_created_idx
		ON projection_thread_activities (thread_id, created_at)
	`)

  database.run(sql`
		CREATE TABLE IF NOT EXISTS projection_thread_sessions (
			thread_id TEXT PRIMARY KEY NOT NULL,
			status TEXT NOT NULL,
			provider_name TEXT,
			provider_instance_id TEXT NOT NULL,
			provider_session_id TEXT,
			provider_thread_id TEXT,
			runtime_mode TEXT NOT NULL,
			active_turn_id TEXT,
			last_error TEXT,
			updated_at TEXT NOT NULL
		)
	`)
  database.run(sql`
		CREATE INDEX IF NOT EXISTS projection_thread_sessions_provider_session_idx
		ON projection_thread_sessions (provider_session_id)
	`)
  database.run(sql`
		CREATE INDEX IF NOT EXISTS projection_thread_sessions_provider_instance_idx
		ON projection_thread_sessions (provider_instance_id)
	`)

  database.run(sql`
		CREATE TABLE IF NOT EXISTS projection_turns (
			row_id INTEGER PRIMARY KEY AUTOINCREMENT,
			thread_id TEXT NOT NULL,
			turn_id TEXT NOT NULL,
			user_message_id TEXT,
			assistant_message_id TEXT,
			state TEXT NOT NULL,
			source_proposed_plan_json TEXT,
			requested_at TEXT NOT NULL,
			started_at TEXT,
			completed_at TEXT,
			UNIQUE (thread_id, turn_id)
		)
	`)
  database.run(sql`
		CREATE INDEX IF NOT EXISTS projection_turns_thread_requested_idx
		ON projection_turns (thread_id, requested_at)
	`)
}

/**
 * Plan markdown and checkpoint summaries used to exist only inside the event
 * log: the plan payload was thrown away at projection time, and every reader
 * that wanted checkpoints re-folded the whole thread stream. These two tables
 * are what makes both survive a reload without a scan.
 */
function applyThreadProposedPlanAndCheckpointProjections(database: PlatformDatabase) {
  database.run(sql`
		CREATE TABLE projection_thread_proposed_plans (
			plan_id TEXT PRIMARY KEY NOT NULL,
			thread_id TEXT NOT NULL,
			turn_id TEXT,
			plan_markdown TEXT NOT NULL,
			implemented_at TEXT,
			implementation_thread_id TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)
	`)
  database.run(sql`
		CREATE INDEX projection_thread_proposed_plans_thread_created_idx
		ON projection_thread_proposed_plans (thread_id, created_at)
	`)
  database.run(sql`
		CREATE INDEX projection_thread_proposed_plans_thread_updated_idx
		ON projection_thread_proposed_plans (thread_id, updated_at)
	`)

  database.run(sql`
		CREATE TABLE projection_thread_checkpoints (
			thread_id TEXT NOT NULL,
			turn_id TEXT NOT NULL,
			checkpoint_turn_count INTEGER NOT NULL,
			checkpoint_ref TEXT NOT NULL,
			status TEXT NOT NULL,
			files_json TEXT NOT NULL,
			assistant_message_id TEXT,
			completed_at TEXT NOT NULL,
			PRIMARY KEY (thread_id, turn_id)
		)
	`)
  database.run(sql`
		CREATE INDEX projection_thread_checkpoints_thread_turn_count_idx
		ON projection_thread_checkpoints (thread_id, checkpoint_turn_count)
	`)
}

/**
 * Durable user settings. One row per top-level section rather than a single
 * settings blob: a write only touches the sections it changes, and a section
 * the user never touched simply has no row, so its default comes from the
 * contract instead of a stale copy frozen at install time.
 */
function applyAppSettings(database: PlatformDatabase) {
  database.run(sql`
		CREATE TABLE app_settings (
			section TEXT PRIMARY KEY NOT NULL,
			value_json TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)
	`)
}

/**
 * The settle / snooze / pin lifecycle. Every column is nullable with no
 * default: "the user has said nothing about this thread" is the ground state,
 * and it has to be distinguishable from "the user explicitly kept it active".
 */
function applyThreadLifecycleColumns(database: PlatformDatabase) {
  database.run(sql`ALTER TABLE projection_threads ADD COLUMN settled_override TEXT`)
  database.run(sql`ALTER TABLE projection_threads ADD COLUMN settled_at TEXT`)
  database.run(sql`ALTER TABLE projection_threads ADD COLUMN snoozed_until TEXT`)
  database.run(sql`ALTER TABLE projection_threads ADD COLUMN snoozed_at TEXT`)
  database.run(sql`ALTER TABLE projection_threads ADD COLUMN pinned_at TEXT`)
  database.run(sql`ALTER TABLE projection_threads ADD COLUMN pin_order_key TEXT`)
  database.run(sql`
		CREATE INDEX projection_threads_pinned_order_idx
		ON projection_threads (pinned_at, pin_order_key)
	`)
}

/**
 * The user's own project order. Nullable with no default: "never dragged" has
 * to stay distinguishable from a placed key, because an unplaced project sorts
 * after the arranged run rather than into the middle of it.
 */
function applyProjectOrderKey(database: PlatformDatabase) {
  database.run(sql`ALTER TABLE projection_projects ADD COLUMN order_key TEXT`)
}

/**
 * Which plan step a thread is on, as a projected column rather than a scan: the
 * shell delta reader serves one row per event, and folding a thread's activity
 * history there is what the row reader exists to avoid. Nullable with no
 * default — a thread that has never planned carries nothing, which is exactly
 * what the fold yields for it.
 */
function applyThreadPlanProgress(database: PlatformDatabase) {
  database.run(sql`ALTER TABLE projection_threads ADD COLUMN plan_progress_json TEXT`)
}

function applyProjectScripts(database: PlatformDatabase) {
  database.run(sql`ALTER TABLE projection_projects ADD COLUMN scripts_json TEXT`)
}

function createProviderRuntimeTables(database: PlatformDatabase) {
  database.run(sql`
		CREATE TABLE IF NOT EXISTS provider_session_runtime (
			thread_id TEXT PRIMARY KEY NOT NULL,
			provider_driver_kind TEXT NOT NULL,
			provider_instance_id TEXT NOT NULL,
			provider_session_id TEXT,
			adapter_key TEXT NOT NULL,
			runtime_mode TEXT NOT NULL,
			status TEXT NOT NULL,
			last_seen_at TEXT NOT NULL,
			resume_cursor_json TEXT,
			runtime_payload_json TEXT
		)
	`)
  database.run(sql`
		CREATE INDEX IF NOT EXISTS provider_session_runtime_status_idx
		ON provider_session_runtime (status)
	`)
  database.run(sql`
		CREATE INDEX IF NOT EXISTS provider_session_runtime_provider_instance_idx
		ON provider_session_runtime (provider_instance_id)
	`)
  database.run(sql`
		CREATE INDEX IF NOT EXISTS provider_session_runtime_provider_session_idx
		ON provider_session_runtime (provider_session_id)
	`)
}

/**
 * Settings moved out of SQLite and into `~/.platform/settings.json`.
 *
 * No data is carried across. This project is greenfield with no external users,
 * and the row this drops held provider config, model preferences and keybinding
 * overrides — all of which a developer re-enters in seconds. Writing migration
 * code to move three rows would outlive the reason it existed.
 *
 * Version 3 stays in the ledger as history; a database that already recorded it
 * never re-runs it, which is why migrations are only ever appended.
 */
function applyDropAppSettings(database: PlatformDatabase) {
  database.run(sql`DROP TABLE IF EXISTS app_settings`)
}
