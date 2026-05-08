import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'

export const metadataDatabasePath =
	Bun.env.FS_METADATA_DB ??
	path.join(homedir(), '.platform-file-picker', 'fs-metadata.sqlite')

ensureDatabaseDirectory(metadataDatabasePath)

const sqlite = new Database(metadataDatabasePath, { create: true })
sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;')

export const db = drizzle({ client: sqlite, schema })

export function closeMetadataDatabase() {
	sqlite.close()
}

function ensureDatabaseDirectory(databasePath: string) {
	if (databasePath === ':memory:') return

	mkdirSync(path.dirname(databasePath), { recursive: true })
}
