import type { OrchestrationProjectShell, ProjectId, ThreadId } from '@workspace/contracts'

import { projectQualifiers } from '@/features/chat/lib/project-qualifiers'
import { threadStatus, type ThreadStatus } from '@/features/chat/lib/thread-status'
import type { ChatSidebarThreadSummary } from '@/features/chat/state/chat-projection-store'

/** Which projects the list is showing. `null` means every project. */
export type SessionRailScope = ProjectId | null

export type SessionRailItem = {
  readonly branch: string | null
  readonly id: ThreadId
  readonly projectId: ProjectId
  readonly projectTitle: string
  readonly sortedAt: string
  readonly status: ThreadStatus
  readonly title: string
}

export type SessionRailProject = {
  readonly active: boolean
  readonly id: ProjectId
  readonly sessionCount: number
  readonly title: string
  /** Parent-path hint, set only when another project shares this title. */
  readonly qualifier: string | null
  readonly workspaceRoot: string
}

export type SessionRailModel = {
  readonly projects: readonly SessionRailProject[]
  /** One ordered list, newest first — scope and search have already been applied. */
  readonly sessions: readonly SessionRailItem[]
  /** How many sessions the current scope holds before the search text narrows it. */
  readonly scopedCount: number
  readonly scopeTitle: string
}

export function sessionRailModel({
  activeProjectId,
  projects,
  query = '',
  scope = null,
  threads,
}: {
  readonly activeProjectId: ProjectId | null
  readonly projects: readonly OrchestrationProjectShell[]
  readonly query?: string
  readonly scope?: SessionRailScope
  readonly threads: readonly ChatSidebarThreadSummary[]
}): SessionRailModel {
  const titleByProjectId = new Map(projects.map((project) => [project.id, project.title]))
  const qualifiers = projectQualifiers(projects)
  const items = threads
    .filter((thread) => !thread.archivedAt)
    .map((thread) => sessionRailItem(thread, titleByProjectId.get(thread.projectId) ?? 'Workspace'))
    .toSorted(compareSessionRailItems)
  const scoped = scope ? items.filter((item) => item.projectId === scope) : items
  const countByProjectId = sessionCountByProjectId(items)

  return {
    projects: projects
      .map((project) => ({
        active: project.id === activeProjectId,
        id: project.id,
        qualifier: qualifiers.get(project.id) ?? null,
        sessionCount: countByProjectId.get(project.id) ?? 0,
        title: project.title,
        workspaceRoot: project.workspaceRoot,
      }))
      .toSorted(compareSessionRailProjects),
    scopedCount: scoped.length,
    scopeTitle: scope ? (titleByProjectId.get(scope) ?? 'Project') : 'All projects',
    sessions: matchingSessions(scoped, query),
  }
}

/**
 * Substring match over the fields the row actually shows. Deliberately not fuzzy: the
 * rail is a short recall list, and fuzzy ranking here surfaces sessions whose titles
 * share nothing visible with what was typed.
 */
function matchingSessions(items: readonly SessionRailItem[], query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return items

  return items.filter((item) => sessionSearchText(item).includes(needle))
}

function sessionSearchText(item: SessionRailItem) {
  return `${item.title}\n${item.projectTitle}\n${item.branch ?? ''}`.toLowerCase()
}

function sessionRailItem(thread: ChatSidebarThreadSummary, projectTitle: string): SessionRailItem {
  return {
    branch: thread.branch ?? null,
    id: thread.id,
    projectId: thread.projectId,
    projectTitle,
    sortedAt: sessionSortTimestamp(thread),
    status: threadStatus(thread),
    title: thread.title,
  }
}

function sessionSortTimestamp(thread: ChatSidebarThreadSummary) {
  return thread.latestUserMessageAt ?? thread.updatedAt ?? thread.createdAt
}

function sessionCountByProjectId(items: readonly SessionRailItem[]) {
  const counts = new Map<ProjectId, number>()
  for (const item of items) {
    counts.set(item.projectId, (counts.get(item.projectId) ?? 0) + 1)
  }

  return counts
}

function compareSessionRailItems(left: SessionRailItem, right: SessionRailItem) {
  return right.sortedAt.localeCompare(left.sortedAt) || left.id.localeCompare(right.id)
}

/** Active project first, then most sessions, then alphabetical. */
function compareSessionRailProjects(left: SessionRailProject, right: SessionRailProject) {
  if (left.active !== right.active) return left.active ? -1 : 1
  if (left.sessionCount !== right.sessionCount) return right.sessionCount - left.sessionCount

  return left.title.localeCompare(right.title)
}
