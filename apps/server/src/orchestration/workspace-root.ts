import { mkdir, stat } from 'node:fs/promises'

import { orchestrationErrors } from '../observability'
import type { OrchestrationCommand } from './schemas'

/**
 * Makes a project's workspace root exist before the command that names it is
 * decided.
 *
 * Here rather than in the decider because the decider is pure and synchronous,
 * and runs inside the SQLite command transaction — filesystem work there would
 * both break that purity and hold a write transaction open across disk I/O. It
 * also has to stay replay-safe: re-deciding a committed command must not create
 * a directory a second time, and only the ingress runs once per dispatch.
 *
 * The path is checked, never rewritten. The client derives the project id from
 * the same string it sends, so resolving `~` or relativity here would mint an
 * id for one path and a project row for another.
 */
export async function ensureCommandWorkspaceRoot(command: OrchestrationCommand) {
  if (command.type !== 'project.create') return
  if (!command.createWorkspaceRootIfMissing) return

  const workspaceRoot = command.workspaceRoot
  const existing = await directoryStatus(workspaceRoot)
  if (existing === 'directory') return
  if (existing === 'file') {
    throw orchestrationErrors.WORKSPACE_ROOT_NOT_DIRECTORY({ workspaceRoot })
  }

  try {
    await mkdir(workspaceRoot, { recursive: true })
  } catch (cause) {
    // Only a real `Error` is a cause evlog can chain; anything else would be
    // dropped silently, so the reason rides the internal field instead.
    throw orchestrationErrors.WORKSPACE_ROOT_CREATE_FAILED({
      workspaceRoot,
      ...(cause instanceof Error ? { cause } : { internal: { cause: String(cause) } }),
    })
  }
}

async function directoryStatus(workspaceRoot: string) {
  try {
    return (await stat(workspaceRoot)).isDirectory() ? 'directory' : 'file'
  } catch {
    return 'missing'
  }
}
