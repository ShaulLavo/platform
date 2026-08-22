import type {
  OrchestrationProjectShell,
  OrchestrationThreadSearchMatch,
  ProjectId,
  ThreadId,
} from '@workspace/contracts'

import { projectQualifiers } from '@/features/chat/utils/project-qualifiers'
import {
  threadPlanProgressLabel,
  threadStatus,
  type ThreadStatus,
} from '@/features/chat/utils/thread-status'
import type { ProjectionThread } from '@/features/chat/state/chat-projection-store'
import {
  compareProjectsForRail,
  withProjectOrderKey,
} from '@/features/chat-mode/utils/project-order'
import { compareSessionsForRail } from '@/features/chat-mode/utils/session-order'
import { rollupThreadStatus } from '@/features/chat-mode/utils/session-status-rollup'
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

type ThreadPlanProgress = NonNullable<ReturnType<typeof threadPlanProgressLabel>>
type SessionRailThreadSource = Pick<
  ProjectionThread,
  | 'archivedAt'
  | 'branch'
  | 'createdAt'
  | 'hasActionableProposedPlan'
  | 'id'
  | 'latestTurn'
  | 'latestUserMessageAt'
  | 'pendingApprovalCount'
  | 'pendingUserInputCount'
  | 'pinOrderKey'
  | 'planProgress'
  | 'projectId'
  | 'session'
  | 'title'
  | 'worktreePath'
> & {
  readonly activityAt?: string
  readonly updatedAt?: string
}

export type SessionRailItem = {
  /** Last thing that happened here. For the row's date label only, never for order. */
  readonly activityAt: string
  readonly archived: boolean
  readonly branch: string | null
  readonly createdAt: string
  readonly id: ThreadId
  /** The slot the user dragged this row into. `null` until they drag it. */
  readonly pinOrderKey: string | null
  /** What this session is doing right now, when it is following a plan. */
  readonly planProgress: ThreadPlanProgress | null
  readonly projectId: ProjectId
  readonly projectTitle: string
  readonly status: ThreadStatus
  readonly title: string
  /** Finished since the last time this session was on the stage. */
  readonly unread: boolean
  /** The session's own checkout, when it has one. Git acts on this, not the project root. */
  readonly worktreePath: string | null
}

export type SessionRailProject = {
  readonly active: boolean
  readonly id: ProjectId
  /** The slot the user dragged this project into. `null` until they drag it. */
  readonly orderKey: string | null
  readonly sessionCount: number
  /** The worst state anything inside is in — the whole point of a collapsed header. */
  readonly status: ThreadStatus
  readonly title: string
  /** Parent-path hint, set only when another project shares this title. */
  readonly qualifier: string | null
  readonly unreadCount: number
  readonly workspaceRoot: string
}

/**
 * One project's slice of the list. Collapsing a project hides its rows, so the header
 * has to carry what was in them: a status rollup, an unread count, and how many rows
 * are folded away.
 */
export type SessionRailGroup = {
  readonly collapsed: boolean
  /** Rows a collapse is holding back. Zero while the group is open. */
  readonly hiddenCount: number
  readonly project: SessionRailProject
  readonly sessions: readonly SessionRailItem[]
}

export type SessionRailModel = {
  /** How many sessions are filed away, whichever view is showing. */
  readonly archivedCount: number
  /** The visible list, split by project. Empty projects never make a group. */
  readonly groups: readonly SessionRailGroup[]
  readonly projects: readonly SessionRailProject[]
  /** One ordered list — view, scope and search have already been applied. */
  readonly sessions: readonly SessionRailItem[]
  /** How many sessions the current view and scope hold before the search narrows them. */
  readonly scopedCount: number
  readonly scopeTitle: string
}

const NO_PROJECT_IDS: readonly ProjectId[] = []
const NO_ORDER_OVERRIDES: RailOrderOverrides = { projectOrderKeys: {}, sessionOrderKeys: {} }
const NO_SEARCH_MATCHES: SessionSearchMatches = {}

/**
 * What the server found inside each thread's messages, keyed by thread. A thread the
 * projection has not heard of simply never produces a row — the rail can only show
 * sessions it already holds.
 */
export type SessionSearchMatches = Readonly<
  Partial<Record<ThreadId, OrchestrationThreadSearchMatch>>
>

/**
 * Keys written by a drag that the server has not confirmed yet. Folding them in
 * here rather than in the components is what keeps the rendered list and the
 * lists the keyboard commands walk agreeing during a reorder.
 */
export type RailOrderOverrides = {
  readonly projectOrderKeys: Readonly<Partial<Record<ProjectId, string>>>
  readonly sessionOrderKeys: Readonly<Partial<Record<ThreadId, string>>>
}

