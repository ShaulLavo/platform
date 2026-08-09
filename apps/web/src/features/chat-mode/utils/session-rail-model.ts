import type { OrchestrationProjectShell, ProjectId, ThreadId } from '@workspace/contracts'

import { projectQualifiers } from '@/features/chat/lib/project-qualifiers'
import type { ChatSidebarThreadSummary } from '@/features/chat/state/chat-projection-store'

export const RECENT_SESSION_LIMIT = 6

export type SessionRailItem = {
  readonly attention: boolean
  readonly branch: string | null
  readonly id: ThreadId
  readonly projectId: ProjectId
  readonly projectTitle: string
  readonly running: boolean
  readonly sortedAt: string
  readonly title: string
}

export type SessionRailProject = {
  readonly active: boolean
  readonly id: ProjectId
  readonly sessions: readonly SessionRailItem[]
  readonly title: string
  /** Parent-path hint, set only when another project shares this title. */
  readonly qualifier: string | null
  readonly workspaceRoot: string
}

export type SessionRailModel = {
  readonly projects: readonly SessionRailProject[]
  readonly recent: readonly SessionRailItem[]
}

export function sessionRailModel({
  activeProjectId,
  projects,
  recentLimit = RECENT_SESSION_LIMIT,
  threads,
}: {
  readonly activeProjectId: ProjectId | null
  readonly projects: readonly OrchestrationProjectShell[]
  readonly recentLimit?: number
  readonly threads: readonly ChatSidebarThreadSummary[]
}): SessionRailModel {
  const titleByProjectId = new Map(projects.map((project) => [project.id, project.title]))
  const qualifiers = projectQualifiers(projects)
  const items = threads
    .filter((thread) => !thread.archivedAt)
    .map((thread) => sessionRailItem(thread, titleByProjectId.get(thread.projectId) ?? 'Workspace'))
    .toSorted(compareSessionRailItems)
  const sessionsByProjectId = groupSessionsByProjectId(items)

  return {
    projects: projects
      .map((project) => ({
        active: project.id === activeProjectId,
        id: project.id,
        sessions: sessionsByProjectId.get(project.id) ?? [],
        qualifier: qualifiers.get(project.id) ?? null,
        title: project.title,
        workspaceRoot: project.workspaceRoot,
      }))
      .toSorted(compareSessionRailProjects),
    recent: items.slice(0, recentLimit),
  }
}

function sessionRailItem(thread: ChatSidebarThreadSummary, projectTitle: string): SessionRailItem {
  return {
    attention: sessionNeedsAttention(thread),
    branch: thread.branch ?? null,
    id: thread.id,
    projectId: thread.projectId,
    projectTitle,
    running: thread.latestTurn?.state === 'running',
    sortedAt: sessionSortTimestamp(thread),
    title: thread.title,
  }
}

function sessionNeedsAttention(thread: ChatSidebarThreadSummary) {
  if (thread.pendingApprovalCount > 0) return true
  if (thread.pendingUserInputCount > 0) return true

  return thread.hasActionableProposedPlan
}

function sessionSortTimestamp(thread: ChatSidebarThreadSummary) {
  return thread.latestUserMessageAt ?? thread.updatedAt ?? thread.createdAt
}

function groupSessionsByProjectId(items: readonly SessionRailItem[]) {
  const grouped = new Map<ProjectId, SessionRailItem[]>()
  for (const item of items) {
    const sessions = grouped.get(item.projectId)
    if (!sessions) {
      grouped.set(item.projectId, [item])
      continue
    }

    sessions.push(item)
  }

  return grouped
}

function compareSessionRailItems(left: SessionRailItem, right: SessionRailItem) {
  return right.sortedAt.localeCompare(left.sortedAt) || left.id.localeCompare(right.id)
}

/** Active project first, then the project whose newest session is most recent. */
function compareSessionRailProjects(left: SessionRailProject, right: SessionRailProject) {
  if (left.active !== right.active) return left.active ? -1 : 1

  const leftAt = left.sessions[0]?.sortedAt ?? ''
  const rightAt = right.sessions[0]?.sortedAt ?? ''

  return rightAt.localeCompare(leftAt) || left.title.localeCompare(right.title)
}
