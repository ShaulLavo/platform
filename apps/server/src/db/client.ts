import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'

const defaultMetadataDatabasePath =
  Bun.env.FS_METADATA_DB ?? path.join(homedir(), '.platform-file-picker', 'fs-metadata.sqlite')

export type PlatformDatabase = ReturnType<typeof openPlatformDatabase>['db']

export type MetadataDatabaseHandle = {
  db: PlatformDatabase
  databasePath: string
  close: () => void
}

export function createMetadataDatabase(
  options: { databasePath?: string } = {},
): MetadataDatabaseHandle {
  return openPlatformDatabase(options.databasePath ?? defaultMetadataDatabasePath)
}

let defaultHandle: MetadataDatabaseHandle | null = null

/**
 * Lazily-opened process-wide database used as a fallback when no handle is
 * injected. Opening is deferred until first use so importing this module has
 * no side effects.
 */
export function getDefaultPlatformDatabase(): PlatformDatabase {
  defaultHandle ??= createMetadataDatabase()
  return defaultHandle.db
}

function openPlatformDatabase(databasePath: string) {
  ensureDatabaseDirectory(databasePath)

  const sqlite = new Database(databasePath, { create: true })
  // `busy_timeout` is what makes concurrent startup safe: two processes opening
  // the same file both run the migration ledger, and the loser of the
  // `BEGIN IMMEDIATE` race waits for the write lock instead of failing busy.
  sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')

  return {
    db: drizzle({ client: sqlite, schema }),
    databasePath,
    close: () => sqlite.close(),
  }
}

function ensureDatabaseDirectory(databasePath: string) {
  if (databasePath === ':memory:') return

  mkdirSync(path.dirname(databasePath), { recursive: true })
}
