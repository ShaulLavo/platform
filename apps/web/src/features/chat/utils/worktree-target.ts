import { worktreeIdSchema, type SessionWorktreeTarget, type WorktreeId } from '@workspace/contracts'
import * as v from 'valibot'

export function newWorktreeTarget(baseWorktreeId: WorktreeId): SessionWorktreeTarget {
  return {
    kind: 'new',
    worktreeId: v.parse(worktreeIdSchema, crypto.randomUUID()),
    baseWorktreeId,
  }
}
