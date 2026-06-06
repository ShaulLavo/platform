import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrateOrchestrationDatabase } from '../migrations'
import * as schema from '../schema'

const expectedOrchestrationTables = [
  'orchestration_events',
  'orchestration_command_receipts',
  'projection_state',
  'projection_projects',
  'projection_threads',
  'projection_thread_messages',
  'projection_thread_activities',
  'projection_thread_sessions',
  'projection_turns',
  'provider_session_runtime',
] as const

describe('orchestration migrations', () => {
  it('creates the Phase 1 orchestration tables in an empty database', () => {
    const sqlite = createMigratedDatabase()

    expect(tableNames(sqlite)).toEqual(expect.arrayContaining([...expectedOrchestrationTables]))
    expect(tableNames(sqlite)).not.toContain('projection_pending_approvals')
    expect(tableNames(sqlite)).not.toContain('projection_thread_proposed_plans')

    sqlite.close()
  })

  it('creates shell summary and runtime columns on projection tables', () => {
    const sqlite = createMigratedDatabase()

    expect(columnNames(sqlite, 'projection_threads')).toEqual(
      expect.arrayContaining([
        'latest_user_message_at',
        'pending_approval_count',
        'pending_user_input_count',
        'has_actionable_proposed_plan',
        'runtime_mode',
        'interaction_mode',
        'model_selection_json',
        'archived_at',
        'deleted_at',
      ]),
    )
    expect(columnNames(sqlite, 'projection_thread_sessions')).toContain('provider_instance_id')
    expect(columnNames(sqlite, 'provider_session_runtime')).toContain('provider_instance_id')
    expect(columnInfo(sqlite, 'provider_session_runtime', 'provider_instance_id')?.not_null).toBe(1)

    sqlite.close()
  })

  it('removes legacy provider runtime rows without provider instance ids', () => {
    const sqlite = new Database(':memory:', { create: true })
    const database = drizzle({ client: sqlite, schema })

    sqlite.exec(`
      CREATE TABLE provider_session_runtime (
        thread_id TEXT PRIMARY KEY NOT NULL,
        provider_driver_kind TEXT NOT NULL,
        provider_instance_id TEXT,
        provider_session_id TEXT,
        adapter_key TEXT NOT NULL,
        runtime_mode TEXT NOT NULL,
        status TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        resume_cursor_json TEXT,
        runtime_payload_json TEXT
      )
    `)
    sqlite.exec(`
      INSERT INTO provider_session_runtime (
        thread_id,
        provider_driver_kind,
        provider_instance_id,
        provider_session_id,
        adapter_key,
        runtime_mode,
        status,
        last_seen_at,
        resume_cursor_json,
        runtime_payload_json
      )
      VALUES (
        'thread-legacy',
        'codex',
        NULL,
        'provider-session:thread-legacy',
        'codex',
        'full-access',
        'running',
        '2026-05-28T00:00:00.000Z',
        NULL,
        NULL
      )
    `)

    migrateOrchestrationDatabase(database)

    expect(providerSessionRuntimeRowCount(sqlite)).toBe(0)
    sqlite.close()
  })

  it('creates lookup indexes for shell snapshots, detail snapshots, and replay', () => {
    const sqlite = createMigratedDatabase()

    expect(indexNames(sqlite, 'orchestration_events')).toEqual(
      expect.arrayContaining([
        'orchestration_events_sequence_idx',
        'orchestration_events_aggregate_sequence_idx',
      ]),
    )
    expect(indexNames(sqlite, 'projection_threads')).toContain(
      'projection_threads_project_deleted_created_idx',
    )
    expect(indexNames(sqlite, 'projection_thread_messages')).toContain(
      'projection_thread_messages_thread_created_idx',
    )
    expect(indexNames(sqlite, 'projection_thread_activities')).toContain(
      'projection_thread_activities_thread_created_idx',
    )
    expect(indexNames(sqlite, 'projection_thread_sessions')).toEqual(
      expect.arrayContaining([
        'projection_thread_sessions_provider_session_idx',
        'projection_thread_sessions_provider_instance_idx',
      ]),
    )

    sqlite.close()
  })
})

function createMigratedDatabase() {
  const sqlite = new Database(':memory:', { create: true })
  const database = drizzle({ client: sqlite, schema })

  migrateOrchestrationDatabase(database)

  return sqlite
}

function tableNames(sqlite: Database) {
  return sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
    .all()
    .map((row) => row.name)
}

function columnNames(sqlite: Database, tableName: string) {
  return sqlite
    .query<{ name: string }, [string]>('SELECT name FROM pragma_table_info(?) ORDER BY cid')
    .all(tableName)
    .map((row) => row.name)
}

function columnInfo(sqlite: Database, tableName: string, columnName: string) {
  return sqlite
    .query<{ not_null: number }, [string, string]>(
      'SELECT "notnull" AS not_null FROM pragma_table_info(?) WHERE name = ?',
    )
    .get(tableName, columnName)
}

function indexNames(sqlite: Database, tableName: string) {
  return sqlite
    .query<{ name: string }, [string]>('SELECT name FROM pragma_index_list(?) ORDER BY name')
    .all(tableName)
    .map((row) => row.name)
}

function providerSessionRuntimeRowCount(sqlite: Database) {
  return (
    sqlite
      .query<{ count: number }, []>('SELECT COUNT(*) AS count FROM provider_session_runtime')
      .get()?.count ?? 0
  )
}
