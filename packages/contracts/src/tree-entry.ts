export type EntryTypeFilter = "file" | "directory" | "symlink" | "other"

export type TreeEntry = {
  name: string
  path: string
  type: EntryTypeFilter
  targetType?: EntryTypeFilter
  size: number
  mtimeMs: number
  birthtimeMs: number
}
