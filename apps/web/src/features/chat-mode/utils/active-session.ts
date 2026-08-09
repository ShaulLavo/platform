import type { ProjectId, ThreadId } from '@workspace/contracts'

export type SessionSelection =
  | { readonly kind: 'auto' }
  | { readonly kind: 'draft'; readonly projectId: ProjectId }
  | { readonly kind: 'session'; readonly projectId: ProjectId; readonly threadId: ThreadId }

export type ActiveSession =
  /** No session picked yet: show the newest one, or the composer when there are none. */
  | { readonly status: 'auto'; readonly threadId: ThreadId | null }
  /** Explicit "new session": always the composer, even when sessions exist. */
  | { readonly status: 'draft'; readonly threadId: null }
  /** The pick names a session the projection has not caught up to yet. */
  | { readonly status: 'resolving'; readonly threadId: null }
  | { readonly status: 'ready'; readonly threadId: ThreadId }

export function activeSession({
  projectId,
  selection,
  threadIds,
}: {
  readonly projectId: ProjectId | null
  readonly selection: SessionSelection
  readonly threadIds: readonly ThreadId[]
}): ActiveSession {
  const newest: ActiveSession = { status: 'auto', threadId: threadIds[0] ?? null }
  if (selection.kind === 'auto') return newest
  // Both remaining picks name a project. Activation is synchronous, so a pick aimed
  // somewhere other than the active project means the user has since gone elsewhere —
  // show that project's newest session rather than stranding the stage on a spinner.
  if (selection.projectId !== projectId) return newest
  if (selection.kind === 'draft') return { status: 'draft', threadId: null }
  if (!threadIds.includes(selection.threadId)) return { status: 'resolving', threadId: null }

  return { status: 'ready', threadId: selection.threadId }
}

export function isDraftFor(selection: SessionSelection, projectId: ProjectId) {
  if (selection.kind !== 'draft') return false

  return selection.projectId === projectId
}

export function activeSessionShowsComposer(session: ActiveSession) {
  if (session.status === 'draft') return true

  return session.status === 'auto' && session.threadId === null
}
