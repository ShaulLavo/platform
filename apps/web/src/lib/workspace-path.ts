/**
 * Paths relate to a workspace root in exactly two ways: they are inside it, or they
 * are not. Both the cache and the address grammar need that answer and need the
 * relative form that follows from it, so the predicate and the two conversions live
 * together here rather than being re-derived per feature.
 *
 * In memory paths stay absolute — the file server wants absolute. Only serialized
 * forms are relative.
 */

/** The root's own relative form. Empty string round-trips ambiguously; this does not. */
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
  if (!root) return false
  if (path === root) return true

  return path.startsWith(`${root}/`)
}

/**
 * Absolute path to workspace-relative. Returns null when the path is outside the root,
 * which is the same answer the cache's filter gives — one predicate, not two.
 */
export function toWorkspaceRelative(rootPath: string, path: string) {
  const root = normalizeWorkspaceRoot(rootPath)
  if (!isPathInWorkspace(path, root)) return null
  if (path === root) return WORKSPACE_ROOT_RELATIVE_PATH

  return path.slice(root.length + 1)
}

/**
 * Workspace-relative back to absolute. Rejects anything that is not relative — a
 * leading `/` or a `..` segment — because both mean a serialized form has been read
 * with the wrong root, and silently resolving them would place a tab outside its
 * own workspace.
 */
export function toWorkspaceAbsolute(rootPath: string, relativePath: string) {
  const root = normalizeWorkspaceRoot(rootPath)
  if (!root) return null
  if (relativePath === WORKSPACE_ROOT_RELATIVE_PATH) return root
  if (!relativePath || relativePath.startsWith('/')) return null
  if (relativePath.split('/').includes('..')) return null

  return `${root}/${relativePath}`
}
