import type { SessionSelection } from '@/features/chat-mode/utils/active-session'
import type { ProjectId, ThreadId } from '@workspace/contracts'

/**
 * Chat mode's three selection variants, as the document slot of a chat address.
 *
 * `ThreadId` is `thread-` plus a client-minted UUID living in this machine's SQLite,
 * so a thread link is a this-machine link until sessions sync. That is not hidden —
 * the restore reports `unavailable` and the stage says so, because a link that
 * silently fell through to the newest thread would read as the app losing your place.
 *
 * The `projectId` is deliberately absent: it is a one-way hash of an absolute path
 * and must never appear in a URL. It is re-derived from the workspace the address
 * already names.
 */

const SESSION_TOKEN_PREFIX = 't'
const DRAFT_TOKEN = 't/new'

export function sessionTokenFor(selection: SessionSelection) {
  if (selection.kind === 'session') {
    return `${SESSION_TOKEN_PREFIX}/${encodeURIComponent(selection.threadId)}`
  }
  if (selection.kind === 'draft') return DRAFT_TOKEN

  // `auto` is the absence of a pick, and absence is how the grammar spells it.
  return null
}

export type ParsedSessionToken =
  | { readonly kind: 'draft' }
  | { readonly kind: 'session'; readonly threadId: ThreadId }
  | { readonly kind: 'rejected' }

export function parseSessionToken(token: string | null): ParsedSessionToken | null {
  if (!token) return null
  if (token === DRAFT_TOKEN) return { kind: 'draft' }

  const [prefix, ...rest] = token.split('/')
  if (prefix !== SESSION_TOKEN_PREFIX) return null

  const threadId = decodeThreadId(rest.join('/'))
  if (!threadId) return { kind: 'rejected' }

  return { kind: 'session', threadId: threadId as ThreadId }
}

export function sessionSelectionFor(
  parsed: ParsedSessionToken,
  projectId: ProjectId,
): SessionSelection | null {
  if (parsed.kind === 'draft') return { kind: 'draft', projectId }
  if (parsed.kind === 'session') return { kind: 'session', projectId, threadId: parsed.threadId }

  return null
}

/**
 * Thread ids are compared by exact equality everywhere, so an abbreviated one does
 * not resolve — a prefix is rejected rather than guessed at.
 */
function decodeThreadId(raw: string) {
  if (!raw) return null

  try {
    const threadId = decodeURIComponent(raw)
    return threadId.startsWith('thread-') ? threadId : null
  } catch {
    return null
  }
}
