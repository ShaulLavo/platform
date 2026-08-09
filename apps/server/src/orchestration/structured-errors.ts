import { defineErrorCatalog } from 'evlog'

/**
 * Checkpoint diff failures the client has to branch on. They used to be
 * untyped prose, which forced the browser retry policy to substring-match the
 * message — a rewording silently turned a permanent failure into a retry loop.
 */
export const checkpointErrors = defineErrorCatalog('checkpoint', {
  RANGE_INVALID: {
    status: 400,
    message: ({ fromTurnCount, toTurnCount }: { fromTurnCount: number; toTurnCount: number }) =>
      `Checkpoint diff range is inverted: fromTurnCount ${fromTurnCount} is after toTurnCount ${toTurnCount}`,
    why: 'A diff range must run forwards; the caller asked for a range that ends before it starts.',
    fix: 'Send fromTurnCount less than or equal to toTurnCount. Retrying the same range cannot succeed.',
  },
  RANGE_EXCEEDS_TURN_COUNT: {
    status: 404,
    message: ({
      availableTurnCount,
      requestedTurnCount,
    }: {
      availableTurnCount: number
      requestedTurnCount: number
    }) =>
      `Checkpoint diff range exceeds current turn count: requested ${requestedTurnCount}, current ${availableTurnCount}`,
    why: 'The thread has no checkpoint that far along — the turn either never completed or was reverted away.',
    fix: 'Reload the thread and request a range within its current checkpoint count.',
  },
  REF_UNAVAILABLE: {
    status: 404,
    message: ({ turnCount }: { turnCount: number }) =>
      `Checkpoint ref is unavailable for turn ${turnCount}`,
    why: 'The checkpoint for this turn is missing, errored, or its git ref is gone from the workspace.',
    fix: 'Reopen the diff after the turn finishes capturing, or pick a turn whose checkpoint is ready.',
  },
})
