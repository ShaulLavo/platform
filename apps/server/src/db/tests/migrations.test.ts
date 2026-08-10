import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { createMetadataDatabase, type MetadataDatabaseHandle } from '../client'
import {
  migrateOrchestrationDatabase,
  migratePlatformDatabase,
  platformMigrations,
  type Migration,
} from '../migrations'

const expectedTables = [
  'schema_migrations',
  'fs_metadata',
  'orchestration_events',
  'orchestration_command_receipts',
  'projection_state',
  'projection_projects',
  'projection_threads',
  'projection_thread_messages',
  'projection_thread_activities',
  'projection_thread_sessions',
  'projection_thread_proposed_plans',
  'projection_thread_checkpoints',
  'projection_turns',
  'provider_session_runtime',
] as const

/** Every real migration in the ledger, so the assertions below move with it. */
const ledgerVersionNumbers = platformMigrations.map((migration) => migration.version)
const nextVersion = Math.max(...ledgerVersionNumbers) + 1

const openHandles: MetadataDatabaseHandle[] = []
const tempDirs: string[] = []

afterEach(() => {
  for (const handle of openHandles.splice(0)) handle.close()
  for (const dir of tempDirs.splice(0)) rmSync(dir, { force: true, recursive: true })
})

describe('platform migration ledger', () => {
  it('creates every table in a fresh database and records the baseline', () => {
    const handle = openTempDatabase()

    const applied = migratePlatformDatabase(handle.db)

    expect(applied.map((migration) => migration.version)).toEqual(ledgerVersionNumbers)
    expect(tableNames(handle)).toEqual(expect.arrayContaining([...expectedTables]))
    expect(ledgerVersions(handle)).toEqual(ledgerVersionNumbers)
    expect(ledgerRow(handle, 1)?.applied_at).toEqual(expect.any(String))
  })

  it('applies nothing on the second run', () => {
    const handle = openTempDatabase()

    migratePlatformDatabase(handle.db)
    const second = migratePlatformDatabase(handle.db)

    expect(second).toEqual([])
    expect(ledgerVersions(handle)).toEqual(ledgerVersionNumbers)
  })

  it('applies nothing from a second connection to the same file', () => {
    const first = openTempDatabase()
    const second = openTempDatabase(first.databasePath)

    migratePlatformDatabase(first.db)
    const applied = migratePlatformDatabase(second.db)

    expect(applied).toEqual([])
    expect(ledgerVersions(second)).toEqual(ledgerVersionNumbers)
  })

  it('creates the orchestration lookup indexes the snapshot queries rely on', () => {
    const handle = openTempDatabase()

    migrateOrchestrationDatabase(handle.db)

    expect(indexNames(handle, 'orchestration_events')).toEqual(
      expect.arrayContaining([
        'orchestration_events_sequence_idx',
        'orchestration_events_aggregate_sequence_idx',
      ]),
    )
    expect(indexNames(handle, 'projection_threads')).toContain(
      'projection_threads_project_deleted_created_idx',
    )
    expect(indexNames(handle, 'projection_thread_sessions')).toEqual(
      expect.arrayContaining([
        'projection_thread_sessions_provider_session_idx',
        'projection_thread_sessions_provider_instance_idx',
      ]),
    )
    expect(columnInfo(handle, 'provider_session_runtime', 'provider_instance_id')?.not_null).toBe(1)
  })

  it('adds the thread lifecycle columns and their pinned lookup index', () => {
    const handle = openTempDatabase()

    migrateOrchestrationDatabase(handle.db)

    expect(columnNames(handle, 'projection_threads')).toEqual(
      expect.arrayContaining([
        'settled_override',
        'settled_at',
        'snoozed_until',
        'snoozed_at',
        'pinned_at',
        'pin_order_key',
      ]),
    )
    expect(indexNames(handle, 'projection_threads')).toContain(
      'projection_threads_pinned_order_idx',
    )
  })

  it('adds a column to a database already at the 001 baseline', () => {
    const handle = openTempDatabase()
    migratePlatformDatabase(handle.db)

    const applied = migratePlatformDatabase(handle.db, [...platformMigrations, addParkedAt])

    expect(applied.map((migration) => migration.version)).toEqual([nextVersion])
    expect(columnNames(handle, 'projection_threads')).toContain('parked_at')
    expect(ledgerVersions(handle)).toEqual([...ledgerVersionNumbers, nextVersion])
  })

  it('rolls back the DDL and records nothing when a migration throws', () => {
    const handle = openTempDatabase()
    migratePlatformDatabase(handle.db)

    expect(() =>
      migratePlatformDatabase(handle.db, [...platformMigrations, addParkedAtThenThrow]),
    ).toThrow(new RegExp(`migration ${nextVersion}_add_projection_threads_parked_at failed`, 'i'))

    expect(columnNames(handle, 'projection_threads')).not.toContain('parked_at')
    expect(ledgerVersions(handle)).toEqual(ledgerVersionNumbers)
  })

  it('reports the failure as a structured error', () => {
    const handle = openTempDatabase()

    const error = captureError(() =>
      migratePlatformDatabase(handle.db, [...platformMigrations, addParkedAtThenThrow]),
    )

    expect(error).toMatchObject({
      code: 'db.MIGRATION_FAILED',
      name: 'EvlogError',
    })
    expect(error).toHaveProperty('why')
    expect(error).toHaveProperty('fix')
  })
})

