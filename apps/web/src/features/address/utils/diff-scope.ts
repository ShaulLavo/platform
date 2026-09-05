import type { SessionDiffScope } from '@/features/chat/utils/session-diff-scope-storage'
import type { TurnId } from '@workspace/contracts'

/**
 * `?diff=wt` | `?diff=<turnId>` — which diff the chat tool pane is showing.
 *
 * On its own key rather than the plan's `?scope=`, which was double-booked with the
 * session rail's scope. The rail's is a `ProjectId` and cannot appear in a URL at all,
 * so this one gets a name of its own instead of a shared one that could only ever
 * carry half the meaning.
 *
 * The turn id is emitted whole: every lookup is exact equality, so an abbreviation
 * would not resolve.
 *
 * `wt` is the one reserved word, and everything else is a turn id. The decoder used to
 * demand a `turn-` prefix, which only ever held in test fixtures: a real `TurnId` is
 * `opaqueIdSchema('TurnId')` — any non-empty string — and the values in play come
 * straight off the provider as `event.turnId`. So the encoder emitted ids its own
 * decoder threw away, and a shared chat link silently lost its turn scope. Reserving one
 * two-character word is the whole grammar; a provider minting a turn literally called
 * `wt` is the only collision, against every provider id round-tripping.
 */
const WORKING_TREE = 'wt'

export function diffScopeParam(scope: SessionDiffScope | null) {
  if (!scope) return null
  if (scope.kind === 'working-tree') return WORKING_TREE

  return scope.turnId
}

export function diffScopeFor(param: string | null): SessionDiffScope | null {
  if (!param) return null
  if (param === WORKING_TREE) return { kind: 'working-tree' }

  return { filePath: null, kind: 'turn', turnId: param as TurnId }
}
