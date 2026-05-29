export const fileSystemKeys = {
  all: ['file-system'] as const,
  fileSnapshots: () => [...fileSystemKeys.all, 'file-snapshots'] as const,
  fileSnapshot: (path: string) => [...fileSystemKeys.fileSnapshots(), path] as const,
  quickOpenFiles: (rootPath: string, query: string) =>
    [...fileSystemKeys.fileSnapshots(), 'quick-open', rootPath, query] as const,
  trees: () => [...fileSystemKeys.all, 'trees'] as const,
  tree: (rootPath: string) => [...fileSystemKeys.trees(), rootPath] as const,
  treeDirectory: (rootPath: string, treePath: string, path: string) =>
    [...fileSystemKeys.tree(rootPath), 'directory', treePath, path] as const,
}

export const filePickerKeys = {
  all: ['file-picker'] as const,
  serverInfo: () => [...filePickerKeys.all, 'server-info'] as const,
  directories: () => [...filePickerKeys.all, 'directories'] as const,
  directory: (path: string, query: string, mode: 'file' | 'folder', reloadVersion: number) =>
    [...filePickerKeys.directories(), { mode, path, query, reloadVersion }] as const,
  recents: () => [...filePickerKeys.all, 'recents'] as const,
  recentList: (reloadVersion: number) => [...filePickerKeys.recents(), reloadVersion] as const,
}

export const gitKeys = {
  all: ['git'] as const,
  branches: (path: string) => [...gitKeys.all, 'branches', path] as const,
  blobDiff: (query: {
    newObjectId?: string
    oldObjectId?: string
    oldPath?: string
    path: string
  }) => [...gitKeys.diffs(), 'blob', query] as const,
  diffs: () => [...gitKeys.all, 'diffs'] as const,
  checkpointDiff: (query: {
    filePath?: string
    fromTurnCount: number
    path?: string
    scope?: 'file' | 'thread' | 'turn'
    threadId: string
    toTurnCount: number
  }) => [...gitKeys.diffs(), 'checkpoint', query] as const,
  diff: (path: string, staged: boolean) => [...gitKeys.diffs(), path, staged] as const,
  statuses: () => [...gitKeys.all, 'statuses'] as const,
  status: (path: string) => [...gitKeys.statuses(), path] as const,
}

export const documentSymbolKeys = {
  all: ['document-symbols'] as const,
  document: (rootPath: string, path: string, contentRevision: string) =>
    [...documentSymbolKeys.all, rootPath, path, contentRevision] as const,
}

export const logsKeys = {
  all: ['logs'] as const,
  detail: (id: string) => [...logsKeys.all, 'detail', id] as const,
  events: (filters: unknown) => [...logsKeys.all, 'events', filters] as const,
  summary: (filters: unknown) => [...logsKeys.all, 'summary', filters] as const,
}