const addParkedAt: Migration = {
  name: 'add_projection_threads_parked_at',
  up: (database) => {
    database.run(sql`ALTER TABLE projection_threads ADD COLUMN parked_at TEXT`)
  },
  version: nextVersion,
}

const addParkedAtThenThrow: Migration = {
  name: 'add_projection_threads_parked_at',
  up: (database) => {
    database.run(sql`ALTER TABLE projection_threads ADD COLUMN parked_at TEXT`)
    throw new Error('migration exploded after its DDL')
  },
  version: nextVersion,
}

function openTempDatabase(databasePath?: string) {
  const handle = createMetadataDatabase({ databasePath: databasePath ?? tempDatabasePath() })
  openHandles.push(handle)

  return handle
}

function tempDatabasePath() {
  const directory = mkdtempSync(path.join(tmpdir(), 'platform-migrations-'))
  tempDirs.push(directory)

  return path.join(directory, 'platform.sqlite')
}

function captureError(run: () => unknown) {
  try {
    run()
  } catch (error) {
    return error
  }

  return expect.unreachable('expected the migration run to throw')
}

function tableNames(handle: MetadataDatabaseHandle) {
  return rows<{ name: string }>(
    handle,
    sql`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
  ).map((row) => row.name)
}

function columnNames(handle: MetadataDatabaseHandle, tableName: string) {
  return rows<{ name: string }>(
    handle,
    sql`SELECT name FROM pragma_table_info(${tableName}) ORDER BY cid`,
  ).map((row) => row.name)
}

function columnInfo(handle: MetadataDatabaseHandle, tableName: string, columnName: string) {
  return rows<{ not_null: number }>(
    handle,
    sql`SELECT "notnull" AS not_null FROM pragma_table_info(${tableName}) WHERE name = ${columnName}`,
  ).at(0)
}

function indexNames(handle: MetadataDatabaseHandle, tableName: string) {
  return rows<{ name: string }>(
    handle,
    sql`SELECT name FROM pragma_index_list(${tableName}) ORDER BY name`,
  ).map((row) => row.name)
}

function ledgerVersions(handle: MetadataDatabaseHandle) {
  return rows<{ version: number }>(
    handle,
    sql`SELECT version FROM schema_migrations ORDER BY version`,
  ).map((row) => row.version)
}

function ledgerRow(handle: MetadataDatabaseHandle, version: number) {
  return rows<{ applied_at: string; name: string }>(
    handle,
    sql`SELECT name, applied_at FROM schema_migrations WHERE version = ${version}`,
  ).at(0)
}

function rows<T>(handle: MetadataDatabaseHandle, query: ReturnType<typeof sql>) {
  return handle.db.all<T>(query)
}
