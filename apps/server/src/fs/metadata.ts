import { and, desc, eq, isNotNull, sql } from "drizzle-orm"
import { closeMetadataDatabase, db, metadataDatabasePath } from "../db/client"
import { migrateMetadataDatabase } from "../db/migrations"
import { fsMetadata, type FsMetadataRow } from "../db/schema"
import type { FsEntryType } from "./stat"

export type FsMetadataEntry = {
  path: string
  name: string
  type: FsEntryType
  size: number
  mtimeMs: number
  birthtimeMs: number
}

export class FsMetadataStore {
  readonly databasePath = metadataDatabasePath

  constructor() {
    migrateMetadataDatabase()
  }

  recordPicked(entry: FsMetadataEntry) {
    const now = Date.now()

    db.insert(fsMetadata)
      .values({
        path: entry.path,
        name: entry.name,
        entryType: entry.type,
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
          entryType: entry.type,
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
    return db
      .select()
      .from(fsMetadata)
      .where(
        and(
          eq(fsMetadata.entryType, "directory"),
          isNotNull(fsMetadata.lastPickedAt)
        )
      )
      .orderBy(desc(fsMetadata.lastPickedAt))
      .limit(limit)
      .all()
  }

  close() {
    closeMetadataDatabase()
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