export function sessionRailModel({
  activeProjectId = null,
  activeThreadId = null,
  collapsedProjectIds = NO_PROJECT_IDS,
  orderOverrides = NO_ORDER_OVERRIDES,
  projects,
  query = '',
  scope = null,
  searchMatches = NO_SEARCH_MATCHES,
  seenByThreadId = {},
  threads,
  view = 'active',
}: {
  readonly activeProjectId?: ProjectId | null
  /** The session on the stage. It stays visible through a collapse, wherever it lives. */
  readonly activeThreadId?: ThreadId | null
  readonly collapsedProjectIds?: readonly ProjectId[]
  readonly orderOverrides?: RailOrderOverrides
  readonly projects: readonly OrchestrationProjectShell[]
  readonly query?: string
  readonly scope?: SessionRailScope
  readonly searchMatches?: SessionSearchMatches
  readonly seenByThreadId?: SessionSeenStamps
  readonly threads: readonly SessionRailThreadSource[]
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
        orderOverrides.sessionOrderKeys[thread.id],
      ),
    )
    .toSorted(compareSessionsForRail)
  const scoped = scope ? items.filter((item) => item.projectId === scope) : items
  const sessions = matchingSessions(scoped, query, searchMatches)
  const railProjects = projects
    .map((project) => withProjectOrderKey(project, orderOverrides.projectOrderKeys[project.id]))
    .toSorted(compareProjectsForRail)
    .map((project) =>
      sessionRailProject(project, {
        active: project.id === activeProjectId,
        qualifier: qualifiers.get(project.id) ?? null,
        sessions: items.filter((item) => item.projectId === project.id),
      }),
    )

  return {
    archivedCount: threads.filter((thread) => Boolean(thread.archivedAt)).length,
    groups: sessionRailGroups({
      activeThreadId,
      // A search is a request to see matches. Honouring a collapse on top of one hides
      // the very rows the user just asked for and reads as a broken search.
      collapsedProjectIds: query.trim() ? NO_PROJECT_IDS : collapsedProjectIds,
      projects: railProjects,
      sessions,
    }),
    projects: railProjects,
    scopedCount: scoped.length,
    scopeTitle: scope ? (titleByProjectId.get(scope) ?? 'Project') : 'All projects',
    sessions,
  }
}

/** The stage builds one of these for the session it is showing, so header and row agree. */
export function sessionRailItem(
  thread: SessionRailThreadSource,
  projectTitle: string,
  seenAt: string | undefined,
  pendingOrderKey?: string,
): SessionRailItem {
  const completedAt = sessionCompletedAt(thread)

  return {
    activityAt:
      thread.activityAt ?? thread.latestUserMessageAt ?? thread.updatedAt ?? thread.createdAt,
    archived: Boolean(thread.archivedAt),
    branch: thread.branch ?? null,
    createdAt: thread.createdAt,
    id: thread.id,
    pinOrderKey: pendingOrderKey ?? thread.pinOrderKey ?? null,
    projectId: thread.projectId,
    projectTitle,
    planProgress: threadPlanProgressLabel(thread),
    status: threadStatus(thread),
    title: thread.title,
    unread: isSessionUnread(completedAt, seenAt),
    worktreePath: thread.worktreePath ?? null,
  }
}

function sessionRailProject(
  project: OrchestrationProjectShell,
  {
    active,
    qualifier,
    sessions,
  }: {
    readonly active: boolean
    readonly qualifier: string | null
    readonly sessions: readonly SessionRailItem[]
  },
): SessionRailProject {
  return {
    active,
    id: project.id,
    orderKey: project.orderKey ?? null,
    qualifier,
    sessionCount: sessions.length,
    status: rollupThreadStatus(sessions.map((session) => session.status)),
    title: project.title,
    unreadCount: sessions.filter((session) => session.unread).length,
    workspaceRoot: project.workspaceRoot,
  }
}

function sessionRailGroups({
  activeThreadId,
  collapsedProjectIds,
  projects,
  sessions,
}: {
  readonly activeThreadId: ThreadId | null
  readonly collapsedProjectIds: readonly ProjectId[]
  readonly projects: readonly SessionRailProject[]
  readonly sessions: readonly SessionRailItem[]
}): readonly SessionRailGroup[] {
  return projects.flatMap((project) => {
    const owned = sessions.filter((session) => session.projectId === project.id)
    if (owned.length === 0) return []

    const collapsed = collapsedProjectIds.includes(project.id)
    // Folding a project must never fold away the conversation on screen, or the rail
    // stops agreeing with the stage and the highlighted row simply disappears.
    const visible = collapsed ? owned.filter((session) => session.id === activeThreadId) : owned

    return [{ collapsed, hiddenCount: owned.length - visible.length, project, sessions: visible }]
  })
}

/**
 * Substring match over the fields the row actually shows, unioned with whatever the
 * server found inside the messages. Deliberately not fuzzy: the rail is a short recall
 * list, and fuzzy ranking here surfaces sessions whose titles share nothing visible
 * with what was typed.
 *
 * The local half stays first-class rather than being replaced by the server: it is
 * instant, it works while the request is in flight, and it still answers "which of
 * these is the one on `fix/auth`" when the server is unreachable.
 */
function matchingSessions(
  items: readonly SessionRailItem[],
  query: string,
  searchMatches: SessionSearchMatches,
) {
  const needle = query.trim().toLowerCase()
  if (!needle) return items

  return items.filter(
    (item) => sessionSearchText(item).includes(needle) || Boolean(searchMatches[item.id]),
  )
}

function sessionSearchText(item: SessionRailItem) {
  return `${item.title}\n${item.projectTitle}\n${item.branch ?? ''}`.toLowerCase()
}
