import { orchestrationErrors } from '../observability'
import type { OrchestrationProjectedThread, OrchestrationReadModel } from './read-model'

/**
 * Pure guards the decider runs before it plans any event. Without them a command
 * for a missing, deleted or archived aggregate is appended to the log, receipted
 * `accepted` and published — and then silently dropped by the projector, which
 * only patches aggregates it already knows. The client is told "success" and
 * nothing happened. Every guard throws a catalogued structured error instead.
 */
export function requireThreadNotDeleted(model: OrchestrationReadModel, threadId: string) {
  const thread = model.threads.get(threadId)
  // A deleted thread is gone as far as every read surface is concerned, so a
  // tombstone reports as missing rather than as its own status.
  if (!thread || thread.deletedAt) throw orchestrationErrors.THREAD_NOT_FOUND({ threadId })

  return thread
}

export function requireThreadNotArchived(
  model: OrchestrationReadModel,
  threadId: string,
  commandType: string,
) {
  const thread = requireThreadNotDeleted(model, threadId)
  if (thread.archivedAt) throw orchestrationErrors.THREAD_ARCHIVED({ commandType, threadId })

  return thread
}

export function requireThreadArchived(model: OrchestrationReadModel, threadId: string) {
  const thread = requireThreadNotDeleted(model, threadId)
  if (!thread.archivedAt) throw orchestrationErrors.THREAD_NOT_ARCHIVED({ threadId })

  return thread
}

export function requireThreadAbsent(model: OrchestrationReadModel, threadId: string) {
  if (model.threads.has(threadId)) throw orchestrationErrors.THREAD_ALREADY_EXISTS({ threadId })
}

export function requireProject(model: OrchestrationReadModel, projectId: string) {
  const project = model.projects.get(projectId)
  if (!project || project.deletedAt) throw orchestrationErrors.PROJECT_NOT_FOUND({ projectId })

  return project
}

export function requireProjectAbsent(model: OrchestrationReadModel, projectId: string) {
  if (model.projects.has(projectId)) throw orchestrationErrors.PROJECT_ALREADY_EXISTS({ projectId })
}

/**
 * The client dedupes projects by hashing the raw path it was handed, so
 * `/repo`, `/repo/` and `/Repo` (on a case-insensitive volume) all mint
 * different project ids for one checkout. Compare normalized roots here so the
 * second one is refused instead of racing the first over the same worktrees.
 */
export function requireActiveProjectWorkspaceRootAbsent(
  model: OrchestrationReadModel,
  workspaceRoot: string,
  exceptProjectId?: string,
) {
  const normalized = normalizeWorkspaceRootForComparison(workspaceRoot)

  for (const project of model.projects.values()) {
    if (project.deletedAt) continue
    if (project.id === exceptProjectId) continue
    if (normalizeWorkspaceRootForComparison(project.workspaceRoot) !== normalized) continue

    throw orchestrationErrors.PROJECT_WORKSPACE_ROOT_TAKEN({
      projectId: project.id,
      workspaceRoot: normalized,
    })
  }
}

export function requireExpectedBranch(
  thread: OrchestrationProjectedThread,
  expectedBranch: string | null | undefined,
) {
  if (expectedBranch === undefined) return
  if (thread.branch === expectedBranch) return

  throw orchestrationErrors.THREAD_BRANCH_CONFLICT({
    actualBranch: thread.branch,
    expectedBranch,
    threadId: thread.id,
  })
}

export function liveProjectThreads(model: OrchestrationReadModel, projectId: string) {
  return Array.from(model.threads.values()).filter(
    (thread) => thread.projectId === projectId && !thread.deletedAt,
  )
}

export function normalizeWorkspaceRootForComparison(workspaceRoot: string) {
  const trimmed = trimTrailingSeparators(workspaceRoot.trim())
  if (!isWindowsPath(trimmed)) return trimmed

  // Windows volumes are case-insensitive and accept either separator, so the
  // same checkout can arrive spelled four different ways.
  return trimmed.replaceAll('/', '\\').toLowerCase()
}

function trimTrailingSeparators(value: string) {
  if (isRootPath(value)) return value

  const trimmed = value.replace(/[\\/]+$/, '')
  if (!trimmed) return value
  // `C:` alone is the drive's current directory, not its root; keep it a root.
  if (/^[a-zA-Z]:$/.test(trimmed)) return `${trimmed}\\`

  return trimmed
}

function isRootPath(value: string) {
  return value === '/' || value === '\\' || /^[a-zA-Z]:[/\\]?$/.test(value)
}

function isWindowsPath(value: string) {
  return value.startsWith('\\\\') || /^[a-zA-Z]:([/\\]|$)/.test(value)
}
