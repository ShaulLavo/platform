export type EditorFile = {
  path: string
  content: string
  mtimeMs: number
}

export type EditorWorkspaceEntry = {
  path: string
  type: "file" | "directory" | "symlink" | "other"
  size: number
  mtimeMs: number
}
