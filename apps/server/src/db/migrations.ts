import { sql } from 'drizzle-orm'
import { db } from './client'

export function migrateMetadataDatabase(database: typeof db = db) {
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
  addBirthtimeColumn(database)
  database.run(sql`
		CREATE INDEX IF NOT EXISTS fs_metadata_recent_idx
		ON fs_metadata (last_picked_at DESC)
	`)
  database.run(sql`
		CREATE INDEX IF NOT EXISTS fs_metadata_entry_type_idx
		ON fs_metadata (entry_type)
	`)
}

export function migrateOrchestrationDatabase(database: typeof db = db) {
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

export function migratePlatformDatabase(database: typeof db = db) {
  migrateMetadataDatabase(database)
  migrateOrchestrationDatabase(database)
}

function addBirthtimeColumn(database: typeof db) {
  try {
    database.run(sql`
			ALTER TABLE fs_metadata
			ADD COLUMN birthtime_ms INTEGER NOT NULL DEFAULT 0
		`)
  } catch {
    // Existing databases already have this column after the first migration run.
  }
}
