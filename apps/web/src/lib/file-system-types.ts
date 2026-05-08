export type FsEntryType = "file" | "directory" | "symlink" | "other"

export type TreeEntry = {
  name: string
  path: string
  type: FsEntryType
  size: number
  mtimeMs: number
  birthtimeMs: number
  children?: TreeEntry[]
}

export type TreeResult = {
  path: string
  entries: TreeEntry[]
}

export type FileResult = {
  path: string
  content: string
  mtimeMs: number
  size: number
}
