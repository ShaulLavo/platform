import type { SessionSelection } from '@/features/chat-mode/utils/active-session'
import {
  sessionIdSchema,
  type EnvironmentId,
  type ProjectId,
  type SessionId,
} from '@workspace/contracts'
import * as v from 'valibot'

const SESSION_TOKEN_PREFIX = 't'
const DRAFT_TOKEN = 't/new'

export function sessionTokenFor(selection: SessionSelection) {
  if (selection.kind === 'session') {
    return `${SESSION_TOKEN_PREFIX}/${encodeURIComponent(selection.sessionId)}`
  }
  if (selection.kind === 'draft') return DRAFT_TOKEN

  // `auto` is the absence of a pick, and absence is how the grammar spells it.
  return null
}

export type ParsedSessionToken =
  | { readonly kind: 'draft' }
  | { readonly kind: 'session'; readonly sessionId: SessionId }
  | { readonly kind: 'rejected' }

export function parseSessionToken(token: string | null): ParsedSessionToken | null {
  if (!token) return null
  if (token === DRAFT_TOKEN) return { kind: 'draft' }

  const [prefix, ...rest] = token.split('/')
  if (prefix !== SESSION_TOKEN_PREFIX) return null

  const sessionId = decodeSessionId(rest.join('/'))
  if (!sessionId) return { kind: 'rejected' }

  return { kind: 'session', sessionId }
}

export function sessionSelectionFor(
  parsed: ParsedSessionToken,
  environmentId: EnvironmentId,
  projectId: ProjectId,
): SessionSelection | null {
  if (parsed.kind === 'draft') return { kind: 'draft', environmentId, projectId }
  if (parsed.kind === 'session')
    return { kind: 'session', environmentId, projectId, sessionId: parsed.sessionId }

  return null
}

/**
 * Session ids are compared by exact equality everywhere, so an abbreviated one does
 * not resolve — a prefix is rejected rather than guessed at.
 */
function decodeSessionId(raw: string) {
  if (!raw) return null

  try {
    const sessionId = decodeURIComponent(raw)
    const parsed = v.safeParse(sessionIdSchema, sessionId)
    return parsed.success ? parsed.output : null
  } catch {
    return null
  }
}
