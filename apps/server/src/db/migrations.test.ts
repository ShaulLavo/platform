import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrateOrchestrationDatabase } from './migrations'
import * as schema from './schema'

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

function indexNames(sqlite: Database, tableName: string) {
  return sqlite
    .query<{ name: string }, [string]>('SELECT name FROM pragma_index_list(?) ORDER BY name')
    .all(tableName)
    .map((row) => row.name)
}
