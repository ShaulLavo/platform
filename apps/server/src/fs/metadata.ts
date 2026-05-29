import { and, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { effectiveEntryType, type EntryTypeFilter } from '@workspace/contracts'
import {
  createMetadataDatabase,
  type MetadataDatabaseHandle,
  type PlatformDatabase,
} from '../db/client'
import { migrateMetadataDatabase } from '../db/migrations'
import { fsMetadata, type FsMetadataRow } from '../db/schema'

export type FsMetadataEntry = {
  path: string
  name: string
  type: EntryTypeFilter
  targetType?: EntryTypeFilter
  size: number
  mtimeMs: number
  birthtimeMs: number
}

export type FsMetadataStoreOptions = {
  /** Existing database handle to use. The store will not close handles it does not own. */
  database?: MetadataDatabaseHandle
  /** Path to open a dedicated, store-owned database when no handle is provided. */
  databasePath?: string
}

export class FsMetadataStore {
  readonly databasePath: string
  private readonly db: PlatformDatabase
  private readonly ownedHandle: MetadataDatabaseHandle | null

  constructor(options: FsMetadataStoreOptions = {}) {
    if (options.database) {
      this.ownedHandle = null
      this.db = options.database.db
      this.databasePath = options.database.databasePath
    } else {
      this.ownedHandle = createMetadataDatabase({ databasePath: options.databasePath })
      this.db = this.ownedHandle.db
      this.databasePath = this.ownedHandle.databasePath
    }

    migrateMetadataDatabase(this.db)
  }

  recordPicked(entry: FsMetadataEntry) {
    const now = Date.now()

    this.db
      .insert(fsMetadata)
      .values({
        path: entry.path,
        name: entry.name,
        entryType: effectiveEntryType(entry),
        size: entry.size,
        mtimeMs: entry.mtimeMs,
        birthtimeMs: entry.birthtimeMs,
        lastPickedAt: now,
        pickCount: 1,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: fsMetadata.path,
        set: {
          name: entry.name,
          entryType: effectiveEntryType(entry),
          size: entry.size,
          mtimeMs: entry.mtimeMs,
          birthtimeMs: entry.birthtimeMs,
          lastPickedAt: now,
          pickCount: sql`${fsMetadata.pickCount} + 1`,
          updatedAt: now,
        },
      })
      .run()
  }

  listRecentDirectories(limit: number) {
    return this.db
      .select()
      .from(fsMetadata)
      .where(and(eq(fsMetadata.entryType, 'directory'), isNotNull(fsMetadata.lastPickedAt)))
      .orderBy(desc(fsMetadata.lastPickedAt))
      .limit(limit)
      .all()
  }

  close() {
    this.ownedHandle?.close()
  }
}

export function metadataRowToEntry(row: FsMetadataRow): FsMetadataEntry {
  return {
    path: row.path,
    name: row.name,
    type: row.entryType,
    size: row.size,
    mtimeMs: row.mtimeMs,
    birthtimeMs: row.birthtimeMs,
  }
}
