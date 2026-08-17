export const mutationKeys = {
  checkout: (rootPath: string) => ['git', 'mutation', 'checkout', rootPath] as const,
  commit: (rootPath: string) => ['git', 'mutation', 'commit', rootPath] as const,
  createBranch: (rootPath: string) => ['git', 'mutation', 'create-branch', rootPath] as const,
  discard: (path: string) => ['git', 'mutation', 'discard', path] as const,
  discardMany: (paths: readonly string[]) => ['git', 'mutation', 'discard-many', ...paths] as const,
  discardStagedMany: (paths: readonly string[]) =>
    ['git', 'mutation', 'discard-staged-many', ...paths] as const,
  fetch: (rootPath: string) => ['git', 'mutation', 'fetch', rootPath] as const,
  pull: (rootPath: string) => ['git', 'mutation', 'pull', rootPath] as const,
  createPullRequest: (rootPath: string) =>
    ['git', 'mutation', 'create-pull-request', rootPath] as const,
  push: (rootPath: string) => ['git', 'mutation', 'push', rootPath] as const,
  sync: (rootPath: string) => ['git', 'mutation', 'sync', rootPath] as const,
  stage: (path: string) => ['git', 'mutation', 'stage', path] as const,
  stageMany: (paths: readonly string[]) => ['git', 'mutation', 'stage-many', ...paths] as const,
  unstage: (path: string) => ['git', 'mutation', 'unstage', path] as const,
  unstageMany: (paths: readonly string[]) => ['git', 'mutation', 'unstage-many', ...paths] as const,
}
