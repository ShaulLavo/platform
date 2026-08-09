import type { OrchestrationProjectShell, ProjectId, ThreadId } from '@workspace/contracts'

import { projectQualifiers } from '@/features/chat/lib/project-qualifiers'
import { threadStatus, type ThreadStatus } from '@/features/chat/lib/thread-status'
import type { ChatSidebarThreadSummary } from '@/features/chat/state/chat-projection-store'
import { compareSessionsByCreation } from '@/features/chat-mode/utils/session-order'
import {
  isSessionUnread,
  sessionCompletedAt,
  type SessionSeenStamps,
} from '@/features/chat-mode/utils/session-unread'

/** Which projects the list is showing. `null` means every project. */
export type SessionRailScope = ProjectId | null

/**
 * The rail is an inbox: `active` is the inbox itself, `archived` is what has been
 * filed. Archived sessions need a surface of their own — without one, archiving is a
 * delete with a friendlier name and Unarchive is an item no menu can ever render.
 */
export type SessionRailView = 'active' | 'archived'

export type SessionRailItem = {
  /** Last thing that happened here. For the row's date label only, never for order. */
  readonly activityAt: string
  readonly archived: boolean
  readonly branch: string | null
  readonly createdAt: string
  readonly id: ThreadId
  readonly projectId: ProjectId
  readonly projectTitle: string
  readonly status: ThreadStatus
  readonly title: string
  /** Finished since the last time this session was on the stage. */
  readonly unread: boolean
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
  /** How many sessions are filed away, whichever view is showing. */
  readonly archivedCount: number
  readonly projects: readonly SessionRailProject[]
  /** One ordered list — view, scope and search have already been applied. */
  readonly sessions: readonly SessionRailItem[]
  /** How many sessions the current view and scope hold before the search narrows them. */
  readonly scopedCount: number
  readonly scopeTitle: string
}

export function sessionRailModel({
  activeProjectId = null,
  projects,
  query = '',
  scope = null,
  seenByThreadId = {},
  threads,
  view = 'active',
}: {
  readonly activeProjectId?: ProjectId | null
  readonly projects: readonly OrchestrationProjectShell[]
  readonly query?: string
  readonly scope?: SessionRailScope
  readonly seenByThreadId?: SessionSeenStamps
  readonly threads: readonly ChatSidebarThreadSummary[]
  readonly view?: SessionRailView
}): SessionRailModel {
  const titleByProjectId = new Map(projects.map((project) => [project.id, project.title]))
  const qualifiers = projectQualifiers(projects)
  const items = threads
    .filter((thread) => Boolean(thread.archivedAt) === (view === 'archived'))
    .map((thread) =>
      sessionRailItem(
        thread,
        titleByProjectId.get(thread.projectId) ?? 'Workspace',
        seenByThreadId[thread.id],
      ),
    )
    .toSorted(compareSessionsByCreation)
  const scoped = scope ? items.filter((item) => item.projectId === scope) : items
  const countByProjectId = sessionCountByProjectId(items)

  return {
    archivedCount: threads.filter((thread) => Boolean(thread.archivedAt)).length,
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

/** The stage builds one of these for the session it is showing, so header and row agree. */
export function sessionRailItem(
  thread: ChatSidebarThreadSummary,
  projectTitle: string,
  seenAt: string | undefined,
): SessionRailItem {
  const completedAt = sessionCompletedAt(thread)

  return {
    activityAt: thread.latestUserMessageAt ?? thread.updatedAt ?? thread.createdAt,
    archived: Boolean(thread.archivedAt),
    branch: thread.branch ?? null,
    createdAt: thread.createdAt,
    id: thread.id,
    projectId: thread.projectId,
    projectTitle,
    status: threadStatus(thread),
    title: thread.title,
    unread: isSessionUnread(completedAt, seenAt),
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

function sessionCountByProjectId(items: readonly SessionRailItem[]) {
  const counts = new Map<ProjectId, number>()
  for (const item of items) {
    counts.set(item.projectId, (counts.get(item.projectId) ?? 0) + 1)
  }

  return counts
}

/** Active project first, then most sessions, then alphabetical. */
function compareSessionRailProjects(left: SessionRailProject, right: SessionRailProject) {
  if (left.active !== right.active) return left.active ? -1 : 1
  if (left.sessionCount !== right.sessionCount) return right.sessionCount - left.sessionCount

  return left.title.localeCompare(right.title)
}
