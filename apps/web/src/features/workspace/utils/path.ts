// Workspace paths use the filesystem API namespace; an empty root is its configured root.
export const WORKSPACE_ROOT_RELATIVE_PATH = '.'

/**
 * Trailing slashes are the one normalization worth doing here. Everything else — `..`
 * collapse, case folding, realpath — is deliberately absent, because the file server
 * hands us paths it has already resolved and inventing a second normalizer would give
 * two answers to one question.
 */
export function normalizeWorkspaceRoot(rootPath: string) {
  return rootPath.replace(/\/+$/, '')
}

/** Leaf directory name, the human-facing name of a workspace. */
export function workspacePathLeaf(rootPath: string) {
  const leaf = normalizeWorkspaceRoot(rootPath).split('/').filter(Boolean).at(-1)

  return leaf ?? 'Workspace'
}

export function isPathInWorkspace(path: string, rootPath: string) {
  const root = normalizeWorkspaceRoot(rootPath)
  if (path === root) return true
  if (!root) return !path.startsWith('/') && !path.split('/').includes('..')

  return path.startsWith(`${root}/`)
}

/**
 * Filesystem API path to workspace-relative. Returns null when the path is outside the root,
 * which is the same answer the cache's filter gives — one predicate, not two.
 */
export function toWorkspaceRelative(rootPath: string, path: string) {
  const root = normalizeWorkspaceRoot(rootPath)
  if (!isPathInWorkspace(path, root)) return null
  if (path === root) return WORKSPACE_ROOT_RELATIVE_PATH

  if (!root) return path
  return path.slice(root.length + 1)
}

/**
 * Workspace-relative back to the filesystem API namespace. Rejects anything that is not relative — a
 * leading `/` or a `..` segment — because both mean a serialized form has been read
 * with the wrong root, and silently resolving them would place a tab outside its
 * own workspace.
 */
export function toWorkspaceAbsolute(rootPath: string, relativePath: string) {
  const root = normalizeWorkspaceRoot(rootPath)
  if (relativePath === WORKSPACE_ROOT_RELATIVE_PATH) return root
  if (!relativePath || relativePath.startsWith('/')) return null
  if (relativePath.split('/').includes('..')) return null

  if (!root) return relativePath
  return `${root}/${relativePath}`
}
