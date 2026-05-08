import type { FilePickerMode } from "@/components/file-picker-dialog"

export const fileSystemKeys = {
  all: ["file-system"] as const,
  files: () => [...fileSystemKeys.all, "files"] as const,
  file: (path: string) => [...fileSystemKeys.files(), path] as const,
  trees: () => [...fileSystemKeys.all, "trees"] as const,
  tree: (rootPath: string) => [...fileSystemKeys.trees(), rootPath] as const,
  treeDirectory: (rootPath: string, treePath: string, path: string) =>
    [...fileSystemKeys.tree(rootPath), "directory", treePath, path] as const,
  workspaceSources: (key: string) =>
    [...fileSystemKeys.all, "workspace-sources", key] as const,
}

export const filePickerKeys = {
  all: ["file-picker"] as const,
  serverInfo: () => [...filePickerKeys.all, "server-info"] as const,
  directories: () => [...filePickerKeys.all, "directories"] as const,
  directory: (
    path: string,
    query: string,
    mode: FilePickerMode,
    reloadVersion: number
  ) =>
    [
      ...filePickerKeys.directories(),
      { mode, path, query, reloadVersion },
    ] as const,
  recents: () => [...filePickerKeys.all, "recents"] as const,
  recentList: (reloadVersion: number) =>
    [...filePickerKeys.recents(), reloadVersion] as const,
}
