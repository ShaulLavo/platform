import { sql } from "drizzle-orm"
import { db } from "./client"

export function migrateMetadataDatabase() {
  db.run(sql`
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
  addBirthtimeColumn()
  db.run(sql`
		CREATE INDEX IF NOT EXISTS fs_metadata_recent_idx
		ON fs_metadata (last_picked_at DESC)
	`)
  db.run(sql`
		CREATE INDEX IF NOT EXISTS fs_metadata_entry_type_idx
		ON fs_metadata (entry_type)
	`)
}

function addBirthtimeColumn() {
  try {
    db.run(sql`
			ALTER TABLE fs_metadata
			ADD COLUMN birthtime_ms INTEGER NOT NULL DEFAULT 0
		`)
  } catch {
    // Existing databases already have this column after the first migration run.
  }
}
