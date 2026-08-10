import {
  commandIdSchema,
  eventIdSchema,
  threadIdSchema,
  turnIdSchema,
  type OrchestrationEvent,
  type ThreadId,
  type TurnId,
} from '@workspace/contracts'
import { afterEach, beforeEach } from 'vitest'
import * as v from 'valibot'

import { createInitialChatProjectionState } from '@/features/chat/state/chat-projection-store'
import { applyChatProjectionEvent } from '@/features/chat/state/chat-projection-writers'
import {
  hydrateThreadDiffScopeStoreFromStorage,
  useThreadDiffScopeStore,
} from '@/features/chat/state/thread-diff-scope-store'
import {
  THREAD_DIFF_SCOPE_LIMIT,
  THREAD_DIFF_SCOPE_STORAGE_KEY,
} from '@/features/chat/utils/thread-diff-scope-storage'
import { expect, test } from '../../../../../test/fixtures'

// The node project has no DOM, and the point of persistence is what crosses
// localStorage, so stand up a real Map-backed Storage rather than skipping it.
const STORE = new Map<string, string>()

function memoryLocalStorage(): Storage {
  return {
    get length() {
      return STORE.size
    },
    clear: () => STORE.clear(),
    getItem: (key: string) => STORE.get(key) ?? null,
    key: (index: number) => Array.from(STORE.keys())[index] ?? null,
    removeItem: (key: string) => void STORE.delete(key),
    setItem: (key: string, value: string) => void STORE.set(key, value),
  }
}

function scopeFor(threadId: ThreadId) {
  return useThreadDiffScopeStore.getState().scopeByThreadId[threadId]?.scope
}

function parseThreadId(value: string) {
  return v.parse(threadIdSchema, value)
}

function parseTurnId(value: string) {
  return v.parse(turnIdSchema, value)
}

function timestamp(index: number) {
  return `2026-06-01T00:00:${String(index).padStart(2, '0')}.000Z`
}

function threadEvent(threadId: ThreadId, sequence: number, slug: string) {
  return {
    actorKind: 'provider',
    aggregateId: threadId,
    aggregateKind: 'thread',
    causationEventId: null,
    commandId: v.parse(commandIdSchema, `command-${slug}`),
    correlationId: v.parse(commandIdSchema, `command-${slug}`),
    eventId: v.parse(eventIdSchema, `event-${slug}`),
    metadata: {},
    occurredAt: timestamp(sequence),
    sequence,
  } as const satisfies Omit<
    Extract<OrchestrationEvent, { type: 'thread.reverted' }>,
    'payload' | 'type'
  >
}

function turnDiffCompletedEvent(
  threadId: ThreadId,
  turnId: TurnId,
  checkpointTurnCount: number,
): OrchestrationEvent {
  return {
    ...threadEvent(threadId, checkpointTurnCount, `turn-diff-${checkpointTurnCount}`),
    payload: {
      assistantMessageId: null,
      checkpointRef: `checkpoint-${checkpointTurnCount}`,
      checkpointTurnCount,
      completedAt: timestamp(checkpointTurnCount),
      files: [{ additions: 3, deletions: 1, kind: 'modified', path: 'src/a.ts' }],
      status: 'ready',
      threadId,
      turnId,
    },
    type: 'thread.turn-diff-completed',
  }
}

function revertedEvent(threadId: ThreadId, turnCount: number): OrchestrationEvent {
  return {
    ...threadEvent(threadId, 90 + turnCount, `reverted-${turnCount}`),
    payload: { revertedAt: timestamp(30), threadId, turnCount },
    type: 'thread.reverted',
  }
}

/**
 * Three real checkpoints, then a real revert to the first — the client projection
 * drops every checkpoint past the reverted turn count exactly as the server's
 * `pruneThreadAfterRevert` does, so the list this returns is the pruned list the
 * reconcile has to survive.
 */
function turnIdsAfterRevert(threadId: ThreadId, turnIds: readonly TurnId[], turnCount: number) {
  let state = createInitialChatProjectionState()

  turnIds.forEach((turnId, index) => {
    state = applyChatProjectionEvent(state, turnDiffCompletedEvent(threadId, turnId, index + 1))
  })
  state = applyChatProjectionEvent(state, revertedEvent(threadId, turnCount))

  return state.turnDiffIdsByThreadId[threadId] ?? []
}

beforeEach(() => {
  STORE.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: memoryLocalStorage(),
  })
  hydrateThreadDiffScopeStoreFromStorage()
})

afterEach(() => {
  STORE.clear()
  hydrateThreadDiffScopeStoreFromStorage()
  delete (globalThis as { localStorage?: Storage }).localStorage
})

test('a thread starts with no remembered diff scope', () => {
  expect(scopeFor(parseThreadId('thread-1'))).toBeUndefined()
})

