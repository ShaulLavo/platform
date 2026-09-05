import { TEST_ENVIRONMENT_ID } from '../../../../../test/factories/chat'
import { projectIdSchema, sessionIdSchema } from '@workspace/contracts'
import * as v from 'valibot'

import {
  createSessionSelectionStore,
  resetSessionSelectionStore,
} from '@/features/chat-mode/state/session-selection-store'
import { readSessionSelectionCache } from '@/features/workspace/state/cache'
import { expect, test } from '../../../../../test/fixtures'

// A DOM test on purpose: the durability being proved here is localStorage, and the node
// world has none — a store test there would pass while persisting nothing.
const projectId = v.parse(projectIdSchema, '852f9abe-406f-5a75-a09c-18dbfa9fc7f2')
const sessionId = v.parse(sessionIdSchema, '0cecbcf1-b3a4-5425-826e-9780b43b7832')

test('the session on the stage survives a restart', () => {
  resetSessionSelectionStore()

  createSessionSelectionStore().getState().selectSession(TEST_ENVIRONMENT_ID, projectId, sessionId)

  expect(readSessionSelectionCache()).toEqual({
    kind: 'session',
    environmentId: TEST_ENVIRONMENT_ID,
    projectId,
    sessionId,
  })
  // A second store is what a cold load is: it reads the cache the same way.
  const reloaded = createSessionSelectionStore()
  expect(reloaded.getState().selection).toEqual({
    kind: 'session',
    environmentId: TEST_ENVIRONMENT_ID,
    projectId,
    sessionId,
  })
  // And it knows the pick came off disk, so a session that is gone can say so.
  expect(reloaded.getState().restored).toBe(true)
})

test('a draft is remembered as a draft, not as the newest session', () => {
  resetSessionSelectionStore()

  createSessionSelectionStore().getState().startDraft(TEST_ENVIRONMENT_ID, projectId)

  expect(createSessionSelectionStore().getState().selection).toEqual({
    kind: 'draft',
    environmentId: TEST_ENVIRONMENT_ID,
    projectId,
  })
})

test('a cold profile starts on the auto pick', () => {
  resetSessionSelectionStore()

  const store = createSessionSelectionStore()

  expect(store.getState().selection).toEqual({ kind: 'auto' })
  expect(store.getState().restored).toBe(false)
})
