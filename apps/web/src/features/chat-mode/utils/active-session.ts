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
  /** A remembered pick whose session is gone — deleted here, or never on this machine. */
  | { readonly status: 'missing'; readonly threadId: null }
  | { readonly status: 'ready'; readonly threadId: ThreadId }

const NO_THREAD_IDS: readonly ThreadId[] = []

/**
 * Resolves a pick against what the projection actually holds. A pick that names no
 * known thread has two very different meanings and each needs its own screen:
 * `resolving` while a thread this session just created makes its way through the event
 * stream, and `missing` when the pick came off disk and points at nothing. Collapsing
 * them into one spinner is what makes a deleted session look like an app that hung.
 */
export function activeSession({
  archivedThreadIds = NO_THREAD_IDS,
  projectId,
  restored = false,
  selection,
  threadIds,
}: {
  /**
   * The project's filed-away sessions. They are pickable but never auto-picked: the
   * archive browser can hand one to the stage, while an archived newest thread must
   * not become the session a cold start opens onto.
   */
  readonly archivedThreadIds?: readonly ThreadId[]
  readonly projectId: ProjectId | null
  /** True while the pick is the restored one — nothing in this session has chosen yet. */
  readonly restored?: boolean
  readonly selection: SessionSelection
  readonly threadIds: readonly ThreadId[]
}): ActiveSession {
  const newest: ActiveSession = { status: 'auto', threadId: threadIds[0] ?? null }
  if (selection.kind === 'auto') return newest
  // Both remaining picks name a project. Nothing is loaded yet, so the pick is not
  // wrong — it is early, and dropping to the newest thread here would flash a
  // conversation the user did not ask for on every cold start.
  if (!projectId) return { status: 'resolving', threadId: null }
  // Activation is synchronous, so a pick aimed at some other project means the user has
  // since gone elsewhere — show that project's newest session instead.
  if (selection.projectId !== projectId) return newest
  if (selection.kind === 'draft') return { status: 'draft', threadId: null }

  const known =
    threadIds.includes(selection.threadId) || archivedThreadIds.includes(selection.threadId)
  if (known) return { status: 'ready', threadId: selection.threadId }
  if (restored) return { status: 'missing', threadId: null }

  return { status: 'resolving', threadId: null }
}

export function isDraftFor(selection: SessionSelection, projectId: ProjectId) {
  if (selection.kind !== 'draft') return false

  return selection.projectId === projectId
}

export function activeSessionShowsComposer(session: ActiveSession) {
  if (session.status === 'draft') return true

  return session.status === 'auto' && session.threadId === null
}
