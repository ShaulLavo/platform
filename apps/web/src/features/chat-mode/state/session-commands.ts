import {
  scopedSessionKey,
  type EnvironmentId,
  type ProjectId,
  type ScopedProjectRef,
} from '@workspace/contracts'
import {
  selectCurrentWorktree,
  selectWorktreeAtPath,
} from '@/features/chat/state/chat-projection-selectors'
import { activeChatProjection } from '@/features/chat/state/active-projection'
import {
  useChatProjectionStore,
  selectChatProjectionSlice,
} from '@/features/chat/state/chat-projection-store'
import { useRailOrderStore } from '@/features/chat-mode/state/rail-order-store'
import { useSessionMultiSelectStore } from '@/features/chat-mode/state/session-multi-select-store'
import { useSessionRailStore } from '@/features/chat-mode/state/session-rail-store'
import { useSessionReadStore } from '@/features/chat-mode/state/session-read-store'
import { useSessionSearchStore } from '@/features/chat-mode/state/session-search-store'
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { currentRailEnvironments } from '@/features/chat-mode/state/rail-environments'
import type { SessionClickIntent } from '@/features/chat-mode/utils/session-multi-select'
import {
  sessionRailModel,
  type SessionRailItem,
} from '@/features/chat-mode/utils/session-rail-model'
import { useActiveProjectStore } from '@/features/workspace/state/active-project'
import { activeEnvironmentId } from '@/lib/environments/state/domain'
import type { OpenWorkspaceRootResult } from '@/features/workspace/hooks/use-open-root'
export type SessionTraversalDirection = 'next' | 'previous'
type SessionProjectOpener = (
  environmentId: EnvironmentId,
  workspaceRoot: string,
) => Promise<OpenWorkspaceRootResult>
let openProjectRoot: SessionProjectOpener | null = null
let openingGeneration = 0
export function setSessionProjectOpener(opener: SessionProjectOpener | null) {
  openProjectRoot = opener
}
export type SessionOpenOptions = { readonly openProject?: SessionProjectOpener }
export async function openSessionRow(session: SessionRailItem, options: SessionOpenOptions = {}) {
  const generation = ++openingGeneration
  const opened = await openRoot(session.environmentId, session.worktreePath, options)
  if (!opened || generation !== openingGeneration) return false
  useSessionSelectionStore
    .getState()
    .selectSession(session.environmentId, session.projectId, session.id)
  return true
}
export function activateSessionRow(session: SessionRailItem, intent: SessionClickIntent) {
  const multi = useSessionMultiSelectStore.getState()
  if (intent === 'toggle') {
    multi.toggle(session.ref)
    return true
  }
  if (intent === 'extend') {
    multi.extendTo(
      session.ref,
      visibleSessions().map((item) => item.ref),
    )
    return true
  }
  multi.markOnly(session.ref)
  return openSessionRow(session)
}
export function clearSessionMultiSelect() {
  useSessionMultiSelectStore.getState().clear()
}
export async function startSessionDraft(ref: ScopedProjectRef, options: SessionOpenOptions = {}) {
  const generation = ++openingGeneration
  const slice = selectChatProjectionSlice(useChatProjectionStore.getState(), ref.environmentId)
  const worktree = selectCurrentWorktree(slice, ref.projectId)
  if (!worktree) return false
  const opened = await openRoot(ref.environmentId, worktree.path, options)
  if (!opened || generation !== openingGeneration) return false
  useSessionRailStore.getState().setView('active')
  useSessionSelectionStore.getState().startDraft(ref.environmentId, ref.projectId)
  return true
}
export function startScopedSessionDraft() {
  const projectId = useSessionRailStore.getState().scope ?? activeProjectId()
  if (!projectId) return false
  const environmentId = activeEnvironmentId()
  return startSessionDraft({ environmentId, projectId })
}
export function selectAdjacentSession(direction: SessionTraversalDirection) {
  const sessions = visibleSessions()
  if (!sessions.length) return false
  const index = sessions.findIndex((session) => session.key === selectedSessionKey())
  if (index < 0) return openSessionAt(sessions, direction === 'next' ? 0 : sessions.length - 1)
  const step = direction === 'next' ? 1 : -1
  return openSessionAt(sessions, (index + step + sessions.length) % sessions.length)
}
export function jumpToSession(position: number) {
  return openSessionAt(visibleSessions(), position - 1)
}
function openSessionAt(sessions: readonly SessionRailItem[], index: number) {
  const session = sessions[index]
  if (!session) return false
  useSessionMultiSelectStore.getState().markOnly(session.ref)
  return openSessionRow(session)
}
function visibleSessions() {
  const rail = useSessionRailStore.getState()
  return sessionRailModel({
    environments: currentRailEnvironments(),
    orderOverrides: useRailOrderStore.getState(),
    query: rail.query,
    scope: rail.scope,
    searchMatches: useSessionSearchStore.getState().matchBySessionKey,
    seenBySessionKey: useSessionReadStore.getState().seenBySessionKey,
    view: rail.view,
  }).sessions
}
function selectedSessionKey() {
  const { selection } = useSessionSelectionStore.getState()
  return selection.kind === 'session' ? scopedSessionKey(selection) : null
}
function activeProjectId(): ProjectId | null {
  const workspaceRoot = useActiveProjectStore.getState().workspaceRoot
  return workspaceRoot !== null
    ? (selectWorktreeAtPath(activeChatProjection(), workspaceRoot)?.projectId ?? null)
    : null
}
async function openRoot(environmentId: EnvironmentId, path: string, options: SessionOpenOptions) {
  const opener = options.openProject ?? openProjectRoot
  if (!opener) return false
  const result = await opener(environmentId, path)
  return result === 'opened' || result === 'already-open'
}