test('a picked scope survives a reload', () => {
  const threadId = parseThreadId('thread-1')

  useThreadDiffScopeStore.getState().selectThreadDiffScope(threadId, { kind: 'working-tree' })

  // What a fresh page load does: drop the in-memory map, read storage back.
  hydrateThreadDiffScopeStoreFromStorage()
  expect(scopeFor(threadId)).toEqual({ kind: 'working-tree' })
})

test('junk in storage falls back to no remembered scope instead of throwing', () => {
  STORE.set(THREAD_DIFF_SCOPE_STORAGE_KEY, '{"scopeByThreadId":{"thread-1":{"scope":42}}}')

  hydrateThreadDiffScopeStoreFromStorage()
  expect(scopeFor(parseThreadId('thread-1'))).toBeUndefined()
})

test('the map is bounded, keeping the most recently picked threads', () => {
  const { selectThreadDiffScope } = useThreadDiffScopeStore.getState()

  for (let index = 0; index <= THREAD_DIFF_SCOPE_LIMIT; index += 1) {
    selectThreadDiffScope(parseThreadId(`thread-${index}`), { kind: 'working-tree' })
  }

  const stored = useThreadDiffScopeStore.getState().scopeByThreadId
  expect(Object.keys(stored)).toHaveLength(THREAD_DIFF_SCOPE_LIMIT)
  expect(scopeFor(parseThreadId('thread-0'))).toBeUndefined()
  expect(scopeFor(parseThreadId(`thread-${THREAD_DIFF_SCOPE_LIMIT}`))).toBeDefined()
})

test('a turn pick a revert deleted reconciles to the nearest surviving turn', () => {
  const threadId = parseThreadId('thread-1')
  const turnIds = [parseTurnId('turn-1'), parseTurnId('turn-2'), parseTurnId('turn-3')]
  const { reconcileTurnScope, selectThreadDiffScope } = useThreadDiffScopeStore.getState()

  selectThreadDiffScope(threadId, { filePath: 'src/a.ts', kind: 'turn', turnId: turnIds[2]! })

  // The revert keeps only turn 1, which is what the server prunes to as well.
  const survivingTurnIds = turnIdsAfterRevert(threadId, turnIds, 1)
  expect(survivingTurnIds).toEqual([turnIds[0]])

  reconcileTurnScope(threadId, survivingTurnIds)
  expect(scopeFor(threadId)).toEqual({ filePath: null, kind: 'turn', turnId: turnIds[0] })
})

test('a reconciled pick is what a reload reads back', () => {
  const threadId = parseThreadId('thread-1')
  const turnIds = [parseTurnId('turn-1'), parseTurnId('turn-2'), parseTurnId('turn-3')]
  const { reconcileTurnScope, selectThreadDiffScope } = useThreadDiffScopeStore.getState()

  selectThreadDiffScope(threadId, { filePath: null, kind: 'turn', turnId: turnIds[2]! })
  reconcileTurnScope(threadId, turnIdsAfterRevert(threadId, turnIds, 2))

  hydrateThreadDiffScopeStoreFromStorage()
  expect(scopeFor(threadId)).toEqual({ filePath: null, kind: 'turn', turnId: turnIds[1] })
})

test('a turn pick that survived the revert is left alone', () => {
  const threadId = parseThreadId('thread-1')
  const turnIds = [parseTurnId('turn-1'), parseTurnId('turn-2'), parseTurnId('turn-3')]
  const { reconcileTurnScope, selectThreadDiffScope } = useThreadDiffScopeStore.getState()

  selectThreadDiffScope(threadId, { filePath: 'src/a.ts', kind: 'turn', turnId: turnIds[0]! })
  reconcileTurnScope(threadId, turnIdsAfterRevert(threadId, turnIds, 2))

  expect(scopeFor(threadId)).toEqual({ filePath: 'src/a.ts', kind: 'turn', turnId: turnIds[0] })
})

// An empty list is a thread whose detail has not arrived, and a cold start hits
// that on every reload. Treating it as "the turn is gone" would make the stored
// pick unusable by construction.
test('an unloaded thread does not lose its turn pick', () => {
  const threadId = parseThreadId('thread-1')
  const turnId = parseTurnId('turn-3')
  const { reconcileTurnScope, selectThreadDiffScope } = useThreadDiffScopeStore.getState()

  selectThreadDiffScope(threadId, { filePath: null, kind: 'turn', turnId })
  reconcileTurnScope(threadId, [])

  expect(scopeFor(threadId)).toEqual({ filePath: null, kind: 'turn', turnId })
})

test('a working-tree pick is never touched by a revert', () => {
  const threadId = parseThreadId('thread-1')
  const turnIds = [parseTurnId('turn-1'), parseTurnId('turn-2')]
  const { reconcileTurnScope, selectThreadDiffScope } = useThreadDiffScopeStore.getState()

  selectThreadDiffScope(threadId, { kind: 'working-tree' })
  reconcileTurnScope(threadId, turnIdsAfterRevert(threadId, turnIds, 1))

  expect(scopeFor(threadId)).toEqual({ kind: 'working-tree' })
})
