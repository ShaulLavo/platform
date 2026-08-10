import { projectIdSchema, threadIdSchema } from '@workspace/contracts'
import * as v from 'valibot'

import {
  createSessionSelectionStore,
  resetSessionSelectionStore,
} from '@/features/chat-mode/state/session-selection-store'
import { readSessionSelectionCache } from '@/lib/workspace-cache'
import { expect, test } from '../../../../../test/fixtures'

// A DOM test on purpose: the durability being proved here is localStorage, and the node
// world has none — a store test there would pass while persisting nothing.
const projectId = v.parse(projectIdSchema, 'project-a')
const threadId = v.parse(threadIdSchema, 'thread-a')

test('the session on the stage survives a restart', () => {
  resetSessionSelectionStore()

  createSessionSelectionStore().getState().selectSession(projectId, threadId)

  expect(readSessionSelectionCache()).toEqual({ kind: 'session', projectId, threadId })
  // A second store is what a cold load is: it reads the cache the same way.
  const reloaded = createSessionSelectionStore()
  expect(reloaded.getState().selection).toEqual({ kind: 'session', projectId, threadId })
  // And it knows the pick came off disk, so a thread that is gone can say so.
  expect(reloaded.getState().restored).toBe(true)
})

test('a draft is remembered as a draft, not as the newest session', () => {
  resetSessionSelectionStore()

  createSessionSelectionStore().getState().startDraft(projectId)

  expect(createSessionSelectionStore().getState().selection).toEqual({
    kind: 'draft',
    projectId,
  })
})

test('a cold profile starts on the auto pick', () => {
  resetSessionSelectionStore()

  const store = createSessionSelectionStore()

  expect(store.getState().selection).toEqual({ kind: 'auto' })
  expect(store.getState().restored).toBe(false)
})
