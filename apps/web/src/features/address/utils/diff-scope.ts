import type { ThreadDiffScope } from '@/features/chat/utils/thread-diff-scope-storage'
import type { TurnId } from '@workspace/contracts'

/**
 * `?diff=wt` | `?diff=turn-<turnId>` — which diff the chat tool pane is showing.
 *
 * On its own key rather than the plan's `?scope=`, which was double-booked with the
 * session rail's scope. The rail's is a `ProjectId` and cannot appear in a URL at all,
 * so this one gets a name of its own instead of a shared one that could only ever
 * carry half the meaning.
 *
 * The turn id is emitted whole: every lookup is exact equality, so an abbreviation
 * would not resolve.
 */
const WORKING_TREE = 'wt'
const TURN_PREFIX = 'turn-'

export function diffScopeParam(scope: ThreadDiffScope | null) {
  if (!scope) return null
  if (scope.kind === 'working-tree') return WORKING_TREE

  return scope.turnId
}

export function diffScopeFor(param: string | null): ThreadDiffScope | null {
  if (!param) return null
  if (param === WORKING_TREE) return { kind: 'working-tree' }
  if (!param.startsWith(TURN_PREFIX)) return null

  return { filePath: null, kind: 'turn', turnId: param as TurnId }
}
