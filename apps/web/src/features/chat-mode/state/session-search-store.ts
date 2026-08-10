import type { OrchestrationThreadSearchMatch, ThreadId } from '@workspace/contracts'
import { create } from 'zustand'

import type { SessionSearchMatches } from '@/features/chat-mode/utils/session-rail-model'

/**
 * What the server last found inside message bodies, and for which query.
 *
 * A store rather than rail-local state for the same reason `session-rail-store`
 * is one: the keyboard commands rebuild the visible list from outside React and
 * must walk exactly the rows the rail drew, matches included.
 *
 * `matchedQuery` is the query the matches belong to, not the one being typed.
 * The snippet highlight reads it so the highlight can never miss on the frame
 * between a keystroke and its settled request.
 */
type SessionSearchStore = {
  readonly matchByThreadId: SessionSearchMatches
  readonly matchedQuery: string
  /** True while the settled query is still catching up with what was typed. */
  readonly searching: boolean
  readonly sync: (next: {
    matches: readonly OrchestrationThreadSearchMatch[]
    query: string
    searching: boolean
  }) => void
}

const NO_MATCHES: SessionSearchMatches = {}

export const useSessionSearchStore = create<SessionSearchStore>()((set, get) => ({
  matchByThreadId: NO_MATCHES,
  matchedQuery: '',
  searching: false,
  // One `set` guarded on identity: this runs from an effect that re-fires on
  // every query render, and a fresh state object would wake the whole rail.
  sync: ({ matches, query, searching }) => {
    const current = get()
    const matchByThreadId = matchesByThreadId(matches)
    if (
      current.matchedQuery === query &&
      current.searching === searching &&
      sameMatches(current.matchByThreadId, matchByThreadId)
    ) {
      return
    }

    set({ matchByThreadId, matchedQuery: query, searching })
  },
}))

export function resetSessionSearchStore() {
  useSessionSearchStore.setState({
    matchByThreadId: NO_MATCHES,
    matchedQuery: '',
    searching: false,
  })
}

/**
 * One match per thread already, but the newest wins if that ever stops holding —
 * a rail row can only show one snippet.
 */
function matchesByThreadId(matches: readonly OrchestrationThreadSearchMatch[]) {
  if (matches.length === 0) return NO_MATCHES

  const byThreadId: Record<string, OrchestrationThreadSearchMatch> = {}
  for (const match of matches) {
    byThreadId[match.threadId] = match
  }

  return byThreadId as SessionSearchMatches
}

function sameMatches(left: SessionSearchMatches, right: SessionSearchMatches) {
  const leftIds = Object.keys(left) as ThreadId[]
  if (leftIds.length !== Object.keys(right).length) return false

  return leftIds.every((threadId) => left[threadId]?.snippet === right[threadId]?.snippet)
}
