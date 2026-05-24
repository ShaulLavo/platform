import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const fsMetadata = sqliteTable('fs_metadata', {
  path: text('path').primaryKey(),
  name: text('name').notNull(),
  entryType: text('entry_type', {
    enum: ['file', 'directory', 'symlink', 'other'],
  }).notNull(),
  size: integer('size').notNull(),
  mtimeMs: integer('mtime_ms').notNull(),
  birthtimeMs: integer('birthtime_ms').notNull().default(0),
  lastPickedAt: integer('last_picked_at'),
  pickCount: integer('pick_count').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export type FsMetadataRow = typeof fsMetadata.$inferSelect
export type NewFsMetadataRow = typeof fsMetadata.$inferInsert
