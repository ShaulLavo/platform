/**
 * Filter + discriminator for the filesystem entry kind. Mirrors
 * `entryTypeQueryValueSchema` in `apps/server/src/fs/contracts.ts`.
 */
export type EntryTypeFilter = "file" | "directory" | "symlink" | "other"

/**
 * Canonical directory/file entry returned by the filesystem service.
 * Structurally equivalent to the Valibot `treeEntrySchema` inferred
 * output.
 */
export type TreeEntry = {
  name: string
  path: string
  type: EntryTypeFilter
  size: number
  mtimeMs: number
  birthtimeMs: number
}
