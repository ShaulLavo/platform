import path from 'node:path'

/**
 * Workspace roots reach the adapters without a leading separator — the
 * projection stores rows like `Users/shaul/Desktop/platform` alongside
 * absolute ones. Handing a relative path to `child_process.spawn` as `cwd`
 * fails with `ENOENT` even when the executable exists, and the Claude Agent
 * SDK reports that as "native binary exists but failed to launch", which
 * points at the binary rather than at the directory. Normalize at the adapter
 * boundary so every provider spawns against a real absolute directory.
 */
export function normalizeWorkspaceCwd(cwd: string) {
  if (cwd.startsWith('/')) return cwd
  if (cwd.startsWith('Users/')) return `/${cwd}`

  return path.resolve(cwd)
}
