import type { ProjectId } from '@workspace/contracts'

import { selectChatProjects } from '@/features/chat/state/chat-projection-selectors'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { useSessionRailStore } from '@/features/chat-mode/state/session-rail-store'
import { useSessionReadStore } from '@/features/chat-mode/state/session-read-store'
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import {
  sessionRailModel,
  type SessionRailItem,
} from '@/features/chat-mode/utils/session-rail-model'
import { sessionThreads } from '@/features/chat-mode/utils/session-threads'
import { useActiveProjectStore } from '@/state/active-project-store'

export type SessionTraversalDirection = 'next' | 'previous'

type SessionProjectOpener = (workspaceRoot: string) => unknown

/**
 * Opening a project is app-level work that lives behind a hook — it stats the path,
 * switches the editor root, and records the folder as recent — so chat mode hands the
 * opener over for as long as it is mounted. Null the rest of the time, which is also
 * the honest answer for a session command fired while chat mode is not on screen.
 */
let openProjectRoot: SessionProjectOpener | null = null

export function setSessionProjectOpener(opener: SessionProjectOpener | null) {
  openProjectRoot = opener
}

/**
 * The one way a session reaches the stage. Every caller — a row click, a menu item, a
 * keyboard jump — goes through here, so "activate the owning project first" can never
 * be forgotten by one of them.
 */
export function openSessionRow(session: SessionRailItem) {
  activateSessionProject(session.projectId)
  useSessionSelectionStore.getState().selectSession(session.projectId, session.id)

  return true
}

export function startSessionDraft(projectId: ProjectId) {
  activateSessionProject(projectId)
  // A new session lands in the inbox, so leaving the archive on screen would show a
  // list the session it just created can never appear in.
  useSessionRailStore.getState().setView('active')
  useSessionSelectionStore.getState().startDraft(projectId)

  return true
}

/** Scoped to one project, "new session" means that one — otherwise the open one. */
export function startScopedSessionDraft() {
  const projectId = useSessionRailStore.getState().scope ?? activeProjectId()
  if (!projectId) return false

  return startSessionDraft(projectId)
}

export function selectAdjacentSession(direction: SessionTraversalDirection) {
  const sessions = visibleSessions()
  if (sessions.length === 0) return false

  const index = sessions.findIndex((session) => session.id === selectedThreadId())
  // Nothing picked yet (or the pick is filtered out): step in from the near end.
  if (index === -1) return openSessionAt(sessions, direction === 'next' ? 0 : sessions.length - 1)

  const step = direction === 'next' ? 1 : -1

  return openSessionAt(sessions, (index + step + sessions.length) % sessions.length)
}

/** `position` is 1-based, matching the keys it is bound to. */
export function jumpToSession(position: number) {
  return openSessionAt(visibleSessions(), position - 1)
}

function openSessionAt(sessions: readonly SessionRailItem[], index: number) {
  const session = sessions[index]
  if (!session) return false

  return openSessionRow(session)
}

/**
 * Exactly the list the rail is drawing, rebuilt from the same stores it renders from.
 * A keyboard jump that ignored the search text or the archive view would land on a
 * session the user cannot see counting to.
 */
function visibleSessions() {
  const projection = useChatProjectionStore.getState()
  const rail = useSessionRailStore.getState()

  return sessionRailModel({
    projects: selectChatProjects(projection),
    query: rail.query,
    scope: rail.scope,
    seenByThreadId: useSessionReadStore.getState().seenByThreadId,
    threads: sessionThreads(projection.threadIds, projection.sidebarThreadSummaryById),
    view: rail.view,
  }).sessions
}

function selectedThreadId() {
  const { selection } = useSessionSelectionStore.getState()
  if (selection.kind !== 'session') return null

  return selection.threadId
}

function activeProjectId(): ProjectId | null {
  const workspaceRoot = useActiveProjectStore.getState().workspaceRoot
  if (!workspaceRoot) return null

  const projection = useChatProjectionStore.getState()

  return (
    selectChatProjects(projection).find((project) => project.workspaceRoot === workspaceRoot)?.id ??
    null
  )
}

function activateSessionProject(projectId: ProjectId) {
  const project = useChatProjectionStore.getState().projectById[projectId]
  if (!project) return
  if (project.workspaceRoot === useActiveProjectStore.getState().workspaceRoot) return
  if (!openProjectRoot) return

  void openProjectRoot(project.workspaceRoot)
}
